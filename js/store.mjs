/** Saved state: actors, the roll log and the language. Lives in localStorage (when available) and can be exported as a file. */
import { normalizeActor, newActor, refresh, uid } from "./model.mjs";
import { PREGENS, PREGENS_ES } from "./pregens.mjs";
import { setLang } from "./i18n.mjs";
import { newTracker } from "./board.mjs";

const KEY = "project-moon-the-city/v1";
const LOG_LIMIT = 200;

export const state = { version: 1, lang: "en", name: "", selected: "", actors: [], log: [], seenWarning: false, tracker: newTracker(), map: null, handouts: [] };

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) apply(JSON.parse(raw));
  } catch { /* private window or corrupt data: start empty */ }
  setLang(state.lang);
}
function apply(data) {
  state.lang = data.lang === "es" ? "es" : "en";
  state.name = String(data.name ?? "").slice(0, 30);
  state.actors = (data.actors ?? []).filter(a => a && ["character", "npc", "crew"].includes(a.type)).map(normalizeActor);
  state.log = Array.isArray(data.log) ? data.log.slice(-LOG_LIMIT) : [];
  state.selected = state.actors.some(a => a.id === data.selected) ? data.selected : (state.actors[0]?.id ?? "");
  state.seenWarning = !!data.seenWarning;
  state.tracker = data.tracker && Array.isArray(data.tracker.slots) ? { active: !!data.tracker.active, exchange: Number(data.tracker.exchange) || 1, slots: data.tracker.slots } : newTracker();
  state.map = data.map && Array.isArray(data.map.tokens) ? data.map : null;
  state.handouts = Array.isArray(data.handouts) ? data.handouts.filter(h => h && h.id && h.title !== undefined).slice(0, 60) : [];
}

let dirty = false;
export function exportData() {
  return { version: 1, lang: state.lang, name: state.name, selected: state.selected, seenWarning: state.seenWarning, tracker: state.tracker, map: state.map, handouts: state.handouts, actors: state.actors.map(({ derived, ...a }) => ({ ...a, items: a.items.map(({ derived: _d, ...i }) => i) })), log: state.log.slice(-LOG_LIMIT) };
}
export function save(storage = globalThis.localStorage) {
  dirty = true;
  try { storage?.setItem(KEY, JSON.stringify(exportData())); dirty = false; return true; } catch { return false; }
}
export const hasUnsavedExport = () => dirty;

/** Replace everything with an exported file's contents. Throws on a file that isn't ours. */
export function importData(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.actors)) throw new Error("Not a Project Moon save file.");
  apply(data);
  setLang(state.lang);
}

export const byId = id => state.actors.find(a => a.id === id);
export const selectedActor = () => byId(state.selected);
export function addActor(actor) { state.actors.push(actor); state.selected = actor.id; return actor; }
export function removeActor(id) {
  state.actors = state.actors.filter(a => a.id !== id);
  for (const c of state.actors) if (c.type === "crew") c.system.memberIds = c.system.memberIds.filter(m => m !== id);
  if (state.selected === id) state.selected = state.actors[0]?.id ?? "";
}
/** Add a message to the log. Returns the entry, or null if one with the same id is already there. */
export function addLog(html, id = uid()) {
  if (state.log.some(e => e.id === id)) return null;
  const entry = { id, at: Date.now(), html };
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  return entry;
}

/** Add the four pregenerated characters (Spanish text if the app is in Spanish). Returns the names added. */
export function importPregens() {
  const added = [];
  for (const p of PREGENS) {
    if (state.actors.some(a => a.name === p.name || a.name === p.name)) continue;
    const es = state.lang === "es" ? PREGENS_ES.find(x => x.name === p.name) : null;
    const actor = newActor("character", p.name, es ? { ...p.system, ...es.text } : p.system, es ? es.items : p.items);
    refresh(actor);
    addActor(actor);
    added.push(p.name);
  }
  if (added.length) state.selected = state.actors.find(a => a.name === added[0])?.id ?? state.selected;
  return added;
}
