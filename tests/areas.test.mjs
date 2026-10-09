import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/board.mjs";
import * as S from "../js/store.mjs";
import * as SC from "../js/scenes.mjs";

const C = 70;
const mk = () => B.newMap({ name: "t", w: C * 20, h: C * 20, cell: C });
const at = (m, name, gx, gy, extra = {}) => B.addToken(m, { name, x: (gx + 0.5) * C, y: (gy + 0.5) * C, ...extra });
const names = (m, a) => B.tokensInArea(m, a).map(t => t.name).sort();

test("a circle holds the tokens within its radius, counted in squares", () => {
  const m = mk(); at(m, "centre", 10, 10); at(m, "two", 12, 10); at(m, "diag", 12, 12); at(m, "far", 14, 10); at(m, "edge", 13, 10);
  const a = B.addArea(m, { shape: "circle", x: 10.5 * C, y: 10.5 * C, size: 3 });
  assert.deepEqual(names(m, a), ["centre", "diag", "edge", "two"]);                                 // 3 squares away still counts; 4 does not; the diagonal is 2.8 away
  assert.equal(names(m, B.addArea(m, { shape: "circle", x: 10.5 * C, y: 10.5 * C, size: 1 })).join(), "centre");
});

test("a cone opens as wide as it is long, in the direction it points", () => {
  const m = mk(); at(m, "ahead", 14, 10); at(m, "ahead-edge", 14, 12); at(m, "wide", 14, 14); at(m, "behind", 8, 10); at(m, "toolong", 16, 10); at(m, "origin", 10, 10);
  const east = B.addArea(m, { shape: "cone", x: 10.5 * C, y: 10.5 * C, angle: 0, size: 5 });
  assert.deepEqual(names(m, east), ["ahead", "ahead-edge", "origin"]);                               // (4,+2) is 26.6 degrees: inside; (4,+4) is 45: outside; 6 squares is too long
  const south = B.addArea(m, { shape: "cone", x: 10.5 * C, y: 10.5 * C, angle: 90, size: 5 });
  assert.deepEqual(names(m, south), ["origin"]);                                                     // nobody lies to the south
  const west = B.addArea(m, { shape: "cone", x: 10.5 * C, y: 10.5 * C, angle: 180, size: 5 });
  assert.deepEqual(names(m, west), ["behind", "origin"]);
});

test("a line has a length and a width, and nothing behind its start", () => {
  const m = mk(); at(m, "on", 13, 10); at(m, "beside", 13, 11); at(m, "beside2", 13, 12); at(m, "end", 15, 10); at(m, "past", 17, 10); at(m, "behind", 8, 10);
  const one = B.addArea(m, { shape: "line", x: 10.5 * C, y: 10.5 * C, angle: 0, size: 5, width: 1 });
  assert.deepEqual(names(m, one), ["end", "on"]);
  const three = B.addArea(m, { shape: "line", x: 10.5 * C, y: 10.5 * C, angle: 0, size: 5, width: 3 });
  assert.deepEqual(names(m, three), ["beside", "end", "on"]);                                        // 3 squares wide reaches the row next to it, not two away
  const poly = B.areaPolygon(one, C); assert.equal(poly.length, 4);
  assert.ok(Math.abs(Math.hypot(poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]) - 5 * C) < 1e-6);
});

test("dragging gives a direction in degrees and a size in whole squares, never less than one", () => {
  const m = mk();
  assert.deepEqual(B.areaFromDrag(m, 100, 100, 100 + 3 * C, 100), { angle: 0, size: 3 });
  assert.deepEqual(B.areaFromDrag(m, 100, 100, 100, 100 + 2.2 * C), { angle: 90, size: 2 });
  assert.deepEqual(B.areaFromDrag(m, 100, 100, 100 - C, 100), { angle: 180, size: 1 });
  assert.equal(B.areaFromDrag(m, 100, 100, 100, 100 - 5 * C).angle, 270);
  assert.equal(B.areaFromDrag(m, 0, 0, 5, 5).size, 1);
});

test("areas are marks: players see the shown ones, they are erased and cleared with the drawings, and survive saving", () => {
  const m = mk();
  const shown = B.addArea(m, { shape: "cone", x: 100, y: 100, size: 4, shown: true }), hidden = B.addArea(m, { shape: "circle", x: 200, y: 200, size: 2, shown: false });
  B.addPin(m, { x: 5, y: 5, label: "keep", shown: true });
  assert.deepEqual(B.marksForPlayers(m).map(x => x.kind), ["area", "pin"]);
  m.fog = B.newFog(m); m.fog.on = true; B.fogAll(m, false);
  assert.deepEqual(B.marksForPlayers(m).map(x => x.kind), ["area"]);                                  // under fog the pin goes, a laid area stays
  m.fog.on = false;
  assert.equal(B.removeMark(m, hidden.id), true);
  S.state.actors = []; S.state.scenes = []; S.state.sceneId = ""; S.state.viewId = "";
  S.state.scenes = [SC.newScene("Row", m)];
  const text = JSON.stringify(S.exportData()); S.state.scenes = []; S.importData(text);
  assert.deepEqual(B.marksOf(S.state.scenes[0].map).map(x => [x.kind, x.shape ?? ""]), [["area", "cone"], ["pin", ""]]);
  assert.equal(B.clearMarks(S.state.scenes[0].map), 1); assert.deepEqual(B.marksOf(S.state.scenes[0].map).map(x => x.kind), ["pin"]);
  void shown;
});

test("a bad area is repaired or dropped, and sizes are limited", () => {
  assert.deepEqual(B.cleanMarks([{ id: "a", kind: "area", shape: "cone", x: "5", y: 6, angle: -90, size: 999, width: 99, color: "x" }]).map(a => [a.angle, a.size, a.width, a.color]), [[270, B.MAX_AREA, 10, B.MARK_COLORS[0]]]);
  assert.deepEqual(B.cleanMarks([{ id: "b", kind: "area", shape: "star" }, { id: "c", kind: "area" }]), []);
  assert.equal(B.addArea(mk(), { shape: "star" }), null);
  const m = mk(); for (let i = 0; i < B.MAX_MARKS + 3; i++) B.addArea(m, { shape: "circle", x: 1, y: 1, size: 1 });
  assert.equal(m.marks.length, B.MAX_MARKS);
});
