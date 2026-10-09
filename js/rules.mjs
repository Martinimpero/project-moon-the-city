/**
 * Project Moon: The City - pure rules (no Foundry dependencies, so they can be unit-tested in Node).
 * Mirrors the manual: Part II (the roll), Part IV (the Self), Part X (the Sins), Part VI §5 (gear).
 */

export const ATTRIBUTES = ["body", "mind", "presence", "resolve"];
export const SKILLS = ["combat", "athletics", "stealth", "investigation", "technology", "medicine", "persuasion", "deception", "empathy", "streetwise", "corporate", "fixer"];
export const SINS = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"];
/** Wheel order, clockwise. Each Sin is strong against the next two and weak against the two before. */
export const WHEEL = ["sloth", "wrath", "pride", "envy", "gluttony", "lust", "gloom"];

/** Default Attribute for each Skill (the GM may override per roll). */
export const DEFAULT_ATTRIBUTE = {
  combat: "body", athletics: "body", stealth: "body", investigation: "mind", technology: "mind", medicine: "mind",
  persuasion: "presence", deception: "presence", empathy: "presence", streetwise: "mind", corporate: "mind", fixer: "mind"
};

/** Fit: Favored (+1) and Hindered (-2) Skills for each Sin (Part X §4). */
export const FIT = {
  wrath: { favored: ["combat", "athletics", "persuasion"], hindered: ["stealth", "investigation", "medicine"] },
  lust: { favored: ["persuasion", "empathy", "deception"], hindered: ["investigation", "technology", "corporate"] },
  sloth: { favored: ["stealth", "medicine", "investigation"], hindered: ["athletics", "combat", "streetwise"] },
  gluttony: { favored: ["investigation", "streetwise", "corporate"], hindered: ["stealth", "empathy", "medicine"] },
  gloom: { favored: ["empathy", "medicine", "investigation"], hindered: ["persuasion", "deception", "athletics"] },
  pride: { favored: ["persuasion", "corporate", "fixer"], hindered: ["empathy", "stealth", "deception"] },
  envy: { favored: ["deception", "stealth", "technology"], hindered: ["persuasion", "medicine", "fixer"] }
};

export const GEAR_KINDS = ["mundane", "weapon", "suit", "tool", "charm"];

/* ------------------------------------------------------------------ the core roll */

/** Count Successes (7 or higher) in an array of d10 results. */
export function countSuccesses(results) {
  return results.filter(r => r >= 7).length;
}

/**
 * Band for an unopposed roll (Part II §2). Critical Failure is checked first:
 * zero Successes and at least one die showing a 1 (E.G.O. dice included).
 */
export function unopposedBand(successes, difficulty, anyOne) {
  if (successes === 0 && anyOne) return "criticalFailure";
  if (successes >= difficulty + 2) return "critical";
  if (successes >= difficulty) return "success";
  if (successes === difficulty - 1) return "partial";
  return "failure";
}

/**
 * Band for an opposed roll, read from the side trying to change things (Part II §2):
 * margin +3 or more Critical, +1 or +2 Success, 0 or -1 Partial, -2 or worse Failure.
 * Critical Failure still applies to the roller's own dice.
 */
export function opposedBand(mine, theirs, myAnyOne) {
  const margin = mine - theirs;
  if (mine === 0 && myAnyOne) return "criticalFailure";
  if (margin >= 3) return "critical";
  if (margin >= 1) return "success";
  if (margin >= -1) return "partial";
  return "failure";
}

export const BAND_LABEL = {
  criticalFailure: "Critical Failure", failure: "Failure", partial: "Partial", success: "Success", critical: "Critical Success"
};

/* ------------------------------------------------------------------ the Self */

/** Stress lowers E.G.O. maximum (Part IV §2): 0-1 none, 2-3 -1, 4-5 -2. Never below 1. */
export function stressPenalty(stress) {
  return stress <= 1 ? 0 : (stress <= 3 ? 1 : 2);
}
export function egoMax(resolve, stress) {
  return Math.max(1, resolve - stressPenalty(stress));
}
/** Fraying at Stress 4 or 5. */
export function isFraying(stress) {
  return stress >= 4;
}
/** Unsteady: below half of maximum, judged at the start of a roll. A maximum of 2 or less skips Unsteady. */
export function isUnsteady(ego, max) {
  return max > 2 && ego > 0 && ego * 2 < max;
}
export function isEmpty(ego) {
  return ego <= 0;
}
/** Harm tiers 0 none, 1 Hurt, 2 Injured, 3 Wounded, 4 Maimed/Dying. Injured -1 die, Wounded -2. */
export function harmPenalty(harm) {
  return harm <= 1 ? 0 : (harm === 2 ? 1 : 2);
}
/** A Flashpoint fires when a 1 shows while Empty (every roll) or Unsteady (the first 1 each scene). */
export function flashpointFires({ anyOne, empty, unsteady, alreadyThisScene }) {
  if (!anyOne) return false;
  if (empty) return true;
  return unsteady && !alreadyThisScene;
}

/* ------------------------------------------------------------------ the Sins */

/** +1 if `a` is strong against `b`, -1 if weak, 0 if neutral or the same. */
export function matchup(a, b) {
  if (!a || !b || a === b) return 0;
  const i = WHEEL.indexOf(a), j = WHEEL.indexOf(b);
  if (i < 0 || j < 0) return 0;
  const d = (j - i + WHEEL.length) % WHEEL.length;
  if (d === 1 || d === 2) return 1;
  if (d === 5 || d === 6) return -1;
  return 0;
}
/** Swing for a Sin rating: rating 2-3 +-1, 4 +-2, 5 +-3. Rating 0-1 gives none. */
export function swingFor(rating) {
  if (rating < 2) return 0;
  if (rating < 4) return 1;
  return rating === 4 ? 2 : 3;
}
/** Fit while Under a Sin: Favored +1 (+2 at rating 4+), Hindered -2 (-3 at rating 4+). Needs rating 2+. */
export function fitFor(underSin, skill, rating) {
  if (!underSin || rating < 2 || !FIT[underSin]) return 0;
  const strong = rating >= 4;
  if (FIT[underSin].favored.includes(skill)) return strong ? 2 : 1;
  if (FIT[underSin].hindered.includes(skill)) return strong ? -3 : -2;
  return 0;
}
/**
 * Boon of a piece of attuned gear (Part VI §5). Returns the bonus dice for this roll.
 * kind: weapon (attack), suit (defense), tool (a Favored Skill), charm (no dice).
 */
export function gearBoon({ kind, gearSin, tagSin, fine, attunedRating, context, skill }) {
  if (!gearSin || gearSin !== tagSin) return 0;
  const base = fine && attunedRating >= 3 ? 2 : 1;
  if (kind === "weapon" && context === "attack") return base;
  if (kind === "suit" && context === "defense") return base;
  if (kind === "tool" && FIT[gearSin]?.favored.includes(skill)) return base;
  return 0;
}
/**
 * Total Sin-derived dice for a roll. Matchup + Fit are capped at +-3 together; the gear Boon is added on top;
 * the total never exceeds +4 (Part VI §5).
 */
export function sinDice({ tagSin, tagRating, targetSin, underSin, underRating, skill, boon = 0 }) {
  const swing = swingFor(tagRating);
  const m = tagSin ? matchup(tagSin, targetSin) * swing : 0;
  const f = fitFor(underSin, skill, underRating);
  const core = Math.max(-3, Math.min(3, m + f));
  const total = Math.min(4, core + Math.max(0, boon));
  return { matchup: m, fit: f, boon, total };
}
/** The tag rating used for a roll: gear can let you borrow the Sin as if rating 2 (Part VI §5). */
export function effectiveTagRating(ownRating, borrowing) {
  return borrowing ? Math.max(ownRating, 2) : ownRating;
}
export function highestSin(resonance) {
  return SINS.reduce((best, s) => (resonance[s] > (resonance[best] ?? -1) ? s : best), SINS[0]);
}
/** NPC Sin rating from Grade (Part X §3). */
export function npcSinRating(grade) {
  return grade >= 5 ? 2 : (grade >= 2 ? 3 : 4);
}
/** NPC dice pool from Threat Grade (Part IX §4); a group rolls +2. */
export function npcDice(grade, isGroup = false) {
  const base = grade >= 8 ? 3 : (grade >= 5 ? 4 : (grade >= 2 ? 6 : 8));
  return base + (isGroup ? 2 : 0);
}
export function npcDifficulty(grade) {
  return grade >= 8 ? 1 : (grade >= 5 ? 2 : (grade >= 2 ? 3 : 4));
}

/** Drift (Part X §6): if the most-tagged Sin leads the second by 8+, it gains 1 (max 4); the least-tagged Sin with at least 1 loses 1. */
export function computeDrift(resonance, tally) {
  const order = [...SINS].sort((a, b) => tally[b] - tally[a]);
  const top = order[0], second = order[1];
  if (tally[top] - tally[second] < 8) return null;
  if (resonance[top] >= 4) return null;
  const candidates = SINS.filter(s => s !== top && resonance[s] >= 1);
  if (!candidates.length) return null;
  const minTally = Math.min(...candidates.map(s => tally[s]));
  const loser = candidates.find(s => tally[s] === minTally);
  return { gain: top, lose: loser };
}

/* ------------------------------------------------------------------ the Hail Mary */

/** Hail Mary Difficulty: base 2 or 3, +1 if digging deep, +1 if Fraying, +1 on a drastic moment. */
export function hailMaryDifficulty({ base = 2, digDeep = false, fraying = false, drastic = false }) {
  return base + (digDeep ? 1 : 0) + (fraying ? 1 : 0) + (drastic ? 1 : 0);
}
export const HAIL_MARY_RESULT = {
  critical: "E.G.O. Manifestation, clean. E.G.O. refills to 1. Stress +1.",
  success: "E.G.O. Manifestation, at a cost: a Trauma marked or a Boundary bent. Stress +1.",
  partial: "Partial Distortion: genuinely transformed and monstrous, the player keeps the wheel. Stress +2.",
  failure: "Complete Distortion: the self is pushed out. Lasts until the fiction brings them back. Stress +2.",
  criticalFailure: "Complete Distortion, already severe: death or permanence are live options. Stress +2."
};

/* ------------------------------------------------------------------ resources and gear */
export const COST = { light: 1, armor: 1, kit: 1, heavy: 2, attuned: 2, fine: 3, augmentBackstreets: 2, augmentNest: 3, extraction: 4 };
/** Resources earned from a Contract: equal to Risk, minus 1 for the Office's cut at Risk 3 or 4. */
export function contractPayment(risk, throughOffice = true) {
  return Math.max(0, risk - (throughOffice && risk >= 3 ? 1 : 0));
}

/* ------------------------------------------------------------------ Signature Techniques */

/** Signature Technique: rating 2+ unlocks it, once per scene; rating 4+ (Overtaken) twice. */
export function techniqueUsesPerScene(rating) {
  return rating >= 4 ? 2 : (rating >= 2 ? 1 : 0);
}
export function canUseTechnique({ rating, used, strained }) {
  if (strained) return { ok: false, reason: "That Sin is Strained by a Scar until the Scar Heals." };
  const max = techniqueUsesPerScene(rating);
  if (max === 0) return { ok: false, reason: "Signature Techniques need Resonance 2 or more." };
  if (used >= max) return { ok: false, reason: "Already used {used} of {max} this scene.", data: { used, max } };
  return { ok: true, max };
}
/** E.G.O. refunds (Vice, techniques, gear, Gifts) are capped at 2 per scene combined. */
export const REFUND_CAP = 2;
export function refundGranted(refundsSoFar, amount = 1) {
  return Math.max(0, Math.min(amount, REFUND_CAP - refundsSoFar));
}

/* ------------------------------------------------------------------ downtime */

/** Upkeep: 1 Resources a phase; short means Stress +1. Optionally repair Spent gear (1 each) with what is left. */
export function upkeepPlan({ resources, spentGear = 0, repair = false }) {
  if (resources < 1) return { paid: 0, resources: 0, stressGain: 1, repaired: 0 };
  const left = resources - 1;
  const repaired = repair ? Math.min(spentGear, left) : 0;
  return { paid: 1 + repaired, resources: left - repaired, stressGain: 0, repaired };
}
/** Rest between Contracts: +1 for the night, +1 for a downtime scene (+1 more with a Safehouse: up to 3), clipped to the maximum. */
export function restGain({ ego, max, safehouse = false }) {
  return Math.max(0, Math.min(max - ego, safehouse ? 3 : 2));
}
/** With three or more Assets the Fund pays 1 a phase to keep them up. */
export function fundUpkeep({ assetCount, fund }) {
  if (assetCount < 3) return { pays: 0, ok: true };
  return fund >= 1 ? { pays: 1, ok: true } : { pays: 0, ok: false };
}
export function addResources(current, payment) {
  return Math.min(5, current + payment);
}
