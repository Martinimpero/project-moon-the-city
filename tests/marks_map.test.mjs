import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/board.mjs";
import * as S from "../js/store.mjs";
import * as SC from "../js/scenes.mjs";
import { Room } from "../js/room.mjs";

const mk = () => B.newMap({ name: "Row", w: 2100, h: 1400, cell: 70 });

test("a pin keeps a label and a private note; the position is kept on the map", () => {
  const m = mk();
  const p = B.addPin(m, { x: 9999, y: -5, label: "x".repeat(99), note: "The crate is hollow.", color: "#bad", shown: false });
  assert.deepEqual([p.x, p.y, p.label.length, p.color], [2100, 0, B.MAX_LABEL, B.MARK_COLORS[0]]);       // clamped; a bad colour falls back
  B.editPin(m, p.id, { label: "Fire barrel", shown: true, color: "#5cc8ff" });
  assert.deepEqual([p.label, p.shown, p.color, p.note], ["Fire barrel", true, "#5cc8ff", "The crate is hollow."]);
  assert.equal(B.editPin(m, "nope", { label: "x" }), null);
});

test("a drawn line is thinned, kept between 2 and 300 points, and a click is not a line", () => {
  const m = mk();
  const pts = Array.from({ length: 1000 }, (_, i) => [i * 2, 100 + Math.sin(i / 20) * 30]);
  const s = B.addStroke(m, pts, { color: "#ff5c5c", width: 6, shown: true });
  assert.ok(s.pts.length >= 2 && s.pts.length <= B.MAX_STROKE_POINTS);
  assert.deepEqual(s.pts[0], pts[0]); assert.deepEqual(s.pts.at(-1), pts.at(-1));
  assert.equal(B.addStroke(m, [[1, 1]], {}), null);
  assert.equal(B.simplify([[0, 0], [1, 0], [2, 0], [50, 0]], 10).length, 2);                              // the near points go; first and last stay
  assert.equal(B.simplify([[0, 0], [30, 0], [31, 0], [60, 0]], 10).length, 3);                            // a far middle point stays
});

test("players get shown drawings and pins only, a pin without its private note, and nothing under fog", () => {
  const m = mk();
  B.addStroke(m, [[0, 0], [300, 0]], { shown: true }); B.addStroke(m, [[0, 10], [300, 10]], { shown: false });
  const a = B.addPin(m, { x: 100, y: 100, label: "Open", note: "secret", shown: true });
  B.addPin(m, { x: 700, y: 700, label: "Hidden label", note: "secret", shown: false });
  B.addPin(m, { x: 1400, y: 700, label: "Far", note: "secret", shown: true });
  m.fog = B.newFog(m); m.fog.on = true; B.fogAll(m, false); B.paintFog(m, 100, 100, true, 1);             // only the squares around (100,100) are clear
  const seen = B.marksForPlayers(m);
  assert.deepEqual(seen.map(x => x.kind + ":" + (x.label ?? "")), ["stroke:", "pin:Open"]);
  assert.equal(seen[1].note, ""); assert.equal(a.note, "secret");                                          // the GM's copy keeps it
  const out = B.mapForPlayers(m); assert.equal(out.marks.length, 2);
  assert.ok(!JSON.stringify(out).includes("secret"));
  B.fogAll(m, true); assert.equal(B.marksForPlayers(m).length, 3);                                          // everything revealed: the far pin shows too
});

test("erase, clear and the limit", () => {
  const m = mk();
  const p = B.addPin(m, { x: 1, y: 1, label: "a" }); B.addStroke(m, [[0, 0], [200, 0]], {});
  assert.equal(B.removeMark(m, p.id), true); assert.equal(B.removeMark(m, p.id), false);
  B.addPin(m, { x: 5, y: 5, label: "b" });
  assert.equal(B.clearMarks(m), 1); assert.deepEqual(m.marks.map(x => x.kind), ["pin"]);                    // drawings go, pins stay
  assert.equal(B.clearMarks(m, { pins: true }), 1); assert.deepEqual(m.marks, []);
  for (let i = 0; i < B.MAX_MARKS + 5; i++) B.addPin(m, { x: i, y: i });
  assert.equal(m.marks.length, B.MAX_MARKS); assert.equal(B.addPin(m, { x: 1, y: 1 }), null);
});

test("a map saved before marks existed works, junk is dropped, and marks survive saving and a copied scene", () => {
  const old = mk(); delete old.marks;
  assert.deepEqual(B.marksOf(old), []); assert.deepEqual(B.mapForPlayers(old).marks, []);
  assert.deepEqual(B.cleanMarks([null, { id: "a", kind: "pin", x: "5", y: "oops", label: "ok" }, { id: "b", kind: "stroke", pts: [[1, 2]] }, { id: "c", kind: "weird" }, "x"]).map(m => [m.id, m.x, m.y]), [["a", 5, 0]]);
  S.state.actors = []; S.state.scenes = []; S.state.sceneId = ""; S.state.viewId = "";
  const m = mk(); B.addPin(m, { x: 10, y: 20, label: "keep", note: "n", shown: true }); B.addStroke(m, [[0, 0], [300, 300]], { shown: true });
  S.state.scenes = [SC.newScene("Row", m)];
  const text = JSON.stringify(S.exportData()); S.state.scenes = []; S.importData(text);
  assert.deepEqual(B.marksOf(S.state.scenes[0].map).map(x => x.kind), ["pin", "stroke"]);
  const copy = SC.duplicateScene(S.state, S.state.scenes[0].id);
  assert.equal(B.marksOf(copy.map).length, 2);
});

test("room: a player receives the shown marks with the map, never the private note", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const tick = () => new Promise(r => setTimeout(r, 30));
  const map = mk(); B.addPin(map, { x: 10, y: 10, label: "Exit", note: "TRAP", shown: true });
  const gm = new Room({ Peer, handlers: { onLog() {}, hostBoard: () => ({ tracker: { slots: [] }, map: B.mapForPlayers(map), clocks: [] }) } });
  let got = null;
  const ana = new Room({ Peer, handlers: { onLog() {}, onBoard: b => { got = b.map; } } });
  await gm.host("MAP01", "GM"); await ana.join("MAP01", "Ana"); await tick();
  assert.deepEqual(got.marks.map(m => m.label), ["Exit"]); assert.ok(!JSON.stringify(got).includes("TRAP"));
  ana.leave(); gm.leave();
});
