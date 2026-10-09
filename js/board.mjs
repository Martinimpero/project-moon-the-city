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
  autoVision(map);
  return token;
}
export const removeToken = (map, id) => { map.tokens = map.tokens.filter(t => t.id !== id); autoVision(map); };
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
  autoVision(map);
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
  const { tokens, walls, ...rest } = map;
  const copy = { ...rest, tokens: tokens.filter(t => !t.hidden && (t.pc || isRevealed(map, t.x, t.y))), marks: marksForPlayers(map) };
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

/* ---- map marks: pins with a private note, and freehand drawings ---- */
export const MAX_MARKS = 150, MAX_STROKE_POINTS = 300, MAX_LABEL = 40, MAX_NOTE = 400;
export const AREA_SHAPES = ["circle", "cone", "line"], MAX_AREA = 40;
const normAngle = a => ((a % 360) + 360) % 360;
export const MARK_COLORS = ["#ff5c5c", "#ffb347", "#ffe066", "#6bd98f", "#5cc8ff", "#9b8cff", "#ffffff", "#111111"];
const clipStr = (v, n) => String(v ?? "").slice(0, n);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const colour = c => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : MARK_COLORS[0]);
/** A saved or received list of marks, repaired: anything that is not a pin or a stroke is dropped. */
export function cleanMarks(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m !== "object" || !m.id) continue;
    if (m.kind === "pin") out.push({ id: String(m.id), kind: "pin", x: num(m.x), y: num(m.y), label: clipStr(m.label, MAX_LABEL), note: clipStr(m.note, MAX_NOTE), color: colour(m.color), shown: !!m.shown });
    else if (m.kind === "area" && AREA_SHAPES.includes(m.shape)) out.push({ id: String(m.id), kind: "area", shape: m.shape, x: num(m.x), y: num(m.y), angle: normAngle(num(m.angle)), size: Math.max(1, Math.min(MAX_AREA, Math.round(num(m.size)) || 1)), width: Math.max(1, Math.min(10, Math.round(num(m.width)) || 1)), color: colour(m.color), shown: !!m.shown });
    else if (m.kind === "stroke" && Array.isArray(m.pts) && m.pts.length >= 2) {
      const pts = m.pts.slice(0, MAX_STROKE_POINTS).map(p => [num(p?.[0]), num(p?.[1])]);
      out.push({ id: String(m.id), kind: "stroke", pts, color: colour(m.color), width: Math.max(2, Math.min(40, num(m.width) || 6)), shown: !!m.shown });
    }
    if (out.length >= MAX_MARKS) break;
  }
  return out;
}
/** The map's marks, repaired in place (maps saved before marks existed have none). */
const cleanLists = new WeakSet();
export function marksOf(map) {
  if (map.marks && cleanLists.has(map.marks)) return map.marks;          // already repaired: keep the same objects
  map.marks = cleanMarks(map.marks); cleanLists.add(map.marks);
  return map.marks;
}
export function addPin(map, { x, y, label = "", note = "", color, shown = false }) {
  const marks = marksOf(map); if (marks.length >= MAX_MARKS) return null;
  const pin = { id: uid(), kind: "pin", x: Math.max(0, Math.min(map.w, num(x))), y: Math.max(0, Math.min(map.h, num(y))), label: clipStr(label, MAX_LABEL).trim(), note: clipStr(note, MAX_NOTE), color: colour(color), shown: !!shown };
  marks.push(pin); return pin;
}
export function editPin(map, id, fields) {
  const pin = marksOf(map).find(m => m.id === id && m.kind === "pin"); if (!pin) return null;
  if ("label" in fields) pin.label = clipStr(fields.label, MAX_LABEL).trim();
  if ("note" in fields) pin.note = clipStr(fields.note, MAX_NOTE);
  if ("color" in fields) pin.color = colour(fields.color);
  if ("shown" in fields) pin.shown = !!fields.shown;
  return pin;
}
/** Thin a drawn line: keep a point only when it is at least `minDist` from the last one kept (and always the last point), at most MAX_STROKE_POINTS. */
export function simplify(pts, minDist) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const p = out[out.length - 1]; if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) >= minDist) out.push(pts[i]); }
  out.push(pts[pts.length - 1]);
  if (out.length > MAX_STROKE_POINTS) { const k = out.length / MAX_STROKE_POINTS, last = out[out.length - 1]; const thin = Array.from({ length: MAX_STROKE_POINTS }, (_, i) => out[Math.min(out.length - 1, Math.floor(i * k))]); thin[thin.length - 1] = last; return thin; }
  return out;
}
export function addStroke(map, pts, { color, width = 6, shown = true } = {}) {
  const marks = marksOf(map); if (marks.length >= MAX_MARKS) return null;
  const line = simplify((pts ?? []).map(p => [num(p[0]), num(p[1])]), Math.max(2, (map.cell > 0 ? map.cell : 70) / 14));
  if (line.length < 2) return null;
  const s = { id: uid(), kind: "stroke", pts: line, color: colour(color), width: Math.max(2, Math.min(40, num(width) || 6)), shown: !!shown };
  marks.push(s); return s;
}
export function removeMark(map, id) { const marks = marksOf(map), i = marks.findIndex(m => m.id === id); if (i < 0) return false; marks.splice(i, 1); return true; }
/** Remove every drawing (and, with `pins`, every pin). Returns how many went. */
export function clearMarks(map, { pins = false } = {}) { const marks = marksOf(map), keep = pins ? [] : marks.filter(m => m.kind === "pin"); const n = marks.length - keep.length; map.marks = keep; cleanLists.add(keep); return n; }
/** What a player may see: drawings and pins the GM has shown; a pin loses its private note, and under fog only a pin in a revealed square is sent. */
export function marksForPlayers(map) {
  return marksOf(map).filter(m => m.shown && (m.kind !== "pin" || !map.fog?.on || isRevealed(map, m.x, m.y)))
    .map(m => (m.kind === "pin" ? { ...m, note: "" } : m));
}

/* ---- walls and automatic vision: player tokens reveal the squares they can see; walls and closed doors block the view ---- */
export const MAX_WALLS = 300, MAX_VISION = 15;
const cleanWallLists = new WeakSet();
/** A saved or received list of walls, repaired. */
export function cleanWalls(list) {
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (!w || typeof w !== "object" || !w.id) continue;
    const s = { id: String(w.id), kind: w.kind === "door" ? "door" : "wall", x1: num(w.x1), y1: num(w.y1), x2: num(w.x2), y2: num(w.y2), open: w.kind === "door" && !!w.open };
    if (s.x1 === s.x2 && s.y1 === s.y2) continue;
    out.push(s); if (out.length >= MAX_WALLS) break;
  }
  return out;
}
export function wallsOf(map) {
  if (map.walls && cleanWallLists.has(map.walls)) return map.walls;
  map.walls = cleanWalls(map.walls); cleanWallLists.add(map.walls);
  return map.walls;
}
/** The vision settings of a map's fog (repaired in place), or null if the map has no fog. */
export function dynOf(map) {
  const f = map.fog; if (!f) return null;
  const d = f.dyn && typeof f.dyn === "object" ? f.dyn : {};
  f.dyn = { on: !!d.on, radius: Math.max(1, Math.min(MAX_VISION, Math.floor(Number(d.radius)) || 8)), remember: d.remember !== false };
  return f.dyn;
}
const snapTo = (v, cell) => Math.round(v / cell) * cell;
/** Add a wall or a door between two points. With `snap` the ends go to the nearest grid corner. */
export function addWall(map, { x1, y1, x2, y2, kind = "wall", snap = true }) {
  const walls = wallsOf(map); if (walls.length >= MAX_WALLS) return null;
  const c = map.cell > 0 ? map.cell : 70, f = v => (snap ? snapTo(v, c) : v);
  const w = { id: uid(), kind: kind === "door" ? "door" : "wall", x1: f(num(x1)), y1: f(num(y1)), x2: f(num(x2)), y2: f(num(y2)), open: false };
  if (w.x1 === w.x2 && w.y1 === w.y2) return null;
  walls.push(w); autoVision(map); return w;
}
export function removeWall(map, id) { const walls = wallsOf(map), i = walls.findIndex(w => w.id === id); if (i < 0) return false; walls.splice(i, 1); autoVision(map); return true; }
export function toggleDoor(map, id) { const w = wallsOf(map).find(x => x.id === id && x.kind === "door"); if (!w) return null; w.open = !w.open; autoVision(map); return w; }
export function clearWalls(map) { const n = wallsOf(map).length; map.walls = []; cleanWallLists.add(map.walls); autoVision(map); return n; }
/** Distance from a point to a segment. */
const distSeg = (px, py, w) => {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / l2)) : 0;
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
};
/** The wall or door closest to a point, if within `tol` pixels. */
export function wallNear(map, x, y, tol = 20) {
  let best = null, bd = tol;
  for (const w of wallsOf(map)) { const d = distSeg(x, y, w); if (d <= bd) { best = w; bd = d; } }
  return best;
}
/** Do the segments a-b and c-d cross or touch? Touching counts, so a view that grazes the end of a wall or the joint of two walls is blocked, never leaked. */
export function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const on = (px, py, qx, qy, rx, ry) => Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy), o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(ax, ay, bx, by, cx, cy)) || (o2 === 0 && on(ax, ay, bx, by, dx, dy)) || (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && on(cx, cy, dx, dy, bx, by));
}
/** Does anything solid (a wall, or a closed door) lie between two points? */
export function sightBlocked(walls, x1, y1, x2, y2) {
  for (const w of walls) {
    if (w.kind === "door" && w.open) continue;
    if (segmentsCross(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2)) return true;
  }
  return false;
}
/** The squares ([column, row]) a viewer at (x, y) can see within `radius` squares: a straight line from the viewer to the middle of the square must not cross a wall. */
export function visibleCells(map, x, y, radius, walls = wallsOf(map)) {
  const f = map.fog; if (!f) return [];
  const c = f.cell, vx = Math.floor(x / c), vy = Math.floor(y / c), out = [];
  const near = walls.filter(w => Math.min(w.x1, w.x2) <= x + (radius + 1) * c && Math.max(w.x1, w.x2) >= x - (radius + 1) * c && Math.min(w.y1, w.y2) <= y + (radius + 1) * c && Math.max(w.y1, w.y2) >= y - (radius + 1) * c);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx * dx + dy * dy > radius * radius + radius) continue;
    const gx = vx + dx, gy = vy + dy;
    if (gx < 0 || gy < 0 || gx >= f.cols || gy >= f.rows) continue;
    if ((dx || dy) && sightBlocked(near, x, y, (gx + 0.5) * c, (gy + 0.5) * c)) continue;
    out.push([gx, gy]);
  }
  return out;
}
/**
 * Recompute the fog from what the player tokens can see. With "remember explored" on, squares once seen stay revealed; with it off, the fog is
 * covered again and only what is in sight now is clear. Does nothing unless the fog and the automatic vision are on. Returns true if the fog changed.
 */
export function updateVision(map) {
  const f = map.fog, d = f && dynOf(map);
  if (!f?.on || !d.on) return false;
  const before = f.bits, walls = wallsOf(map);
  if (!d.remember) f.bits = "0".repeat(f.cols * f.rows);
  for (const tk of map.tokens) {
    if (!tk.pc) continue;
    for (const [gx, gy] of visibleCells(map, tk.x, tk.y, d.radius, walls)) setBit(f, gy * f.cols + gx, true);
  }
  return f.bits !== before;
}
function autoVision(map) { if (map.fog?.on && map.fog.dyn?.on) updateVision(map); }

/* ---- area templates: a circle, a cone or a line laid on the map, to see who is in the way ---- */
const CONE_HALF = Math.atan(0.5);                      // a cone is as wide at its end as it is long
/**
 * Lay an area on the map. `size` is the radius (circle) or the length (cone, line) in squares; `width` is a line's width in squares;
 * `angle` is the direction in degrees (0 = east, turning clockwise on screen).
 */
export function addArea(map, { shape = "circle", x, y, angle = 0, size = 1, width = 1, color, shown = true }) {
  if (!AREA_SHAPES.includes(shape)) return null;
  const marks = marksOf(map); if (marks.length >= MAX_MARKS) return null;
  const a = { id: uid(), kind: "area", shape, x: Math.max(0, Math.min(map.w, num(x))), y: Math.max(0, Math.min(map.h, num(y))), angle: normAngle(num(angle)), size: Math.max(1, Math.min(MAX_AREA, Math.round(num(size)) || 1)), width: Math.max(1, Math.min(10, Math.round(num(width)) || 1)), color: colour(color), shown: !!shown };
  marks.push(a); return a;
}
/** The outline of a cone or a line as points in image pixels (a circle has none: it is drawn from its centre and radius). */
export function areaPolygon(a, cell) {
  const rad = a.angle * Math.PI / 180, L = a.size * cell;
  if (a.shape === "cone") {
    const pts = [[a.x, a.y]];
    for (let i = 0; i <= 10; i++) { const t = rad - CONE_HALF + (2 * CONE_HALF * i) / 10; pts.push([a.x + Math.cos(t) * L, a.y + Math.sin(t) * L]); }
    return pts;
  }
  if (a.shape === "line") {
    const hw = (a.width * cell) / 2, nx = -Math.sin(rad) * hw, ny = Math.cos(rad) * hw, ex = a.x + Math.cos(rad) * L, ey = a.y + Math.sin(rad) * L;
    return [[a.x + nx, a.y + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [a.x - nx, a.y - ny]];
  }
  return null;
}
/** Is a point inside the area? */
export function inArea(a, cell, px, py) {
  const dx = px - a.x, dy = py - a.y, L = a.size * cell;
  if (a.shape === "circle") return Math.hypot(dx, dy) <= L;
  const rad = a.angle * Math.PI / 180, along = dx * Math.cos(rad) + dy * Math.sin(rad), across = -dx * Math.sin(rad) + dy * Math.cos(rad);
  if (along < 0 || along > L) return false;
  if (a.shape === "line") return Math.abs(across) <= (a.width * cell) / 2;
  return Math.abs(Math.atan2(across, along)) <= CONE_HALF + 1e-9;              // cone
}
/** The tokens whose centre is inside the area (hidden ones too: this is for the GM). */
export function tokensInArea(map, a) {
  const c = map.cell > 0 ? map.cell : 70;
  return map.tokens.filter(t => inArea(a, c, t.x, t.y));
}
/** Direction (degrees) and length in squares from a start point to an end point, for drawing an area by dragging. */
export function areaFromDrag(map, x1, y1, x2, y2) {
  const c = map.cell > 0 ? map.cell : 70, dx = x2 - x1, dy = y2 - y1;
  return { angle: normAngle(Math.atan2(dy, dx) * 180 / Math.PI), size: Math.max(1, Math.min(MAX_AREA, Math.round(Math.hypot(dx, dy) / c))) };
}
