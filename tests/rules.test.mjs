import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/rules.mjs";

test("successes count 7 and up", () => {
  assert.equal(R.countSuccesses([1, 6, 7, 8, 10]), 3);
});

test("unopposed bands, Critical Failure first", () => {
  assert.equal(R.unopposedBand(0, 2, true), "criticalFailure");
  assert.equal(R.unopposedBand(0, 2, false), "failure");
  assert.equal(R.unopposedBand(1, 2, true), "partial");   // a 1 with a Success is not a Critical Failure
  assert.equal(R.unopposedBand(2, 2, false), "success");
  assert.equal(R.unopposedBand(4, 2, false), "critical");
  assert.equal(R.unopposedBand(0, 1, false), "partial");   // Difficulty 1 has no Failure band
  assert.equal(R.unopposedBand(0, 1, true), "criticalFailure");
});

test("opposed bands from the aggressor's side", () => {
  assert.equal(R.opposedBand(5, 2, false), "critical");
  assert.equal(R.opposedBand(3, 2, false), "success");
  assert.equal(R.opposedBand(2, 2, false), "partial");   // a tie favors the defender
  assert.equal(R.opposedBand(1, 2, false), "partial");
  assert.equal(R.opposedBand(0, 3, false), "failure");
  assert.equal(R.opposedBand(0, 3, true), "criticalFailure");
});

test("E.G.O. maximum follows Stress", () => {
  assert.equal(R.egoMax(4, 1), 4);
  assert.equal(R.egoMax(4, 2), 3);
  assert.equal(R.egoMax(4, 3), 3);
  assert.equal(R.egoMax(4, 5), 2);
  assert.equal(R.egoMax(1, 5), 1);   // never below 1
  assert.ok(R.isFraying(4));
  assert.ok(!R.isFraying(3));
});

test("Unsteady and Empty", () => {
  assert.ok(R.isUnsteady(1, 4));
  assert.ok(!R.isUnsteady(2, 4));    // exactly half is steady
  assert.ok(!R.isUnsteady(1, 2));    // a maximum of 2 skips Unsteady
  assert.ok(R.isEmpty(0));
  assert.ok(R.flashpointFires({ anyOne: true, empty: true, unsteady: false, alreadyThisScene: true }));
  assert.ok(!R.flashpointFires({ anyOne: true, empty: false, unsteady: true, alreadyThisScene: true }));
  assert.ok(R.flashpointFires({ anyOne: true, empty: false, unsteady: true, alreadyThisScene: false }));
  assert.ok(!R.flashpointFires({ anyOne: false, empty: true, unsteady: true, alreadyThisScene: false }));
});

test("Harm penalties", () => {
  assert.deepEqual([0, 1, 2, 3].map(R.harmPenalty), [0, 0, 1, 2]);
});

test("the wheel: each Sin is strong against the next two, weak against the two before", () => {
  assert.equal(R.matchup("wrath", "pride"), 1);
  assert.equal(R.matchup("wrath", "envy"), 1);
  assert.equal(R.matchup("wrath", "sloth"), -1);
  assert.equal(R.matchup("wrath", "gloom"), -1);
  assert.equal(R.matchup("wrath", "gluttony"), 0);
  assert.equal(R.matchup("wrath", "lust"), 0);
  assert.equal(R.matchup("wrath", "wrath"), 0);
  assert.equal(R.matchup("gloom", "sloth"), 1);   // the wheel wraps
  assert.equal(R.matchup("gloom", "wrath"), 1);
  for (const a of R.SINS) {      // antisymmetric
    for (const b of R.SINS) assert.equal(R.matchup(a, b) + R.matchup(b, a), 0);
  }
});

test("swing by rating", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(R.swingFor), [0, 0, 1, 1, 2, 3]);
});

test("Fit while Under a Sin", () => {
  assert.equal(R.fitFor("wrath", "combat", 3), 1);
  assert.equal(R.fitFor("wrath", "stealth", 3), -2);
  assert.equal(R.fitFor("wrath", "streetwise", 3), 0);
  assert.equal(R.fitFor("wrath", "combat", 4), 2);
  assert.equal(R.fitFor("wrath", "stealth", 4), -3);
  assert.equal(R.fitFor("wrath", "combat", 1), 0);   // needs rating 2
  assert.equal(R.fitFor("", "combat", 3), 0);
});

test("every Sin has exactly three Favored and three Hindered Skills, none overlapping", () => {
  for (const s of R.SINS) {
    const { favored, hindered } = R.FIT[s];
    assert.equal(favored.length, 3);
    assert.equal(hindered.length, 3);
    assert.equal(favored.filter(x => hindered.includes(x)).length, 0);
    for (const k of [...favored, ...hindered]) assert.ok(R.SKILLS.includes(k), k);
  }
});

test("Dax example from the manual: Wrath 3 riding Wrath attacks a Pride NPC with Combat", () => {
  const r = R.sinDice({ tagSin: "wrath", tagRating: 3, targetSin: "pride", underSin: "wrath", underRating: 3, skill: "combat" });
  assert.equal(r.matchup, 1);
  assert.equal(r.fit, 1);
  assert.equal(r.total, 2);    // Body 4 + Combat 3 = 7, +2 = 9 dice
});

test("matchup + Fit cap at +-3, gear Boon on top, total capped at +4", () => {
  const a = R.sinDice({ tagSin: "wrath", tagRating: 5, targetSin: "pride", underSin: "wrath", underRating: 5, skill: "combat" });
  assert.equal(a.matchup, 3);
  assert.equal(a.fit, 2);
  assert.equal(a.total, 3);     // 3 + 2 capped at 3
  const b = R.sinDice({ tagSin: "wrath", tagRating: 5, targetSin: "pride", underSin: "wrath", underRating: 5, skill: "combat", boon: 2 });
  assert.equal(b.total, 4);     // 3 + 2 capped at 4
  const c = R.sinDice({ tagSin: "wrath", tagRating: 3, targetSin: "pride", skill: "combat", boon: 1 });
  assert.equal(c.total, 2);     // +1 matchup, +1 Boon
  const d = R.sinDice({ tagSin: "wrath", tagRating: 3, targetSin: "sloth", underSin: "wrath", underRating: 3, skill: "stealth" });
  assert.equal(d.total, -3);    // -1 matchup, -2 Fit
});

test("rating 1 gives no matchup; borrowing counts as rating 2", () => {
  const flicker = R.sinDice({ tagSin: "wrath", tagRating: 1, targetSin: "pride", skill: "combat" });
  assert.equal(flicker.total, 0);
  assert.equal(R.effectiveTagRating(0, true), 2);
  assert.equal(R.effectiveTagRating(3, true), 3);
  assert.equal(R.effectiveTagRating(0, false), 0);
});

test("gear Boon by kind", () => {
  const base = { gearSin: "wrath", tagSin: "wrath", fine: false, attunedRating: 3, skill: "combat" };
  assert.equal(R.gearBoon({ ...base, kind: "weapon", context: "attack" }), 1);
  assert.equal(R.gearBoon({ ...base, kind: "weapon", context: "defense" }), 0);
  assert.equal(R.gearBoon({ ...base, kind: "suit", context: "defense" }), 1);
  assert.equal(R.gearBoon({ ...base, kind: "tool", context: "any", skill: "combat" }), 1);   // Combat is Favored by Wrath
  assert.equal(R.gearBoon({ ...base, kind: "tool", context: "any", skill: "stealth" }), 0);
  assert.equal(R.gearBoon({ ...base, kind: "charm", context: "attack" }), 0);
  assert.equal(R.gearBoon({ ...base, kind: "weapon", context: "attack", fine: true }), 2);
  assert.equal(R.gearBoon({ ...base, kind: "weapon", context: "attack", fine: true, attunedRating: 2 }), 1);
  assert.equal(R.gearBoon({ ...base, kind: "weapon", context: "attack", tagSin: "pride" }), 0);
});

test("NPC numbers by Grade", () => {
  assert.equal(R.npcDice(9), 3);
  assert.equal(R.npcDice(8), 3);
  assert.equal(R.npcDice(7), 4);
  assert.equal(R.npcDice(4), 6);
  assert.equal(R.npcDice(1), 8);
  assert.equal(R.npcDice(8, true), 5);   // Grade 8 group: pool 5
  assert.equal(R.npcDifficulty(4), 3);
  assert.equal(R.npcSinRating(6), 2);
  assert.equal(R.npcSinRating(3), 3);
  assert.equal(R.npcSinRating(1), 4);
});

test("Drift needs a lead of 8 and caps at 4", () => {
  const res = { wrath: 3, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 2, envy: 1 };
  const t1 = { wrath: 12, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 3, envy: 1 };
  assert.deepEqual(R.computeDrift(res, t1), { gain: "wrath", lose: "envy" });
  const t2 = { ...t1, pride: 6 };
  assert.equal(R.computeDrift(res, t2), null);       // lead of 6
  assert.equal(R.computeDrift({ ...res, wrath: 4 }, t1), null);   // already 4
});

test("Hail Mary difficulty", () => {
  assert.equal(R.hailMaryDifficulty({ base: 2 }), 2);
  assert.equal(R.hailMaryDifficulty({ base: 3, digDeep: true }), 4);
  assert.equal(R.hailMaryDifficulty({ base: 2, digDeep: true, fraying: true }), 4);
  assert.equal(R.hailMaryDifficulty({ base: 2, drastic: true }), 3);
});

test("Contract payment", () => {
  assert.equal(R.contractPayment(2), 2);
  assert.equal(R.contractPayment(3), 2);
  assert.equal(R.contractPayment(4), 3);
  assert.equal(R.contractPayment(4, false), 4);
});

test("highest Sin is the Alignment", () => {
  assert.equal(R.highestSin({ wrath: 1, lust: 0, sloth: 0, gluttony: 3, gloom: 1, pride: 2, envy: 0 }), "gluttony");
});

test("Signature Techniques: once per scene, twice at rating 4, blocked when Strained", () => {
  assert.equal(R.techniqueUsesPerScene(1), 0);
  assert.equal(R.techniqueUsesPerScene(2), 1);
  assert.equal(R.techniqueUsesPerScene(4), 2);
  assert.ok(R.canUseTechnique({ rating: 3, used: 0, strained: false }).ok);
  assert.ok(!R.canUseTechnique({ rating: 3, used: 1, strained: false }).ok);
  assert.ok(R.canUseTechnique({ rating: 4, used: 1, strained: false }).ok);
  assert.ok(!R.canUseTechnique({ rating: 4, used: 0, strained: true }).ok);
  assert.ok(!R.canUseTechnique({ rating: 1, used: 0, strained: false }).ok);
});

test("E.G.O. refunds cap at 2 per scene combined", () => {
  assert.equal(R.refundGranted(0), 1);
  assert.equal(R.refundGranted(1), 1);
  assert.equal(R.refundGranted(2), 0);
  assert.equal(R.refundGranted(1, 2), 1);
});

test("Upkeep: pay 1; short means Stress +1; repairs use what is left", () => {
  assert.deepEqual(R.upkeepPlan({ resources: 3 }), { paid: 1, resources: 2, stressGain: 0, repaired: 0 });
  assert.deepEqual(R.upkeepPlan({ resources: 0 }), { paid: 0, resources: 0, stressGain: 1, repaired: 0 });
  assert.deepEqual(R.upkeepPlan({ resources: 3, spentGear: 2, repair: true }), { paid: 3, resources: 0, stressGain: 0, repaired: 2 });
  assert.deepEqual(R.upkeepPlan({ resources: 2, spentGear: 2, repair: true }), { paid: 2, resources: 0, stressGain: 0, repaired: 1 });
  assert.deepEqual(R.upkeepPlan({ resources: 1, spentGear: 1, repair: true }), { paid: 1, resources: 0, stressGain: 0, repaired: 0 });
});

test("Rest between Contracts: 2 E.G.O., 3 with a Safehouse, never past the maximum", () => {
  assert.equal(R.restGain({ ego: 0, max: 4 }), 2);
  assert.equal(R.restGain({ ego: 0, max: 4, safehouse: true }), 3);
  assert.equal(R.restGain({ ego: 3, max: 4, safehouse: true }), 1);
  assert.equal(R.restGain({ ego: 4, max: 4 }), 0);
});

test("The Fund keeps Assets up only with three or more", () => {
  assert.deepEqual(R.fundUpkeep({ assetCount: 2, fund: 0 }), { pays: 0, ok: true });
  assert.deepEqual(R.fundUpkeep({ assetCount: 3, fund: 1 }), { pays: 1, ok: true });
  assert.deepEqual(R.fundUpkeep({ assetCount: 4, fund: 0 }), { pays: 0, ok: false });
});

test("Resources are capped at 5", () => {
  assert.equal(R.addResources(4, 3), 5);
  assert.equal(R.addResources(1, 2), 3);
});
