/**
 * Session kits: one file that sets up a whole session (scenes with maps and tokens, Threat sheets, handouts, notes, Clocks, Exchange order).
 * Importing never touches characters. Plain functions, so Node can test them.
 *   mode "add":     add what is missing; anything with the same name is left as it is (tokens link to the existing sheet).
 *   mode "prep":    scenes and notes only.
 *   mode "replace": replace the Threats, scenes, handouts, notes, journal, Clocks and Exchange order with the kit's (characters and crews are kept).
 */
import { newActor } from "./model.mjs";
import { newMap, addToken, moveToken, addSlot } from "./board.mjs";
import { newScene, MAX_SCENES, ensureScenes } from "./scenes.mjs";
import { newHandout, MAX_HANDOUTS } from "./handouts.mjs";
import * as J from "./journal.mjs";
import * as K from "./clocks.mjs";
import { MAPS } from "./maplist.mjs";

export const KIT_KIND = "project-moon-kit", MODES = ["add", "prep", "replace"];
/** A kit's text is a string or { en, es }; read it in `lang`. */
export const pick = (v, lang) => (v && typeof v === "object" ? (v[lang] ?? v.en ?? "") : String(v ?? ""));

/** Read a kit file's text. Throws a readable message if it is not one. */
export function parseKit(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file is not a Project Moon kit."); }
  if (!data || data.kind !== KIT_KIND || data.version !== 1) throw new Error("That file is not a Project Moon kit.");
  return data;
}
/** What a kit holds, for the preview. */
export const contents = kit => ({
  scenes: (kit.scenes ?? []).length, tokens: (kit.scenes ?? []).reduce((n, s) => n + (s.tokens ?? []).length, 0), actors: (kit.actors ?? []).length,
  handouts: (kit.handouts ?? []).length, notes: (kit.notes ?? []).length, journal: (kit.journal ?? []).length, clocks: (kit.clocks ?? []).length
});

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * Apply `kit` to `state` (the app's state object). Returns what was added and what was left alone.
 * `author` signs the journal entries. Names in the kit are read in `lang`.
 */
export function applyKit(state, kit, { mode = "add", lang = "en", author = "GM" } = {}) {
  if (!MODES.includes(mode)) mode = "add";
  const out = { actors: 0, scenes: 0, tokens: 0, handouts: 0, notes: 0, journal: 0, clocks: 0, exchange: 0, skipped: 0 };
  const full = mode !== "prep";
  if (mode === "replace") {
    state.actors = state.actors.filter(a => a.type !== "npc");
    state.scenes = []; state.handouts = []; state.notes = []; state.journal = []; state.clocks = [];
    state.tracker = { ...state.tracker, active: false, exchange: 1, slots: [] };
  }
  /* sheets: a name already used keeps its sheet */
  const byRef = {};
  for (const a of kit.actors ?? []) {
    const have = state.actors.find(x => x.type === "npc" && same(x.name, a.name));
    if (have) { byRef[a.ref] = have.id; if (full) out.skipped++; continue; }
    if (!full) continue;
    const n = newActor("npc", a.name, a.system ?? {}); state.actors.push(n); byRef[a.ref] = n.id; out.actors++;
  }
  /* scenes: an untouched "Scene 1" makes way for the first one */
  ensureScenes(state);
  if (state.scenes.length === 1 && !state.scenes[0].map && state.scenes[0].name === "Scene 1" && (kit.scenes ?? []).length) state.scenes = [];
  let first = null;
  for (const sc of kit.scenes ?? []) {
    if (state.scenes.length >= MAX_SCENES) { out.skipped++; continue; }
    const def = MAPS.find(m => m.id === sc.map);
    const map = def ? newMap({ src: def.file, name: def.title, w: def.w, h: def.h, cell: def.cell || 70, bundled: def.id }) : null;
    if (map) {
      map.grid = def.grid;
      for (const t of sc.tokens ?? []) {
        const actorId = t.ref ? (byRef[t.ref] ?? "") : "";
        const tk = addToken(map, { name: t.name, x: t.x, y: t.y, color: t.color, img: t.img, actorId, size: t.size, hidden: !!t.hidden, pc: false });
        moveToken(map, tk.id, tk.x, tk.y); out.tokens++;
      }
    }
    const scene = newScene(pick(sc.name, lang), map); state.scenes.push(scene); first ??= scene; out.scenes++;
  }
  if (first && (mode === "replace" || out.scenes)) { if (mode === "replace" || !state.scenes.some(s => s.id === state.sceneId)) state.sceneId = first.id; state.viewId = first.id; }
  ensureScenes(state);
  /* notes */
  for (const n of kit.notes ?? []) {
    if (state.notes.some(x => same(x.title, n.title))) { out.skipped++; continue; }
    if (J.addNote(state.notes, { title: n.title, text: n.text })) out.notes++;
  }
  if (!full) return out;
  /* handouts, journal, Clocks */
  for (const h of kit.handouts ?? []) {
    if (state.handouts.some(x => same(x.title, h.title)) || state.handouts.length >= MAX_HANDOUTS) { out.skipped++; continue; }
    state.handouts.push(newHandout({ title: h.title, text: h.text, lang: h.lang, alt: h.alt })); out.handouts++;
  }
  for (const e of kit.journal ?? []) {
    const title = pick(e.title, lang);
    if (state.journal.some(x => same(x.title, title))) { out.skipped++; continue; }
    const r = J.applyOp(state.journal, "add", { title, text: pick(e.text, lang) }, author, { gm: true });
    if (r.ok && e.pinned) r.entry.pinned = true;
    if (r.ok) out.journal++;
  }
  for (const c of kit.clocks ?? []) {
    const name = pick(c.name, lang);
    if (state.clocks.some(x => same(x.name, name))) { out.skipped++; continue; }
    if (K.addClock(state.clocks, { name, size: c.size, filled: c.filled, scope: c.scope, consequence: pick(c.consequence, lang), shown: c.shown })) out.clocks++;
  }
  /* Exchange order: listed, not started */
  for (const ref of kit.exchange ?? []) {
    const id = byRef[ref], a = state.actors.find(x => x.id === id);
    if (!a || state.tracker.slots.some(s => s.actorId === id)) continue;
    addSlot(state.tracker, { name: a.name, kind: a.system.isGroup ? "threat" : "named", actorId: id }); out.exchange++;
  }
  return out;
}
