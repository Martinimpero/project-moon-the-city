import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.mjs";
import { newActor, newItem, refresh } from "../js/model.mjs";
import { PREGENS } from "../js/pregens.mjs";
import { setLang } from "../js/i18n.mjs";
import * as S from "../js/store.mjs";

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const pregen = name => { const p = PREGENS.find(x => x.name === name); return newActor("character", p.name, p.system, p.items); };
const base = (o = {}) => ({ attribute: "body", skill: "combat", difficulty: 2, opposition: 0, tag: "", target: "", context: "other", gear: "", ego: 0, help: 0, modifier: 0, bond: "", borrowedFace: false, ...o });

test("a plain roll counts 7+ as Successes and sets the band", () => {
  setLang("en");
  const dax = pregen("Dax Verrin");               // Body 4 + Combat 3 = 7 dice
  const d = E.rollDraft(dax, base(), null, seq(7, 8, 1, 2, 3, 4, 5));
  assert.equal(d.pool, 7);
  assert.equal(d.successes, 2);
  assert.equal(d.band, "success");
  const out = E.commitRoll(dax, d);
  assert.match(out.html, /Success/);
});

test("a roll with zero Successes and a 1 is a Critical Failure", () => {
  const dax = pregen("Dax Verrin");
  const d = E.rollDraft(dax, base(), null, seq(1, 2, 3, 4, 5, 6, 2));
  assert.equal(d.band, "criticalFailure");
});

test("Wrath-tagged attack at rating 3 against Sloth gets the matchup and Fit dice", () => {
  const dax = pregen("Dax Verrin");
  dax.system.riding = "wrath"; refresh(dax);
  const d = E.rollDraft(dax, base({ tag: "wrath", target: "pride" }), null, seq(7));
  // Wrath is strong against Pride and Envy (two steps on the wheel): +1; Combat is Favored while Under Wrath: +1.
  assert.equal(d.sin.matchup, 1);
  assert.equal(d.sin.fit, 1);
  assert.equal(d.pool, 7 + 2);
});

test("E.G.O. dice that show 1 or 2 are Complications", () => {
  const wren = pregen("Wren Okoro");
  const d = E.rollDraft(wren, base({ attribute: "resolve", skill: "medicine", ego: 2 }), null, seq(8, 8, 8, 8, 8, 8, 8, 1, 2));
  const out = E.commitRoll(wren, d);
  assert.match(out.html, /2 Complications/);
  assert.equal(wren.derived.egoCurrent, 2);
});

test("spending E.G.O. below half reports the Voice", () => {
  const wren = pregen("Wren Okoro");              // E.G.O. 4
  const d = E.rollDraft(wren, base({ attribute: "resolve", skill: "medicine", ego: 3 }), null, seq(8));
  const out = E.commitRoll(wren, d);
  assert.equal(out.voice, "unsteady");
  assert.match(E.voiceCardHtml(wren, "unsteady"), /pm-voice/);
});

test("Unbowed rerolls up to three failing dice and counts the use", () => {
  const tomas = pregen("Tomas Quill");             // Pride 3
  const d = E.rollDraft(tomas, base({ attribute: "mind", skill: "investigation", difficulty: 4 }), null, seq(2, 3, 4, 5, 6, 8));
  assert.equal(d.canUnbowed, true);
  E.unbowed(d, seq(9, 9, 9));
  assert.equal(d.changed.size, 3);
  assert.ok(d.successes >= 3);
  E.commitRoll(tomas, d);
  assert.equal(tomas.system.scene.techniques.pride, 1);
  assert.equal(E.techniqueAvailable(tomas, "pride"), false);
});

test("a Pull wears the gear and a 1 on attuned gear triggers it", () => {
  const dax = pregen("Dax Verrin");
  const knife = dax.items.find(i => i.name === "Ember Knife");
  const d = E.rollDraft(dax, base({ context: "attack", gear: knife.id }), null, seq(1, 2, 7, 7, 7, 7, 7));
  const out = E.commitRoll(dax, d);
  assert.equal(knife.system.wear, 1);
  assert.match(out.html, /Pull/);
});

test("opposed rolls read the margin and Sorrow's Weight is consumed", () => {
  const dax = pregen("Dax Verrin");
  const thug = newActor("npc", "Thug", { grade: 8 });
  const tg = E.targetInfo(thug); thug.system.nextPenalty = -2;
  const tg2 = E.targetInfo(thug);
  const d = E.rollDraft(dax, base({ opposition: 3 }), tg2, seq(7, 7, 7, 7, 7, 7, 7, 7, 1));
  assert.equal(d.oppDice, 1);
  E.commitRoll(dax, d);
  assert.equal(thug.system.nextPenalty, 0);
  assert.ok(tg);
});

test("Rampage arms, presets the next roll at -1 and clears", () => {
  const dax = pregen("Dax Verrin");
  dax.system.scene.last = { sin: "wrath", success: true, anyOne: false };
  const r = E.useTechnique(dax, "wrath");
  assert.equal(r.status, "ok");
  assert.equal(dax.system.scene.armed, "rampage");
  const d = E.rollDraft(dax, base(), null, seq(7));
  assert.equal(d.tagSin, "wrath");
  assert.equal(d.effects, -1);
  E.commitRoll(dax, d);
  assert.equal(dax.system.scene.armed, "");
  assert.equal(E.useTechnique(dax, "wrath").status, "fail");   // once per scene at rating 3
});

test("techniques ask for what they need and respect Strained", () => {
  const wren = pregen("Wren Okoro");               // Gloom 3
  assert.equal(E.useTechnique(wren, "gloom").status, "need");
  const npc = newActor("npc", "Guard");
  wren.system.scene.last = { sin: "gloom", success: true, anyOne: false };
  const r = E.useTechnique(wren, "gloom", { target: npc });
  assert.equal(r.status, "ok");
  assert.equal(npc.system.nextPenalty, -2);
  wren.system.strained = "sloth"; refresh(wren);
  assert.equal(E.useTechnique(wren, "sloth").status, "fail");
});

test("Hook creates a temporary Bond that a new scene removes", () => {
  const wren = pregen("Wren Okoro");
  wren.system.resonance.lust = 2; refresh(wren);
  wren.system.scene.last = { sin: "lust", success: true, anyOne: false };
  const before = wren.items.length;
  const r = E.useTechnique(wren, "lust", { hookWho: "Guard", hookType: "affection" });
  assert.equal(r.status, "ok");
  assert.equal(wren.items.length, before + 1);
  E.newScene(wren);
  assert.equal(wren.items.length, before);
});

test("Devour and Vice share the 2-per-scene refund cap", () => {
  const lena = pregen("Lena Hart");
  lena.system.ego.value = 0; refresh(lena);
  assert.equal(E.useTechnique(lena, "gluttony").status, "ok");
  assert.equal(E.invokeVice(lena).status, "ok");
  assert.equal(lena.system.scene.refunds, 2);
  assert.equal(lena.derived.egoCurrent, 2);
  assert.equal(E.invokeVice(lena).status, "fail");
});

test("Hail Mary: no Acceptance turns a Success into a Partial; dig deep spends E.G.O.", () => {
  const wren = pregen("Wren Okoro");
  const r = E.hailMary(wren, { verdict: "v", acceptance: "", skill: "empathy", base: 2, desire: true, dig: true, drastic: false, bond: false }, seq(9));
  assert.equal(r.band, "partial");
  assert.equal(wren.system.stress, 3);
  assert.equal(wren.system.ego.value, 0);
  assert.match(r.html[1], /Partial Distortion/);
  const bad = E.hailMary(newActor("character", "x", { ego: { value: 1, max: 1 } }), { skill: "empathy", dig: true });
  assert.ok(bad.error);
});

test("Ride, Drift and wear", () => {
  const dax = pregen("Dax Verrin");
  assert.equal(E.ride(dax, "envy").ok, false);     // rating 1
  assert.equal(E.ride(dax, "wrath").ok, true);
  assert.equal(dax.system.tally.wrath, 1);
  dax.system.tally = { wrath: 10, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 1, envy: 0 };
  const d = E.drift(dax);
  assert.equal(d.drift.gain, "wrath");
  assert.equal(dax.system.resonance.wrath, 4);
  const knife = dax.items.find(i => i.type === "gear");
  E.adjustWear(knife, 3);
  assert.equal(knife.derived.spent, true);
});

test("downtime pays upkeep, repairs and rests; the Fund sleeps an Asset when empty", () => {
  setLang("en");
  const dax = pregen("Dax Verrin"), wren = pregen("Wren Okoro");
  const knife = dax.items.find(i => i.type === "gear"); knife.system.wear = 3; refresh(dax);
  dax.system.ego.value = 0; refresh(dax);
  const crew = newActor("crew", "Gantry", { fund: 0, assets: { safehouse: true, getaway: true, workshop: true } });
  const choice = { [dax.id]: { rest: true, repair: true }, [wren.id]: { rest: false, repair: false } };
  const need = E.runDowntime([dax, wren], crew, choice);
  assert.deepEqual(need.needsDormantPick.length, 3);
  const r = E.runDowntime([dax, wren], crew, choice, "workshop");
  assert.equal(crew.system.dormantAsset, "workshop");
  assert.equal(knife.system.wear, 0);
  assert.equal(dax.system.resources, 0);           // 2 - 1 upkeep - 1 repair
  assert.equal(dax.derived.egoCurrent, 2);         // safehouse allows up to 3, capped at max 2
  assert.match(r.html, /dormant/);
  assert.equal(E.payMembers([wren], 4), 3);
});

test("NPC roll uses Grade dice", () => {
  const npc = newActor("npc", "Enforcer", { grade: 5, isGroup: true });
  assert.equal(npc.derived.dice, 6);
  assert.match(E.npcRoll(npc, seq(7, 8, 1)), /Success/);
});

test("store: round-trip through export and import, pregens once", () => {
  S.state.actors = []; S.state.log = [];
  S.state.lang = "en";
  assert.equal(S.importPregens().length, 4);
  assert.equal(S.importPregens().length, 0);
  S.addLog("<p>x</p>");
  const text = JSON.stringify(S.exportData());
  S.state.actors = [];
  S.importData(text);
  assert.equal(S.state.actors.length, 4);
  assert.ok(S.state.actors[0].derived);
  assert.throws(() => S.importData("{}"));
});

test("Spanish pregens load in Spanish", () => {
  S.state.actors = []; S.state.lang = "es"; setLang("es");
  S.importPregens();
  assert.match(S.state.actors[0].system.concept, /médica/);
  setLang("en");
});
