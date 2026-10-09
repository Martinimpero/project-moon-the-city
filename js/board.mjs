/**
 * The Exchange tracker and the map, as plain data with pure helpers (Part VI: an Exchange is "PC actions in fictional order,
 * one Threat action, one named-opponent action", so this tracks who has acted, not initiative).
 */
import { uid } from "./model.mjs";
import { newTimer } from "./timer.mjs";

/* ------------------------------------------------------------------ Exchange tracker */

export const newTracker = () => ({ active: false, exchange: 1, slots: [], timer: newTimer() });

export function addSlot(tr, { name, kind = "other", actorId = "" }) {
  if (actorId && tr.slots.some(s => s.actorId === actorId)) return null;
  const slot = { id: uid(), name: name || "?", kind, actorId, acted: false };
  tr.slots.push(slot);
  return slot;
}
export function removeSlot(tr, id) { tr.slots = tr.slots.filter(s => s.id !== id); }
export function moveSlot(tr, id, delta) {
  const i = tr.slots.findIndex(s => s.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= tr.slots.length) return false;
  const [slot] = tr.slots.splice(i, 1);
  tr.slots.splice(j, 0, slot);
  return true;
}
export function toggleActed(tr, id) {
  const s = tr.slots.find(x => x.id === id);
  if (s) s.acted = !s.acted;
  return s;
}
/** Who is up: the first slot that has not acted. */
export const currentSlot = tr => tr.slots.find(s => !s.acted) ?? null;
export const allActed = tr => tr.slots.length > 0 && tr.slots.every(s => s.acted);
export function nextExchange(tr) {
  tr.exchange += 1;
  tr.slots.forEach(s => { s.acted = false; });
  return tr.exchange;
}
export function startFight(tr) { tr.active = true; tr.exchange = 1; tr.slots.forEach(s => { s.acted = false; }); }
export function endFight(tr) { tr.active = false; tr.exchange = 1; tr.slots = []; }

/** Slots to add for a fight: every character, then every Threat; skips any already present. kinds: pc, threat (a group), named (a single opponent). */
export function suggestSlots(characters, npcs) {
  return [
    ...characters.map(a => ({ name: a.name, kind: "pc", actorId: a.id })),
    ...npcs.map(a => ({ name: a.name, kind: a.system.isGroup ? "threat" : "named", actorId: a.id }))
  ];
}

/* ------------------------------------------------------------------ the map */

export const TOKEN_COLORS = ["#d63031", "#f08c28", "#c9aa1e", "#46aa5a", "#2fa9bd", "#4664dc", "#9650c8", "#e8e8e8"];

export function newMap({ src = "", name = "", w = 2100, h = 1400, cell = 70, bundled = "" } = {}) {
  return { name, src, bundled, w, h, cell, grid: true, snap: true, rev: uid(), tokens: [] };
}
export function addToken(map, { name, x, y, color = "#e8e8e8", img = "", actorId = "", size = 1, hidden = false, pc = false }) {
  const token = { id: uid(), name: name || "?", x: Number.isFinite(x) ? x : map.w / 2, y: Number.isFinite(y) ? y : map.h / 2, color, img, actorId, size, hidden, pc };
  map.tokens.push(token);
  return token;
}
export const removeToken = (map, id) => { map.tokens = map.tokens.filter(t => t.id !== id); };
/** Move a token to image coordinates, clamped to the map and snapped to the centre of a square when `snap` is on. */
export function moveToken(map, id, x, y) {
  const tk = map.tokens.find(t => t.id === id);
  if (!tk) return null;
  let nx = Math.max(0, Math.min(map.w, x)), ny = Math.max(0, Math.min(map.h, y));
  if (map.snap && map.cell > 0) {
    nx = (Math.floor(nx / map.cell) + 0.5) * map.cell; ny = (Math.floor(ny / map.cell) + 0.5) * map.cell;
    nx = Math.min(nx, map.w); ny = Math.min(ny, map.h);
  }
  tk.x = nx; tk.y = ny;
  return tk;
}
/* ---- fog of war: a grid of squares, "1" = revealed. It hides things on screen; it is not a secret (see the README). ---- */

export function newFog(map) {
  const cell = map.cell > 0 ? map.cell : 70;
  const cols = Math.ceil(map.w / cell), rows = Math.ceil(map.h / cell);
  return { on: false, cell, cols, rows, bits: "0".repeat(cols * rows) };
}
const fogIndex = (fog, x, y) => {
  const cx = Math.floor(x / fog.cell), cy = Math.floor(y / fog.cell);
  return cx < 0 || cy < 0 || cx >= fog.cols || cy >= fog.rows ? -1 : cy * fog.cols + cx;
};
export function isRevealed(map, x, y) {
  const f = map.fog;
  if (!f?.on) return true;
  const i = fogIndex(f, x, y);
  return i >= 0 && f.bits[i] === "1";
}
function setBit(f, i, v) { if (i >= 0 && f.bits[i] !== (v ? "1" : "0")) f.bits = f.bits.slice(0, i) + (v ? "1" : "0") + f.bits.slice(i + 1); }
/** Reveal (v true) or cover (v false) every square within `r` squares of a point (r 0 = just the square under it). */
export function paintFog(map, x, y, v, r = 0) {
  const f = map.fog; if (!f) return;
  const cx = Math.floor(x / f.cell), cy = Math.floor(y / f.cell);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r) continue;                       // a rounded blob, not a square
    const gx = cx + dx, gy = cy + dy;
    if (gx >= 0 && gy >= 0 && gx < f.cols && gy < f.rows) setBit(f, gy * f.cols + gx, v);
  }
}
export function fogAll(map, v) { if (map.fog) map.fog.bits = (v ? "1" : "0").repeat(map.fog.cols * map.fog.rows); }
/** Horizontal runs of covered squares as [x, y, width, height] rectangles in image pixels, for drawing. */
export function fogRects(fog) {
  const out = [];
  for (let r = 0; r < fog.rows; r++) {
    let start = -1;
    for (let c = 0; c <= fog.cols; c++) {
      const covered = c < fog.cols && fog.bits[r * fog.cols + c] === "0";
      if (covered && start < 0) start = c;
      if (!covered && start >= 0) { out.push([start * fog.cell, r * fog.cell, (c - start) * fog.cell, fog.cell]); start = -1; }
    }
  }
  return out;
}

/** What a player may see: hidden tokens are removed, and with fog on so is any token not in a revealed square (characters' tokens always show). The custom image is sent separately (it can be large). */
export function mapForPlayers(map) {
  if (!map) return null;
  const { tokens, ...rest } = map;
  const copy = { ...rest, tokens: tokens.filter(t => !t.hidden && (t.pc || isRevealed(map, t.x, t.y))) };
  if (!map.bundled) copy.src = "";           // a custom image travels in its own message
  return copy;
}
export const initials = name => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
/** Squares between two image points, counting diagonals as the larger axis (a simple, table-friendly distance). */
export function squaresBetween(map, a, b) {
  const dx = Math.abs(a.x - b.x) / map.cell, dy = Math.abs(a.y - b.y) / map.cell;
  return Math.round(Math.max(dx, dy));
}

/** Shrink an uploaded image to at most `max` pixels wide, as a JPEG data URL. Browser only. */
export async function shrinkImage(file, max = 1800, quality = 0.8) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  return { src: canvas.toDataURL("image/jpeg", quality), w, h };
}

/* ---- map pings: a short-lived pulse the GM puts on the map for everyone to look at ---- */

export const PING_MS = 3800;
/** A ping at image coordinates, kept on the map. `look` also asks everyone's view to centre there. `rev` is the map it belongs to. */
export function makePing(map, x, y, look = false, now = Date.now(), who = "") {
  if (!map || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const name = String(who ?? "").trim().slice(0, 30);
  return { id: uid(), rev: map.rev, x: Math.max(0, Math.min(map.w, x)), y: Math.max(0, Math.min(map.h, y)), look: !!look && !name, at: now, who: name, color: name ? pingColor(name) : "#c9a227" };
}
/** A player's ping takes a colour from their name, so the same person always shows the same one (the GM's is gold). */
export function pingNote(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % (TOKEN_COLORS.length - 1);                         // not the last colour (white): that one is the GM-neutral one
}
export const pingColor = name => TOKEN_COLORS[pingNote(name)];
export const pingAlive = (p, now = Date.now()) => now - p.at < PING_MS;
/** A ping that arrived from the GM is only for the map the viewer has. */
export const pingFits = (p, map) => !!map && p.rev === map.rev;
/** The view (x, y, w, h) re-centred on a point, keeping its size and staying on the map. */
export function centreView(view, map, x, y) {
  const w = Math.min(view.w, map.w), h = Math.min(view.h, map.h);
  return { w, h, x: Math.max(0, Math.min(map.w - w, x - w / 2)), y: Math.max(0, Math.min(map.h - h, y - h / 2)) };
}
