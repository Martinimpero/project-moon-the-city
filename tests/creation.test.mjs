import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/creation.mjs";
import { ATTRIBUTES, SKILLS, SINS } from "../js/rules.mjs";

/** Wren, the way Appendix L builds her: Body 2 Mind 2 Presence 2 Resolve 4; a medic package; Gloom 3, Sloth 2, Lust 1. */
function wren() {
  const b = C.blankBuild();
  Object.assign(b, {
    name: "Wren Okoro", concept: "A Backstreets medic who used to work Wing security.", identity: "The one who fixes people, not machines.", background: "Raised in a Backstreets market",
    affiliation: "Mutual-aid network (a market street clinic)", affBond: "obligation", relationship: "Old Tabbi, who runs the market street clinic", relBond: "affection",
    principle: "Everyone gets one honest chance to be helped.", burden: "A Wing guard bled out in her arms during a night shift after she waited for a supervisor's sign-off.",
    fear: "Dying without anyone knowing what happened to me.", boundary: "I won't let someone die on my table because I hesitated.",
    desire: "Open a real clinic.", vice: "Can't say no to a patient.", ambition: "Is a clean conscience something the City lets you keep?",
    gearName: "Rain Cape", gearKind: "suit", gearSin: "gloom", gearNote: "The weather follows you."
  });
  C.applyOccupation(b, "medic"); b.occupation = "Backstreets Medic (unlicensed)";
  for (const [a, n] of [["body", 1], ["mind", 1], ["presence", 1], ["resolve", 3]]) for (let i = 0; i < n; i++) assert.equal(C.bumpAttr(b, a, 1), true);
  C.bumpSkill(b, "medicine", 1);                                      // 2 -> 3
  for (const s of ["combat", "athletics", "stealth", "investigation", "persuasion", "streetwise"]) C.bumpSkill(b, s, 1);   // six more at 1: seven free points in all
  for (const [s, n] of [["gloom", 3], ["sloth", 2], ["lust", 1]]) for (let i = 0; i < n; i++) assert.equal(C.bumpResonance(b, s, 1), true);
  return b;
}

test("the manual's numbers", () => {
  assert.deepEqual([C.ATTR_POINTS, C.ATTR_MAX, C.PACKAGE_SKILLS, C.PACKAGE_RATING, C.FREE_POINTS, C.SKILL_MAX, C.RESONANCE_POINTS, C.RESONANCE_MAX], [6, 4, 3, 2, 7, 3, 6, 3]);
  assert.equal(C.OCCUPATIONS.length, 8);
  for (const o of C.OCCUPATIONS) { assert.equal(o.skills.length, 3); assert.ok(o.skills.every(s => SKILLS.includes(s))); }
});

test("a finished build has no problems and makes the sheet the manual describes", () => {
  const b = wren();
  assert.deepEqual(C.problems(b), []);
  const a = C.buildCharacter(b, "en");
  const s = a.system;
  assert.equal(ATTRIBUTES.reduce((n, k) => n + s.attributes[k], 0), 10);               // 4 + 6 points = 10 dots
  assert.equal(SKILLS.reduce((n, k) => n + s.skills[k], 0), 13);                       // 3 x 2 + 7 = 13 dots
  assert.deepEqual([s.skills.medicine, s.skills.streetwise, s.skills.empathy], [3, 3, 2]);
  assert.equal(SINS.reduce((n, k) => n + s.resonance[k], 0), 6);
  assert.equal(a.derived.alignment, "gloom");
  assert.deepEqual([s.ego.value, s.ego.max, a.derived.egoCurrent], [4, 4, 4]);          // E.G.O. maximum = Resolve, starts full
  assert.deepEqual([s.stress, s.resources, s.grade, s.harm, s.broken], [1, 2, 9, 0, 0]);
  const bonds = a.items.filter(i => i.type === "bond");
  assert.deepEqual(bonds.map(x => [x.system.type, x.system.strength]), [["affection", 2], ["obligation", 1]]);   // Relationship at 2, Affiliation at 1
  const trauma = a.items.filter(i => i.type === "trauma");
  assert.equal(trauma.length, 1); assert.match(trauma[0].system.trigger, /bled out in her arms/);                 // the Burden becomes the starting Trauma
  const gear = a.items.find(i => i.type === "gear");
  assert.deepEqual([gear.system.kind, gear.system.sin, gear.system.cost], ["suit", "gloom", 2]);
  assert.equal(s.lang, "en");
});

test("the point-buy stops at the maximums and at what is left", () => {
  const b = C.blankBuild();
  for (let i = 0; i < 3; i++) assert.equal(C.bumpAttr(b, "body", 1), true);          // 1 -> 4
  assert.equal(C.bumpAttr(b, "body", 1), false);                                     // 5 is never available at creation
  assert.equal(C.attrPointsLeft(b), 3);
  for (let i = 0; i < 3; i++) C.bumpAttr(b, "mind", 1);
  assert.equal(C.attrPointsLeft(b), 0); assert.equal(C.bumpAttr(b, "resolve", 1), false);
  assert.equal(C.bumpAttr(b, "body", -4), false);                                    // nothing goes below 1
  C.applyOccupation(b, "security");                                                  // combat, investigation, persuasion at 2
  assert.equal(C.bumpSkill(b, "combat", 1), true);                                   // 2 -> 3
  assert.equal(C.bumpSkill(b, "combat", 1), false);                                  // 4 is not allowed
  assert.equal(C.bumpSkill(b, "stealth", 3), true); assert.equal(C.bumpSkill(b, "stealth", 1), false);
  assert.equal(C.bumpSkill(b, "athletics", -1), false);
  for (let i = 0; i < 3; i++) C.bumpResonance(b, "wrath", 1);
  assert.equal(C.bumpResonance(b, "wrath", 1), false);                               // 3 in one Sin at most
  for (let i = 0; i < 3; i++) C.bumpResonance(b, "pride", 1);
  assert.equal(C.resonanceLeft(b), 0); assert.equal(C.bumpResonance(b, "envy", 1), false);
});

test("a package is exactly three Skills, and a Background may add one free point", () => {
  const b = C.blankBuild();
  C.applyOccupation(b, "medic");
  assert.deepEqual(b.package, ["medicine", "streetwise", "empathy"]);
  assert.equal(C.togglePackageSkill(b, "combat"), false);                              // already three
  assert.equal(C.togglePackageSkill(b, "empathy"), true); assert.equal(C.togglePackageSkill(b, "combat"), true);
  assert.deepEqual([...b.package].sort(), ["combat", "medicine", "streetwise"]);
  assert.equal(C.skillValue(b, "combat"), 2);
  b.bgSkill = "combat"; assert.equal(C.skillValue(b, "combat"), 3);                    // 2 + the Background's free point
  assert.equal(C.bumpSkill(b, "combat", 1), false);                                    // and that is the top
  b.package = ["combat"]; assert.ok(C.problems(b).some(p => p.code === "package"));
});

test("problems say what is still to do and what is against the rules, step by step", () => {
  const b = C.blankBuild();
  const all = C.problems(b);
  assert.ok(all.every(p => p.severity === "todo"));
  assert.ok(all.some(p => p.code === "attrLeft" && p.n === 6));
  assert.ok(all.some(p => p.code === "skillLeft" && p.n === 7));
  assert.ok(all.some(p => p.code === "resLeft" && p.n === 6));
  assert.ok(all.some(p => p.field === "burden" && p.step === "wound"));
  assert.equal(C.problemsFor(b, "attributes").length, 1);
  b.attrs.body = 5;                                                                  // somehow over the top
  assert.ok(C.problems(b).some(p => p.code === "attrOver" && p.severity === "error"));
  b.gearName = "Knife"; b.gearKind = "weapon"; b.gearSin = "";
  assert.ok(C.problems(b).some(p => p.code === "gearSin"));                            // attuned gear needs a Sin
});

test("alignment and ties", () => {
  const b = C.blankBuild();
  assert.equal(C.alignmentOf(b), ""); assert.deepEqual(C.tiedTop(b), []);
  C.bumpResonance(b, "envy", 1); C.bumpResonance(b, "envy", 1);
  assert.equal(C.alignmentOf(b), "envy");
  C.bumpResonance(b, "wrath", 1); C.bumpResonance(b, "wrath", 1);
  assert.deepEqual(C.tiedTop(b).sort(), ["envy", "wrath"]);
});

test("an unfinished build still makes a legal character (nothing is invented, nothing is out of range)", () => {
  const b = C.blankBuild(); b.attrs.body = 9; b.extra.combat = 9;
  const a = C.buildCharacter(b);
  assert.equal(a.system.attributes.body, 4); assert.equal(a.system.skills.combat, 3);
  assert.equal(a.name, "New character"); assert.equal(a.items.length, 0);
  assert.equal(a.system.ego.max, 1);                                                   // Resolve 1
  const mundane = C.blankBuild(); mundane.gearName = "Toolkit"; mundane.gearKind = "mundane"; mundane.gearSin = "wrath";
  assert.equal(C.buildCharacter(mundane).items[0].system.sin, "");                      // mundane gear is not attuned
  const bg = C.blankBuild(); bg.bgBond = true; bg.background = "Raised in a Backstreets market";
  assert.deepEqual(C.buildCharacter(bg).items.map(i => [i.type, i.system.strength]), [["bond", 1]]);   // a Background's minor Bond is Strength 1
});
