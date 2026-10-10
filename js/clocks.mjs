/**
 * The Clocks board: the table's Clocks (Open War, Kurokumo Heat, a chase...) in one place. The GM keeps them and chooses which ones the players
 * can see; players see the name, the segments and how full each is, never the consequence until the Clock is full. Plain functions, so Node can test them.
 */
import { uid } from "./model.mjs";

export const MAX_CLOCKS = 30, SIZES = [4, 6, 8, 10, 12];
const clip = (v, n) => String(v ?? "").slice(0, n);
const size = n => { n = Math.floor(Number(n)); return n >= 2 && n <= 12 ? n : 6; };

export function newClock({ name = "", size: sz = 6, filled = 0, scope = "", consequence = "", shown = false, id } = {}) {
  const s = size(sz);
  return { id: id || uid(), name: clip(name, 40).trim() || "Clock", size: s, filled: Math.max(0, Math.min(s, Math.floor(Number(filled)) || 0)), scope: clip(scope, 60), consequence: clip(consequence, 300), shown: !!shown };
}
/** A saved or received list, repaired. */
export const cleanClocks = list => (Array.isArray(list) ? list : []).filter(c => c && typeof c === "object" && c.id).slice(0, MAX_CLOCKS).map(c => newClock({ ...c, id: String(c.id) }));

/** Move a Clock by `delta` segments (kept between 0 and its size). Returns { clock, filledNow, emptiedNow }: whether this step filled it. */
export function step(clock, delta) {
  const was = clock.filled;
  clock.filled = Math.max(0, Math.min(clock.size, was + Math.trunc(Number(delta) || 0)));
  return { clock, filledNow: was < clock.size && clock.filled >= clock.size, changed: clock.filled !== was };
}
export const isFull = c => c.filled >= c.size;

/** What a player is sent: only the Clocks the GM shows, with the consequence only once the Clock is full. */
export const forPlayers = list => list.filter(c => c.shown).map(c => ({ id: c.id, name: c.name, size: c.size, filled: c.filled, scope: c.scope, consequence: isFull(c) ? c.consequence : "", shown: true }));

export function addClock(list, fields) {
  if (list.length >= MAX_CLOCKS) return null;
  const c = newClock(fields); list.push(c); return c;
}
export function editClock(list, id, fields) {
  const c = list.find(x => x.id === id); if (!c) return null;
  const n = newClock({ ...c, ...fields, id });
  Object.assign(c, n); return c;
}
export function removeClock(list, id) { const i = list.findIndex(x => x.id === id); if (i < 0) return false; list.splice(i, 1); return true; }
