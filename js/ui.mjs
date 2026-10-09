/** The interface: sidebar, sheets, dialogs and the roll log. Plain DOM; every change goes through the engine, saves, and re-renders. */
import * as R from "./rules.mjs";
import { SIN_LABEL, SKILL_LABEL, ATTRIBUTE_LABEL, HARM_LABEL, GEAR_KIND_LABEL, BOND_TYPE_LABEL, SIN_TEXT, SIGNATURE } from "./config.mjs";
import { t, tIn, setLang, bilingual as bi, bilingualHtml, expandMarkers } from "./i18n.mjs";
import * as E from "./engine.mjs";
import { esc } from "./engine.mjs";
import { newActor, newItem, normalizeActor, refresh, gearOf, bondsOf, traumasOf, setPath, getPath, uid } from "./model.mjs";
import * as S from "./store.mjs";
import { state } from "./store.mjs";
import { verdictCandidates } from "./voice.mjs";
import { Room, newCode, cleanCode } from "./room.mjs";
import { peerOptionsFor, parseIceServers, testConnection, DEFAULT_ICE } from "./net.mjs";
import * as K from "./backup.mjs";
import * as SC from "./scenes.mjs";
import { viewedScene } from "./scenes.mjs";
import { openWizard } from "./wizard.mjs";
import * as safe from "./safety.mjs";
import * as B from "./board.mjs";
import * as C from "./conditions.mjs";
import { createBoardUI } from "./boardui.mjs";
import * as H from "./handouts.mjs";
import { createHandoutUI } from "./handoutui.mjs";
import * as J from "./journal.mjs";
import { createJournalUI } from "./journalui.mjs";
import { createThreatUI } from "./threatui.mjs";
import { createTablesUI } from "./tablesui.mjs";
import { createClocksUI } from "./clocksui.mjs";
import { createScreenUI } from "./screenui.mjs";
import * as CK from "./clocks.mjs";
import * as KIT from "./kit.mjs";
import * as PR from "./printout.mjs";
import * as UNDO from "./undo.mjs";
import { TOKENS } from "./maplist.mjs";
import { createSfx } from "./sfx.mjs";
import { TimerClock, timerOf, fmt as fmtTime } from "./timer.mjs";

const $ = sel => document.querySelector(sel);
const tabs = {};            // per-actor current tab
let view = "sheet";         // phone layout: "people" | "sheet" | "log"
let toastTimer = null;

/* ------------------------------------------------------------------ small helpers */

const opts = (obj, selected = "", blank = null) =>
  (blank !== null ? `<option value="">${esc(blank)}</option>` : "") +
  Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${String(k) === String(selected) ? " selected" : ""}>${esc(v)}</option>`).join("");
const sinChoices = () => ({ ...Object.fromEntries(R.SINS.map(k => [k, SIN_LABEL[k]])) });
const harmChoices = () => Object.fromEntries(HARM_LABEL.map((l, i) => [i, l]));
const pips = (n, on, cls = "") => Array.from({ length: n }, (_, i) => `<i class="pip ${cls} ${i < on ? "on" : ""}"></i>`).join("");
const num = (path, value, min, max, cls = "") => `<input class="${cls}" type="number" data-path="${path}" value="${esc(value)}" min="${min}" max="${max}">`;
const txt = (path, value, ph = "") => `<input type="text" data-path="${path}" value="${esc(value)}" placeholder="${esc(ph)}">`;

export function toast(msg) {
  const el = $("#toast");
  el.textContent = expandMarkers(msg, state.lang); el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 3800);
}
/* ---- keeping the data safe: saving, snapshots, a backup file, and a reminder ---- */
const META_KEY = "project-moon-the-city/backup-meta";
const loadMeta = () => { try { return { changedAt: 0, firstChangeAt: 0, exportedAt: 0, sig: "", ...JSON.parse(localStorage.getItem(META_KEY) || "{}") }; } catch { return { changedAt: 0, firstChangeAt: 0, exportedAt: 0, sig: "" }; } };
let meta = loadMeta();
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ } };
let saveFailed = false;          // the last save did not work: shown until one does
let backupFile = null;           // the file handle the app writes to, if the user chose one
let backupFilePerm = "none";     // "none" | "granted" | "prompt" | "denied"
let backupTimer = null;

function persist() {
  saveFailed = !S.save();
  if (!saveFailed && S.signature() !== meta.sig) {          // the data really changed (not just which character is open)
    const now = Date.now();
    meta.sig = S.signature(); meta.changedAt = now; if (!meta.firstChangeAt) meta.firstChangeAt = now; saveMeta();
    clearTimeout(backupTimer); backupTimer = setTimeout(runAutoBackup, 4000);
  }
  renderWarn();
  scheduleSync();
  clearTimeout(undoTimer); undoTimer = setTimeout(() => renderUndo(), 60);
}
let undoTimer = null;

/** After changes settle: write the backup file (if there is one) and keep a snapshot every ten minutes. */
async function runAutoBackup() {
  const json = S.savedJson();
  if (!json) return;
  if (backupFile) {
    const r = await safe.writeBackupFile(backupFile, json);
    backupFilePerm = r === "permission" ? "prompt" : (r === "ok" ? "granted" : backupFilePerm);
    if (r === "ok") { meta.exportedAt = Date.now(); saveMeta(); }              // the file counts as a backup
  }
  await takeSnapshot("auto", false);
  renderWarn();
}
async function takeSnapshot(label, force) {
  const list = await safe.snapshots.list();
  const { list: next, added } = K.pushSnapshot(list, { at: Date.now(), label, size: S.savedJson().length, json: S.savedJson() }, { force });
  if (added) await safe.snapshots.replaceAll(next);
  return added;
}

/** The bar under the header: a save that failed, a backup file that needs allowing again, or a backup that is overdue. */
function renderWarn() {
  const el = $("#warnbar");
  if (!el) return;
  let html = "", kind = "";
  if (saveFailed) { kind = "bad"; html = `<span>${esc(t("Could not save in this browser. Your latest changes may be lost. Export a copy now."))}</span><button type="button" data-action="export">${esc(t("Export now"))}</button>`; }
  else if (backupFile && backupFilePerm === "prompt") { kind = "warn"; html = `<span>${esc(t("The browser needs your permission to keep writing the backup file."))}</span><button type="button" data-action="allowBackupFile">${esc(t("Allow"))}</button>`; }
  else if (K.backupDue(meta)) { kind = "warn"; html = `<span>${esc(t("Your changes have not been backed up since {when}.", { when: K.ageText(meta.exportedAt, Date.now(), t) }))}</span><button type="button" data-action="export">${esc(t("Export now"))}</button><button type="button" data-action="backups">${esc(t("Backups"))}</button>`; }
  el.hidden = !html; el.className = kind; el.innerHTML = html;
}
function downloadText(text, name) {
  const blob = new Blob([text], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = name;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
/** Add a message to the log and, in a room, send it on. Private messages (the Voice) stay with the player and the GM. */
function post(html, { priv = false, secret = false } = {}) {
  html = bilingualHtml(html);
  const entry = S.addLog(html);
  if (entry && secret) entry.secret = true;
  if (entry) sfx.forHtml(html);
  if (entry && room?.online) room.sendLog({ id: entry.id, html, private: priv });
}

/* ------------------------------------------------------------------ shared rooms */

let room = null;                // the Room, once the player has opened one
let remoteSel = "";             // id of a remote actor being looked at (read-only), or ""
let syncTimer = null;
let rtab = "log";               // right-hand pane: "log" | "xchg" | "map"
const remoteBoard = { tracker: B.newTracker(), map: null, image: null, clocks: [] };   // what the GM sent (players only)
const dragging = () => !!document.querySelector("#mapsvg")?.dataset.drag;
const isGM = () => !room?.online || room.role === "host";
const board = () => (isGM()
  ? { tracker: state.tracker, map: S.viewedMap(), image: S.viewedMap() && !S.viewedMap().bundled && S.viewedMap().src ? { rev: S.viewedMap().rev, src: S.viewedMap().src } : null }
  : remoteBoard);
const sfx = createSfx();
const clock = new TimerClock();
const received = [];            // handouts the GM has shown this player (memory only)
let remoteJournal = [];          // the party journal as the GM last sent it (players only)
const partyJournal = () => (isGM() ? state.journal : remoteJournal);
/** Change the party journal: the GM (or someone alone) changes it directly and tells the room; a player asks the GM's page. */
function journalApply(op, entry) {
  if (isGM()) {
    const r = J.applyOp(state.journal, op, entry, state.name || "GM", { gm: true });
    if (!r.ok) return toast(t("That could not be done."));
    persist(); renderBoard(); if (room?.role === "host") room.sendJournal(state.journal);
  } else if (room?.online) room.sendJournalOp(op, entry);
  else toast(t("You are not connected to the room right now."));
}
const journalUI = createJournalUI({
  state, $: sel => document.querySelector(sel), lang: () => state.lang, isGM, myName: () => (isGM() ? (state.name || "GM") : state.name),
  party: partyJournal, apply: journalApply, notesChanged: () => { persist(); renderBoard(); },
  ask: o => ask(o), toast: m => toast(m),
  recapParts: () => ({
    lines: J.logLines(state.log, state.lang),
    scenes: state.scenes.filter(s => s.map).map(s => s.name),
    handouts: state.handouts.filter(h => h.shown).map(h => H.pick(h, state.lang).title)
  })
});
const handoutUI_names = h => { const names = room?.role === "host" ? [...room.peers.values()].map(p => p.name) : []; return h.to.map(n => names.find(x => x.toLowerCase() === n) ?? n).join(", "); };
const handoutUI = createHandoutUI({
  state, lang: () => state.lang, $: sel => document.querySelector(sel), room: () => room, isGM, received: () => received,
  players: () => (room?.role === "host" ? [...room.peers.values()].map(p => p.name) : []),
  nameList: h => { const names = room?.role === "host" ? [...room.peers.values()].map(p => p.name) : []; const known = h.to.map(n => names.find(x => x.toLowerCase() === n) ?? n); return known.join(", "); },
  /** The players who have this handout right now. */
  audience: h => (room?.role === "host" && h.shown ? H.sharedWith(h, [...room.peers.values()].map(p => p.name)) : []),
  changed: (h, gone, { before = [], announce = false } = {}) => {
    persist(); renderBoard();
    if (room?.role === "host") {
      const now = gone || !h.shown ? [] : H.sharedWith(h, [...room.peers.values()].map(p => p.name));
      const removed = before.filter(n => !now.some(m => m.toLowerCase() === n.toLowerCase()));
      if (gone || !h.shown) room.sendUnhandout(h.id);                                   // taken back: everyone forgets it
      else {
        if (removed.length) room.sendUnhandout(h.id, removed);                          // no longer meant for them
        if (!H.isPrivate(h)) room.sendHandout(H.forPlayers(h)); else if (now.length) room.sendHandout(H.forPlayers(h), now);
      }
    }
    if (announce && h.shown && !gone) {
      if (!H.isPrivate(h)) post(H.announceHtml(h, tIn, esc));
      else post(bi(() => `<div class="pm-card pm-handout"><div class="pm-card-head">${esc(t("Shown privately"))}</div><div class="pm-notes"><p><b>${esc(h.title)}</b> &rarr; ${esc(handoutUI_names(h))}</p></div></div>`), { priv: true });   // only the GM sees this line
    }
  },
  ask: o => ask(o), toast: m => toast(m)
});
function addToExchange(id) {
  const a = findActor(id); if (!a || state.tracker.slots.some(s => s.actorId === id)) return false;
  B.addSlot(state.tracker, { name: a.name, kind: a.type === "character" ? "pc" : (a.system.isGroup ? "threat" : "named"), actorId: id });
  return true;
}
const boardUI = createBoardUI({
  state, clock, bi, $: sel => document.querySelector(sel), room: () => room, isGM, board,
  remoteActors: () => remoteActors(), findActor: id => findActor(id),
  changed: () => { persist(); renderBoard(); if (room?.role === "host") room.sendBoard(); },
  sendBoard: () => { if (room?.role === "host") room.sendBoard(); },
  redrawMap: () => renderBoard(),
  mark: label => markUndo(label),
  sendPing: p => { if (room?.role === "host") room.sendPing(p); else if (room?.role === "player") room.sendPlayerPing(p.x, p.y, p.rev); },
  myName: () => state.name || "",
  sfx: (name, opts) => sfx.play(name, opts),
  showMap: () => { rtab = "map"; view = "log"; render(); },
  setMap: m => { viewedScene(state).map = m; },
  sceneInfo: () => ({ list: state.scenes.map(s => ({ id: s.id, name: s.name })), shownId: state.sceneId, viewId: state.viewId }),
  sceneDo: (op, arg) => {
    const st = state;
    const r = { view: () => SC.viewScene(st, arg), add: () => SC.addScene(st, arg), rename: () => SC.renameScene(st, st.viewId, arg), dup: () => SC.duplicateScene(st, st.viewId), del: () => SC.removeScene(st, st.viewId), show: () => SC.showScene(st, st.viewId) }[op]?.();
    if (op === "show" && room?.role === "host") room.sendBoard();
    return r;
  },
  openSheet: id => {                                         // look at a character's or Threat's sheet from a token
    if (S.byId(id)) { state.selected = id; remoteSel = ""; } else if (findRemote(id)) remoteSel = id; else return false;
    view = "sheet"; persist(); render(); return true;
  },
  addToExchange: id => addToExchange(id),
  post: html => post(html), ask: o => ask(o), toast: m => toast(m)
});
const screenUI = createScreenUI({ $: sel => document.querySelector(sel) });
const clocksUI = createClocksUI({
  $: sel => document.querySelector(sel), isGM, list: () => (isGM() ? state.clocks : remoteBoard.clocks), mine: () => state.clocks,
  svg: (size, filled) => clockSvg(size, filled), post: build => post(bi(build)),
  changed: () => { persist(); renderBoard(); if (room?.role === "host") room.sendBoard(); },
  ask: o => ask(o), toast: m => toast(m)
});
const tablesUI = createTablesUI({
  $: sel => document.querySelector(sel), lang: () => state.lang,
  post: build => post(bi(build)),
  addNote: (title, text) => { J.addNote(state.notes, { title, text }); persist(); },
  toast: m => toast(m)
});
const threatUI = createThreatUI({
  state, $: sel => document.querySelector(sel), lang: () => state.lang, hasMap: () => !!board().map,
  changed: () => { persist(); renderBoard(); },
  /** Put the new Threats on the sheet list, and (if asked) in the Exchange order and as tokens in the middle of the map being viewed. */
  create: (made, o) => {
    const map = board().map, vw = boardUI.centre(), img = TOKENS.find(x => x.includes("Generic_Enemy")) ?? "";
    made.forEach((a, i) => {
      S.addActor(a);
      if (o.exchange) addToExchange(a.id);
      if (o.map && map) {
        const step = (map.cell > 0 ? map.cell : 70) * 1.5, cx = vw ? vw.x + vw.w / 2 : map.w / 2, cy = vw ? vw.y + vw.h / 2 : map.h / 2;
        const tk = B.addToken(map, { name: a.name, x: cx + (i - (made.length - 1) / 2) * step, y: cy + step * 2, color: "#d9453d", img, actorId: a.id, size: 1, hidden: false, pc: false });
        B.moveToken(map, tk.id, tk.x, tk.y);
      }
    });
    view = "sheet"; persist(); render(); if (room?.role === "host") room.sendBoard();
    return made.length;
  },
  ask: o => ask(o), toast: m => toast(m)
});
const SESSION_KEY = "project-moon-the-city/session";
/** Remember the room we are in (not part of the exported save), so a reload goes back to it. A deliberate leave or a refusal forgets it. */
function saveSession() {
  try {
    const snap = room?.session ? room.snapshot() : null;
    if (snap) localStorage.setItem(SESSION_KEY, JSON.stringify(snap)); else localStorage.removeItem(SESSION_KEY);
  } catch { /* private window */ }
}
const savedSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const PEER_URL = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";

const strip = a => JSON.parse(JSON.stringify(a, (k, v) => (k === "derived" || k === "remote" ? undefined : v)));
function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = PEER_URL; el.crossOrigin = "anonymous";
    el.onload = () => (globalThis.Peer ? resolve(globalThis.Peer) : reject(new Error("PeerJS did not load")));
    el.onerror = () => reject(new Error("offline"));
    document.head.appendChild(el);
  });
}
const handlers = {
  onStatus: () => { saveSession(); renderChrome(); renderSidebar(); if (room?.status === "error" && room.error) toast(t(room.error)); },
  onResumed: () => {
    toast(t("Reconnected."));
    if (room.role === "player") scheduleSync(); else { room.sendBoard(); room.broadcastTable(); }
    renderChrome();
  },
  onLog: (entry, quiet) => { if (S.addLog(entry.html, entry.id)) { renderLog(); if (!quiet) { flashLog(); sfx.forHtml(entry.html); } } },
  onTable: () => { if (remoteSel && !findRemote(remoteSel)) remoteSel = ""; renderSidebar(); if (remoteSel) renderMain(); },
  onEffect: (actorId, value) => {
    const a = S.byId(actorId); if (!a) return;
    E.setPenalty(a, value); refresh(a); persist(); render();
  },
  onScene: () => { state.actors.filter(x => x.type === "character").forEach(E.newScene); persist(); render(); toast(t("The GM started a new scene.")); },
  onPing: p => boardUI.showPing(p, { remote: true }),
  onPlayerPing: (pid, name, { x, y, rev }) => {                   // a player pinged: check it, show it here, pass it to everyone else
    const map = S.shownMap();
    if (!map || rev !== map.rev) return;
    const p = B.makePing(map, x, y, false, Date.now(), name);
    if (!p) return;
    boardUI.showPing(p, { remote: true });
    room?.sendPing(p, pid);
  },
  onBoard: b => { if (dragging()) return; remoteBoard.tracker = b.tracker; remoteBoard.map = b.map; remoteBoard.clocks = CK.cleanClocks(b.clocks); clock.sync(timerOf(b.tracker)); renderBoard(); },
  onMapImg: (rev, src) => { remoteBoard.image = { rev, src }; renderBoard(); },
  onToken: (pid, id, x, y) => {
    const map = S.shownMap(), tk = map?.tokens.find(k => k.id === id), peer = room?.peers.get(pid);
    if (!tk || !peer || !tk.actorId || !peer.actors.some(a => a.id === tk.actorId)) return;     // players move only their own characters' tokens
    B.moveToken(map, id, x, y); persist(); renderBoard(); room.sendBoard();
  },
  hostBoard: () => { const T = timerOf(state.tracker); return { tracker: { ...state.tracker, timer: { ...T, left: T.running ? Math.ceil(clock.remaining(T)) : T.left } }, map: B.mapForPlayers(S.shownMap()), clocks: CK.forPlayers(state.clocks), mapImage: S.shownMap() && !S.shownMap().bundled && S.shownMap().src ? { rev: S.shownMap().rev, src: S.shownMap().src } : null  }; },
  onGrant: (actorId, n) => {
    const a = S.byId(actorId);
    if (!a || a.type !== "character" || n < 1) return;
    mutate(a, () => E.awardMarks(a, n));
    toast(t("{name} earns Marks: {n}.", { name: a.name, n }));
  },
  onHarm: (actorId, delta) => {
    const a = S.byId(actorId);
    if (!a || a.type !== "character" || delta < 1) return;
    const res = C.hurtResult(a.system.harm);
    mutate(a, () => { a.system.harm = res.harm; });
    toast(res.changed ? t("{name} takes Hurt: Harm is now {harm}.", { name: a.name, harm: HARM_LABEL[res.harm] }) : t("{name} burns, but Harm is already {harm}: no change.", { name: a.name, harm: HARM_LABEL[res.harm] }));
  },
  onCond: (pid, actorId, types) => {
    // a player's roll used these up: Sinking on anyone it was rolled against or on, Poise only on their own characters
    const peer = room?.peers.get(pid);
    const own = !!peer?.actors.some(a => a.id === actorId);
    const allowed = types.filter(k => k === "sinking" || (k === "poise" && own));
    if (allowed.length && C.clearForActor(state.tracker, actorId, allowed)) { persist(); renderBoard(); room.sendBoard(); }
  },
  hostJournal: () => state.journal,
  onJournal: entries => { remoteJournal = J.cleanList(entries); if (rtab === "jr") renderBoard(); },
  onJournalOp: (name, op, entry) => {
    const r = J.applyOp(state.journal, op, entry, name, { gm: false });
    if (r.ok) { persist(); renderBoard(); room?.sendJournal(state.journal); }
  },
  hostHandouts: name => H.shownListFor(state.handouts, name),
  onHandout: h => {
    H.normalizeHandout(h);
    const i = received.findIndex(x => x.id === h.id);
    if (i >= 0) received[i] = h; else { received.push(h); toast(t("The GM shows you: {title}", { title: H.pick(h, state.lang).title })); handoutUI.view(h); }
    renderBoard();
  },
  onUnhandout: id => { const i = received.findIndex(x => x.id === id); if (i >= 0) received.splice(i, 1); renderBoard(); },
  hostNpcs: () => state.actors.filter(a => a.type === "npc" && a.shared).map(strip),
  hostOwns: id => !!S.byId(id)
};
/** Everyone else's characters (and the GM's shared Threats), as read-only actors. */
function remoteActors() {
  if (!room?.online) return [];
  const out = [];
  for (const p of room.table.players) for (const raw of p.actors) { const a = normalizeActor(raw); a.remote = { pid: p.pid, owner: p.name }; out.push(a); }
  for (const raw of room.table.npcs) { const a = normalizeActor(raw); a.remote = { pid: "host", owner: t("GM") }; out.push(a); }
  return out;
}
const findRemote = id => remoteActors().find(a => a.id === id);
const findActor = id => S.byId(id) ?? findRemote(id);
const viewActor = () => (remoteSel ? findRemote(remoteSel) : null) ?? S.selectedActor();
/** After a roll or technique changed a "weighed down" penalty on someone else's actor, tell its owner. */
function syncRemote(actor, value) { if (actor?.remote && room?.online) room.sendEffect(actor.id, value); }
function scheduleSync() {
  if (!room?.online) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (room.role === "host") room.broadcastTable();
    else room.sendSheets(state.actors.filter(a => a.type === "character").map(strip));
  }, 350);
}

/** Show a dialog and resolve with whatever `read(form)` returns on OK, or null on cancel. */
export function ask({ title, body, ok = t("OK"), wide = false, read = f => Object.fromEntries(new FormData(f).entries()), setup = null, cancel = true }) {
  return new Promise(resolve => {
    const dlg = document.createElement("dialog");
    dlg.className = `pm-modal ${wide ? "wide" : ""}`;
    title = expandMarkers(title, state.lang); body = expandMarkers(body, state.lang); ok = expandMarkers(ok, state.lang);
    dlg.innerHTML = `<form method="dialog" class="pm-dialog"><header><h2>${esc(title)}</h2></header><div class="pm-dlg-body">${body}</div>
      <footer>${cancel ? `<button type="button" value="cancel" class="ghost" data-cancel>${esc(t("Cancel"))}</button>` : ""}<button type="submit" value="ok" class="primary">${esc(ok)}</button></footer></form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector("form");
    let result = null, done = false;
    const finish = () => { if (done) return; done = true; dlg.remove(); resolve(result); };
    form.addEventListener("submit", () => { result = read(form); setTimeout(finish, 0); });
    dlg.querySelector("[data-cancel]")?.addEventListener("click", () => { dlg.close(); finish(); });
    dlg.addEventListener("close", finish);
    dlg.addEventListener("cancel", () => setTimeout(finish, 0));   // Escape
    setup?.(form);
    dlg.showModal();
  });
}
/** Show what a kit holds, let the GM choose how to bring it in, and do it. A snapshot of what exists now is kept first. */
async function kitDialog(kit) {
  if (room?.online && room.role !== "host") return toast(t("Only the GM can import a kit."));
  const c = KIT.contents(kit), lang = state.lang;
  const li = (n, label) => (n ? `<li>${esc(t(label, { n }))}</li>` : "");
  const r = await ask({
    title: KIT.pick(kit.title, lang), ok: t("Import kit"), wide: true,
    body: `<p>${esc(KIT.pick(kit.about, lang))}</p><ul>${li(c.scenes, "{n} scenes with maps")}${li(c.tokens, "{n} tokens")}${li(c.actors, "{n} Threat sheets")}${li(c.handouts, "{n} handouts")}${li(c.notes, "{n} private notes")}${li(c.journal, "{n} journal entries")}${li(c.clocks, "{n} Clocks")}</ul>
      <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="add" checked> ${esc(t("Add to what I have (nothing is replaced; names that already exist are kept)"))}</label></div>
      <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="prep"> ${esc(t("Only scenes and notes"))}</label></div>
      <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="replace"> ${esc(t("Replace my Threats, scenes, handouts, notes, journal and Clocks (characters are kept)"))}</label></div>
      <p class="pm-note">${esc(t("A snapshot of what you have now is kept first, so you can go back."))}</p>`,
    read: f => f.elements.mode.value
  });
  if (!r) return;
  if (r === "replace" && !(await confirmDlg(t("Replace"), esc(t("This replaces your Threats, scenes, handouts, notes, journal and Clocks with the kit's. Characters stay.")), t("Replace")))) return;
  await takeSnapshot("before kit", true);
  const out = KIT.applyKit(state, kit, { mode: r, lang, author: state.name || "GM" });
  persist(); render(); if (room?.role === "host") { room.sendBoard(); room.sendJournal(state.journal); }
  toast(t("Kit imported: {a} Threats, {s} scenes, {h} handouts, {n} notes, {c} Clocks.", { a: out.actors, s: out.scenes, h: out.handouts, n: out.notes, c: out.clocks }) + (out.skipped ? " " + t("{n} left as they were.", { n: out.skipped }) : ""));
}
/** Put `html` in the print-only area and open the browser's print dialog ("Save as PDF" makes the file). */
function printPages(html, title) {
  const area = $("#print-area"), old = document.title;
  area.innerHTML = html; document.title = title; document.body.classList.add("printing");
  const done = () => { area.innerHTML = ""; document.body.classList.remove("printing"); document.title = old; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}
async function printDialog() {
  const a = viewActor(), gm = isGM();
  const opts = [
    a ? ["sheet", t("This sheet: {name}", { name: a.name })] : null,
    ["blank", t("A blank character sheet")],
    ["handouts", gm ? t("All handouts") : t("The handouts I have been shown")],
    ["journal", t("The party journal")], ["notes", t("My private notes")],
    ["screen", t("The rules screen")],
    gm ? ["clocks", t("The Clocks")] : null
  ].filter(Boolean);
  const r = await ask({
    title: t("Print"), ok: t("Print"), wide: true,
    body: `<p>${esc(t("This opens your browser's print window. Choose \"Save as PDF\" as the printer to make a file."))}</p>${opts.map(([k, l], i) => `<div class="pm-row"><label class="chk"><input type="radio" name="what" value="${k}" ${i ? "" : "checked"}> ${esc(l)}</label></div>`).join("")}
      <div class="pm-row"><label class="chk"><input type="checkbox" name="both"> ${esc(t("Handouts: print both languages when there are two"))}</label></div>`,
    read: f => ({ what: f.elements.what.value, both: f.elements.both.checked })
  });
  if (!r) return;
  const lang = state.lang, tr = (k, d) => t(k, d);
  const handouts = gm ? state.handouts : received;
  const map = {
    sheet: () => PR.actorPage(a, tr), blank: () => PR.characterPage(null, tr),
    handouts: () => handouts.map(h => PR.handoutPages(h, lang, { both: r.both })).join(""),
    journal: () => PR.journalPage(t("Party journal"), J.sorted(partyJournal()), tr), notes: () => PR.journalPage(t("My notes"), J.sorted(state.notes), tr),
    screen: () => PR.screenPages(tr), clocks: () => PR.clocksPage(state.clocks, tr)
  };
  const html = map[r.what]();
  if (!html || (r.what === "handouts" && !handouts.length)) return toast(t("Nothing to print there yet."));
  printPages(html, r.what === "sheet" ? a.name : t("Print"));
}
/* ---- undo ---- */
const undoStack = UNDO.newStack();
/** What each action is called when it is undone. Anything not here cannot be undone. */
const UNDO_LABEL = {
  rollSkill: "Roll", rollAttribute: "Roll", hailMary: "Hail Mary", useTechnique: "Signature Technique", invokeVice: "Vice", rollNpc: "Threat roll", applyHurt: "Apply Hurt",
  upkeep: "Upkeep", newScene: "New scene", rest: "Rest", ride: "Riding a Sin", drift: "Drift", wear: "Gear wear", downtime: "Downtime", downtimeAll: "Downtime for all", newSceneAll: "New scene for all",
  clockStep: "Clock change", deleteClock: "Clock change", ckStep: "Clock change", ckEdit: "Clock change",
  xStart: "Exchange change", xEnd: "Exchange change", xNext: "Exchange change", xFill: "Exchange change", slotMove: "Exchange change", slotActed: "Exchange change", slotRemove: "Exchange change", slotAdd: "Exchange change",
  condStep: "Condition change", condRemove: "Condition change", condAdd: "Condition change",
  marksRaise: "Growth", marksUnlock: "Grade unlock", awardMarks: "Marks awarded", tokenDel: "Token removed", marksClear: "Drawings cleared", deleteActor: "Sheet deleted", sceneDel: "Scene deleted", deleteItem: "Item deleted"
};
const nowJson = () => JSON.stringify(S.exportData());
const markUndo = label => UNDO.push(undoStack, label, nowJson());
function renderUndo() {
  const b = $("#b-undo"); if (!b) return;
  const label = UNDO.peek(undoStack, nowJson());
  b.disabled = !label; b.textContent = t("Undo");
  b.title = label ? t("Undo: {label}", { label: t(label) }) : t("Nothing to undo.");
}
function undoLast() {
  const r = UNDO.pop(undoStack, nowJson());
  if (!r) return toast(t("Nothing to undo."));
  S.importData(r.json); sfx.settings.on = state.sound.on;
  const label = r.label;
  post(bi(() => E.card(esc(t("Undone: {label}", { label: t(label) })), `<p>${esc(t("{name} took back the last change.", { name: state.name || t("Someone") }))}</p>`)));
  persist(); render();
  if (room?.role === "host") { room.sendBoard(); room.sendJournal(state.journal); }
  toast(t("Undone: {label}", { label: t(label) }));
}
const BUNDLED_KITS = [["kits/session01.json", "Session 01: The Row Shipment (Risk 3)"]];
const confirmDlg = (title, message, ok = t("OK")) => ask({ title, body: `<p>${message}</p>`, ok, read: () => true }).then(Boolean);

/* ------------------------------------------------------------------ rendering */

export function render() {
  document.documentElement.lang = state.lang;
  document.body.classList.toggle("is-gm", isGM());
  document.body.dataset.view = view;
  renderChrome();
  renderUndo();
  renderSidebar();
  renderMain();
  renderLog();
  renderBoard();
}

function renderBoard() {
  if ((rtab === "thr" || rtab === "tb") && !isGM()) rtab = "log";
  const tabs = [["log", t("Log")], ["xchg", t("Exchange")], ["map", t("Map")], ["ho", t("Handouts")], ["jr", t("Journal")], ["ck", t("Clocks")], ["sc", t("Screen")], ...(isGM() ? [["thr", t("Threats")], ["tb", t("Tables")]] : [])];
  $("#rtabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-action="rtab" data-tab="${k}" class="${rtab === k ? "active" : ""}">${esc(l)}</button>`).join("");
  for (const [k, id] of [["log", "pane-log"], ["xchg", "pane-xchg"], ["map", "pane-map"], ["ho", "pane-ho"], ["jr", "pane-jr"], ["thr", "pane-thr"], ["tb", "pane-tb"], ["ck", "pane-ck"], ["sc", "pane-sc"]]) $("#" + id).hidden = rtab !== k;
  $("#b-clearlog").hidden = rtab !== "log";
  $("#b-secret").hidden = rtab !== "log" || !isGM();
  if (rtab === "xchg") boardUI.renderTracker();
  if (rtab === "map") boardUI.renderMap();
  if (rtab === "ho") handoutUI.render();
  if (rtab === "jr") journalUI.render();
  if (rtab === "thr") threatUI.render();
  if (rtab === "tb") tablesUI.render();
  if (rtab === "ck") clocksUI.render();
  if (rtab === "sc") screenUI.render();
}

function renderChrome() {
  $("#lang").textContent = state.lang === "es" ? "EN" : "ES";
  $("#lang").title = state.lang === "es" ? "English" : "Español";
  const labels = { people: t("People"), sheet: t("Sheet"), log: t("Table") };
  $("#phone-tabs").innerHTML = ["people", "sheet", "log"].map(v => `<button type="button" data-action="view" data-view="${v}" class="${view === v ? "active" : ""}">${esc(labels[v])}</button>`).join("");
  $("#t-title").textContent = t("Project Moon: The City");
  $("#t-sub").textContent = t("A free table companion. Your sheets are saved in this browser.");
  for (const [id, key] of [["b-backup", "Backup"], ["b-export", "Export"], ["b-import", "Import"], ["b-print", "Print"], ["b-kits", "Kits"], ["b-help", "Help"]]) $("#" + id).textContent = t(key);
  renderWarn();
  const sb = $("#b-sound");
  sb.textContent = state.sound.on ? `\u266A ${t("Sound on")}` : `\u266A ${t("Sound off")}`;
  sb.classList.toggle("off", !state.sound.on);
  $("#vol").value = Math.round(state.sound.vol * 100);
  $("#timer-chip").title = t("Turn timer");
  const rb = $("#b-room");
  rb.textContent = room?.online ? `${t("Room")} ${room.code} · ${room.count}` : (room?.reconnecting ? t("Reconnecting...") : (room?.status === "connecting" ? t("Connecting...") : t("Room")));
  rb.classList.toggle("live", !!room?.online);
  rb.classList.toggle("warn", !!room?.reconnecting);
  const nb = $("#netbar");
  nb.hidden = !room?.reconnecting;
  if (room?.reconnecting) nb.innerHTML = `<span>${esc(room.role === "host" ? t("Reopening room {code}...", { code: room.code }) : t("Lost the room. Reconnecting to {code}...", { code: room.code }))} <small>(${room.attempt || 1})</small></span><button type="button" data-action="stopRetry">${esc(t("Stop trying"))}</button>`;
  const chat = $("#chat");
  chat.hidden = !room?.online;
  $("#chat-text").placeholder = t("Say something to the table");
  $("#chat-send").textContent = t("Send");
  const to = $("#chat-to");
  const sel = to.value;
  to.hidden = room?.role !== "host";
  if (room?.role === "host") to.innerHTML = `<option value="">${esc(t("Everyone"))}</option>` + [...room.peers].map(([pid, p]) => `<option value="${esc(pid)}">${esc(p.name)}</option>`).join("");
  to.value = [...to.options].some(o => o.value === sel) ? sel : "";
}

function renderSidebar() {
  const icon = { character: "◆", npc: "▲", crew: "■" };
  const list = state.actors.map(a => {
    let sub = "";
    if (a.type === "character") sub = `E.G.O. ${a.derived.egoCurrent}/${a.system.ego.max} · ${t("Stress")} ${a.system.stress}`;
    else if (a.type === "npc") sub = `${t("Grade")} ${a.system.grade}${a.system.isGroup ? ` · ${t("group")}` : ""}`;
    else sub = `${t("Fund")} ${a.system.fund}`;
    return `<li><button type="button" class="actor ${a.id === state.selected && !remoteSel ? "sel" : ""} ${a.type}" data-action="select" data-id="${a.id}"><span class="ic">${icon[a.type]}</span><span class="nm">${esc(a.name)}</span><small>${esc(sub)}</small></button></li>`;
  }).join("");
  $("#side").innerHTML = `
    <div class="side-actions">
      <button type="button" data-action="newCharacter">+ ${esc(t("Character"))}</button>
      <button type="button" data-action="newNpc">+ ${esc(t("Threat"))}</button>
      <button type="button" data-action="newCrew">+ ${esc(t("Crew"))}</button>
      <button type="button" data-action="pregens" class="gold">${esc(t("Add the 4 pregens"))}</button>
    </div>
    <ul class="actor-list">${list || `<li class="hint pad">${esc(t("Nobody yet. Add the pregens, or make a character."))}</li>`}</ul>
    ${remoteHtml()}
    <div class="side-foot"><button type="button" data-action="downtimeAll">${esc(t("Run downtime for all"))}</button><button type="button" data-action="newSceneAll">${esc(t("New scene for all"))}</button>${isGM() ? `<button type="button" data-action="awardMarks">${esc(t("Award Marks"))}</button>` : ""}</div>`;
}

function remoteHtml() {
  const list = remoteActors();
  if (!room?.online) return "";
  const rows = list.map(a => `<li><button type="button" class="actor remote ${a.id === remoteSel ? "sel" : ""} ${a.type}" data-action="selectRemote" data-id="${a.id}"><span class="ic">${a.type === "npc" ? "▲" : "◆"}</span><span class="nm">${esc(a.name)}</span><small>${esc(a.remote.owner)}${a.type === "character" ? ` · E.G.O. ${a.derived.egoCurrent}/${a.system.ego.max} · ${esc(t("Stress"))} ${a.system.stress}` : ""}</small></button></li>`).join("");
  return `<div class="side-room"><b>${esc(t("At the table"))}</b> <small>${esc(room.code)} · ${room.count}</small></div><ul class="actor-list remote-list">${rows || `<li class="hint pad">${esc(t("Nobody else is here yet."))}</li>`}</ul>`;
}

function renderMain() {
  const a = viewActor();
  const el = $("#main");
  if (!a) { el.innerHTML = `<div class="empty"><h2>${esc(t("Welcome to the City"))}</h2><p>${esc(t("Add the four pregenerated characters, or make your own. Roll from the sheet; the log keeps every result."))}</p><p><button type="button" class="primary" data-action="pregens">${esc(t("Add the 4 pregens"))}</button></p></div>`; return; }
  const scroll = el.querySelector(".pm-body")?.scrollTop ?? 0;
  el.innerHTML = a.type === "character" ? characterSheet(a) : (a.type === "npc" ? npcSheet(a) : crewSheet(a));
  el.classList.toggle("readonly", !!a.remote);
  if (a.remote) el.querySelector(".pm-head")?.insertAdjacentHTML("afterbegin", `<div class="ro-note">${esc(t("{owner}'s sheet (read only)", { owner: a.remote.owner }))}</div>`);
  const body = el.querySelector(".pm-body"); if (body) body.scrollTop = scroll;
}

function renderLog() {
  const el = $("#log-list");
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = state.log.map(e => `<div class="msg ${e.secret ? "secret" : ""}">${e.html}${e.secret ? `<div class="msg-acts"><span>${esc(t("Only you can see this"))}</span><button type="button" data-action="revealRoll" data-id="${esc(e.id)}">${esc(t("Show to the table"))}</button></div>` : ""}</div>`).join("") || `<p class="hint pad">${esc(t("Rolls and results appear here."))}</p>`;
  $("#b-clearlog").textContent = t("Clear log");
  if (atBottom || !el.dataset.init) { el.scrollTop = el.scrollHeight; el.dataset.init = "1"; }
}

/* ---- character ---- */

function header(a, badges, extra = "") {
  return `<header class="pm-head"><input class="pm-name" type="text" data-path="name" value="${esc(a.name)}" placeholder="${esc(t("Name"))}">
    <div class="pm-badges">${badges}</div>${extra}
    <div class="pm-tools">${a.type === "character" ? `<button type="button" data-action="exportCharacter" title="${esc(t("Save this character as a file"))}">${esc(t("Export"))}</button>` : ""}<button type="button" data-action="duplicateActor">${esc(t("Duplicate"))}</button><button type="button" data-action="deleteActor">${esc(t("Delete"))}</button></div></header>`;
}

function characterSheet(a) {
  const s = a.system, d = a.derived;
  const tab = tabs[a.id] ?? "main";
  const badges = [
    `<span class="pm-badge">${esc(t("Grade"))} ${s.grade}</span>`,
    `<span class="pm-badge">${esc(t("Resources"))} ${s.resources}/5</span>`,
    d.alignment && s.resonance[d.alignment] > 0 ? `<span class="pm-badge sin sin-${d.alignment}">${esc(t("Alignment"))}: ${esc(SIN_LABEL[d.alignment])}</span>` : "",
    d.empty ? `<span class="pm-badge warn">${esc(t("Empty"))}</span>` : (d.unsteady ? `<span class="pm-badge warn">${esc(t("Unsteady"))}</span>` : ""),
    d.fraying ? `<span class="pm-badge warn">${esc(t("Fraying"))}</span>` : "",
    s.riding ? `<span class="pm-badge sin sin-${s.riding}">${esc(t("Riding"))} ${esc(SIN_LABEL[s.riding])}</span>` : "",
    s.scene.unmoved ? `<span class="pm-badge sin">${esc(t("Unmoved"))}</span>` : "",
    s.scene.armed ? `<span class="pm-badge sin">${esc(t("Rampage armed"))}</span>` : "",
    s.scene.nextPenalty ? `<span class="pm-badge warn">${esc(t("Weighed down"))} ${s.scene.nextPenalty}</span>` : ""
  ].join("");
  const meters = `<div class="pm-meters">
      <div class="pm-meter"><b>E.G.O.</b> ${pips(s.ego.max, d.egoCurrent)}
        <input class="pm-small" type="number" data-path="system.ego.value" value="${d.egoCurrent}" min="0" max="${s.ego.max}"> / ${s.ego.max}
        <button type="button" data-action="rest" title="${esc(t("Rest: +1 E.G.O."))}">+1</button></div>
      <div class="pm-meter"><b>${esc(t("Stress"))}</b> ${pips(5, s.stress, "stress")} <input class="pm-small" type="number" data-path="system.stress" value="${s.stress}" min="0" max="5"></div>
      <div class="pm-meter"><b>${esc(t("Harm"))}</b> <select data-path="system.harm" data-num>${opts(harmChoices(), s.harm)}</select></div>
    </div>
    <div class="pm-actions"><button type="button" data-action="hailMary">${esc(t("Hail Mary"))}</button>
      <button type="button" data-action="newScene" title="${esc(t("Reset Flashpoint and Pull, end Riding"))}">${esc(t("New scene"))}</button></div>`;
  const tabNames = [["main", "Character"], ["self", "The Self"], ["sins", "Sins"], ["gear", "Gear and Bonds"], ["growth", "Growth"], ["notes", "Notes"]];
  const nav = `<nav class="pm-tabs">${tabNames.map(([k, l]) => `<button type="button" data-action="tab" data-tab="${k}" class="${tab === k ? "active" : ""}">${esc(t(l))}</button>`).join("")}</nav>`;
  return `<div class="pm-sheet">${header(a, badges, meters)}${nav}<section class="pm-body">${characterTab(a, tab)}</section></div>`;
}

function characterTab(a, tab) {
  const s = a.system;
  if (tab === "main") {
    const under = s.riding || s.under;
    const field = (label, path, v) => `<label>${esc(t(label))} ${txt(path, v)}</label>`;
    const skills = R.SKILLS.map(k => {
      const fit = R.fitFor(under, k, under ? s.resonance[under] : 0);
      return `<tr class="${fit > 0 ? "fit-up" : (fit < 0 ? "fit-down" : "")}"><td><button type="button" data-action="rollSkill" data-skill="${k}">${esc(SKILL_LABEL[k])}</button></td>
        <td class="hint">${esc(ATTRIBUTE_LABEL[R.DEFAULT_ATTRIBUTE[k]])}</td><td>${num(`system.skills.${k}`, s.skills[k], 0, 5)}</td>
        <td class="fit">${fit ? `${fit > 0 ? "+" : ""}${fit} ${esc(t("Fit"))}` : ""}</td></tr>`;
    }).join("");
    return `<div class="pm-grid2">${field("Concept", "system.concept", s.concept)}${field("Identity", "system.identity", s.identity)}${field("Occupation", "system.occupation", s.occupation)}${field("Affiliation", "system.affiliation", s.affiliation)}${field("Background", "system.background", s.background)}
      <label>${esc(t("Grade"))} ${num("system.grade", s.grade, 1, 9)}</label></div>
      <h3>${esc(t("Attributes"))}</h3><div class="pm-attrs">${R.ATTRIBUTES.map(k => `<div class="pm-attr"><button type="button" data-action="rollAttribute" data-attr="${k}">${esc(ATTRIBUTE_LABEL[k])}</button>${num(`system.attributes.${k}`, s.attributes[k], 1, 5)}</div>`).join("")}</div>
      <h3>${esc(t("Skills"))} <small>(${esc(t("click a name to roll"))})</small></h3><table class="pm-skills">${skills}</table>`;
  }
  if (tab === "self") {
    const item = i => `<li><b>${esc(i.name)}</b> <span class="hint">${esc(i.system.trigger)}</span><span class="ctl"><button type="button" data-action="editItem" data-id="${i.id}">${esc(t("Edit"))}</button><button type="button" data-action="deleteItem" data-id="${i.id}">&times;</button></span></li>`;
    const tr = traumasOf(a);
    return `<h3>${esc(t("The Wound"))}</h3><div class="pm-grid2">
      <label class="wide">${esc(t("Burden"))} <textarea data-path="system.burden" rows="2">${esc(s.burden)}</textarea></label>
      <label>${esc(t("Fear"))} ${txt("system.fear", s.fear)}</label><label>${esc(t("Boundary"))} ${txt("system.boundary", s.boundary)}</label>
      <label>${esc(t("Vice"))} <span class="inline-row">${txt("system.vice", s.vice)}<button type="button" data-action="invokeVice" title="${esc(t("+1 E.G.O., once per scene, inside the refund cap"))}">${esc(t("Invoke"))}</button></span></label>
      <label>${esc(t("Desire"))} ${txt("system.desire", s.desire)}</label><label>${esc(t("Principle"))} ${txt("system.principle", s.principle)}</label><label>${esc(t("Ambition"))} ${txt("system.ambition", s.ambition)}</label>
      <label>${esc(t("Broken Boundaries"))} ${num("system.broken", s.broken, 0, 3)}</label><label>${esc(t("Scars"))} ${txt("system.scars", s.scars)}</label></div>
      <details class="altlang"><summary>${esc(t("The same words in {lang} (for the Voice and the Verdict)", { lang: H.LANG_NAME[H.otherLang(s.lang)] }))}</summary>
        <div class="pm-grid2"><label>${esc(t("The words above are written in"))} <select data-path="system.lang">${opts({ en: H.LANG_NAME.en, es: H.LANG_NAME.es }, s.lang)}</select></label>
          <label class="wide">${esc(t("Burden"))} <textarea data-path="system.alt.burden" rows="2">${esc(s.alt.burden)}</textarea></label>
          <label>${esc(t("Fear"))} ${txt("system.alt.fear", s.alt.fear)}</label><label>${esc(t("Boundary"))} ${txt("system.alt.boundary", s.alt.boundary)}</label></div>
        <p class="hint">${esc(t("Optional. Cards that quote these words then read in each player's language."))}</p></details>
      <h3>${esc(t("Traumas"))} <button type="button" data-action="createItem" data-type="trauma">${esc(t("Add"))}</button></h3>
      <ul class="pm-list">${tr.map(item).join("") || `<li class="hint">${esc(t("No Traumas yet."))}</li>`}</ul>`;
  }
  if (tab === "growth") {
    const raiseBtn = (kind, key) => {
      const info = R.raiseInfo(s, kind, key), why = { cap: t("Needs a Grade unlock"), marks: t("Not enough Marks"), max: t("At the maximum") }[info.reason] ?? "";
      return `<button type="button" data-action="marksRaise" data-kind="${kind}" data-key="${key}" ${info.ok ? "" : "disabled"} title="${esc(info.ok ? "" : why)}">${esc(t("Raise"))} (${info.cost})</button>${info.ok || !why ? "" : ` <small class="hint">${esc(why)}</small>`}`;
    };
    const skillRows = R.SKILLS.map(k => `<tr><td>${esc(SKILL_LABEL[k])}</td><td>${s.skills[k]}</td><td>${raiseBtn("skill", k)}</td></tr>`).join("");
    const attrRows = R.ATTRIBUTES.map(k => `<tr><td>${esc(ATTRIBUTE_LABEL[k])}</td><td>${s.attributes[k]}</td><td>${raiseBtn("attr", k)}</td></tr>`).join("");
    const unlockName = { skill4: t("Skill 4"), attr5: t("Attribute 5"), skill5: t("Skill 5") };
    const unlocks = R.UNLOCKS.map(u => {
      const label = `<b>${esc(unlockName[u.slot])}</b> <small class="hint">(${esc(t("Grade {n}", { n: u.grade }))})</small>`;
      if (s.grade > u.grade) return `<li class="dim">${label}: ${esc(t("not yet"))}</li>`;
      const chosen = s.unlocks[u.slot];
      if (chosen) return `<li>${label}: ${esc(u.kind === "attr" ? ATTRIBUTE_LABEL[chosen] : SKILL_LABEL[chosen])}</li>`;
      const ch = R.unlockChoices(s, u.slot);
      return `<li>${label}: ${ch.length ? ch.map(k => `<button type="button" data-action="marksUnlock" data-slot="${u.slot}" data-key="${k}">${esc(u.kind === "attr" ? ATTRIBUTE_LABEL[k] : SKILL_LABEL[k])}</button>`).join(" ") : `<span class="hint">${esc(t("nothing is at {n} yet", { n: u.from }))}</span>`}</li>`;
    }).join("");
    const hist = (s.growth ?? []).slice(-8).reverse().map(g => `<li>${esc(g.kind === "attr" ? ATTRIBUTE_LABEL[g.key] : SKILL_LABEL[g.key])} &rarr; ${g.to} <small class="hint">(${esc(t("Marks spent: {n}", { n: g.cost }))})</small></li>`).join("");
    return `<div class="pm-grid2"><label>${esc(t("Unspent Marks"))} ${num("system.marks.unspent", s.marks.unspent, 0, 99)}</label><label>${esc(t("Marks earned in total"))} ${num("system.marks.earned", s.marks.earned, 0, 999)}</label></div>
      <p class="hint">${esc(t("Spend Marks in downtime, in a scene that shows the training. A Skill costs its new rating; an Attribute costs three times its new rating. Skills stop at 3 and Attributes at 4 until a Grade unlock."))}</p>
      <div class="pm-cols"><div><h3>${esc(t("Skills"))}</h3><table class="pm-skills">${skillRows}</table></div><div><h3>${esc(t("Attributes"))}</h3><table class="pm-skills">${attrRows}</table>
      <h3>${esc(t("Grade unlocks"))}</h3><ul class="unlocks">${unlocks}</ul></div></div>
      ${hist ? `<h3>${esc(t("Growth so far"))}</h3><ul>${hist}</ul>` : ""}`;
  }
  if (tab === "sins") {
    const sc = { "": t("None"), ...sinChoices() };
    const rows = R.SINS.map(k => {
      const rating = s.resonance[k], idx = R.WHEEL.indexOf(k);
      const beats = [1, 2].map(i => SIN_LABEL[R.WHEEL[(idx + i) % 7]]).join(", ");
      const loses = [1, 2].map(i => SIN_LABEL[R.WHEEL[(idx - i + 7) % 7]]).join(", ");
      const max = R.techniqueUsesPerScene(rating), used = s.scene.techniques[k] ?? 0, strained = s.strained === k, auto = k === "pride" || k === "envy";
      const tech = rating >= 2 ? `<tr class="tech sin-${k}"><td colspan="5"><b>${esc(SIGNATURE[k][0])}</b> (${used}/${max} ${esc(t("this scene"))}${strained ? `, ${esc(t("Strained"))}` : ""}): ${esc(SIGNATURE[k][1])}</td>
        <td><button type="button" data-action="useTechnique" data-sin="${k}" ${used >= max || strained ? "disabled" : ""} title="${esc(auto ? t("Offered automatically during rolls; this button explains how") : t("Apply this technique"))}">${esc(auto ? t("Info") : t("Use"))}</button></td></tr>` : "";
      return `<tr class="sin-${k} ${d(a).alignment === k && rating > 0 ? "alignment" : ""}"><td><b>${esc(SIN_LABEL[k])}</b><br><small>${esc(SIN_TEXT[k].keyword)}</small></td>
        <td>${num(`system.resonance.${k}`, rating, 0, 5)}</td><td>${num(`system.tally.${k}`, s.tally[k], 0, 999)}</td>
        <td><small>${esc(t("Strong"))}: ${esc(beats)}<br>${esc(t("Weak"))}: ${esc(loses)}</small></td>
        <td><small>+ ${esc(R.FIT[k].favored.map(x => SKILL_LABEL[x]).join(", "))}<br>&minus; ${esc(R.FIT[k].hindered.map(x => SKILL_LABEL[x]).join(", "))}</small></td>
        <td><button type="button" data-action="ride" data-sin="${k}" class="${s.riding === k ? "active" : ""}">${esc(s.riding === k ? t("Riding") : t("Ride"))}</button></td></tr>${tech}`;
    }).join("");
    return `<div class="pm-grid2">
      <label>${esc(t("Under a Sin (not Riding)"))} <select data-path="system.under">${opts(sc, s.under)}</select></label>
      <label>${esc(t("Riding"))} <select data-path="system.riding">${opts(sc, s.riding)}</select></label>
      <label>${esc(t("Strained by a Scar"))} <select data-path="system.strained">${opts(sc, s.strained)}</select></label></div>
      <div class="scroll-x"><table class="pm-sins"><thead><tr><th>${esc(t("Sin"))}</th><th>${esc(t("Resonance"))}</th><th>${esc(t("Tally"))}</th><th>${esc(t("Wheel"))}</th><th>${esc(t("Fit (when Under)"))}</th><th></th></tr></thead>${rows}</table></div>
      <p><button type="button" data-action="drift">${esc(t("End-of-fourth-session Drift"))}</button></p>`;
  }
  if (tab === "gear") {
    const gear = gearOf(a).map(g => `<li class="${g.derived.spent ? "spent" : ""}"><b>${esc(g.name)}</b> <span class="hint">${esc(GEAR_KIND_LABEL[g.system.kind])}${g.system.sin ? ` · ${esc(SIN_LABEL[g.system.sin])}` : ""}${g.system.fine ? ` · ${esc(t("Fine"))}` : ""}</span>
      <span class="wear">${esc(t("Wear"))} ${pips(3, g.system.wear)} <button type="button" data-action="wear" data-id="${g.id}" data-delta="-1">&minus;</button><button type="button" data-action="wear" data-id="${g.id}" data-delta="1">+</button></span>
      ${g.derived.spent ? `<span class="badge-spent">${esc(t("Spent"))}</span>` : ""}
      <span class="ctl"><button type="button" data-action="editItem" data-id="${g.id}">${esc(t("Edit"))}</button><button type="button" data-action="deleteItem" data-id="${g.id}">&times;</button></span></li>`).join("");
    const bonds = bondsOf(a).map(b => `<li><b>${esc(BOND_TYPE_LABEL[b.system.type])} ${b.system.strength}</b> ${esc(b.system.person)} <span class="hint">${esc(b.name)}</span>
      <span class="ctl"><button type="button" data-action="editItem" data-id="${b.id}">${esc(t("Edit"))}</button><button type="button" data-action="deleteItem" data-id="${b.id}">&times;</button></span></li>`).join("");
    return `<div class="pm-grid2"><label>${esc(t("Resources (0 to 5)"))} <span class="inline-row">${num("system.resources", s.resources, 0, 5)}<button type="button" data-action="upkeep" title="${esc(t("Pay upkeep, repair Spent gear, rest"))}">${esc(t("Downtime upkeep"))}</button></span></label></div>
      <h3>${esc(t("Gear"))} <button type="button" data-action="createItem" data-type="gear">${esc(t("Add"))}</button></h3><ul class="pm-list">${gear || `<li class="hint">${esc(t("No gear."))}</li>`}</ul>
      <h3>${esc(t("Bonds"))} <button type="button" data-action="createItem" data-type="bond">${esc(t("Add"))}</button></h3><ul class="pm-list">${bonds || `<li class="hint">${esc(t("No Bonds."))}</li>`}</ul>`;
  }
  return `<textarea class="pm-notes-area" data-path="system.notes" rows="18">${esc(s.notes)}</textarea>`;
}
const d = a => a.derived;

/* ---- Threat ---- */

function npcSheet(a) {
  const s = a.system, dd = a.derived;
  const badges = `<span class="pm-badge">${esc(t("Grade"))} ${s.grade}${s.isGroup ? ` · ${esc(t("group"))}` : ""}</span><span class="pm-badge">${dd.dice} ${esc(t("dice"))}</span><span class="pm-badge">${esc(t("Difficulty {n}", { n: dd.difficulty }))}</span>${s.alignment ? `<span class="pm-badge sin sin-${s.alignment}">${esc(SIN_LABEL[s.alignment])} ${dd.sinRating}</span>` : ""}${s.nextPenalty ? `<span class="pm-badge warn">${esc(t("Weighed down"))} ${s.nextPenalty}</span>` : ""}`;
  const threat = { 0: t("Holding"), 1: t("Breaking"), 2: t("Routed") };
  return `<div class="pm-sheet">${header(a, badges, `<div class="pm-actions"><button type="button" data-action="rollNpc">${esc(t("Roll its pool"))}</button>${isGM() ? `<button type="button" data-action="rollNpcSecret" title="${esc(t("Only you see the result, until you show it to the table."))}">${esc(t("Roll in secret"))}</button>` : ""}${isGM() ? `<button type="button" data-action="thrSave" title="${esc(t("Keep this Threat as a template in the Threats tab"))}">${esc(t("Save to library"))}</button>` : ""}${room?.role === "host" ? `<button type="button" data-action="shareNpc" class="${a.shared ? "active" : ""}">${esc(a.shared ? t("Shown to the table") : t("Show to the table"))}</button>` : ""}</div>`)}
    <section class="pm-body"><div class="pm-grid2">
      <label>${esc(t("Concept"))} ${txt("system.concept", s.concept)}</label>
      <label>${esc(t("Grade"))} ${num("system.grade", s.grade, 1, 9)}</label>
      <label><input type="checkbox" data-path="system.isGroup" ${s.isGroup ? "checked" : ""}> ${esc(t("A group (+2 dice)"))}</label>
      <label>${esc(t("Sin"))} <select data-path="system.alignment">${opts({ ...sinChoices() }, s.alignment, t("None"))}</select></label>
      <label>${esc(t("Harm"))} <select data-path="system.harm" data-num>${opts(harmChoices(), s.harm)}</select></label>
      <label>${esc(t("Threat Clock"))} <select data-path="system.threat" data-num>${opts(threat, s.threat)}</select></label>
      <label>${esc(t("Want"))} ${txt("system.want", s.want)}</label><label>${esc(t("Bond hook"))} ${txt("system.bondHook", s.bondHook)}</label>
      <label class="wide">${esc(t("Detail"))} ${txt("system.detail", s.detail)}</label></div>
      <h3>${esc(t("Notes"))}</h3><textarea class="pm-notes-area" data-path="system.notes" rows="8">${esc(s.notes)}</textarea></section></div>`;
}

/* ---- Crew ---- */

function clockSvg(size, filled) {
  const cx = 32, cy = 32, r = 28;
  const pt = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  let out = `<svg viewBox="0 0 64 64" width="64" height="64" class="pm-clock">`;
  for (let i = 0; i < size; i++) {
    const a0 = -Math.PI / 2 + (2 * Math.PI * i) / size, a1 = -Math.PI / 2 + (2 * Math.PI * (i + 1)) / size;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    out += `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" class="seg ${i < filled ? "on" : ""}"/>`;
  }
  return out + `</svg>`;
}

function crewSheet(a) {
  const s = a.system;
  const members = E.crewMembers(a, state.actors);
  const grade = E.officeGrade(members);
  const maxRisk = E.maxRiskOffered(grade);
  const badges = `<span class="pm-badge">${esc(t("Office Grade"))} ${grade}</span><span class="pm-badge">${esc(t("Highest Risk offered:"))} ${esc(maxRisk === "any" ? t("any") : maxRisk)}</span>${a.derived.fractured ? `<span class="pm-badge warn">${esc(t("Fractured"))}</span>` : ""}`;
  const assets = [["safehouse", "Safehouse (3)", "Recover up to 3 E.G.O. between Contracts"], ["getaway", "Getaway (2)", "Chases clear a segment on a win by 1"], ["workshop", "Workshop contact (2)", "Free repairs, -1 Cost once per phase"], ["informant", "Informant (2)", "Preparation die is two dice"], ["clinic", "Clinic (2)", "Treatment rolls are one Difficulty lower"], ["cover", "Cover (2)", "The first Heat segment each Contract is not filled"]]
    .map(([k, l, h]) => `<li><label><input type="checkbox" data-path="system.assets.${k}" ${s.assets[k] ? "checked" : ""}> <b>${esc(t(l))}</b></label> ${s.dormantAsset === k ? `<span class="badge-spent">${esc(t("dormant"))}</span>` : ""} <span class="hint">${esc(t(h))}</span></li>`).join("");
  const clocks = s.clocks.map((c, i) => `<div class="pm-clockcard">${clockSvg(c.size, c.filled)}<div class="nm">${esc(c.name)}</div><div class="ct">${c.filled} / ${c.size}</div>
    <div><button type="button" data-action="clockStep" data-index="${i}" data-delta="-1">&minus;</button><button type="button" data-action="clockStep" data-index="${i}" data-delta="1">+</button><button type="button" data-action="deleteClock" data-index="${i}">&times;</button></div></div>`).join("");
  const ledger = s.ledger.map((l, i) => `<tr><td>${esc(l.client)}</td><td>${l.risk}</td><td>${l.payment}</td><td>${esc(l.report === "falsified" ? t("Falsified") : t("Honest"))}</td><td><button type="button" data-action="deleteLedger" data-index="${i}">&times;</button></td></tr>`).join("");
  const rows = members.map(m => `<tr><td>${esc(m.name)}</td><td>${m.system.grade}</td><td>${m.system.resources}</td><td>${m.derived.egoCurrent}/${m.system.ego.max}</td><td>${m.system.stress}</td></tr>`).join("");
  return `<div class="pm-sheet crew">${header(a, badges)}<section class="pm-body">
    <div class="pm-grid2">
      <label>${esc(t("Office"))} ${txt("system.office", s.office)}</label><label>${esc(t("Association"))} ${txt("system.association", s.association)}</label>
      <label>${esc(t("Function"))} ${txt("system.officeFunction", s.officeFunction)}</label><label>${esc(t("The Grind"))} ${txt("system.grind", s.grind)}</label>
      <label>${esc(t("Person Behind the Desk"))} ${txt("system.personBehindDesk", s.personBehindDesk)}</label>
      <label><input type="checkbox" data-path="system.associate" ${s.associate ? "checked" : ""}> ${esc(t("Associate Office (can't refuse assignments)"))}</label>
      <label>${esc(t("Crew Bond"))} <select data-path="system.crewBondType">${opts({ trust: t("Trust"), obligation: t("Obligation") }, s.crewBondType)}</select></label>
      <label>${esc(t("Strength (0 = Fractured)"))} ${num("system.crewBond", s.crewBond, 0, 3)}</label>
      <label>${esc(t("Fund (0 to 5)"))} ${num("system.fund", s.fund, 0, 5)}</label></div>
    <h3>${esc(t("Members"))} <button type="button" data-action="editMembers">${esc(t("Choose"))}</button> <button type="button" data-action="downtime">${esc(t("Run downtime upkeep"))}</button></h3>
    <table class="pm-ledger"><thead><tr><th>${esc(t("Character"))}</th><th>${esc(t("Grade"))}</th><th>${esc(t("Resources"))}</th><th>E.G.O.</th><th>${esc(t("Stress"))}</th></tr></thead>${rows || `<tr><td colspan="5" class="hint">${esc(t("No characters yet."))}</td></tr>`}</table>
    <h3>${esc(t("Assets"))}</h3><ul class="pm-list">${assets}</ul><p class="hint">${esc(t("With three or more Assets the Fund pays 1 each downtime phase to keep them up."))}</p>
    <h3>${esc(t("Heat and other Clocks"))} <button type="button" data-action="addClock">${esc(t("Add Clock"))}</button></h3><div class="pm-clocks">${clocks || `<p class="hint">${esc(t("No Clocks."))}</p>`}</div>
    <h3>${esc(t("Ledger"))} <button type="button" data-action="addLedger">${esc(t("Add entry"))}</button></h3>
    <table class="pm-ledger"><thead><tr><th>${esc(t("Client"))}</th><th>${esc(t("Risk"))}</th><th>${esc(t("Paid"))}</th><th>${esc(t("Report"))}</th><th></th></tr></thead>${ledger || `<tr><td colspan="5" class="hint">${esc(t("No Contracts yet."))}</td></tr>`}</table>
    <h3>${esc(t("Notes"))}</h3><textarea class="pm-notes-area" data-path="system.notes" rows="6">${esc(s.notes)}</textarea></section></div>`;
}

/* ------------------------------------------------------------------ state changes */

/** Run a change on an actor, post any Voice, save and redraw. */
function mutate(actor, fn) {
  const before = { ...actor.derived };
  const out = fn();
  refresh(actor);
  if (actor.type === "character") { const lv = E.voiceTransition(before, actor); if (lv) post(bi(() => E.voiceCardHtml(actor, lv)), { priv: true }); }
  persist(); render();
  return out;
}

function onField(e) {
  const el = e.target.closest("[data-path]");
  if (!el) return;
  const a = viewActor();
  if (!a || a.remote) return;
  const path = el.dataset.path;
  let v;
  if (el.type === "checkbox") v = el.checked;
  else if (el.type === "number" || el.hasAttribute("data-num")) { v = Number(el.value); if (Number.isNaN(v)) v = 0; if (el.min && el.min !== "") v = Math.max(Number(el.min), v); if (el.max && el.max !== "") v = Math.min(Number(el.max), v); }
  else v = el.value;
  mutate(a, () => { path === "name" ? (a.name = v) : setPath(a, path, v); });
}

/* ------------------------------------------------------------------ dialogs */

function rollDialog(actor, preset, others, conds = { sinking: 0, poise: 0 }) {
  const s = actor.system, d = actor.derived;
  const gear = gearOf(actor).filter(g => g.derived.attuned && !g.derived.spent);
  const bonds = bondsOf(actor).filter(b => b.system.strength >= 1);
  const under = s.riding || s.under || "";
  const armed = s.scene.armed === "rampage";
  const notes = [];
  if (armed) notes.push(t("Rampage armed: this roll is the second attack, tagged Wrath at -1 die."));
  if (s.scene.nextPenalty < 0) notes.push(t("Sorrow's Weight: {n} dice on this roll.", { n: s.scene.nextPenalty }));
  if (under) notes.push(t("Under {sin}: Fit applies.", { sin: esc(SIN_LABEL[under]) }));
  if (conds.sinking) notes.push(t("Sinking: -{n} dice on this roll (applied automatically; it is used up).", { n: conds.sinking }));
  if (conds.poise) notes.push(t("Poise: +{n} dice if you tag Pride (a Failure spends it all).", { n: conds.poise }));
  const targets = Object.fromEntries(others.map(o => [o.id, o.name]));
  const body = `
    <div class="pm-row"><label>${esc(t("Attribute"))}</label><select name="attribute">${opts(ATTRIBUTE_LABEL, preset.attribute)}</select>
      <label>${esc(t("Skill"))}</label><select name="skill"><option value="">${esc(t("(none)"))}</option>${opts(SKILL_LABEL, preset.skill)}</select></div>
    <div class="pm-row"><label>${esc(t("Target"))}</label><select name="targetActor"><option value="">${esc(t("No target"))}</option>${opts(targets)}</select></div>
    <div class="pm-row"><label>${esc(t("Difficulty"))}</label><input type="number" name="difficulty" value="2" min="1" max="6">
      <label>${esc(t("Opposition dice"))}</label><input type="number" name="opposition" value="0" min="0" max="15" title="${esc(t("0 = roll against the Difficulty"))}"></div>
    <div class="pm-row"><label>${esc(t("Tag a Sin"))}</label><select name="tag">${opts(sinChoices(), armed ? "wrath" : under, t("No tag"))}</select>
      <label>${esc(t("Their Sin"))}</label><select name="target">${opts(sinChoices(), "", t("None / untagged"))}</select></div>
    <div class="pm-row"><label>${esc(t("Roll is"))}</label><select name="context">${opts({ attack: t("an attack"), defense: t("a defense"), other: t("something else") }, preset.context ?? "other")}</select>
      <label>${esc(t("Attuned gear"))}</label><select name="gear"><option value="">${esc(t("None"))}</option>${gear.map(g => `<option value="${g.id}">${esc(g.name)} (${esc(SIN_LABEL[g.system.sin])} ${esc(GEAR_KIND_LABEL[g.system.kind])})</option>`).join("")}</select></div>
    <div class="pm-row"><label>${esc(t("E.G.O. dice (have {n})", { n: d.egoCurrent }))}</label><input type="number" name="ego" value="0" min="0" max="${d.egoCurrent}">
      <label>${esc(t("Help dice"))}</label><input type="number" name="help" value="0" min="0" max="10">
      <label>${esc(t("Other +/-"))}</label><input type="number" name="modifier" value="0" min="-5" max="5"></div>
    <div class="pm-row"><label>${esc(t("Spend a Bond (+1 die)"))}</label><select name="bond"><option value="">${esc(t("No Bond"))}</option>${bonds.map(b => `<option value="${b.id}">${esc(BOND_TYPE_LABEL[b.system.type])} ${b.system.strength}: ${esc(b.system.person || b.name)}</option>`).join("")}</select></div>
    ${E.techniqueAvailable(actor, "envy") ? `<div class="pm-row"><label class="chk"><input type="checkbox" name="borrowedFace"> ${esc(t("Borrowed Face: copy their Sin tag (+1 die, matchup neutral)"))}</label></div>` : ""}
    <p class="pm-note target-note"></p>${notes.map(n => `<p class="pm-note">${n}</p>`).join("")}`;
  return body;
}

async function doRoll(actor, preset) {
  const others = [...state.actors, ...remoteActors()].filter(o => o.id !== actor.id && (o.type === "npc" || o.type === "character"));
  const conds = C.rollConditions(board().tracker, actor.id);
  const withSinking = a => { const tg = E.targetInfo(a); if (tg) tg.sinking = C.stacksOf(board().tracker, a.id, "sinking"); return tg; };
  const picked = await ask({
    title: t("Roll: {name}", { name: actor.name }), ok: t("Roll"), wide: true,
    body: rollDialog(actor, { skill: preset.skill ?? "", attribute: preset.attribute ?? (R.DEFAULT_ATTRIBUTE[preset.skill] ?? "body"), context: preset.context ?? "other" }, others, conds),
    read: f => { const v = Object.fromEntries(new FormData(f).entries()); v.borrowedFace = f.elements.borrowedFace?.checked ?? false; return v; },
    setup: f => {
      f.elements.targetActor.addEventListener("change", () => {
        const tg = withSinking(findActor(f.elements.targetActor.value));
        f.elements.opposition.value = tg ? tg.dice : 0;
        f.elements.target.value = tg?.sin ?? "";
        f.querySelector(".target-note").textContent = tg ? t("Target: {name}", { name: tg.name }) + (tg.unmoved ? t(" (Unmoved: -2 dice to your roll, no Help)") : "") + (tg.weight < 0 ? t(" (weighed down {n})", { n: tg.weight }) : "") + (tg.sinking ? t(" (Sinking: -{n} dice to them)", { n: tg.sinking }) : "") : "";
      });
    }
  });
  if (!picked) return;
  const target = withSinking(findActor(picked.targetActor));
  const draft = bi(() => E.rollDraft(actor, { ...picked, sinking: conds.sinking, poise: conds.poise }, target));
  if (draft.canUnbowed) {
    const yes = await confirmDlg(t("Unbowed"), t("{name} is Pride-rated. Use <b>Unbowed</b> to reroll up to three dice that didn't succeed? If the reroll still fails, you take a Complication. (Once per scene, twice at rating 4.)", { name: esc(actor.name) }), t("Use Unbowed"));
    if (yes) bi(() => E.unbowed(draft));
  }
  let consumed = {};
  mutate(actor, () => {
    const out = bi(() => E.commitRoll(actor, draft));
    consumed = out.consumed;
    post(out.html);
  });
  useUpConditions(actor.id, [consumed.sinking && "sinking", consumed.poise && "poise"].filter(Boolean));
  if (target && consumed.targetSinking) useUpConditions(target.actor.id, ["sinking"]);
  if (target) { refresh(target.actor); if (target.weight < 0 && draft.oppDice > 0) syncRemote(target.actor, 0); }
  flashLog();
}
/** A roll used up Sinking or Poise: the GM clears them from the tracker; a player asks the GM to. */
function useUpConditions(actorId, types) {
  if (!types.length) return;
  if (isGM()) { if (C.clearForActor(state.tracker, actorId, types)) { persist(); renderBoard(); if (room?.role === "host") room.sendBoard(); } }
  else room.sendCond(actorId, types);
}
function flashLog() { const el = $("#log"); el.classList.remove("ping"); void el.offsetWidth; el.classList.add("ping"); }

async function doHailMary(actor) {
  // the starting Verdicts, written out in each language
  const cands = bi(() => verdictCandidates({ ...actor.system, alignment: actor.derived.alignment }));
  const cEn = cands.map(x => expandMarkers(x, "en")), cEs = cands.map(x => expandMarkers(x, "es"));
  const c = state.lang === "es" ? cEs : cEn;
  const body = `<p>${t("The Voice becomes the <b>Verdict</b>: what the Wound has always said about this character, in the words of their Fear and in {sin}'s voice. The GM speaks it (edit it freely). The player answers with the <b>Acceptance</b>: who the character is underneath.", { sin: esc(SIN_LABEL[actor.derived.alignment] ?? t("their Sin")) })}</p>
    <div class="pm-row"><label class="full">${esc(t("Verdict"))} (English)</label><textarea name="verdictEn" rows="3">${esc(cEn[0] ?? "")}</textarea></div>
    <div class="pm-row"><label class="full">${esc(t("Verdict"))} (Español)</label><textarea name="verdictEs" rows="3">${esc(cEs[0] ?? "")}</textarea></div>
    ${c.length > 1 ? `<p class="pm-note">${esc(t("Other starting points:"))} ${c.slice(1).map(x => `&ldquo;${esc(x)}&rdquo;`).join(" / ")}</p>` : ""}
    <div class="pm-row"><label class="full">${esc(t("Acceptance (the player's answer, in their own words)"))} (${state.lang === "es" ? "Español" : "English"})</label><textarea name="acceptance" rows="2"></textarea></div>
    <div class="pm-row"><label class="full">${esc(t("The same Acceptance in {lang} (optional; if empty, the same words show to everyone)", { lang: state.lang === "es" ? "English" : "Español" }))}</label><textarea name="acceptanceAlt" rows="2"></textarea></div>
    <div class="pm-row"><label>${esc(t("Skill"))}</label><select name="skill">${opts(SKILL_LABEL, "empathy")}</select><label>${esc(t("Base Difficulty"))}</label><select name="base"><option value="2">2</option><option value="3">3</option></select></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="desire" checked> ${esc(t("A sincere Desire is on the line (the Boundary now contradicts it)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="dig"> ${esc(t("Dig deep (spend all E.G.O., +1 Difficulty; needs 2+)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="drastic"> ${esc(t("Drastic moment (+1 Difficulty)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="bond"> ${esc(t("Spend a Bond for +1 die"))}</label></div>
    <p class="pm-note">${esc(t("Leave the Acceptance empty if the player can't or won't say it: a Success then becomes a Partial Distortion."))}</p>`;
  const input = await ask({
    title: t("Hail Mary: {name}", { name: actor.name }), body, ok: t("Speak the Verdict and roll"), wide: true,
    read: f => ({ verdict: { en: f.elements.verdictEn.value, es: f.elements.verdictEs.value }, acceptance: state.lang === "es" ? { es: f.elements.acceptance.value, en: f.elements.acceptanceAlt.value } : { en: f.elements.acceptance.value, es: f.elements.acceptanceAlt.value }, skill: f.elements.skill.value, base: Number(f.elements.base.value), desire: f.elements.desire.checked, dig: f.elements.dig.checked, drastic: f.elements.drastic.checked, bond: f.elements.bond.checked })
  });
  if (!input) return;
  const before = { ...actor.derived };
  const out = bi(() => E.hailMary(actor, input));
  if (out.error) { toast(out.error); return; }
  out.html.forEach(post);
  if (out.voice) post(bi(() => E.voiceCardHtml(actor, out.voice)), { priv: true });
  persist(); render(); flashLog();
}

async function doTechnique(actor, sin) {
  const answers = {};
  for (let guard = 0; guard < 4; guard++) {
    const r = bi(() => E.useTechnique(actor, sin, answers));
    if (r.status === "fail") { toast(r.reason); return; }
    if (r.status === "info") { post(r.html); persist(); render(); flashLog(); return; }
    if (r.status === "ok") { if (sin === "gloom") syncRemote(answers.target, -2); mutate(actor, () => { post(r.html); if (r.voice) post(bi(() => E.voiceCardHtml(actor, r.voice)), { priv: true }); }); flashLog(); return; }
    if (r.need === "follow") {
      const yes = await confirmDlg(r.name, t("<b>{name}</b> follows a {sin}-tagged Success, and your last roll wasn't one. Use it anyway?", { name: esc(r.name), sin: esc(SIN_LABEL[sin]) }), t("Use it anyway"));
      if (!yes) return;
      answers.follow = true;
    } else if (r.need === "target") {
      const others = [...state.actors, ...remoteActors()].filter(o => o.id !== actor.id && (o.type === "npc" || o.type === "character"));
      if (!others.length) { toast(t("No target chosen.")); return; }
      const id = await ask({ title: t("Choose the target"), ok: t("Target"), body: `<select name="who">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select>`, read: f => f.elements.who.value });
      if (!id) return;
      answers.target = findActor(id);
    } else if (r.need === "hook") {
      const data = await ask({ title: t("Hook"), ok: t("Hook"), body: `<div class="pm-row"><label>${esc(t("Who is hooked"))}</label><input type="text" name="who"><label>${esc(t("Bond"))}</label><select name="type"><option value="affection">${esc(BOND_TYPE_LABEL.affection)}</option><option value="obligation">${esc(BOND_TYPE_LABEL.obligation)}</option></select></div>`, read: f => ({ who: f.elements.who.value, type: f.elements.type.value }) });
      if (!data) return;
      answers.hookWho = data.who; answers.hookType = data.type;
    }
  }
}

async function editItem(actor, id) {
  const item = actor.items.find(i => i.id === id);
  if (!item) return;
  const s = item.system;
  let body = `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" value="${esc(item.name)}"></div>`;
  if (item.type === "gear") body += `<div class="pm-row"><label>${esc(t("Kind"))}</label><select name="kind">${opts(GEAR_KIND_LABEL, s.kind)}</select><label>${esc(t("Sin"))}</label><select name="sin">${opts(sinChoices(), s.sin, t("None"))}</select></div>
      <div class="pm-row"><label>${esc(t("Wear"))}</label><input type="number" name="wear" min="0" max="3" value="${s.wear}"><label>${esc(t("Cost"))}</label><input type="number" name="cost" min="0" max="5" value="${s.cost}"><label class="chk"><input type="checkbox" name="fine" ${s.fine ? "checked" : ""}> ${esc(t("Fine"))}</label></div>
      <div class="pm-row"><label class="full">${esc(t("Description"))}</label><textarea name="description" rows="3">${esc(s.description)}</textarea></div>`;
  else if (item.type === "bond") body += `<div class="pm-row"><label>${esc(t("Type"))}</label><select name="type">${opts(BOND_TYPE_LABEL, s.type)}</select><label>${esc(t("Strength"))}</label><input type="number" name="strength" min="0" max="3" value="${s.strength}"></div>
      <div class="pm-row"><label>${esc(t("Person"))}</label><input type="text" name="person" value="${esc(s.person)}"></div>
      <div class="pm-row"><label class="chk"><input type="checkbox" name="temporary" ${s.temporary ? "checked" : ""}> ${esc(t("Temporary (ends with the scene)"))}</label></div>`;
  else body += `<div class="pm-row"><label class="full">${esc(t("Trigger"))}</label><textarea name="trigger" rows="2">${esc(s.trigger)}</textarea></div><div class="pm-row"><label class="full">${esc(t("Reaction"))}</label><textarea name="reaction" rows="2">${esc(s.reaction)}</textarea></div>`;
  const r = await ask({ title: item.name, body, ok: t("Save"), wide: true, read: f => { const v = Object.fromEntries(new FormData(f).entries()); for (const k of ["fine", "temporary"]) if (f.elements[k]) v[k] = f.elements[k].checked; return v; } });
  if (!r) return;
  mutate(actor, () => {
    item.name = r.name || item.name;
    const num = k => Math.max(0, Number(r[k]) || 0);
    if (item.type === "gear") Object.assign(s, { kind: r.kind, sin: r.sin, wear: Math.min(3, num("wear")), cost: Math.min(5, num("cost")), fine: !!r.fine, description: r.description });
    else if (item.type === "bond") Object.assign(s, { type: r.type, strength: Math.min(3, num("strength")), person: r.person, temporary: !!r.temporary });
    else Object.assign(s, { trigger: r.trigger, reaction: r.reaction });
  });
}

async function doDowntime(actors, crew) {
  if (!actors.length) { toast(t("No characters to run a downtime phase for.")); return; }
  const owned = E.ownedAssets(crew);
  const safehouse = !!crew?.system.assets.safehouse && crew.system.dormantAsset !== "safehouse";
  const rows = actors.map(a => {
    const spent = gearOf(a).filter(i => i.derived.spent).length;
    return `<tr><td><b>${esc(a.name)}</b></td><td>${a.system.resources}</td><td>${spent}</td><td><input type="checkbox" name="rest_${a.id}" checked></td><td><input type="checkbox" name="repair_${a.id}" ${spent ? "checked" : "disabled"}></td></tr>`;
  }).join("");
  const body = `<p>${t("Each character pays <b>1 Resources</b> of upkeep (short means Stress +1). Rest returns E.G.O. up to {n}.", { n: safehouse ? 3 : 2 })}${safehouse ? ` (${esc(E.ASSET_LABEL.safehouse)})` : ""}</p>
    <div class="scroll-x"><table class="pm-ledger"><thead><tr><th>${esc(t("Character"))}</th><th>${esc(t("Resources"))}</th><th>${esc(t("Spent gear"))}</th><th>${esc(t("Rest"))}</th><th>${esc(t("Repair (1 each)"))}</th></tr></thead>${rows}</table></div>
    ${owned.length >= 3 ? `<p class="pm-note">${esc(t("The Fund pays 1 to keep {n} Assets up.", { n: owned.length }))}</p>` : ""}`;
  const choice = await ask({ title: t("Downtime phase"), body, ok: t("Run it"), wide: true,
    read: f => Object.fromEntries(actors.map(a => [a.id, { rest: f.elements[`rest_${a.id}`]?.checked, repair: f.elements[`repair_${a.id}`]?.checked }])) });
  if (!choice) return;
  let out = bi(() => E.runDowntime(actors, crew, choice));
  if (out.needsDormantPick) {
    const pick = await ask({ title: t("The Fund can't keep the Assets up"), ok: t("Go dormant"), body: `<p>${esc(t("The Fund is empty. Which Asset goes dormant (the newest)?"))}</p><select name="asset">${out.needsDormantPick.map(k => `<option value="${k}">${esc(E.ASSET_LABEL[k])}</option>`).join("")}</select>`, read: f => f.elements.asset.value });
    out = bi(() => E.runDowntime(actors, crew, choice, pick || out.needsDormantPick.at(-1)));
  }
  post(out.html);
  persist(); render(); flashLog();
}

/* ------------------------------------------------------------------ click actions */

const READONLY_OK = new Set(["backups", "export", "exportCharacter", "allowBackupFile", "stopRetry", "applyHurt", "rtab", "sound", "timerGo", ...Object.keys(boardUI.actions), ...Object.keys(handoutUI.actions), ...Object.keys(journalUI.actions), ...Object.keys(threatUI.actions), ...Object.keys(tablesUI.actions), ...Object.keys(clocksUI.actions), ...Object.keys(screenUI.actions), "view", "select", "selectRemote", "tab", "kits", "print", "awardMarks", "undo", "secretRoll", "revealRoll", "newCharacter", "newNpc", "newCrew", "pregens", "lang", "export", "import", "help", "room", "clearLog", "downtimeAll", "newSceneAll"]);
const actions = {
  ...threatUI.actions, ...tablesUI.actions, ...clocksUI.actions, ...screenUI.actions,
  stopRetry: () => { room?.leave(); room = null; saveSession(); render(); },
  applyHurt: async el => {
    if (!isGM()) return;
    const slot = state.tracker.slots.find(s => s.id === el.dataset.slot);
    if (!slot) return toast(t("That combatant is no longer in the order."));
    if (!C.takeHurtDue(slot)) return toast(t("No Hurt is waiting for {name}.", { name: slot.name }));
    const actor = slot.actorId ? findActor(slot.actorId) : null;
    const res = actor ? C.hurtResult(actor.system.harm) : null;
    if (!actor) toast(t("{name} has no sheet here. Mark the Harm yourself.", { name: slot.name }));
    else if (actor.remote) { if (!room.sendHarm(actor.id, 1)) { slot.hurtDue += 1; return toast(t("Could not reach {name}'s player.", { name: actor.name })); } }
    else mutate(actor, () => { actor.system.harm = res.harm; });
    post(bi(() => `<div class="pm-card pm-conditions"><div class="pm-card-head">${esc(slot.name)}</div><div class="pm-notes"><p>${esc(actor ? (res.changed ? t("{name} takes Hurt: Harm is now {harm}.", { name: slot.name, harm: HARM_LABEL[res.harm] }) : t("{name} burns, but Harm is already {harm}: no change.", { name: slot.name, harm: HARM_LABEL[res.harm] })) : t("{name} takes Hurt.", { name: slot.name }))}</p></div></div>`));
    persist(); renderBoard(); if (room?.role === "host") room.sendBoard();
  },
  sound: () => { state.sound.on = !state.sound.on; sfx.settings.on = state.sound.on; persist(); renderChrome(); sfx.play("place"); },
  timerGo: () => { rtab = "xchg"; view = "log"; render(); },
  ...boardUI.actions,
  ...handoutUI.actions,
  ...journalUI.actions,
  rtab: el => { rtab = el.dataset.tab; renderBoard(); if (rtab === "log") renderLog(); },
  view: (el) => { view = el.dataset.view; render(); },
  select: (el) => { state.selected = el.dataset.id; remoteSel = ""; view = "sheet"; persist(); render(); },
  selectRemote: (el) => { remoteSel = el.dataset.id; view = "sheet"; render(); },
  room: () => roomDialog(),
  shareNpc: (el, a) => { a.shared = !a.shared; persist(); render(); toast(a.shared ? t("This Threat is now shown to the table.") : t("This Threat is hidden again.")); },
  tab: (el, a) => { tabs[a.id] = el.dataset.tab; render(); },
  newCharacter: async () => {
    const r = await openWizard();                         // the guided builder (Part III); it can also hand back "blank"
    if (!r) return;
    const a = r === "blank" ? newActor("character", t("New character")) : r;
    S.addActor(a); view = "sheet"; persist(); render();
    if (r !== "blank") toast(t("{name} is ready. Check the sheet and press Export to keep a copy.", { name: a.name }));
  },
  newNpc: () => { const a = newActor("npc", t("New Threat"), { grade: 5 }); S.addActor(a); view = "sheet"; persist(); render(); },
  newCrew: () => { const a = newActor("crew", t("New crew")); S.addActor(a); view = "sheet"; persist(); render(); },
  pregens: () => { const added = S.importPregens(); toast(added.length ? t("Imported: {names}", { names: added.join(", ") }) : t("The pregenerated characters already exist.")); view = "sheet"; persist(); render(); },
  rollSkill: (el, a) => doRoll(a, { skill: el.dataset.skill, attribute: R.DEFAULT_ATTRIBUTE[el.dataset.skill] }),
  rollAttribute: (el, a) => doRoll(a, { attribute: el.dataset.attr }),
  hailMary: (el, a) => doHailMary(a),
  useTechnique: (el, a) => doTechnique(a, el.dataset.sin),
  invokeVice: (el, a) => { const r = bi(() => E.invokeVice(a)); if (r.status === "fail") return toast(r.reason); mutate(a, () => post(r.html)); flashLog(); },
  upkeep: (el, a) => doDowntime([a], null),
  newScene: (el, a) => { mutate(a, () => E.newScene(a)); toast(t("New scene: Flashpoint, Pull, techniques, Vice, refunds and scene effects reset; Riding ended; Hooks expire.")); },
  rest: (el, a) => mutate(a, () => E.rest(a)),
  ride: (el, a) => { const r = E.ride(a, el.dataset.sin); if (!r.ok) return toast(r.reason); persist(); render(); },
  drift: async (el, a) => {
    let r = bi(() => E.drift(a));
    if (!r.drift) { if (!(await confirmDlg(t("Drift"), esc(t("No Sin leads by 8 or more tags. Clear the tally anyway?"))))) return; r = bi(() => E.drift(a, true)); }
    if (r.html) post(r.html);
    persist(); render(); flashLog();
  },
  createItem: (el, a) => {
    const type = el.dataset.type;
    const item = newItem(type, { gear: t("New gear"), bond: t("New Bond"), trauma: t("New Trauma") }[type]);
    a.items.push(item); persist(); render(); editItem(a, item.id);
  },
  editItem: (el, a) => editItem(a, el.dataset.id),
  deleteItem: (el, a) => { a.items = a.items.filter(i => i.id !== el.dataset.id); refresh(a); persist(); render(); },
  wear: (el, a) => { const g = a.items.find(i => i.id === el.dataset.id); if (g) { E.adjustWear(g, Number(el.dataset.delta)); persist(); render(); } },
  rollNpc: (el, a) => { const sunk = C.stacksOf(board().tracker, a.id, "sinking"); post(bi(() => E.npcRoll(a, undefined, { sinking: sunk }))); mutate(a, () => {}); if (sunk) useUpConditions(a.id, ["sinking"]); flashLog(); },
  addClock: async (el, a) => {
    const data = await ask({ title: t("New Clock"), ok: t("Add"), body: `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" placeholder="${esc(t("Coldwater Heat"))}"><label>${esc(t("Segments"))}</label><select name="size"><option>4</option><option selected>6</option><option>8</option></select></div>`, read: f => ({ name: f.elements.name.value || t("Clock"), size: Number(f.elements.size.value) }) });
    if (data) mutate(a, () => a.system.clocks.push({ name: data.name, size: data.size, filled: 0 }));
  },
  clockStep: (el, a) => {
    const c = a.system.clocks[Number(el.dataset.index)], delta = Number(el.dataset.delta);
    const was = c.filled;
    c.filled = Math.max(0, Math.min(c.size, c.filled + delta));
    if (c.filled >= c.size && was < c.size) { post(bi(() => E.card(esc(t("Clock full: {name}", { name: c.name })), `<p>${esc(t("Something concrete happens: an audit, a visit, a contract pulled. Never vague."))}</p>`))); flashLog(); }
    mutate(a, () => {});
  },
  deleteClock: (el, a) => mutate(a, () => a.system.clocks.splice(Number(el.dataset.index), 1)),
  addLedger: async (el, a) => {
    const data = await ask({ title: t("Ledger entry"), ok: t("Add"), body: `<div class="pm-row"><label>${esc(t("Client"))}</label><input type="text" name="client"><label>${esc(t("Risk"))}</label><select name="risk"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></div>
      <div class="pm-row"><label>${esc(t("Report"))}</label><select name="report"><option value="honest">${esc(t("Honest"))}</option><option value="falsified">${esc(t("Falsified"))}</option></select></div>
      <div class="pm-row"><label class="chk"><input type="checkbox" name="pay" checked> ${esc(t("Pay the members their Resources now"))}</label></div>`,
      read: f => { const risk = Number(f.elements.risk.value); return { client: f.elements.client.value || t("Client"), risk, payment: R.contractPayment(risk), report: f.elements.report.value, pay: f.elements.pay.checked }; } });
    if (!data) return;
    const { pay, ...entry } = data;
    mutate(a, () => a.system.ledger.push(entry));
    if (pay) { const n = E.payMembers(E.crewMembers(a, state.actors), entry.risk); toast(t("Each member is paid {n} Resources (capped at 5).", { n })); persist(); render(); }
    if (entry.report === "falsified") toast(t("A falsified Report opens a Heat Clock (4) on the Association. Add it to the crew's Clocks."));
  },
  deleteLedger: (el, a) => mutate(a, () => a.system.ledger.splice(Number(el.dataset.index), 1)),
  editMembers: async (el, a) => {
    const all = state.actors.filter(x => x.type === "character");
    if (!all.length) return toast(t("There are no characters yet."));
    const cur = new Set(a.system.memberIds);
    const chosen = await ask({ title: t("Crew members"), ok: t("Save"), body: `<div class="checks">${all.map(x => `<label class="chk"><input type="checkbox" name="m_${x.id}" ${cur.has(x.id) ? "checked" : ""}> ${esc(x.name)} (${esc(t("Grade"))} ${x.system.grade})</label>`).join("")}</div><p class="pm-note">${esc(t("With nobody ticked, the crew is every character."))}</p>`, read: f => all.filter(x => f.elements[`m_${x.id}`]?.checked).map(x => x.id) });
    if (chosen) mutate(a, () => { a.system.memberIds = chosen; });
  },
  downtime: (el, a) => doDowntime(E.crewMembers(a, state.actors), a),
  downtimeAll: () => {
    const crew = state.actors.find(x => x.type === "crew") ?? null;
    doDowntime(state.actors.filter(x => x.type === "character"), crew);
  },
  newSceneAll: () => { state.actors.filter(x => x.type === "character").forEach(E.newScene); if (room?.role === "host") room.broadcastScene(); persist(); render(); toast(t("New scene: Flashpoint, Pull, techniques, Vice, refunds and scene effects reset; Riding ended; Hooks expire.")); },
  deleteActor: async () => {
    const a = S.selectedActor(); if (!a) return;
    if (await confirmDlg(t("Delete {name}?", { name: a.name }), esc(t("This cannot be undone. Export first if you want a copy.")), t("Delete"))) { S.removeActor(a.id); persist(); render(); }
  },
  duplicateActor: () => {
    const a = S.selectedActor(); if (!a) return;
    const copy = JSON.parse(JSON.stringify(a)); copy.id = uid(); copy.name = `${a.name} (${t("copy")})`; copy.items.forEach(i => { i.id = uid(); });
    S.addActor(refresh(copy)); persist(); render();
  },
  lang: () => { state.lang = state.lang === "es" ? "en" : "es"; setLang(state.lang); persist(); render(); },
  export: () => {
    downloadText(JSON.stringify(S.exportData(), null, 1), `project-moon-${stamp()}.json`);
    state.seenWarning = true; meta.exportedAt = Date.now(); saveMeta(); persist(); renderWarn();
  },
  exportCharacter: (el, a) => {
    if (a?.type !== "character") return;
    downloadText(JSON.stringify(K.characterFile(a), null, 1), `${a.name.replace(/[^\p{L}\p{N}]+/gu, "_") || "character"}.pmchar.json`);
    toast(t("{name} exported. Send the file to anyone; they can Import it.", { name: a.name }));
  },
  allowBackupFile: async () => { backupFilePerm = await safe.filePermission(backupFile, true); if (backupFilePerm === "granted") runAutoBackup(); renderWarn(); },
  backups: () => backupDialog(),
  import: () => $("#file").click(),
  clearLog: async () => { if (await confirmDlg(t("Clear log"), esc(t("Delete every message in the log?")), t("Clear log"))) { state.log = []; persist(); render(); } },
  marksRaise: (el, a) => {
    const r = E.raiseTrait(a, el.dataset.kind, el.dataset.key);
    if (!r.ok) return toast(t("That cannot be raised now."));
    mutate(a, () => { post(bi(() => r.html)); }); flashLog();
  },
  marksUnlock: (el, a) => { if (E.chooseUnlock(a, el.dataset.slot, el.dataset.key)) mutate(a, () => {}); },
  awardMarks: async () => {
    if (!isGM()) return;
    const people = [...state.actors, ...remoteActors()].filter(x => x.type === "character");
    if (!people.length) return toast(t("There are no characters to give Marks to."));
    const r = await ask({
      title: t("Award Marks"), ok: t("Award"), wide: true,
      body: `<p>${esc(t("At the end of a Contract every player earns 1 Mark, plus 1 if it was Risk 3 or 4, plus 1 (once per session) for a played Reckoning or a scene that grew a Bond."))}</p>
        <div class="pm-row"><label>${esc(t("Risk"))}</label><select name="risk"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></div>
        <div class="pm-row"><label class="chk"><input type="checkbox" name="bonus"> ${esc(t("A Reckoning was played, or a scene grew a Bond"))}</label></div>
        <div class="checks">${people.map(x => `<label class="chk"><input type="checkbox" name="w_${x.id}" checked> ${esc(x.name)}${x.remote ? ` (${esc(x.remote.owner)})` : ""}</label>`).join("")}</div>`,
      read: f => ({ risk: Number(f.elements.risk.value), bonus: f.elements.bonus.checked, who: people.filter(x => f.elements["w_" + x.id]?.checked) })
    });
    if (!r || !r.who.length) return;
    const n = R.marksFor(r);
    const given = [];
    for (const x of r.who) {
      if (x.remote) { if (room?.sendGrant(x.id, n)) given.push(x.name); }
      else { markUndo("Marks awarded"); mutate(x, () => E.awardMarks(x, n)); given.push(x.name); }
    }
    post(bi(() => E.card(esc(t("Marks awarded")), `<p>${esc(t("Marks each: {n} ({names})", { n, names: given.join(", ") }))}</p>`))); persist(); flashLog();
    if (given.length < r.who.length) toast(t("Some players could not be reached."));
  },
  undo: () => undoLast(),
  secretRoll: async () => {
    if (!isGM()) return;
    const r = await ask({
      title: t("Secret roll"), ok: t("Roll"),
      body: `<p>${esc(t("Only you see the result, until you show it to the table."))}</p><div class="pm-row"><label>${esc(t("What for"))}</label><input type="text" name="label" maxlength="60" placeholder="${esc(t("the guard notices"))}"></div>
        <div class="pm-row"><label>${esc(t("Dice"))}</label><input type="number" name="dice" value="3" min="0" max="20"><label>${esc(t("Difficulty"))}</label><select name="diff"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></div>`,
      read: f => ({ label: f.elements.label.value.trim(), dice: Number(f.elements.dice.value), difficulty: Number(f.elements.diff.value) })
    });
    if (!r) return;
    post(bi(() => E.secretRoll(r)), { priv: true, secret: true }); persist(); renderLog(); flashLog();
  },
  rollNpcSecret: (el, a) => {
    const sunk = C.stacksOf(board().tracker, a.id, "sinking");
    markUndo("Threat roll");
    post(bi(() => E.npcRoll(a, undefined, { sinking: sunk })), { priv: true, secret: true }); mutate(a, () => {}); if (sunk) useUpConditions(a.id, ["sinking"]); flashLog();
  },
  revealRoll: el => {
    const e = state.log.find(x => x.id === el.dataset.id); if (!e || !e.secret) return;
    state.log = state.log.filter(x => x !== e); post(e.html, {}); persist(); renderLog(); flashLog();
  },
  print: () => printDialog(),
  kits: async () => {
    const r = await ask({
      title: t("Session kits"), ok: t("Open"), wide: true,
      body: `<p>${esc(t("A kit sets up a whole session at once: scenes, Threats, handouts, notes and Clocks."))}</p>${BUNDLED_KITS.map(([f, name], i) => `<div class="pm-row"><label class="chk"><input type="radio" name="kit" value="${f}" ${i ? "" : "checked"}> ${esc(t(name))}</label></div>`).join("")}
        <div class="pm-row"><label class="chk"><input type="radio" name="kit" value="__file"> ${esc(t("A kit file from my computer..."))}</label></div>`,
      read: f => f.elements.kit.value
    });
    if (!r) return;
    if (r === "__file") { $("#file").click(); return; }
    try { const res = await fetch(r, { cache: "no-cache" }); if (!res.ok) throw new Error(); await kitDialog(KIT.parseKit(await res.text())); } catch (err) { toast(t("That kit could not be opened.")); }
  },
  help: () => ask({ title: t("How to use this"), ok: t("Close"), cancel: false, wide: true, body: helpHtml(), read: () => true })
};

function helpHtml() {
  const li = s => `<li>${s}</li>`;
  return `<ul class="help">${[
    t("Add the four pregens, or make a character. Click a Skill name to roll it."),
    t("The roll dialog adds Sin dice (matchup and Fit), attuned gear, Bonds, E.G.O. dice and Help. Pick a target to fill in its dice and Sin."),
    t("E.G.O. dice that show 1 or 2 are Complications. When E.G.O. drops, the Voice speaks in the log."),
    t("Signature Techniques are on the Sins tab. Press New scene when a scene ends."),
    t("Your sheets are saved in this browser only. Use Export now and then to keep a file, and Import to load it on another device."),
    t("To play together, press Room: the GM opens a room and players join with the code. Everyone sees the rolls; the GM sees each player's sheet.")
  ].map(li).join("")}</ul>`;
}

/* ---- the room dialog ---- */

const makeRoom = Peer => new Room({ Peer, handlers, peerOptions: iceOptions() });

/** After a reload: go back to the room we were in. Keeps trying while the GM or the broker is away. */
async function autoResume() {
  const saved = savedSession();
  if (!saved || new URLSearchParams(location.search).get("room")) return;
  let Peer;
  try { Peer = await loadPeer(); } catch { toast(t("Shared rooms need an internet connection (they load PeerJS).")); return; }
  room = makeRoom(Peer);
  state.name = saved.name || state.name;
  room.resume(saved);
  renderChrome();
}

async function startRoom(mode, name, code, { password = "" } = {}) {
  let Peer;
  try { Peer = await loadPeer(); } catch { toast(t("Shared rooms need an internet connection (they load PeerJS).")); return; }
  if (room) room.leave(true);
  room = makeRoom(Peer);
  state.name = name; persist();
  renderChrome();
  try {
    if (mode === "host") await room.host(code, name, { password }); else await room.join(code, name, { password });
  } catch {
    toast(t(room.error) || room.error); const r = room; room = null; r.leave(true); render(); return;
  }
  render();
  if (mode === "host") { room.sendBoard(); handlers.onLog({ id: uid(), html: bilingualHtml(bi(() => E.card(esc(t("Room open")), `<p>${esc(t("Share the code {code} or the link. Players keep their own sheets; everyone sees the rolls.", { code: room.code }))}</p>`)))  }, true); room.broadcastTable(); }
  else scheduleSync();
}

const ICE_KEY = "project-moon-the-city/ice";
const relayText = () => { try { return localStorage.getItem(ICE_KEY) || ""; } catch { return ""; } };
function iceOptions() { return peerOptionsFor(relayText()); }

/** The result of "test my connection", as plain sentences. */
function connectionReport(r) {
  const lines = [r.broker ? t("The room service answered in {ms} ms.", { ms: r.brokerMs }) : t("Could not reach the room service (PeerJS). Check your internet connection, or that this network does not block it.")];
  lines.push({
    relay: t("A relay is working, so rooms should connect even on strict networks."),
    direct: t("Your network gave a public address, so direct rooms should work for most people. Some strict networks (schools, offices, mobile data) can still block them; a relay fixes that."),
    blocked: t("Your network gave only a local address: direct rooms will probably fail. Try another network, or add a relay under Connection."),
    none: t("Could not test the network (this browser may not allow it).")
  }[r.verdict]);
  return lines;
}

async function roomDialog() {
  if (room?.online) {
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const host = room.role === "host";
    const who = host ? [...room.peers].map(([pid, p]) => ({ pid, name: p.name })) : [{ name: room.name }, ...room.table.players.map(p => ({ name: p.name }))];
    const controls = host ? `
        <div class="pm-row"><label class="chk"><input type="checkbox" id="ctl-lock" ${room.locked ? "checked" : ""}> ${esc(t("Lock the room (nobody new can join; people who were already in can come back)"))}</label></div>
        <div class="pm-row"><label>${esc(t("Password"))}</label><input type="text" id="ctl-pw" value="${esc(room.password)}" maxlength="40" placeholder="${esc(t("none"))}"></div>
        <ul class="who-list">${who.map(p => `<li data-pid="${esc(p.pid)}"><span>${esc(p.name)}</span><button type="button" data-kick="${esc(p.pid)}">${esc(t("Remove"))}</button></li>`).join("") || `<li class="hint">${esc(t("Nobody else yet."))}</li>`}</ul>` :
      `<p><b>${esc(t("Here now"))}:</b> ${esc(who.map(p => p.name).join(", "))}</p>`;
    const r = await ask({ title: t("Room {code}", { code: room.code }), ok: t("Leave room"), wide: true,
      body: `<p>${esc(host ? t("You are the GM and host. If your page closes or reloads, it reopens this room by itself and players come back; if you leave on purpose the room is closed.") : t("You are in this room as {name}. If the connection drops, this page keeps trying to get back in.", { name: room.name }))}</p>
        <div class="pm-row"><label>${esc(t("Code"))}</label><input type="text" readonly value="${esc(room.code)}" class="big"></div>
        <div class="pm-row"><label>${esc(t("Link"))}</label><input type="text" readonly value="${esc(link)}" onfocus="this.select()"></div>${controls}`,
      read: () => true,
      setup: f => {
        f.querySelector("#ctl-lock")?.addEventListener("change", e => room.setLocked(e.target.checked));
        f.querySelector("#ctl-pw")?.addEventListener("change", e => { room.setPassword(e.target.value.trim()); toast(room.password ? t("Password set.") : t("Password removed.")); });
        f.querySelectorAll("[data-kick]").forEach(b => b.addEventListener("click", () => {
          const name = b.parentElement.querySelector("span").textContent;
          if (room.kick(b.dataset.kick)) { b.parentElement.remove(); toast(t("{name} was removed from the room.", { name })); }
        }));
      } });
    if (r) { room.leave(); room = null; saveSession(); received.length = 0; remoteJournal = []; remoteBoard.tracker = B.newTracker(); remoteBoard.map = null; remoteBoard.image = null; render(); toast(t("You left the room.")); }
    return;
  }
  if (room?.reconnecting) {
    const stop = await ask({ title: t("Room {code}", { code: room.code }), ok: t("Stop trying"), wide: true, read: () => true,
      body: `<p>${esc(room.role === "host" ? t("Reopening room {code}...", { code: room.code }) : t("Lost the room. Reconnecting to {code}...", { code: room.code }))} (${room.attempt || 1})</p><p class="pm-note">${esc(t("This keeps trying by itself for ten minutes. Nothing you have written is lost."))}</p>` });
    if (stop) { room.leave(); room = null; saveSession(); render(); }
    return;
  }
  const startCode = cleanCode(new URLSearchParams(location.search).get("room"));
  const body = `<p>${esc(t("Shared rooms connect your browsers directly (through the free PeerJS broker). The GM hosts and must keep the page open. Players keep their own sheets; everyone sees the rolls."))}</p>
    <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="host" ${startCode ? "" : "checked"}> ${esc(t("I am the GM: open a room"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="join" ${startCode ? "checked" : ""}> ${esc(t("I am a player: join a room"))}</label></div>
    <div class="pm-row"><label>${esc(t("Your name"))}</label><input type="text" name="name" value="${esc(state.name)}" maxlength="30"></div>
    <div class="pm-row"><label>${esc(t("Code"))}</label><input type="text" name="code" value="${esc(startCode || newCode())}" maxlength="8" class="big"></div>
    <div class="pm-row"><label>${esc(t("Password"))}</label><input type="text" name="password" maxlength="40" placeholder="${esc(t("optional"))}"></div>
    <details class="altlang"><summary>${esc(t("Connection"))}</summary>
      <div class="pm-row"><button type="button" data-nettest>${esc(t("Test my connection"))}</button></div>
      <div class="net-result pm-note" hidden></div>
      <div class="pm-row"><label class="full">${esc(t("Relay (advanced, optional): one per line, like  turn:host:3478  username  password"))}</label><textarea name="relay" rows="3" spellcheck="false">${esc(relayText())}</textarea></div>
      <p class="hint">${esc(t("Only needed if rooms will not connect on your network. Kept on this device only."))}</p></details>`;
  const r = await ask({ title: t("Shared room"), ok: t("Go"), wide: true, body,
    read: f => ({ mode: f.elements.mode.value, name: f.elements.name.value.trim(), code: cleanCode(f.elements.code.value), password: f.elements.password.value.trim(), relay: f.elements.relay.value }),
    setup: f => {
      f.querySelectorAll("[name=mode]").forEach(el => el.addEventListener("change", () => { f.elements.code.value = f.elements.mode.value === "host" ? newCode() : startCode; }));
      f.querySelector("[data-nettest]").addEventListener("click", async ev => {
        const out = f.querySelector(".net-result"); out.hidden = false; out.textContent = t("Testing...");
        ev.target.disabled = true;
        const Peer = await loadPeer().catch(() => null);
        const opts = peerOptionsFor(f.elements.relay.value);
        const result = await testConnection({ PeerCtor: Peer, iceServers: opts?.config.iceServers ?? DEFAULT_ICE });
        out.innerHTML = connectionReport(result).map(l => `<div>${esc(l)}</div>`).join("");
        ev.target.disabled = false;
      });
    } });
  if (!r) return;
  if (!r.name) { toast(t("Enter your name first.")); return; }
  if (r.code.length < 3) { toast(t("Enter a room code.")); return; }
  const parsed = parseIceServers(r.relay);
  if (parsed.errors.length) toast(t("Some relay lines were ignored (line {n}).", { n: parsed.errors[0].line }));
  try { if (r.relay.trim()) localStorage.setItem(ICE_KEY, r.relay); else localStorage.removeItem(ICE_KEY); } catch { /* private window */ }
  await startRoom(r.mode, r.name, r.code, { password: r.password });
}

function onChat(e) {
  e.preventDefault();
  const input = $("#chat-text"), text = input.value.trim();
  if (!text || !room?.online) return;
  const to = $("#chat-to").value;
  const label = to ? `${esc(room.name)} &rarr; ${esc(room.peers.get(to)?.name ?? "")}` : esc(room.name);
  const html = `<div class="pm-card chat"><div class="pm-card-head">${label}</div><div class="pm-notes"><p>${esc(text)}</p></div></div>`;
  const entry = S.addLog(html);
  if (entry) room.sendLog({ id: entry.id, html, private: false, ...(to ? { to } : {}) });
  input.value = ""; renderLog(); persist();
}

/** Once a quarter second: the turn timer's chip, the Exchange tab's clock, and the ticks and the alarm. */
let lastSec = -1, alarmed = "";
function tickTimer() {
  const tr = board().tracker, T = timerOf(tr);
  clock.sync(T);
  const rem = clock.remaining(T), chip = $("#timer-chip"), show = tr.active && T.secs > 0;
  chip.hidden = !show;
  if (show) {
    const cur = B.currentSlot(tr);
    chip.textContent = `${fmtTime(rem)}${cur ? ` \u00B7 ${cur.name}` : ""}`;
    chip.classList.toggle("low", T.running && rem <= 10);
    chip.classList.toggle("paused", !T.running);
  }
  const clk = document.querySelector("#x-clk");
  if (clk && T.secs) { clk.textContent = fmtTime(rem); clk.closest(".x-timer")?.classList.toggle("low", T.running && rem <= 10); }
  if (T.running && T.secs) {
    const sec = Math.ceil(rem);
    if (sec !== lastSec) { lastSec = sec; if (sec <= 5 && sec > 0) sfx.play("tick"); }
    if (rem <= 0 && alarmed !== T.stamp) { alarmed = T.stamp; sfx.play("alarm"); }
  } else lastSec = -1;
}

/** The Backups window: when you last exported, the snapshots the app keeps, an optional backup file, and storage protection. */
async function backupDialog() {
  const now = Date.now();
  const [snaps, info] = await Promise.all([safe.snapshots.list(), safe.storageInfo()]);
  const rows = [...snaps].reverse().map(sn => `<li><span>${esc(sn.label === "auto" ? t("Automatic") : (sn.label === "before import" ? t("Before an import") : sn.label))} &middot; ${esc(K.ageText(sn.at, now, t))} &middot; ${esc(K.sizeText(sn.size))}</span><button type="button" data-restore="${sn.at}">${esc(t("Restore"))}</button></li>`).join("");
  const fileLine = !safe.fileSupported() ? esc(t("Your browser cannot write a backup file by itself (Chrome and Edge on a computer can). Use Export now and then."))
    : (backupFile ? esc(t("Writing every change to your backup file. {state}", { state: backupFilePerm === "granted" ? t("It is up to date.") : t("The browser needs you to allow it again.") })) : esc(t("No backup file chosen.")));
  const body = `
    <p><b>${esc(t("Last export"))}:</b> ${esc(K.ageText(meta.exportedAt, now, t))}</p>
    <div class="pm-row"><button type="button" data-do="export">${esc(t("Export everything"))}</button><button type="button" data-do="import">${esc(t("Import a file"))}</button></div>
    <p class="hint">${esc(t("To move one character to another device or a friend, open it and press Export on its sheet."))}</p>
    <h3>${esc(t("Backup file"))}</h3><p>${fileLine}</p>
    ${safe.fileSupported() ? `<div class="pm-row"><button type="button" data-do="choosefile">${esc(backupFile ? t("Choose another file") : t("Choose a backup file"))}</button>${backupFile ? `<button type="button" data-do="stopfile">${esc(t("Stop"))}</button>` : ""}</div>` : ""}
    <h3>${esc(t("Snapshots the app keeps"))}</h3>
    <ul class="who-list">${rows || `<li class="hint">${esc(t("None yet. One is taken about every ten minutes of changes, and before any import."))}</li>`}</ul>
    <h3>${esc(t("Browser storage"))}</h3>
    <p>${esc(info.persisted ? t("Protected: the browser will not clear this data when it is short of space.") : t("Not protected: if the browser is short of space it may clear this data."))} ${Number.isFinite(info.usage) ? esc(t("Using {used} of about {total}.", { used: K.sizeText(info.usage), total: K.sizeText(info.quota) })) : ""}</p>
    ${info.persisted ? "" : `<div class="pm-row"><button type="button" data-do="protect">${esc(t("Ask the browser to keep my data"))}</button></div>`}`;
  await ask({ title: t("Backups"), ok: t("Close"), cancel: false, wide: true, read: () => true, body,
    setup: f => {
      const close = () => f.closest("dialog").close();
      f.querySelector('[data-do="export"]')?.addEventListener("click", () => { actions.export(); close(); });
      f.querySelector('[data-do="import"]')?.addEventListener("click", () => { close(); $("#file").click(); });
      f.querySelector('[data-do="protect"]')?.addEventListener("click", async () => { const ok = await safe.protectStorage(); toast(ok ? t("Your data is now protected.") : t("The browser did not agree. Exporting a file is the safe way.")); close(); });
      f.querySelector('[data-do="choosefile"]')?.addEventListener("click", async () => {
        try { backupFile = await safe.chooseBackupFile(); backupFilePerm = await safe.filePermission(backupFile, true); await runAutoBackup(); toast(t("Backup file ready.")); } catch { /* cancelled */ }
        close();
      });
      f.querySelector('[data-do="stopfile"]')?.addEventListener("click", async () => { await safe.forgetBackupFile(); backupFile = null; backupFilePerm = "none"; renderWarn(); close(); });
      f.querySelectorAll("[data-restore]").forEach(b => b.addEventListener("click", async () => {
        const sn = snaps.find(x => String(x.at) === b.dataset.restore);
        if (!sn) return;
        close();
        if (!(await confirmDlg(t("Restore"), esc(t("Go back to this snapshot? What you have now is kept as a snapshot first.")), t("Restore")))) return;
        await takeSnapshot("before restore", true);
        S.importData(sn.json); persist(); render(); toast(t("Restored."));
      }));
    } });
}

export function init() {
  (async () => {                                              // the backup file from last time, if any
    if (!safe.fileSupported()) return;
    backupFile = await safe.savedBackupFile();
    if (backupFile) { backupFilePerm = await safe.filePermission(backupFile); renderWarn(); }
  })();
  sfx.settings.on = state.sound.on; sfx.setVolume(state.sound.vol);
  for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => sfx.unlock(), { once: true });
  $("#vol").addEventListener("input", e => { state.sound.vol = Number(e.target.value) / 100; sfx.setVolume(state.sound.vol); });
  $("#vol").addEventListener("change", () => { persist(); sfx.play("place"); });
  setInterval(tickTimer, 250);
  globalThis.__pm = { get room() { return room; }, sfx, clock, board };   // for debugging in the console
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    const a = viewActor();
    if (a?.remote && !READONLY_OK.has(el.dataset.action)) return;
    if (UNDO_LABEL[el.dataset.action]) markUndo(UNDO_LABEL[el.dataset.action]);
    fn(el, a);
    setTimeout(renderUndo, 0);
  });
  document.addEventListener("change", e => { if (e.target.closest("#main")) onField(e); else if (e.target.closest("#pane-map") || e.target.closest("#pane-xchg")) boardUI.onChange(e); });
  $("#mapfile").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) boardUI.onUpload(f); });
  $("#file").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      if (/"kind"\s*:\s*"project-moon-kit"/.test(raw.slice(0, 400))) { await kitDialog(KIT.parseKit(raw)); return; }
      const parsed = K.parseImport(raw);
      if (parsed.kind === "character") {                    // one character joins the others; nothing is replaced
        const a = K.newCharacterFrom(parsed.actor, state.actors.map(x => x.name));
        S.addActor(a); view = "sheet"; persist(); render(); toast(t("Imported {name}.", { name: a.name }));
        return;
      }
      if (state.actors.length && !(await confirmDlg(t("Import"), esc(t("Importing replaces everything in this browser. A snapshot of what you have now is kept first, so you can go back.")), t("Import")))) return;
      await takeSnapshot("before import", true);
      S.importData(JSON.stringify(parsed.data)); sfx.settings.on = state.sound.on; sfx.setVolume(state.sound.vol); persist(); render(); toast(t("Imported."));
    } catch (err) { toast(t(err?.message?.startsWith("That file") || err?.message?.startsWith("Not a") ? err.message : "That file is not a Project Moon save.")); }
  });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !e.target.closest("input, textarea, select, dialog, [contenteditable]")) { e.preventDefault(); undoLast(); }
  });
  window.addEventListener("beforeunload", () => S.save());
  $("#chat").addEventListener("submit", onChat);
  if (new URLSearchParams(location.search).get("room")) setTimeout(() => roomDialog(), 300);
  else autoResume();
  render();
}
