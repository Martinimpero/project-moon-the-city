import test from "node:test";
import assert from "node:assert/strict";
import * as W from "../js/win.mjs";

test("the first place is right of the list, below the header, and fits the screen", () => {
  const r = W.defaultRect(1366, 800);
  assert.deepEqual([r.x, r.y, r.min], [250, 70, false]);
  assert.ok(r.w >= W.MIN_W && r.x + r.w <= 1366 - 360, "leaves room for the log on the right");
  assert.ok(r.y + r.h <= 800);
  const small = W.defaultRect(900, 500);
  assert.ok(small.w >= W.MIN_W && small.h >= W.MIN_H);
});

test("a saved rectangle is repaired: numbers, sizes within limits, and some of the title bar always on screen", () => {
  assert.deepEqual(W.clampRect({ x: "a", y: "b", w: undefined, h: NaN, min: 1 }, 1366, 800), { x: 250, y: 70, w: 560, h: 520, min: true });
  const off = W.clampRect({ x: 5000, y: 5000, w: 600, h: 500 }, 1366, 800);
  assert.ok(off.x <= 1366 - W.KEEP && off.y <= 800 - W.BAR_H);                                  // dragged far away: still reachable
  const left = W.clampRect({ x: -5000, y: -40, w: 600, h: 500 }, 1366, 800);
  assert.ok(left.x + left.w >= W.KEEP && left.y >= 0);
  const huge = W.clampRect({ x: 0, y: 0, w: 9000, h: 9000 }, 1000, 700);
  assert.ok(huge.w <= 1000 && huge.h <= 700);
  const tiny = W.clampRect({ x: 0, y: 0, w: 10, h: 10 }, 1000, 700);
  assert.deepEqual([tiny.w, tiny.h], [W.MIN_W, W.MIN_H]);
});

test("moving follows the pointer and cannot lose the window", () => {
  const start = { x: 300, y: 100, w: 560, h: 520, min: false };
  assert.deepEqual(W.movedRect(start, 40, -30, 1366, 800), { ...start, x: 340, y: 70 });
  const away = W.movedRect(start, 9000, 9000, 1366, 800);
  assert.ok(away.x <= 1366 - W.KEEP && away.y <= 800 - W.BAR_H);
});

test("where it was put is remembered on this device, and a broken record falls back to the default", () => {
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(W.loadRect(1366, 800, storage), W.defaultRect(1366, 800));
  W.saveRect({ x: 700, y: 120, w: 500, h: 400, min: true }, storage);
  assert.deepEqual(W.loadRect(1366, 800, storage), { x: 700, y: 120, w: 500, h: 400, min: true });
  assert.deepEqual(W.loadRect(900, 600, storage).min, true);
  mem.set("project-moon-the-city/window", "{not json");
  assert.deepEqual(W.loadRect(1366, 800, storage), W.defaultRect(1366, 800));
  assert.doesNotThrow(() => W.saveRect({}, { setItem() { throw new Error("private window"); } }));
});
