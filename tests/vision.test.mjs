import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/board.mjs";
import * as S from "../js/store.mjs";
import * as SC from "../js/scenes.mjs";

const C = 70;
/** A 20 x 20 square map with fog on and automatic vision on. */
function room({ radius = 6, remember = true } = {}) {
  const m = B.newMap({ name: "t", w: C * 20, h: C * 20, cell: C });
  m.fog = B.newFog(m); m.fog.on = true; B.dynOf(m); m.fog.dyn.on = true; m.fog.dyn.radius = radius; m.fog.dyn.remember = remember;
  return m;
}
const centre = (gx, gy) => [(gx + 0.5) * C, (gy + 0.5) * C];
const revealed = (m, gx, gy) => B.isRevealed(m, (gx + 0.5) * C, (gy + 0.5) * C);

test("a player token reveals the squares it can see, and only within its vision", () => {
  const m = room({ radius: 3 });
  const tk = B.addToken(m, { name: "Dax", x: centre(10, 10)[0], y: centre(10, 10)[1], pc: true });
  assert.equal(revealed(m, 10, 10), true); assert.equal(revealed(m, 12, 10), true); assert.equal(revealed(m, 10, 7), true);
  assert.equal(revealed(m, 10, 3), false); assert.equal(revealed(m, 15, 10), false);
  assert.equal(B.isRevealed(m, 1, 1), false);
  void tk;
});

test("a wall blocks the view and a door blocks it only while closed", () => {
  const m = room({ radius: 6 });
  B.addWall(m, { x1: 12 * C, y1: 5 * C, x2: 12 * C, y2: 9 * C });                                   // a wall east of the token, with a door in it
  const door = B.addWall(m, { x1: 12 * C, y1: 9 * C, x2: 12 * C, y2: 11 * C, kind: "door" });
  B.addWall(m, { x1: 12 * C, y1: 11 * C, x2: 12 * C, y2: 15 * C });
  B.addToken(m, { name: "Wren", x: centre(10, 10)[0], y: centre(10, 10)[1], pc: true });
  assert.equal(revealed(m, 11, 10), true);                                                           // this side of the wall
  assert.equal(revealed(m, 14, 10), false);                                                          // behind the closed door
  assert.equal(B.toggleDoor(m, door.id).open, true);                                                 // open it: the view passes, and updates by itself
  assert.equal(revealed(m, 14, 10), true);
  assert.equal(revealed(m, 14, 6), false);                                                           // still blocked by the solid part (a view along its very end counts as blocked)
  assert.equal(B.toggleDoor(m, door.id).open, false);
  assert.equal(B.toggleDoor(m, "none"), null);
  const closed = room({ radius: 6, remember: false });                                                // with "remember" off, closing the door covers the room again
  B.addWall(closed, { x1: 12 * C, y1: 5 * C, x2: 12 * C, y2: 15 * C, kind: "door" });
  const d2 = B.wallsOf(closed)[0]; B.toggleDoor(closed, d2.id);
  B.addToken(closed, { name: "W", x: centre(10, 10)[0], y: centre(10, 10)[1], pc: true });
  assert.equal(revealed(closed, 14, 10), true); B.toggleDoor(closed, d2.id); assert.equal(revealed(closed, 14, 10), false);
});

test("moving a token follows the vision; 'remember explored' keeps what was seen, and without it the fog closes behind", () => {
  const keep = room({ radius: 2, remember: true }), forget = room({ radius: 2, remember: false });
  for (const m of [keep, forget]) {
    const tk = B.addToken(m, { name: "A", x: centre(3, 10)[0], y: centre(3, 10)[1], pc: true });
    B.moveToken(m, tk.id, centre(12, 10)[0], centre(12, 10)[1]);
  }
  assert.equal(revealed(keep, 3, 10), true); assert.equal(revealed(keep, 12, 10), true);
  assert.equal(revealed(forget, 3, 10), false); assert.equal(revealed(forget, 12, 10), true);
});

test("only player tokens see; NPC tokens do not reveal anything, and with the vision off nothing happens by itself", () => {
  const m = room();
  B.addToken(m, { name: "Guard", x: centre(5, 5)[0], y: centre(5, 5)[1], pc: false });
  assert.equal(revealed(m, 5, 5), false);
  const off = room(); off.fog.dyn.on = false; B.addToken(off, { name: "A", x: centre(5, 5)[0], y: centre(5, 5)[1], pc: true });
  assert.equal(revealed(off, 5, 5), false);                                                          // manual fog stays manual
  assert.equal(B.updateVision(off), false);
  const nofog = B.newMap({ w: 700, h: 700, cell: C }); assert.equal(B.updateVision(nofog), false); assert.equal(B.dynOf(nofog), null);
});

test("a token next to a wall does not see through it", () => {
  const m = room({ radius: 5 });
  B.addWall(m, { x1: 11 * C, y1: 0, x2: 11 * C, y2: 20 * C });
  B.addToken(m, { name: "A", x: centre(10, 10)[0], y: centre(10, 10)[1], pc: true });
  assert.equal(revealed(m, 10, 10), true); assert.equal(revealed(m, 11, 10), false); assert.equal(revealed(m, 13, 8), false);
});

test("wall tools: snap to the grid corners, erase the nearest, clear, limit", () => {
  const m = room();
  const w = B.addWall(m, { x1: 71, y1: 139, x2: 349, y2: 141 });
  assert.deepEqual([w.x1, w.y1, w.x2, w.y2], [70, 140, 350, 140]);                                    // snapped
  assert.equal(B.addWall(m, { x1: 10, y1: 10, x2: 20, y2: 20 }), null);                                // both ends on the same corner: no wall
  assert.equal(B.wallNear(m, 200, 150, 20).id, w.id); assert.equal(B.wallNear(m, 200, 300, 20), null);
  assert.equal(B.removeWall(m, w.id), true); assert.equal(B.removeWall(m, w.id), false);
  B.addWall(m, { x1: 0, y1: 0, x2: 700, y2: 0 }); B.addWall(m, { x1: 0, y1: 70, x2: 700, y2: 70, kind: "door" });
  assert.equal(B.clearWalls(m), 2); assert.deepEqual(B.wallsOf(m), []);
  for (let i = 0; i < B.MAX_WALLS + 5; i++) B.addWall(m, { x1: 0, y1: i * 1, x2: 70 + i, y2: 3 * C, snap: false });
  assert.equal(B.wallsOf(m).length, B.MAX_WALLS);
});

test("players never receive the walls, and the fog they get is the result of the vision", () => {
  const m = room({ radius: 3 });
  B.addWall(m, { x1: 11 * C, y1: 0, x2: 11 * C, y2: 20 * C });
  B.addToken(m, { name: "A", x: centre(10, 10)[0], y: centre(10, 10)[1], pc: true });
  const out = B.mapForPlayers(m);
  assert.equal("walls" in out, false); assert.ok(!JSON.stringify(out).includes('"kind":"wall"'));
  assert.equal(B.isRevealed(out, centre(10, 10)[0], centre(10, 10)[1]), true); assert.equal(B.isRevealed(out, centre(12, 10)[0], centre(12, 10)[1]), false);
});

test("old saves without walls or vision settings work, and walls and settings survive saving and copying a scene", () => {
  const old = B.newMap({ w: 700, h: 700, cell: C }); old.fog = B.newFog(old); old.fog.on = true;
  assert.deepEqual(B.wallsOf(old), []); assert.deepEqual(B.dynOf(old), { on: false, radius: 8, remember: true });
  assert.deepEqual(B.cleanWalls([null, { id: "a", x1: 0, y1: 0, x2: 70, y2: 0, kind: "door", open: 1 }, { id: "b", x1: 5, y1: 5, x2: 5, y2: 5 }, { id: "c", kind: "x", x1: 0, y1: 0, x2: 0, y2: 9, open: true }]).map(w => [w.id, w.kind, w.open]), [["a", "door", true], ["c", "wall", false]]);
  S.state.actors = []; S.state.scenes = []; S.state.sceneId = ""; S.state.viewId = "";
  const m = room({ radius: 4, remember: false }); B.addWall(m, { x1: 70, y1: 70, x2: 700, y2: 70 });
  S.state.scenes = [SC.newScene("Dungeon", m)];
  const text = JSON.stringify(S.exportData()); S.state.scenes = []; S.importData(text);
  const back = S.state.scenes[0].map;
  assert.equal(B.wallsOf(back).length, 1); assert.deepEqual(B.dynOf(back), { on: true, radius: 4, remember: false });
  assert.equal(B.wallsOf(SC.duplicateScene(S.state, S.state.scenes[0].id).map).length, 1);
});

test("the vision radius is limited and the update is quick with many walls", () => {
  const m = room({ radius: 99 });
  assert.equal(B.dynOf(m).radius, B.MAX_VISION);
  for (let i = 0; i < B.MAX_WALLS; i++) B.addWall(m, { x1: (i % 19) * C, y1: Math.floor(i / 19) * C, x2: (i % 19) * C + C, y2: Math.floor(i / 19) * C });
  for (let i = 0; i < 4; i++) B.addToken(m, { name: "P" + i, x: centre(5 + i * 3, 10)[0], y: centre(5 + i * 3, 10)[1], pc: true });
  const t0 = performance.now(); for (let i = 0; i < 20; i++) B.updateVision(m);
  assert.ok((performance.now() - t0) / 20 < 80, "one update should take well under a frame budget of a drag");
});
