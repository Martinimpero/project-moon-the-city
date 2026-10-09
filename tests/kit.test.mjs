import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as KIT from "../js/kit.mjs";
import * as S from "../js/store.mjs";
import { newActor } from "../js/model.mjs";
import { MAPS } from "../js/maplist.mjs";
import { TOKENS } from "../js/maplist.mjs";

const text = fs.readFileSync(new URL("../kits/session01.json", import.meta.url), "utf8");
const fresh = () => { S.importData(JSON.stringify({ actors: [] })); return S.state; };

test("the Session 01 kit is a valid kit that points only at maps and tokens the app has", () => {
  const kit = KIT.parseKit(text);
  assert.deepEqual(KIT.contents(kit), { scenes: 4, tokens: 15, actors: 9, handouts: 1, notes: 10, journal: 1, clocks: 3 });
  for (const s of kit.scenes) { assert.ok(MAPS.some(m => m.id === s.map), s.map); for (const t of s.tokens) assert.ok(!t.img || TOKENS.includes(t.img), t.img); }
  const refs = new Set(kit.actors.map(a => a.ref));
  for (const s of kit.scenes) for (const t of s.tokens) assert.ok(!t.ref || refs.has(t.ref), t.ref);
  for (const r of kit.exchange) assert.ok(refs.has(r));
  for (const n of kit.notes) assert.ok(n.text.length <= 4000 && n.title.length <= 80);
  assert.throws(() => KIT.parseKit("nope"), /not a Project Moon kit/);
  assert.throws(() => KIT.parseKit(JSON.stringify({ kind: "project-moon-save" })), /not a Project Moon kit/);
});

test("adding the kit sets up scenes, linked tokens, sheets, handout, Clocks, notes and the Exchange order", () => {
  const st = fresh();
  const out = KIT.applyKit(st, KIT.parseKit(text), { mode: "add", lang: "en" });
  assert.deepEqual([out.actors, out.scenes, out.tokens, out.handouts, out.notes, out.journal, out.clocks, out.exchange], [9, 4, 15, 1, 10, 1, 3, 3]);
  assert.equal(st.scenes.length, 4);                                                  // the empty "Scene 1" made way
  assert.equal(st.scenes[0].name, "1. Briefing: Fixer Office"); assert.equal(st.scenes[0].map.bundled, "storefront");
  assert.equal(st.sceneId, st.scenes[0].id);
  const sable = st.actors.find(a => a.name === "Sable Rennick");
  assert.deepEqual([sable.system.grade, sable.system.alignment, sable.derived.dice], [3, "pride", 6]);
  const tk = st.scenes[3].map.tokens.find(t => t.name === "Sable Rennick");
  assert.equal(tk.actorId, sable.id);                                                 // tokens know their sheet
  assert.equal(st.scenes[1].map.tokens.find(t => t.name === "Crate").actorId, "");
  assert.equal(st.actors.find(a => a.name === "Enforcers A").derived.dice, 5);        // Grade 8 group: 3 + 2
  assert.deepEqual(st.tracker.slots.map(s => s.name), ["Sable Rennick", "Enforcers A", "Enforcers B"]); assert.equal(st.tracker.active, false);
  assert.deepEqual(st.clocks.map(c => [c.name, c.filled, c.shown]), [["Open War", 2, true], ["Coldwater Heat", 0, false], ["Reinforcements", 0, false]]);
  assert.equal(st.handouts[0].title, "The Row Shipment"); assert.equal(st.handouts[0].alt.title, "El Cargamento de la Fila");
  assert.equal(st.journal[0].pinned, true); assert.equal(st.notes.length, 10);
  const saved = JSON.stringify(S.exportData()); S.importData(saved);                  // and it all survives saving
  assert.deepEqual([S.state.scenes.length, S.state.actors.length, S.state.clocks.length], [4, 9, 3]);
});

test("importing twice adds nothing new, and in Spanish the names are Spanish", () => {
  const st = fresh();
  KIT.applyKit(st, KIT.parseKit(text), { lang: "es" });
  assert.equal(st.scenes[0].name, "1. Encargo: Oficina Fixer"); assert.equal(st.clocks[0].name, "Guerra Abierta");
  const again = KIT.applyKit(st, KIT.parseKit(text), { lang: "es" });
  assert.deepEqual([again.actors, again.handouts, again.notes, again.journal, again.clocks, again.exchange], [0, 0, 0, 0, 0, 0]);
  assert.equal(st.actors.filter(a => a.name === "Marl Vessey").length, 1);
  assert.equal(st.scenes.length, 8);                                                  // scenes are added again, on purpose
});

test("characters are never touched; an existing Threat of the same name keeps its sheet and gets the tokens", () => {
  const st = fresh();
  const dax = newActor("character", "Dax Verrin"); const marl = newActor("npc", "Marl Vessey", { grade: 6, want: "mine" });
  st.actors.push(dax, marl);
  KIT.applyKit(st, KIT.parseKit(text), { mode: "add" });
  assert.equal(st.actors.filter(a => a.name === "Marl Vessey").length, 1); assert.equal(marl.system.want, "mine");
  assert.ok(st.scenes[1].map.tokens.some(t => t.name === "Marl Vessey" && t.actorId === marl.id));
  KIT.applyKit(st, KIT.parseKit(text), { mode: "replace" });
  assert.ok(st.actors.includes(dax));                                                 // the PC is still there
  assert.ok(!st.actors.includes(marl)); assert.equal(st.actors.find(a => a.name === "Marl Vessey").system.grade, 4);
  assert.equal(st.scenes.length, 4); assert.equal(st.notes.length, 10);
});

test("scenes and notes only brings no sheets, handouts or Clocks, and tokens stay unlinked", () => {
  const st = fresh();
  const out = KIT.applyKit(st, KIT.parseKit(text), { mode: "prep" });
  assert.deepEqual([out.scenes, out.notes, out.actors, out.handouts, out.clocks], [4, 10, 0, 0, 0]);
  assert.equal(st.actors.length, 0); assert.ok(st.scenes[3].map.tokens.every(t => t.actorId === ""));
  assert.equal(st.clocks.length, 0); assert.equal(st.tracker.slots.length, 0);
});
