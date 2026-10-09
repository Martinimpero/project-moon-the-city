import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/threats.mjs";
import { newActor } from "../js/model.mjs";
import * as S from "../js/store.mjs";
import { THREATS } from "../js/threatdata.mjs";

test("the library has the bestiary, every entry with a Grade and a Spanish name", () => {
  const all = T.allTemplates();
  assert.ok(all.length >= 39);
  assert.ok(all.every(x => x.grade >= 1 && x.grade <= 9 && x.name && x.es));
  assert.equal(new Set(all.map(x => x.id)).size, all.length);                        // ids are unique
});

test("dice and Difficulty always come from the Grade (Appendix E), +2 dice for a group", () => {
  const by = id => T.byId(id);
  assert.deepEqual([by("row-lookout").dice, by("row-lookout").difficulty], [3, 1]);                 // Grade 8, alone
  assert.deepEqual([by("syndicate-enforcer").dice, by("syndicate-enforcer").difficulty], [6, 2]);   // Grade 7, a group: 4 + 2
  assert.deepEqual([by("syndicate-lieutenant").dice, by("syndicate-lieutenant").difficulty], [6, 3]);
  assert.deepEqual([by("the-ash-verdict-color").dice, by("the-ash-verdict-color").difficulty], [8, 4]);
  assert.equal(by("street-thug").dice, 5);                                                          // the manual's example: Grade 8-9 group rolls 5
});

test("search works in both languages; Grade bands, Sin and category narrow it", () => {
  const all = T.allTemplates();
  assert.deepEqual(T.filter(all, { q: "ejecutor" }).map(x => x.id), ["syndicate-enforcer"]);
  assert.ok(T.filter(all, { q: "ENFORCER" }).some(x => x.id === "syndicate-enforcer"));
  assert.ok(T.filter(all, { band: "1" }).every(x => x.grade === 1));
  assert.ok(T.filter(all, { band: "8-9" }).every(x => x.grade >= 8));
  assert.ok(T.filter(all, { band: "5-7" }).every(x => x.grade >= 5 && x.grade <= 7));
  assert.ok(T.filter(all, { sin: "wrath" }).every(x => x.sin === "wrath"));
  assert.ok(T.filter(all, { cat: "Nests" }).every(x => x.cat === "Nests"));
  const g = T.filter(all, {}).map(x => x.grade);
  assert.deepEqual(g, [...g].sort((a, b) => b - a));                                                // strongest first
});

test("a single Threat becomes numbered sheets; a group stays one sheet", () => {
  const solo = T.build(T.byId("knife-duelist"), { count: 3, newActor });
  assert.deepEqual(solo.map(a => a.name), ["Knife Duelist 1", "Knife Duelist 2", "Knife Duelist 3"]);
  assert.deepEqual([solo[0].system.grade, solo[0].system.alignment, solo[0].derived.dice], [5, "pride", 4]);
  assert.match(solo[0].system.notes, /Attack \d+ · Defense \d+ · Resolve \d+/);
  assert.ok(solo[0].system.want && solo[0].system.bondHook && solo[0].system.detail);
  const grp = T.build(T.byId("syndicate-enforcer"), { count: 3, newActor });
  assert.equal(grp.length, 1); assert.equal(grp[0].name, "Syndicate Enforcer x3"); assert.equal(grp[0].system.isGroup, true); assert.equal(grp[0].derived.dice, 6);
  assert.equal(T.build(T.byId("fence"), { count: 1, newActor })[0].name, "Fence");
  assert.equal(T.build(T.byId("fence"), { count: 99, newActor }).length, 20);                       // capped
  assert.equal(T.build(T.byId("fence"), { count: 2, lang: "es", newActor })[0].name, "Perista 1");
});

test("a template with no Sin takes the one you choose, and only a real Sin", () => {
  const tpl = T.byId("fixer-veteran");
  assert.equal(tpl.sin, "");
  assert.equal(T.build(tpl, { sin: "envy", newActor })[0].system.alignment, "envy");
  assert.equal(T.build(tpl, { sin: "nonsense", newActor })[0].system.alignment, "");
});

test("the encounter adds up and warns about a named opponent of Grade 4 or lower", () => {
  const enc = [];
  T.addTo(enc, "syndicate-lieutenant"); T.addTo(enc, "syndicate-enforcer"); T.addTo(enc, "syndicate-enforcer", 2); T.addTo(enc, "does-not-exist");
  const s = T.summary(enc);
  assert.equal(s.rows.length, 3 - 1);                                                                // the unknown id is skipped
  assert.deepEqual([s.foes, s.sheets, s.diceTotal, s.bestGrade], [4, 2, 12, 4]);                    // lieutenant 6 + one enforcer group 6
  assert.deepEqual(s.soloNamed.map(x => x.id), ["syndicate-lieutenant"]);
  T.addTo(enc, "syndicate-enforcer", -50); assert.equal(enc.find(r => r.id === "syndicate-enforcer").count, 1);
  T.dropFrom(enc, "syndicate-enforcer"); assert.equal(enc.length, 2);
});

test("your own templates come from a sheet, are cleaned, sit in the library and survive saving", () => {
  const a = newActor("npc", "Marl Vessey", { grade: 5, isGroup: false, alignment: "envy", want: "Out of the Row", concept: "Fence", notes: "Owes Sable." });
  const tpl = T.fromActor(a);
  assert.deepEqual([tpl.name, tpl.grade, tpl.sin, tpl.want, tpl.use], ["Marl Vessey", 5, "envy", "Out of the Row", "Owes Sable."]);
  const clean = T.cleanCustom([tpl, null, { nope: 1 }, { id: "z", name: "x".repeat(200), grade: 99, sin: "bad" }]);
  assert.equal(clean.length, 2); assert.equal(clean[1].name.length, 60); assert.deepEqual([clean[1].grade, clean[1].sin], [9, ""]);
  const all = T.allTemplates(clean);
  assert.equal(all.find(x => x.id === tpl.id).mine, true); assert.equal(all.find(x => x.id === tpl.id).dice, 4);
  S.state.actors = []; S.state.library = clean;
  const text = JSON.stringify(S.exportData()); S.state.library = []; S.importData(text);
  assert.equal(S.state.library.length, 2);
  S.importData(JSON.stringify({ actors: [] })); assert.deepEqual(S.state.library, []);
});

test("group templates are exactly the ones the Bestiary runs as a Threat of several", () => {
  assert.deepEqual(THREATS.filter(x => x.group).map(x => x.id).sort(), ["nest-security-guard", "response-team", "street-thug", "syndicate-enforcer"]);
  assert.equal(T.byId("row-lookout").group, false);                                                  // "Threat (alone)"
});
