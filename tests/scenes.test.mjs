import test from "node:test";
import assert from "node:assert/strict";
import * as SC from "../js/scenes.mjs";
import * as B from "../js/board.mjs";
import * as S from "../js/store.mjs";

const fresh = () => SC.ensureScenes({ scenes: [], sceneId: "", viewId: "" });

test("there is always at least one scene, and the ids always point at real ones", () => {
  const st = fresh();
  assert.equal(st.scenes.length, 1); assert.equal(st.sceneId, st.scenes[0].id); assert.equal(st.viewId, st.sceneId);
  st.sceneId = "gone"; st.viewId = "gone too"; SC.ensureScenes(st);
  assert.equal(st.sceneId, st.scenes[0].id); assert.equal(st.viewId, st.scenes[0].id);
  assert.equal(SC.removeScene(st, st.scenes[0].id), false);                         // the last scene stays
});

test("an older save's single map becomes the first scene", () => {
  const map = B.newMap({ name: "Backstreet", src: "maps/backstreet.jpg", bundled: "backstreet" }); B.addToken(map, { name: "Wren" });
  const st = SC.scenesFrom({ map });
  assert.equal(st.scenes.length, 1); assert.equal(st.scenes[0].name, "Backstreet"); assert.equal(st.scenes[0].map.tokens.length, 1);
  assert.equal(SC.shownMap(st), map);
  const none = SC.scenesFrom({});
  assert.equal(none.scenes.length, 1); assert.equal(none.scenes[0].map, null);
  const junk = SC.scenesFrom({ scenes: [null, { nope: 1 }, { id: "a", name: "Real", map: { tokens: "no" } }] });
  assert.deepEqual(junk.scenes.map(s => [s.id, s.map]), [["a", null]]);
});

test("preparing a scene does not change what the table sees", () => {
  const st = fresh();
  const a = st.scenes[0]; a.map = B.newMap({ name: "Office" });
  const b = SC.addScene(st, "Warehouse"); b.map = B.newMap({ name: "Warehouse" });
  assert.equal(st.viewId, b.id); assert.equal(st.sceneId, a.id);
  assert.equal(SC.preparing(st), true);
  assert.equal(SC.shownMap(st).name, "Office"); assert.equal(SC.viewedMap(st).name, "Warehouse");
  assert.equal(SC.showScene(st, b.id), true);                                          // now the table moves
  assert.equal(SC.preparing(st), false); assert.equal(SC.shownMap(st).name, "Warehouse");
  assert.equal(SC.showScene(st, b.id), false);                                         // already showing it
  SC.viewScene(st, a.id); assert.equal(st.viewId, a.id); assert.equal(st.sceneId, b.id);
  SC.viewScene(st, "nope"); assert.equal(st.viewId, a.id);
});

test("duplicating makes an independent copy with new ids", () => {
  const st = fresh(); const a = st.scenes[0]; a.map = B.newMap({ name: "Office" });
  const tk = B.addToken(a.map, { name: "Guard", x: 100, y: 100 });
  const copy = SC.duplicateScene(st, a.id);
  assert.equal(copy.name, "Office (copy)".slice(0, 40).replace("Office", a.name)); assert.notEqual(copy.id, a.id);
  assert.notEqual(copy.map.rev, a.map.rev); assert.notEqual(copy.map.tokens[0].id, tk.id);
  copy.map.tokens[0].x = 999; assert.equal(tk.x, 100);                                   // moving one does not move the other
  assert.deepEqual(st.scenes.map(s => s.id), [a.id, copy.id]);
  assert.equal(st.viewId, copy.id);
});

test("removing the scene on show moves the table to a neighbour; renaming and limits", () => {
  const st = fresh(); const a = st.scenes[0]; const b = SC.addScene(st, "B"), c = SC.addScene(st, "C");
  SC.showScene(st, b.id);
  assert.equal(SC.removeScene(st, b.id), true);
  assert.equal(st.sceneId, c.id); assert.equal(st.viewId, c.id);                          // the next one takes over
  assert.equal(SC.removeScene(st, "nope"), false);
  assert.equal(SC.renameScene(st, c.id, "  Rooftop  ").name, "Rooftop");
  assert.equal(SC.renameScene(st, c.id, "   ").name, "Rooftop");                          // a blank name is ignored
  for (let i = 0; i < 60; i++) SC.addScene(st, "x");
  assert.equal(st.scenes.length, SC.MAX_SCENES); assert.equal(SC.addScene(st, "more"), null); assert.equal(SC.duplicateScene(st, a.id), null);
});

test("scenes (with their tokens and fog) survive saving and loading, and a save without scenes loads one", () => {
  S.state.actors = [];
  const sc = S.state.scenes[0];
  sc.map = B.newMap({ name: "Atrium" }); sc.map.fog = B.newFog(sc.map); sc.map.fog.on = true; B.addToken(sc.map, { name: "Wren", pc: true });
  const second = SC.addScene(S.state, "Vault"); SC.showScene(S.state, S.state.scenes[0].id); SC.viewScene(S.state, second.id);
  const text = JSON.stringify(S.exportData());
  S.state.scenes = []; S.importData(text);
  assert.deepEqual(S.state.scenes.map(s => s.name), ["Scene 1", "Vault"].map((n, i) => i === 0 ? S.state.scenes[0].name : n));
  assert.equal(S.state.scenes[0].map.tokens[0].name, "Wren"); assert.equal(S.state.scenes[0].map.fog.on, true);
  assert.equal(S.state.viewId, second.id); assert.equal(S.state.sceneId, S.state.scenes[0].id);
  assert.equal(S.viewedMap(), second.map); assert.equal(S.shownMap(), S.state.scenes[0].map);
  S.importData(JSON.stringify({ actors: [] }));
  assert.equal(S.state.scenes.length, 1);
});
