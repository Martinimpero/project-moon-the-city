/** The interface: sidebar, sheets, dialogs and the roll log. Plain DOM; every change goes through the engine, saves, and re-renders. */
import * as R from "./rules.mjs";
import { SIN_LABEL, SKILL_LABEL, ATTRIBUTE_LABEL, HARM_LABEL, GEAR_KIND_LABEL, BOND_TYPE_LABEL, SIN_TEXT, SIGNATURE } from "./config.mjs";
import { t, setLang } from "./i18n.mjs";
import * as E from "./engine.mjs";
import { esc } from "./engine.mjs";
import { newActor, newItem, normalizeActor, refresh, gearOf, bondsOf, traumasOf, setPath, getPath, uid } from "./model.mjs";
import * as S from "./store.mjs";
import { state } from "./store.mjs";
import { verdictCandidates } from "./voice.mjs";
import { Room, newCode, cleanCode } from "./room.mjs";
import * as B from "./board.mjs";
import { createBoardUI } from "./boardui.mjs";
import * as H from "./handouts.mjs";
import { createHandoutUI } from "./handoutui.mjs";

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
  el.textContent = msg; el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 3800);
}
function persist() {
  if (!S.save()) toast(t("Could not save in this browser. Use Export to keep your data."));
  scheduleSync();
}
/** Add a message to the log and, in a room, send it on. Private messages (the Voice) stay with the player and the GM. */
function post(html, { priv = false } = {}) {
  const entry = S.addLog(html);
  if (entry && room?.online) room.sendLog({ id: entry.id, html, private: priv });
}

/* ------------------------------------------------------------------ shared rooms */

let room = null;                // the Room, once the player has opened one
let remoteSel = "";             // id of a remote actor being looked at (read-only), or ""
let syncTimer = null;
let rtab = "log";               // right-hand pane: "log" | "xchg" | "map"
const remoteBoard = { tracker: B.newTracker(), map: null, image: null };   // what the GM sent (players only)
const dragging = () => !!document.querySelector("#mapsvg")?.dataset.drag;
const isGM = () => !room?.online || room.role === "host";
const board = () => (isGM()
  ? { tracker: state.tracker, map: state.map, image: state.map && !state.map.bundled && state.map.src ? { rev: state.map.rev, src: state.map.src } : null }
  : remoteBoard);
const received = [];            // handouts the GM has shown this player (memory only)
const handoutUI = createHandoutUI({
  state, $: sel => document.querySelector(sel), room: () => room, isGM, received: () => received,
  changed: (h, gone) => {
    persist(); renderBoard();
    if (room?.role === "host") { if (gone || !h.shown) room.sendUnhandout(h.id); else room.sendHandout(H.forPlayers(h)); }
    if (h.shown && !gone) post(E.card(esc(t("The GM shows a handout")), `<p><b>${esc(h.title)}</b></p>`));
  },
  ask: o => ask(o), toast: m => toast(m)
});
const boardUI = createBoardUI({
  state, $: sel => document.querySelector(sel), room: () => room, isGM, board,
  remoteActors: () => remoteActors(), findActor: id => findActor(id),
  changed: () => { persist(); renderBoard(); if (room?.role === "host") room.sendBoard(); },
  sendBoard: () => { if (room?.role === "host") room.sendBoard(); },
  redrawMap: () => renderBoard(),
  setMap: m => { state.map = m; },
  post: html => post(html), ask: o => ask(o), toast: m => toast(m)
});
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
  onStatus: () => { renderChrome(); renderSidebar(); if (room?.status === "error" && room.error) toast(t(room.error)); },
  onLog: (entry, quiet) => { if (S.addLog(entry.html, entry.id)) { renderLog(); if (!quiet) flashLog(); } },
  onTable: () => { if (remoteSel && !findRemote(remoteSel)) remoteSel = ""; renderSidebar(); if (remoteSel) renderMain(); },
  onEffect: (actorId, value) => {
    const a = S.byId(actorId); if (!a) return;
    E.setPenalty(a, value); refresh(a); persist(); render();
  },
  onScene: () => { state.actors.filter(x => x.type === "character").forEach(E.newScene); persist(); render(); toast(t("The GM started a new scene.")); },
  onBoard: b => { if (dragging()) return; remoteBoard.tracker = b.tracker; remoteBoard.map = b.map; renderBoard(); },
  onMapImg: (rev, src) => { remoteBoard.image = { rev, src }; renderBoard(); },
  onToken: (pid, id, x, y) => {
    const map = state.map, tk = map?.tokens.find(k => k.id === id), peer = room?.peers.get(pid);
    if (!tk || !peer || !tk.actorId || !peer.actors.some(a => a.id === tk.actorId)) return;     // players move only their own characters' tokens
    B.moveToken(map, id, x, y); persist(); renderBoard(); room.sendBoard();
  },
  hostBoard: () => ({ tracker: state.tracker, map: B.mapForPlayers(state.map), mapImage: state.map && !state.map.bundled && state.map.src ? { rev: state.map.rev, src: state.map.src } : null }),
  hostHandouts: () => H.shownList(state.handouts),
  onHandout: h => {
    const i = received.findIndex(x => x.id === h.id);
    if (i >= 0) received[i] = h; else { received.push(h); toast(t("The GM shows you: {title}", { title: h.title })); handoutUI.view(h); }
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
const confirmDlg = (title, message, ok = t("OK")) => ask({ title, body: `<p>${message}</p>`, ok, read: () => true }).then(Boolean);

/* ------------------------------------------------------------------ rendering */

export function render() {
  document.documentElement.lang = state.lang;
  document.body.dataset.view = view;
  renderChrome();
  renderSidebar();
  renderMain();
  renderLog();
  renderBoard();
}

function renderBoard() {
  const tabs = [["log", t("Log")], ["xchg", t("Exchange")], ["map", t("Map")], ["ho", t("Handouts")]];
  $("#rtabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-action="rtab" data-tab="${k}" class="${rtab === k ? "active" : ""}">${esc(l)}</button>`).join("");
  for (const [k, id] of [["log", "pane-log"], ["xchg", "pane-xchg"], ["map", "pane-map"], ["ho", "pane-ho"]]) $("#" + id).hidden = rtab !== k;
  $("#b-clearlog").hidden = rtab !== "log";
  if (rtab === "xchg") boardUI.renderTracker();
  if (rtab === "map") boardUI.renderMap();
  if (rtab === "ho") handoutUI.render();
}

function renderChrome() {
  $("#lang").textContent = state.lang === "es" ? "EN" : "ES";
  $("#lang").title = state.lang === "es" ? "English" : "Español";
  const labels = { people: t("People"), sheet: t("Sheet"), log: t("Table") };
  $("#phone-tabs").innerHTML = ["people", "sheet", "log"].map(v => `<button type="button" data-action="view" data-view="${v}" class="${view === v ? "active" : ""}">${esc(labels[v])}</button>`).join("");
  $("#t-title").textContent = t("Project Moon: The City");
  $("#t-sub").textContent = t("A free table companion. Your sheets are saved in this browser.");
  for (const [id, key] of [["b-export", "Export"], ["b-import", "Import"], ["b-help", "Help"]]) $("#" + id).textContent = t(key);
  const rb = $("#b-room");
  rb.textContent = room?.online ? `${t("Room")} ${room.code} · ${room.count}` : (room?.status === "connecting" ? t("Connecting...") : t("Room"));
  rb.classList.toggle("live", !!room?.online);
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
    <div class="side-foot"><button type="button" data-action="downtimeAll">${esc(t("Run downtime for all"))}</button><button type="button" data-action="newSceneAll">${esc(t("New scene for all"))}</button></div>`;
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
  el.innerHTML = state.log.map(e => `<div class="msg">${e.html}</div>`).join("") || `<p class="hint pad">${esc(t("Rolls and results appear here."))}</p>`;
  $("#b-clearlog").textContent = t("Clear log");
  if (atBottom || !el.dataset.init) { el.scrollTop = el.scrollHeight; el.dataset.init = "1"; }
}

/* ---- character ---- */

function header(a, badges, extra = "") {
  return `<header class="pm-head"><input class="pm-name" type="text" data-path="name" value="${esc(a.name)}" placeholder="${esc(t("Name"))}">
    <div class="pm-badges">${badges}</div>${extra}
    <div class="pm-tools"><button type="button" data-action="duplicateActor">${esc(t("Duplicate"))}</button><button type="button" data-action="deleteActor">${esc(t("Delete"))}</button></div></header>`;
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
  const tabNames = [["main", "Character"], ["self", "The Self"], ["sins", "Sins"], ["gear", "Gear and Bonds"], ["notes", "Notes"]];
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
      <h3>${esc(t("Traumas"))} <button type="button" data-action="createItem" data-type="trauma">${esc(t("Add"))}</button></h3>
      <ul class="pm-list">${tr.map(item).join("") || `<li class="hint">${esc(t("No Traumas yet."))}</li>`}</ul>`;
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
  return `<div class="pm-sheet">${header(a, badges, `<div class="pm-actions"><button type="button" data-action="rollNpc">${esc(t("Roll its pool"))}</button>${room?.role === "host" ? `<button type="button" data-action="shareNpc" class="${a.shared ? "active" : ""}">${esc(a.shared ? t("Shown to the table") : t("Show to the table"))}</button>` : ""}</div>`)}
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
  if (actor.type === "character") { const lv = E.voiceTransition(before, actor); if (lv) post(E.voiceCardHtml(actor, lv), { priv: true }); }
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
  else if (el.type === "number" || el.hasAttribute("data-num")) { v = Number(el.value); if (Number.isNaN(v)) v = 0; if (el.min !== "") v = Math.max(Number(el.min), v); if (el.max !== "") v = Math.min(Number(el.max), v); }
  else v = el.value;
  mutate(a, () => { path === "name" ? (a.name = v) : setPath(a, path, v); });
}

/* ------------------------------------------------------------------ dialogs */

function rollDialog(actor, preset, others) {
  const s = actor.system, d = actor.derived;
  const gear = gearOf(actor).filter(g => g.derived.attuned && !g.derived.spent);
  const bonds = bondsOf(actor).filter(b => b.system.strength >= 1);
  const under = s.riding || s.under || "";
  const armed = s.scene.armed === "rampage";
  const notes = [];
  if (armed) notes.push(t("Rampage armed: this roll is the second attack, tagged Wrath at -1 die."));
  if (s.scene.nextPenalty < 0) notes.push(t("Sorrow's Weight: {n} dice on this roll.", { n: s.scene.nextPenalty }));
  if (under) notes.push(t("Under {sin}: Fit applies.", { sin: esc(SIN_LABEL[under]) }));
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
  const picked = await ask({
    title: t("Roll: {name}", { name: actor.name }), ok: t("Roll"), wide: true,
    body: rollDialog(actor, { skill: preset.skill ?? "", attribute: preset.attribute ?? (R.DEFAULT_ATTRIBUTE[preset.skill] ?? "body"), context: preset.context ?? "other" }, others),
    read: f => { const v = Object.fromEntries(new FormData(f).entries()); v.borrowedFace = f.elements.borrowedFace?.checked ?? false; return v; },
    setup: f => {
      f.elements.targetActor.addEventListener("change", () => {
        const tg = E.targetInfo(findActor(f.elements.targetActor.value));
        f.elements.opposition.value = tg ? tg.dice : 0;
        f.elements.target.value = tg?.sin ?? "";
        f.querySelector(".target-note").textContent = tg ? t("Target: {name}", { name: tg.name }) + (tg.unmoved ? t(" (Unmoved: -2 dice to your roll, no Help)") : "") + (tg.weight < 0 ? t(" (weighed down {n})", { n: tg.weight }) : "") : "";
      });
    }
  });
  if (!picked) return;
  const target = E.targetInfo(findActor(picked.targetActor));
  const draft = E.rollDraft(actor, picked, target);
  if (draft.canUnbowed) {
    const yes = await confirmDlg(t("Unbowed"), t("{name} is Pride-rated. Use <b>Unbowed</b> to reroll up to three dice that didn't succeed? If the reroll still fails, you take a Complication. (Once per scene, twice at rating 4.)", { name: esc(actor.name) }), t("Use Unbowed"));
    if (yes) E.unbowed(draft);
  }
  mutate(actor, () => {
    const out = E.commitRoll(actor, draft);
    post(out.html);
  });
  if (target) { refresh(target.actor); if (target.weight < 0 && draft.oppDice > 0) syncRemote(target.actor, 0); }
  flashLog();
}
function flashLog() { const el = $("#log"); el.classList.remove("ping"); void el.offsetWidth; el.classList.add("ping"); }

async function doHailMary(actor) {
  const c = verdictCandidates({ ...actor.system, alignment: actor.derived.alignment });
  const body = `<p>${t("The Voice becomes the <b>Verdict</b>: what the Wound has always said about this character, in the words of their Fear and in {sin}'s voice. The GM speaks it (edit it freely). The player answers with the <b>Acceptance</b>: who the character is underneath.", { sin: esc(SIN_LABEL[actor.derived.alignment] ?? t("their Sin")) })}</p>
    <div class="pm-row"><label class="full">${esc(t("Verdict"))}</label><textarea name="verdict" rows="3">${esc(c[0] ?? "")}</textarea></div>
    ${c.length > 1 ? `<p class="pm-note">${esc(t("Other starting points:"))} ${c.slice(1).map(x => `&ldquo;${esc(x)}&rdquo;`).join(" / ")}</p>` : ""}
    <div class="pm-row"><label class="full">${esc(t("Acceptance (the player's answer, in their own words)"))}</label><textarea name="acceptance" rows="2"></textarea></div>
    <div class="pm-row"><label>${esc(t("Skill"))}</label><select name="skill">${opts(SKILL_LABEL, "empathy")}</select><label>${esc(t("Base Difficulty"))}</label><select name="base"><option value="2">2</option><option value="3">3</option></select></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="desire" checked> ${esc(t("A sincere Desire is on the line (the Boundary now contradicts it)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="dig"> ${esc(t("Dig deep (spend all E.G.O., +1 Difficulty; needs 2+)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="drastic"> ${esc(t("Drastic moment (+1 Difficulty)"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="bond"> ${esc(t("Spend a Bond for +1 die"))}</label></div>
    <p class="pm-note">${esc(t("Leave the Acceptance empty if the player can't or won't say it: a Success then becomes a Partial Distortion."))}</p>`;
  const input = await ask({
    title: t("Hail Mary: {name}", { name: actor.name }), body, ok: t("Speak the Verdict and roll"), wide: true,
    read: f => ({ verdict: f.elements.verdict.value, acceptance: f.elements.acceptance.value, skill: f.elements.skill.value, base: Number(f.elements.base.value), desire: f.elements.desire.checked, dig: f.elements.dig.checked, drastic: f.elements.drastic.checked, bond: f.elements.bond.checked })
  });
  if (!input) return;
  const before = { ...actor.derived };
  const out = E.hailMary(actor, input);
  if (out.error) { toast(out.error); return; }
  out.html.forEach(post);
  if (out.voice) post(E.voiceCardHtml(actor, out.voice), { priv: true });
  persist(); render(); flashLog();
}

async function doTechnique(actor, sin) {
  const answers = {};
  for (let guard = 0; guard < 4; guard++) {
    const r = E.useTechnique(actor, sin, answers);
    if (r.status === "fail") { toast(r.reason); return; }
    if (r.status === "info") { post(r.html); persist(); render(); flashLog(); return; }
    if (r.status === "ok") { if (sin === "gloom") syncRemote(answers.target, -2); mutate(actor, () => { post(r.html); if (r.voice) post(E.voiceCardHtml(actor, r.voice), { priv: true }); }); flashLog(); return; }
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
  let out = E.runDowntime(actors, crew, choice);
  if (out.needsDormantPick) {
    const pick = await ask({ title: t("The Fund can't keep the Assets up"), ok: t("Go dormant"), body: `<p>${esc(t("The Fund is empty. Which Asset goes dormant (the newest)?"))}</p><select name="asset">${out.needsDormantPick.map(k => `<option value="${k}">${esc(E.ASSET_LABEL[k])}</option>`).join("")}</select>`, read: f => f.elements.asset.value });
    out = E.runDowntime(actors, crew, choice, pick || out.needsDormantPick.at(-1));
  }
  post(out.html);
  persist(); render(); flashLog();
}

/* ------------------------------------------------------------------ click actions */

const READONLY_OK = new Set(["rtab", ...Object.keys(boardUI.actions), ...Object.keys(handoutUI.actions), "view", "select", "selectRemote", "tab", "newCharacter", "newNpc", "newCrew", "pregens", "lang", "export", "import", "help", "room", "clearLog", "downtimeAll", "newSceneAll"]);
const actions = {
  ...boardUI.actions,
  ...handoutUI.actions,
  rtab: el => { rtab = el.dataset.tab; renderBoard(); if (rtab === "log") renderLog(); },
  view: (el) => { view = el.dataset.view; render(); },
  select: (el) => { state.selected = el.dataset.id; remoteSel = ""; view = "sheet"; persist(); render(); },
  selectRemote: (el) => { remoteSel = el.dataset.id; view = "sheet"; render(); },
  room: () => roomDialog(),
  shareNpc: (el, a) => { a.shared = !a.shared; persist(); render(); toast(a.shared ? t("This Threat is now shown to the table.") : t("This Threat is hidden again.")); },
  tab: (el, a) => { tabs[a.id] = el.dataset.tab; render(); },
  newCharacter: () => { const a = newActor("character", t("New character")); S.addActor(a); view = "sheet"; persist(); render(); },
  newNpc: () => { const a = newActor("npc", t("New Threat"), { grade: 5 }); S.addActor(a); view = "sheet"; persist(); render(); },
  newCrew: () => { const a = newActor("crew", t("New crew")); S.addActor(a); view = "sheet"; persist(); render(); },
  pregens: () => { const added = S.importPregens(); toast(added.length ? t("Imported: {names}", { names: added.join(", ") }) : t("The pregenerated characters already exist.")); view = "sheet"; persist(); render(); },
  rollSkill: (el, a) => doRoll(a, { skill: el.dataset.skill, attribute: R.DEFAULT_ATTRIBUTE[el.dataset.skill] }),
  rollAttribute: (el, a) => doRoll(a, { attribute: el.dataset.attr }),
  hailMary: (el, a) => doHailMary(a),
  useTechnique: (el, a) => doTechnique(a, el.dataset.sin),
  invokeVice: (el, a) => { const r = E.invokeVice(a); if (r.status === "fail") return toast(r.reason); mutate(a, () => post(r.html)); flashLog(); },
  upkeep: (el, a) => doDowntime([a], null),
  newScene: (el, a) => { mutate(a, () => E.newScene(a)); toast(t("New scene: Flashpoint, Pull, techniques, Vice, refunds and scene effects reset; Riding ended; Hooks expire.")); },
  rest: (el, a) => mutate(a, () => E.rest(a)),
  ride: (el, a) => { const r = E.ride(a, el.dataset.sin); if (!r.ok) return toast(r.reason); persist(); render(); },
  drift: async (el, a) => {
    let r = E.drift(a);
    if (!r.drift) { if (!(await confirmDlg(t("Drift"), esc(t("No Sin leads by 8 or more tags. Clear the tally anyway?"))))) return; r = E.drift(a, true); }
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
  rollNpc: (el, a) => { post(E.npcRoll(a)); mutate(a, () => {}); flashLog(); },
  addClock: async (el, a) => {
    const data = await ask({ title: t("New Clock"), ok: t("Add"), body: `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" placeholder="${esc(t("Coldwater Heat"))}"><label>${esc(t("Segments"))}</label><select name="size"><option>4</option><option selected>6</option><option>8</option></select></div>`, read: f => ({ name: f.elements.name.value || t("Clock"), size: Number(f.elements.size.value) }) });
    if (data) mutate(a, () => a.system.clocks.push({ name: data.name, size: data.size, filled: 0 }));
  },
  clockStep: (el, a) => {
    const c = a.system.clocks[Number(el.dataset.index)], delta = Number(el.dataset.delta);
    const was = c.filled;
    c.filled = Math.max(0, Math.min(c.size, c.filled + delta));
    if (c.filled >= c.size && was < c.size) { post(E.card(esc(t("Clock full: {name}", { name: c.name })), `<p>${esc(t("Something concrete happens: an audit, a visit, a contract pulled. Never vague."))}</p>`)); flashLog(); }
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
    const blob = new Blob([JSON.stringify(S.exportData(), null, 1)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `project-moon-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    state.seenWarning = true; persist();
  },
  import: () => $("#file").click(),
  clearLog: async () => { if (await confirmDlg(t("Clear log"), esc(t("Delete every message in the log?")), t("Clear log"))) { state.log = []; persist(); render(); } },
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

async function startRoom(mode, name, code) {
  let Peer;
  try { Peer = await loadPeer(); } catch { toast(t("Shared rooms need an internet connection (they load PeerJS).")); return; }
  if (room) room.leave(true);
  room = new Room({ Peer, handlers });
  state.name = name; persist();
  renderChrome();
  try {
    if (mode === "host") await room.host(code, name); else await room.join(code, name);
  } catch {
    toast(t(room.error) || room.error); const r = room; room = null; r.leave(true); render(); return;
  }
  render();
  if (mode === "host") { room.sendBoard(); handlers.onLog({ id: uid(), html: E.card(esc(t("Room open")), `<p>${esc(t("Share the code {code} or the link. Players keep their own sheets; everyone sees the rolls.", { code: room.code }))}</p>`) }, true); room.broadcastTable(); }
  else scheduleSync();
}

async function roomDialog() {
  if (room?.online) {
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const who = room.role === "host" ? [...room.peers].map(([, p]) => p.name) : [room.name, ...room.table.players.map(p => p.name)];
    const r = await ask({ title: t("Room {code}", { code: room.code }), ok: t("Leave room"), wide: true,
      body: `<p>${esc(room.role === "host" ? t("You are the GM and host. Keep this page open: the room closes if you leave.") : t("You are in this room as {name}.", { name: room.name }))}</p>
        <div class="pm-row"><label>${esc(t("Code"))}</label><input type="text" readonly value="${esc(room.code)}" class="big"></div>
        <div class="pm-row"><label>${esc(t("Link"))}</label><input type="text" readonly value="${esc(link)}" onfocus="this.select()"></div>
        <p><b>${esc(t("Here now"))}:</b> ${esc(who.join(", ") || t("Nobody else yet."))}</p>`, read: () => true });
    if (r) { room.leave(); room = null; received.length = 0; remoteBoard.tracker = B.newTracker(); remoteBoard.map = null; remoteBoard.image = null; render(); toast(t("You left the room.")); }
    return;
  }
  const startCode = cleanCode(new URLSearchParams(location.search).get("room"));
  const body = `<p>${esc(t("Shared rooms connect your browsers directly (through the free PeerJS broker). The GM hosts and must keep the page open. Players keep their own sheets; everyone sees the rolls."))}</p>
    <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="host" ${startCode ? "" : "checked"}> ${esc(t("I am the GM: open a room"))}</label></div>
    <div class="pm-row"><label class="chk"><input type="radio" name="mode" value="join" ${startCode ? "checked" : ""}> ${esc(t("I am a player: join a room"))}</label></div>
    <div class="pm-row"><label>${esc(t("Your name"))}</label><input type="text" name="name" value="${esc(state.name)}" maxlength="30"></div>
    <div class="pm-row"><label>${esc(t("Code"))}</label><input type="text" name="code" value="${esc(startCode || newCode())}" maxlength="8" class="big"></div>`;
  const r = await ask({ title: t("Shared room"), ok: t("Go"), wide: true, body,
    read: f => ({ mode: f.elements.mode.value, name: f.elements.name.value.trim(), code: cleanCode(f.elements.code.value) }),
    setup: f => f.querySelectorAll("[name=mode]").forEach(el => el.addEventListener("change", () => { f.elements.code.value = f.elements.mode.value === "host" ? newCode() : startCode; })) });
  if (!r) return;
  if (!r.name) { toast(t("Enter your name first.")); return; }
  if (r.code.length < 3) { toast(t("Enter a room code.")); return; }
  await startRoom(r.mode, r.name, r.code);
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

export function init() {
  globalThis.__pm = { get room() { return room; } };   // for debugging in the console
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    const a = viewActor();
    if (a?.remote && !READONLY_OK.has(el.dataset.action)) return;
    fn(el, a);
  });
  document.addEventListener("change", e => { if (e.target.closest("#main")) onField(e); else if (e.target.closest("#pane-map")) boardUI.onChange(e); });
  $("#mapfile").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) boardUI.onUpload(f); });
  $("#file").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (state.actors.length && !(await confirmDlg(t("Import"), esc(t("Importing replaces everything in this browser. Continue?")), t("Import")))) return;
      S.importData(text); persist(); render(); toast(t("Imported."));
    } catch { toast(t("That file is not a Project Moon save.")); }
  });
  window.addEventListener("beforeunload", () => S.save());
  $("#chat").addEventListener("submit", onChat);
  if (new URLSearchParams(location.search).get("room")) setTimeout(() => roomDialog(), 300);
  render();
}
