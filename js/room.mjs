/**
 * Shared rooms (Phase 2). Browser to browser through PeerJS, with the GM's browser as the host.
 * This file is the protocol only: it takes a Peer constructor, so Node can test it with an in-memory fake.
 *
 * Messages (plain objects, field `k` is the kind):
 *   player -> host: hello {name}, sheets {actors}, log {entry}, effect {actorId, value}, token {id, x, y}, cond {actorId, types}
 *   host -> player: history {entries}, log {entry}, table {table}, effect {actorId, value}, scene {},
 *                   harm {actorId, delta} (the GM applies Hurt to a player's character),
 *                   handout {h} / unhandout {id} (a handout the GM shows or takes back),
 *                   board {tracker, map} (the Exchange tracker and the map without hidden tokens), mapimg {rev, src} (a custom map image)
 * `entry` = { id, html, private?, to? }. Private entries stay with the player and the host.
 */
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

export class Room {
  /**
   * @param {object} o
   * @param {Function} o.Peer  PeerJS-compatible constructor
   * @param {object} o.handlers  onStatus(), onLog(entry), onTable(table), onEffect(actorId, value), onScene(), hostNpcs() -> snapshots[], hostOwns(actorId) -> bool
   */
  constructor({ Peer, handlers, timeoutMs = 12000 }) {
    this.Peer = Peer; this.h = handlers; this.timeoutMs = timeoutMs;
    this.role = "none"; this.code = ""; this.name = ""; this.status = "idle"; this.error = "";
    this.peer = null; this.hostConn = null;
    this.peers = new Map();        // host only: pid -> { conn, name, actors }
    this.table = { players: [], npcs: [] };
    this.history = [];             // host only: recent public entries for late joiners
    this.lastImgRev = "";
    this.myId = "";
  }
  get online() { return this.status === "online"; }
  get count() { return this.role === "host" ? this.peers.size + 1 : this.table.players.length + 1; }

  _set(status, error = "") { this.status = status; this.error = error; this.h.onStatus?.(); }

  /** Start a room as the GM. Resolves with the code. */
  host(code, name) {
    this.leave(true);
    this.role = "host"; this.code = cleanCode(code); this.name = name || "GM";
    this._set("connecting");
    return new Promise((resolve, reject) => {
      const peer = this.peer = new this.Peer(PREFIX + this.code);
      const timer = setTimeout(() => fail(new Error("timeout")), this.timeoutMs);
      const fail = err => { clearTimeout(timer); this._set("error", err.type === "unavailable-id" ? "That code is already in use. Another host may still be connected." : (err.message === "timeout" ? "Could not reach the PeerJS broker. Check your connection." : String(err.message || err.type || err))); reject(err); };
      peer.on("open", id => { clearTimeout(timer); this.myId = id; this._set("online"); resolve(this.code); });
      peer.on("error", err => { if (this.status === "connecting") fail(err); else this._set("online", String(err.type || err)); });
      peer.on("connection", conn => this._accept(conn));
      peer.on("disconnected", () => { try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  _accept(conn) {
    const pid = conn.peer;
    conn.on("data", msg => this._fromPlayer(pid, conn, msg));
    conn.on("close", () => { if (this.peers.delete(pid)) { this.broadcastTable(); this.h.onStatus?.(); } });
    conn.on("error", () => { /* the close handler cleans up */ });
  }

  _fromPlayer(pid, conn, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "hello") {
      this.peers.set(pid, { conn, name: String(msg.name || "Player").slice(0, 30), actors: [] });
      conn.send({ k: "history", entries: this.history.slice(-40) });
      this.broadcastTable(); this.h.onStatus?.();
      this.sendBoard(pid);
      for (const h of this.h.hostHandouts?.() ?? []) { try { conn.send({ k: "handout", h }); } catch { /* closed */ } }
    } else if (!this.peers.has(pid)) {
      return;                       // ignore anything before hello
    } else if (msg.k === "sheets") {
      this.peers.get(pid).actors = Array.isArray(msg.actors) ? msg.actors.slice(0, 12) : [];
      this.broadcastTable();
    } else if (msg.k === "log" && msg.entry) {
      const entry = msg.entry;
      this.h.onLog(entry);
      if (!entry.private) { this._remember(entry); this._sendAll({ k: "log", entry }, pid); }
    } else if (msg.k === "effect") {
      this.sendEffect(msg.actorId, msg.value);
    } else if (msg.k === "cond") {
      this.h.onCond?.(pid, msg.actorId, Array.isArray(msg.types) ? msg.types : []);
    } else if (msg.k === "token") {
      this.h.onToken?.(pid, msg.id, Number(msg.x), Number(msg.y));
    }
  }

  /** Join a room as a player. Resolves when the host has accepted the connection. */
  join(code, name) {
    this.leave(true);
    this.role = "player"; this.code = cleanCode(code); this.name = name || "Player";
    this._set("connecting");
    return new Promise((resolve, reject) => {
      const peer = this.peer = new this.Peer();
      const fail = err => { clearTimeout(timer); this._set("error", err.type === "peer-unavailable" ? "No room with that code. Check it, and that the GM has the page open." : (err.message === "timeout" ? "Could not reach the room. Check the code and your connection." : String(err.message || err.type || err))); try { peer.destroy(); } catch { /* ignore */ } reject(err); };
      const timer = setTimeout(() => fail(new Error("timeout")), this.timeoutMs);
      peer.on("error", err => { if (this.status === "connecting") fail(err); });
      peer.on("open", id => {
        this.myId = id;
        const conn = this.hostConn = peer.connect(PREFIX + this.code, { reliable: true });
        conn.on("open", () => { clearTimeout(timer); conn.send({ k: "hello", name: this.name }); this._set("online"); resolve(this.code); });
        conn.on("data", msg => this._fromHost(msg));
        conn.on("close", () => { if (this.role === "player") this._set("error", "The GM left the room."); });
        conn.on("error", () => { /* close handler reports it */ });
      });
    });
  }

  _fromHost(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "history") (msg.entries ?? []).forEach(e => this.h.onLog(e, true));
    else if (msg.k === "log" && msg.entry) this.h.onLog(msg.entry);
    else if (msg.k === "table") { this.table = msg.table ?? { players: [], npcs: [] }; this.table.players = (this.table.players ?? []).filter(p => p.pid !== this.myId); this.h.onTable?.(this.table); }
    else if (msg.k === "effect") this.h.onEffect?.(msg.actorId, msg.value);
    else if (msg.k === "scene") this.h.onScene?.();
    else if (msg.k === "harm") this.h.onHarm?.(msg.actorId, Number(msg.delta) || 0);
    else if (msg.k === "handout" && msg.h) this.h.onHandout?.(msg.h);
    else if (msg.k === "unhandout") this.h.onUnhandout?.(msg.id);
    else if (msg.k === "board") this.h.onBoard?.(msg.board);
    else if (msg.k === "mapimg") this.h.onMapImg?.(msg.rev, msg.src);
  }

  /* ---------------- sending ---------------- */

  _remember(entry) { this.history.push(entry); if (this.history.length > 60) this.history.shift(); }
  _sendAll(msg, exceptPid = "") { for (const [pid, p] of this.peers) if (pid !== exceptPid) { try { p.conn.send(msg); } catch { /* closed */ } } }

  /** Send a log entry: a player sends it to the host; the host sends it to everyone (or to `entry.to`, a peer id). */
  sendLog(entry) {
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
    const msg = { k: "board", board: { tracker: b.tracker, map: b.map } };
    const targets = toPid ? [[toPid, this.peers.get(toPid)]].filter(([, p]) => p) : [...this.peers];
    for (const [, p] of targets) {
      try {
        p.conn.send(msg);
        if (b.mapImage && (toPid || b.mapImage.rev !== this.lastImgRev)) p.conn.send({ k: "mapimg", rev: b.mapImage.rev, src: b.mapImage.src });
      } catch { /* closed */ }
    }
    if (b.mapImage) this.lastImgRev = b.mapImage.rev;
  }
  /** Host: tell whoever owns this character that it takes Hurt (Harm advances `delta` tiers). Returns false if nobody here owns it. */
  sendHarm(actorId, delta = 1) {
    if (this.role !== "host" || !this.online) return false;
    for (const [, p] of this.peers) if (p.actors.some(a => a.id === actorId)) { try { p.conn.send({ k: "harm", actorId, delta }); return true; } catch { return false; } }
    return false;
  }
  /** Host: show a handout to the table, or take it back. */
  sendHandout(h) { if (this.role === "host" && this.online) this._sendAll({ k: "handout", h }); }
  sendUnhandout(id) { if (this.role === "host" && this.online) this._sendAll({ k: "unhandout", id }); }
  /** Player: tell the host a roll used up these conditions (Sinking, Poise) on an actor. */
  sendCond(actorId, types) { if (this.online && this.role === "player") this.hostConn?.send({ k: "cond", actorId, types }); }
  /** Player: ask the host to move a token. */
  sendToken(id, x, y) { if (this.online && this.role === "player") this.hostConn?.send({ k: "token", id, x, y }); }
  broadcastScene() { if (this.role === "host" && this.online) this._sendAll({ k: "scene" }); }

  leave(quiet = false) {
    const wasHost = this.role === "host";
    if (wasHost) for (const [, p] of this.peers) { try { p.conn.close(); } catch { /* ignore */ } }
    try { this.hostConn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null; this.hostConn = null; this.peers.clear(); this.table = { players: [], npcs: [] }; this.history = []; this.lastImgRev = "";
    this.role = "none"; this.code = ""; this.myId = "";
    if (!quiet) this._set("idle"); else { this.status = "idle"; this.error = ""; }
  }
}
