/**
 * Shared rooms (Phase 2). Browser to browser through PeerJS, with the GM's browser as the host.
 * This file is the protocol only: it takes a Peer constructor, so Node can test it with an in-memory fake.
 *
 * Messages (plain objects, field `k` is the kind):
 *   player -> host: hello {name, password?}, journal {op, entry}, sheets {actors}, log {entry}, effect {actorId, value}, token {id, x, y}, cond {actorId, types}, ping {x, y, rev}
 *   host -> player: welcome {name} (you are in), denied {reason} ("password" | "locked" | "removed"), kicked {},
 *                   history {entries}, log {entry}, table {table}, effect {actorId, value}, scene {},
 *                   ping {ping} (the GM points at a spot on the map),
 *                   journal {entries} (the party journal, in full),
 *                   harm {actorId, delta} (the GM applies Hurt to a player's character),
 *                   grant {actorId, n} (the GM awards Marks to a player's character),
 *                   img {id, src} (a picture a sheet refers to by its portraitId; players send theirs to the host, which passes it on to everyone)
 *                   handout {h} / unhandout {id} (a handout the GM shows or takes back),
 *                   board {tracker, map} (the Exchange tracker and the map without hidden tokens), mapimg {rev, src} (a custom map image)
 * `entry` = { id, html, private?, to? }. Private entries stay with the player and the host.
 *
 * Staying connected: when a connection is lost (the GM reloads, a phone sleeps, the network drops) the room does not give up. It tries again
 * with growing pauses for up to `maxRetryMs`, status "reconnecting", and a player re-announces themselves to the host, who treats the same
 * name as the same person coming back. A GM who reloads re-opens the same code (the broker can take a few seconds to free it, so that is retried too).
 * Leaving on purpose, being removed, or a refusal (wrong password, locked) stops the retrying.
 */
import { isData, idOf } from "./portrait.mjs";
export const PREFIX = "pmoon-city-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(rand = defaultRand) {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}
function defaultRand(n) {
  if (globalThis.crypto?.getRandomValues) { const b = new Uint32Array(1); globalThis.crypto.getRandomValues(b); return b[0] % n; }
  return Math.floor(Math.random() * n);
}
export const cleanCode = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const DENIED = {
  password: "Wrong or missing room password.",
  locked: "The GM has locked the room to new players.",
  removed: "The GM removed you from this room."
};

export class Room {
  /**
   * @param {object} o
   * @param {Function} o.Peer  PeerJS-compatible constructor
   * @param {object} o.handlers  onStatus(), onLog(entry), onTable(table), onEffect(actorId, value), onScene(), onResumed(), hostNpcs() -> snapshots[], hostOwns(actorId) -> bool
   * @param {object} [o.peerOptions]  passed to the Peer constructor (for example { config: { iceServers: [...] } } for a TURN relay)
   * @param {number[]} [o.backoff]  pauses between reconnect attempts, in ms; the last one repeats
   * @param {number} [o.maxRetryMs]  how long to keep trying to reconnect
   */
  constructor({ Peer, handlers, timeoutMs = 12000, peerOptions = null, backoff = [1000, 2000, 4000, 8000, 15000], maxRetryMs = 10 * 60 * 1000 }) {
    this.Peer = Peer; this.h = handlers; this.timeoutMs = timeoutMs; this.peerOptions = peerOptions; this.backoff = backoff; this.maxRetryMs = maxRetryMs;
    this.role = "none"; this.code = ""; this.name = ""; this.status = "idle"; this.error = "";
    this.peer = null; this.hostConn = null;
    this.peers = new Map();        // host only: pid -> { conn, name, actors }
    this.table = { players: [], npcs: [] };
    this.images = new Map();                                    // host: the pictures it holds (id -> data URL), sent to everyone who joins
    this.history = [];             // host only: recent public entries for late joiners
    this.lastImgRev = "";
    this.myId = "";
    this.session = null;           // what to come back to: { role, code, name, password }
    this.attempt = 0;              // reconnect attempts so far
    this.outbox = [];              // player: log entries made while disconnected, sent on return
    this.locked = false; this.password = ""; this.known = new Set(); this.blocked = new Set();   // host: who may come in
    this._run = 0;                 // changes whenever the room is left, so a stale retry loop stops
  }
  get online() { return this.status === "online"; }
  get reconnecting() { return this.status === "reconnecting"; }
  get count() { return this.role === "host" ? this.peers.size + 1 : this.table.players.length + 1; }

  _set(status, error = "") { this.status = status; this.error = error; this.h.onStatus?.(); }
  _newPeer(id) { return id === undefined ? (this.peerOptions ? new this.Peer(undefined, this.peerOptions) : new this.Peer()) : (this.peerOptions ? new this.Peer(id, this.peerOptions) : new this.Peer(id)); }

  /* ================================================================ connecting */

  /** Open the host's side of the room. Resolves with the code; rejects with the PeerJS error. Does not touch the status. */
  _openHost() {
    return new Promise((resolve, reject) => {
      const peer = this.peer = this._newPeer(PREFIX + this.code);
      let settled = false;
      const timer = setTimeout(() => fail(Object.assign(new Error("timeout"), { type: "timeout" })), this.timeoutMs);
      const fail = err => { if (settled) return; settled = true; clearTimeout(timer); try { peer.destroy(); } catch { /* ignore */ } reject(err); };
      peer.on("open", id => { if (settled) return; settled = true; clearTimeout(timer); this.myId = id; resolve(this.code); });
      peer.on("error", err => {
        if (!settled) return fail(err);
        if (["network", "server-error", "socket-error", "socket-closed", "unavailable-id"].includes(err.type)) this._lost("The connection to the broker was lost.");
      });
      peer.on("connection", conn => this._accept(conn));
      peer.on("disconnected", () => { try { peer.reconnect(); } catch { /* ignore */ } });
      peer.on("close", () => { if (settled && this.peer === peer) this._lost("The room closed unexpectedly."); });
    });
  }

  /** Connect to the host as a player. Resolves when the host has let us in; rejects with { type: "denied", reason } or the PeerJS error. */
  _openPlayer() {
    return new Promise((resolve, reject) => {
      const peer = this.peer = this._newPeer(undefined);
      let settled = false;
      const timer = setTimeout(() => fail(Object.assign(new Error("timeout"), { type: "timeout" })), this.timeoutMs);
      const fail = err => { if (settled) return; settled = true; clearTimeout(timer); try { peer.destroy(); } catch { /* ignore */ } reject(err); };
      const accept = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(this.code); };
      this._accepted = accept; this._refused = reason => fail({ type: "denied", reason });
      peer.on("error", err => { if (!settled) fail(err); });
      peer.on("open", id => {
        this.myId = id;
        const conn = this.hostConn = peer.connect(PREFIX + this.code, { reliable: true });
        conn.on("open", () => conn.send({ k: "hello", name: this.name, password: this.session?.password ?? "" }));
        conn.on("data", msg => this._fromHost(msg));
        conn.on("close", () => { if (!settled) fail(new Error("closed")); else if (this.hostConn === conn) this._lost("The GM left the room."); });
        conn.on("error", () => { /* the close handler reports it */ });
      });
    });
  }

  _errorText(err) {
    if (err?.type === "denied") return DENIED[err.reason] ?? DENIED.removed;
    if (err?.type === "unavailable-id") return "That code is already in use. Another host may still be connected.";
    if (err?.type === "peer-unavailable") return "No room with that code. Check it, and that the GM has the page open.";
    if (err?.message === "timeout") return this.role === "host" ? "Could not reach the PeerJS broker. Check your connection." : "Could not reach the room. Check the code and your connection.";
    return String(err?.message || err?.type || err);
  }

  /** Start a room as the GM. Resolves with the code. */
  async host(code, name, { password = "", locked = false } = {}) {
    this.leave(true);
    this.role = "host"; this.code = cleanCode(code); this.name = name || "GM"; this.password = password; this.locked = locked;
    this.session = { role: "host", code: this.code, name: this.name, password };
    this._set("connecting");
    try { await this._openHost(); } catch (err) { this._set("error", this._errorText(err)); this.session = null; throw err; }
    this._set("online"); return this.code;
  }

  /** Join a room as a player. Resolves when the host has accepted the connection. */
  async join(code, name, { password = "" } = {}) {
    this.leave(true);
    this.role = "player"; this.code = cleanCode(code); this.name = name || "Player";
    this.session = { role: "player", code: this.code, name: this.name, password };
    this._set("connecting");
    try { await this._openPlayer(); } catch (err) { this._set("error", this._errorText(err)); this.session = null; throw err; }
    this._set("online"); this._flushOutbox(); return this.code;
  }

  /** Come back to a room from a saved session (after a reload): keeps trying until it works or the time runs out. */
  resume({ role, code, name, password = "", locked = false, known = [], blocked = [] }) {
    this.leave(true);
    this.role = role; this.code = cleanCode(code); this.name = name || (role === "host" ? "GM" : "Player"); this.password = role === "host" ? password : "";
    if (role === "host") { this.locked = !!locked; this.known = new Set(known); this.blocked = new Set(blocked); }
    this.session = { role, code: this.code, name: this.name, password };
    this._set("reconnecting");
    this._retryLoop(true);
  }

  /** The connection is gone and nobody asked for that: start trying to get back. */
  _lost(reason) {
    if (!this.session || this.status === "reconnecting" || this.status === "idle" || this.status === "error") return;
    this._teardown();
    this._set("reconnecting", reason);
    this._retryLoop(false);
  }

  _teardown() {
    for (const [, p] of this.peers) { try { p.conn.close(); } catch { /* ignore */ } }
    try { this.hostConn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null; this.hostConn = null; this.peers.clear(); this.myId = "";
  }

  async _retryLoop(immediate) {
    const run = ++this._run, started = Date.now();
    this.attempt = 0;
    while (run === this._run && this.session) {
      if (!(immediate && this.attempt === 0)) await sleep(this.backoff[Math.min(this.attempt - (immediate ? 1 : 0), this.backoff.length - 1)] ?? this.backoff.at(-1));
      if (run !== this._run || !this.session) return;
      this.attempt++; this.h.onStatus?.();
      try {
        this._teardown();
        if (this.session.role === "host") await this._openHost(); else await this._openPlayer();
        if (run !== this._run) { this._teardown(); return; }
        this.attempt = 0;
        this._set("online");
        this._flushOutbox();
        this.h.onResumed?.();
        return;
      } catch (err) {
        if (run !== this._run) return;
        if (err?.type === "denied") { const s = this._errorText(err); this.session = null; this._set("error", s); return; }
        if (Date.now() - started > this.maxRetryMs) { this.session = null; this._set("error", "Could not reconnect. Check your connection, then join again."); return; }
      }
    }
  }

  _flushOutbox() {
    const out = this.outbox.splice(0);
    for (const entry of out) this.sendLog(entry);
  }

  /* ================================================================ the host's side of a connection */

  _accept(conn) {
    const pid = conn.peer;
    conn.on("data", msg => this._fromPlayer(pid, conn, msg));
    conn.on("close", () => { if (this.peers.get(pid)?.conn === conn && this.peers.delete(pid)) { this.broadcastTable(); this.h.onStatus?.(); } });
    conn.on("error", () => { /* the close handler cleans up */ });
  }

  _deny(conn, reason) { try { conn.send({ k: "denied", reason }); } catch { /* closed */ } setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 50); }

  _fromPlayer(pid, conn, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "hello") {
      const name = String(msg.name || "Player").trim().slice(0, 30) || "Player", low = name.toLowerCase();
      if (this.blocked.has(low)) return this._deny(conn, "removed");
      if (this.password && msg.password !== this.password) return this._deny(conn, "password");
      if (this.locked && !this.known.has(low)) return this._deny(conn, "locked");
      // the same name coming back (a reload, a dropped connection) replaces the old connection rather than making a second person
      for (const [oldPid, p] of [...this.peers]) if (oldPid !== pid && p.name.toLowerCase() === low) { this.peers.delete(oldPid); try { p.conn.close(); } catch { /* ignore */ } }
      this.known.add(low);
      this.peers.set(pid, { conn, name, actors: [] });
      conn.send({ k: "welcome", name });
      conn.send({ k: "history", entries: this.history.slice(-40) });
      for (const [id, src] of this.images) { try { conn.send({ k: "img", id, src }); } catch { /* closed */ } }
      this.broadcastTable(); this.h.onStatus?.();
      this.sendBoard(pid);
      conn.send({ k: "journal", entries: this.h.hostJournal?.() ?? [] });
      for (const h of this.h.hostHandouts?.(name) ?? []) { try { conn.send({ k: "handout", h }); } catch { /* closed */ } }
    } else if (!this.peers.has(pid)) {
      return;                       // ignore anything before hello
    } else if (msg.k === "img") {
      this._takeImage(msg.id, msg.src, pid);
    } else if (msg.k === "sheets") {
      this.peers.get(pid).actors = Array.isArray(msg.actors) ? msg.actors.slice(0, 12) : [];
      this.broadcastTable();
    } else if (msg.k === "log" && msg.entry) {
      const entry = msg.entry;
      this.h.onLog(entry);
      if (!entry.private) { this._remember(entry); this._sendAll({ k: "log", entry }, pid); }
    } else if (msg.k === "effect") {
      this.sendEffect(msg.actorId, msg.value);
    } else if (msg.k === "ping") {
      const now = Date.now(), p = this.peers.get(pid);
      if (now - (p.lastPing ?? 0) < 500) return;                       // one ping every half second per player
      p.lastPing = now;
      this.h.onPlayerPing?.(pid, p.name, { x: Number(msg.x), y: Number(msg.y), rev: msg.rev });
    } else if (msg.k === "journal" && msg.entry) {
      this.h.onJournalOp?.(this.peers.get(pid).name, msg.op, msg.entry);
    } else if (msg.k === "cond") {
      this.h.onCond?.(pid, msg.actorId, Array.isArray(msg.types) ? msg.types : []);
    } else if (msg.k === "token") {
      this.h.onToken?.(pid, msg.id, Number(msg.x), Number(msg.y));
    }
  }

  /* ---- who may come in (host) ---- */

  /** What to save so a reload can come back to this room: the code, the name, the password, who was let in and who was removed. */
  snapshot() {
    if (!this.session) return null;
    return { role: this.role, code: this.code, name: this.name, password: this.session.password ?? "", locked: this.locked, known: [...this.known], blocked: [...this.blocked] };
  }
  setLocked(on) { this.locked = !!on; this.h.onStatus?.(); }
  setPassword(pw) { this.password = String(pw ?? "").slice(0, 40); if (this.session) this.session.password = this.password; this.h.onStatus?.(); }
  /** Remove a player. They are told, cannot get back in under that name until the room is closed, and do not try to reconnect. */
  kick(pid) {
    const p = this.peers.get(pid);
    if (!p) return false;
    this.blocked.add(p.name.toLowerCase());
    try { p.conn.send({ k: "kicked" }); } catch { /* closed */ }
    this.peers.delete(pid);
    setTimeout(() => { try { p.conn.close(); } catch { /* ignore */ } }, 50);
    this.broadcastTable(); this.h.onStatus?.();
    return true;
  }
  /** Let a removed player back in. */
  unblock(name) { this.blocked.delete(String(name).toLowerCase()); }

  /* ================================================================ the player's side */

  _fromHost(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "welcome") this._accepted?.();
    else if (msg.k === "denied") this._refused?.(msg.reason);
    else if (msg.k === "kicked") { this.session = null; this._set("error", DENIED.removed); this.leave(true); this._set("error", DENIED.removed); }
    else if (msg.k === "history") { this._accepted?.(); (msg.entries ?? []).forEach(e => this.h.onLog(e, true)); }
    else if (msg.k === "log" && msg.entry) this.h.onLog(msg.entry);
    else if (msg.k === "table") { this.table = msg.table ?? { players: [], npcs: [] }; this.table.players = (this.table.players ?? []).filter(p => p.pid !== this.myId); this.h.onTable?.(this.table); }
    else if (msg.k === "effect") this.h.onEffect?.(msg.actorId, msg.value);
    else if (msg.k === "scene") this.h.onScene?.();
    else if (msg.k === "ping" && msg.ping) this.h.onPing?.(msg.ping);
    else if (msg.k === "harm") this.h.onHarm?.(msg.actorId, Number(msg.delta) || 0);
    else if (msg.k === "grant") this.h.onGrant?.(msg.actorId, Math.max(0, Math.min(6, Math.floor(Number(msg.n)) || 0)));
    else if (msg.k === "journal") this.h.onJournal?.(msg.entries);
    else if (msg.k === "handout" && msg.h) this.h.onHandout?.(msg.h);
    else if (msg.k === "unhandout") this.h.onUnhandout?.(msg.id);
    else if (msg.k === "img" && isData(msg.src) && idOf(msg.src) === msg.id) this.h.onImage?.(msg.id, msg.src);
    else if (msg.k === "board") this.h.onBoard?.(msg.board);
    else if (msg.k === "mapimg") this.h.onMapImg?.(msg.rev, msg.src);
  }

  /* ---------------- sending ---------------- */

  _remember(entry) { this.history.push(entry); if (this.history.length > 60) this.history.shift(); }
  _sendAll(msg, exceptPid = "") { for (const [pid, p] of this.peers) if (pid !== exceptPid) { try { p.conn.send(msg); } catch { /* closed */ } } }

  /** Send a log entry: a player sends it to the host; the host sends it to everyone (or to `entry.to`, a peer id). While a player is disconnected, entries wait and go when they are back. */
  sendLog(entry) {
    if (this.role === "player" && !this.online) { if (this.session && !entry.private) { this.outbox.push(entry); if (this.outbox.length > 30) this.outbox.shift(); } return; }
    if (!this.online) return;
    if (this.role === "player") { this.hostConn?.send({ k: "log", entry }); return; }
    if (entry.to) { try { this.peers.get(entry.to)?.conn.send({ k: "log", entry }); } catch { /* closed */ } return; }
    if (entry.private) return;
    this._remember(entry);
    this._sendAll({ k: "log", entry });
  }
  /** A player pushes their characters to the host. */
  sendSheets(actors) { if (this.online && this.role === "player") this.hostConn?.send({ k: "sheets", actors }); }
  /** The host tells everyone what the table looks like (players' characters and shared Threats). */
  buildTable() {
    return { players: [...this.peers].map(([pid, p]) => ({ pid, name: p.name, actors: p.actors })), npcs: this.h.hostNpcs?.() ?? [] };
  }
  broadcastTable() {
    if (this.role !== "host" || !this.online) return;
    this.table = this.buildTable();
    for (const [pid, p] of this.peers) {
      const view = { ...this.table, players: this.table.players.filter(x => x.pid !== pid) };
      try { p.conn.send({ k: "table", table: view }); } catch { /* closed */ }
    }
    this.h.onTable?.(this.table);
  }
  /** Set the "weighed down" penalty on an actor that someone else owns. The host routes it to the owner. */
  sendEffect(actorId, value) {
    if (!this.online) return;
    if (this.role === "player") { this.hostConn?.send({ k: "effect", actorId, value }); return; }
    if (this.h.hostOwns?.(actorId)) { this.h.onEffect?.(actorId, value); return; }
    for (const [, p] of this.peers) if (p.actors.some(a => a.id === actorId)) { try { p.conn.send({ k: "effect", actorId, value }); } catch { /* closed */ } return; }
  }
  /** Host: send the Exchange tracker and the map to one player (`toPid`) or to everyone. The custom map image goes only when it changed. */
  sendBoard(toPid = "") {
    if (this.role !== "host" || !this.online) return;
    const b = this.h.hostBoard?.();
    if (!b) return;
    const msg = { k: "board", board: { tracker: b.tracker, map: b.map, clocks: b.clocks ?? [] } };
    const targets = toPid ? [[toPid, this.peers.get(toPid)]].filter(([, p]) => p) : [...this.peers];
    for (const [, p] of targets) {
      try {
        p.conn.send(msg);
        if (b.mapImage && (toPid || b.mapImage.rev !== this.lastImgRev)) p.conn.send({ k: "mapimg", rev: b.mapImage.rev, src: b.mapImage.src });
      } catch { /* closed */ }
    }
    if (b.mapImage) this.lastImgRev = b.mapImage.rev;
  }
  /** Host: ping the map for everyone. */
  sendPing(ping, exceptPid = "") { if (this.role === "host" && this.online) this._sendAll({ k: "ping", ping }, exceptPid); }
  /** Player: ping the map. The host checks it and shows it to everyone else. */
  sendPlayerPing(x, y, rev) { if (this.online && this.role === "player") this.hostConn?.send({ k: "ping", x, y, rev }); }
  /** Host: tell whoever owns this character that it takes Hurt (Harm advances `delta` tiers). Returns false if nobody here owns it. */
  sendHarm(actorId, delta = 1) {
    if (this.role !== "host" || !this.online) return false;
    for (const [, p] of this.peers) if (p.actors.some(a => a.id === actorId)) { try { p.conn.send({ k: "harm", actorId, delta }); return true; } catch { return false; } }
    return false;
  }
  /** Host: award `n` Marks to a character. If the host owns it, `onGrant` runs here; otherwise the owner is told. Returns false if nobody here owns it. */
  sendGrant(actorId, n) {
    if (this.role !== "host") return false;
    if (this.h.hostOwns?.(actorId)) { this.h.onGrant?.(actorId, n); return true; }
    if (!this.online) return false;
    for (const [, p] of this.peers) if (p.actors.some(a => a.id === actorId)) { try { p.conn.send({ k: "grant", actorId, n }); return true; } catch { return false; } }
    return false;
  }
  /** Send a picture a sheet refers to. A player sends it to the host; the host keeps it and passes it on to every player. */
  sendImage(id, src) {
    if (!this.online || !isData(src) || idOf(src) !== id) return false;
    if (this.role === "player") { try { this.hostConn?.send({ k: "img", id, src }); return true; } catch { return false; } }
    this._takeImage(id, src, "");
    return true;
  }
  /** Host: remember a picture (the id must be the picture's own, and the picture small) and send it to everyone else. */
  _takeImage(id, src, fromPid) {
    if (this.role !== "host" || !isData(src) || idOf(src) !== id) return;
    this.images.delete(id); this.images.set(id, src);
    while (this.images.size > 80) this.images.delete(this.images.keys().next().value);
    for (const [pid, p] of this.peers) if (pid !== fromPid) { try { p.conn.send({ k: "img", id, src }); } catch { /* closed */ } }
    if (fromPid) this.h.onImage?.(id, src);
  }
  /** Host: send the whole party journal to everyone. */
  sendJournal(entries) { this._sendTo({ k: "journal", entries }, []); }
  /** Player: add, edit or remove a party journal entry. The host decides whether it is allowed and who it is signed by. */
  sendJournalOp(op, entry) { if (this.online && this.role === "player") this.hostConn?.send({ k: "journal", op, entry }); }
  /** Host: show a handout to the table, or take it back. */
  sendHandout(h, names = []) { this._sendTo({ k: "handout", h }, names); }
  sendUnhandout(id, names = []) { this._sendTo({ k: "unhandout", id }, names); }
  /** Send to everyone, or (with names) only to the players with those names. */
  _sendTo(msg, names) {
    if (this.role !== "host" || !this.online) return;
    if (!names.length) return this._sendAll(msg);
    const want = new Set(names.map(n => n.toLowerCase()));
    for (const [, p] of this.peers) if (want.has(p.name.toLowerCase())) { try { p.conn.send(msg); } catch { /* closed */ } }
  }
  /** Player: tell the host a roll used up these conditions (Sinking, Poise) on an actor. */
  sendCond(actorId, types) { if (this.online && this.role === "player") this.hostConn?.send({ k: "cond", actorId, types }); }
  /** Player: ask the host to move a token. */
  sendToken(id, x, y) { if (this.online && this.role === "player") this.hostConn?.send({ k: "token", id, x, y }); }
  broadcastScene() { if (this.role === "host" && this.online) this._sendAll({ k: "scene" }); }

  /** Leave on purpose (or, with `quiet`, just reset before a new connection). A deliberate leave forgets the session, so nothing tries to reconnect. */
  leave(quiet = false) {
    this._run++;                                       // stops any retry loop
    this.session = null;
    this._teardown();
    this.table = { players: [], npcs: [] }; this.history = []; this.lastImgRev = ""; this.outbox = []; this.attempt = 0;
    this.known = new Set(); this.blocked = new Set(); this._accepted = null; this._refused = null;
    this.role = "none"; this.code = "";
    if (!quiet) this._set("idle"); else { this.status = "idle"; this.error = ""; }
  }
}
