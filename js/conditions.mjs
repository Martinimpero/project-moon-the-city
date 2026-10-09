/**
 * Conditions on the Exchange tracker (Part X §1 and §7: each Sin's "signature condition", plus free-form ones).
 * They sit on a tracker slot: `slot.conditions = [{ id, type, name, stacks, rounds, delay, note }]`.
 * The manual gives each condition's effect but not how long it lasts, so the lengths here are defaults the GM can change:
 *  - Burn lasts 3 Exchanges. Tremor bursts at the end of the Exchange after the one it was placed in.
 *  - Bleed, Rupture, Sinking, Poise and Charge have no timer: the GM removes or spends them (Charge discharges when the fight ends).
 */
import { uid } from "./model.mjs";

export const CONDITIONS = {
  burn: { sin: "wrath", rounds: 3, rule: "At the end of each Exchange the target takes Hurt, until it is put out." },
  bleed: { sin: "lust", rule: "Each time the target spends E.G.O. or acts under strain, it takes Hurt. It stays until treated." },
  tremor: { sin: "sloth", delay: 1, rule: "A delayed hit: it bursts for Harm at the end of the next Exchange, or earlier on a trigger." },
  rupture: { sin: "gluttony", stacks: true, rule: "Each Rupture adds +1 Harm to the next hit on the target, then fades." },
  sinking: { sin: "gloom", stacks: true, max: 3, rule: "Each stack removes a die from the target's next roll, to a maximum of -3." },
  poise: { sin: "pride", stacks: true, rule: "Each Poise adds +1 die to your next Pride roll. A Failure spends it all." },
  charge: { sin: "envy", stacks: true, rule: "Spend Charge to add dice or Harm. Unspent Charge discharges as a Complication at the end of the scene." },
  custom: { sin: "", rule: "A condition of your own." }
};
export const CONDITION_TYPES = Object.keys(CONDITIONS);

export const conditionsOf = slot => (Array.isArray(slot.conditions) ? slot.conditions : (slot.conditions = []));

/**
 * Put a condition on a slot. A Sin's condition already there gains stacks (if it stacks, up to its maximum) or is renewed (Burn's timer);
 * a custom condition is always added as a new one. Returns the condition.
 */
export function addCondition(slot, type, { name = "", stacks = 1, rounds = null, note = "" } = {}) {
  const def = CONDITIONS[type] ?? CONDITIONS.custom;
  const list = conditionsOf(slot);
  const cap = def.max ?? 99;
  const n = Math.max(1, Math.min(cap, Math.floor(Number(stacks)) || 1));
  const startRounds = rounds === null || rounds === "" || Number.isNaN(Number(rounds)) ? (def.rounds ?? 0) : Math.max(0, Math.floor(Number(rounds)));
  const existing = type !== "custom" ? list.find(c => c.type === type) : null;
  if (existing) {
    if (def.stacks) existing.stacks = Math.min(cap, existing.stacks + n);
    if (startRounds) existing.rounds = startRounds;
    if (note) existing.note = note;
    return existing;
  }
  const cond = { id: uid(), type: CONDITIONS[type] ? type : "custom", name: type === "custom" ? String(name || "?").slice(0, 30) : "", stacks: def.stacks ? n : 1, rounds: startRounds, delay: def.delay ?? 0, note: String(note).slice(0, 80) };
  list.push(cond);
  return cond;
}
export function removeCondition(slot, id) { slot.conditions = conditionsOf(slot).filter(c => c.id !== id); }
/** Change a stackable condition's stacks (spending one is delta -1); at zero it goes. Returns the condition, or null if it is gone. */
export function stepCondition(slot, id, delta) {
  const c = conditionsOf(slot).find(x => x.id === id);
  if (!c) return null;
  const def = CONDITIONS[c.type];
  if (def.stacks) c.stacks = Math.min(def.max ?? 99, c.stacks + delta);
  else c.rounds = Math.max(0, c.rounds + delta);
  if (def.stacks ? c.stacks <= 0 : (c.rounds <= 0 && (def.rounds || c.type === "custom") && delta < 0)) { removeCondition(slot, id); return null; }
  return c;
}

/**
 * The end of an Exchange. Returns events, each { slot, cond, kind }:
 *  "hurt" (Burn burns: the target takes Hurt), "burst" (Tremor bursts for Harm), "fade" (a timed condition ends).
 * Timed conditions count down and are removed at zero; Tremor's delay counts down, then it bursts and goes.
 */
export function tickExchange(tracker) {
  const events = [];
  for (const slot of tracker.slots) {
    for (const cond of [...conditionsOf(slot)]) {
      if (cond.type === "burn") {
        events.push({ slot, cond: { ...cond }, kind: "hurt" });
        slot.hurtDue = (slot.hurtDue || 0) + 1;                       // waiting for the GM's one-click Apply Hurt
        cond.rounds -= 1;
        if (cond.rounds <= 0) { removeCondition(slot, cond.id); events.push({ slot, cond: { ...cond }, kind: "fade" }); }
      } else if (cond.type === "tremor") {
        if (cond.delay > 0) cond.delay -= 1;
        else { removeCondition(slot, cond.id); events.push({ slot, cond: { ...cond }, kind: "burst" }); }
      } else if (cond.rounds > 0) {                      // a custom condition with a timer
        cond.rounds -= 1;
        if (cond.rounds <= 0) { removeCondition(slot, cond.id); events.push({ slot, cond: { ...cond }, kind: "fade" }); }
      }
    }
  }
  return events;
}
/** The fight is over: unspent Charge discharges as a Complication (one per stack), and every condition ends. */
export function endScene(tracker) {
  const events = [];
  for (const slot of tracker.slots) {
    for (const cond of conditionsOf(slot)) if (cond.type === "charge") events.push({ slot, cond: { ...cond }, kind: "discharge" });
    slot.conditions = [];
  }
  return events;
}

/* ---- conditions that change rolls (Sinking, Poise) ---- */

/** The tracker slot standing for an actor, if the GM has put them in the order. */
export const slotForActor = (tracker, actorId) => (actorId ? tracker.slots.find(s => s.actorId === actorId) ?? null : null);
export function stacksOf(tracker, actorId, type) {
  const slot = slotForActor(tracker, actorId);
  return slot ? conditionsOf(slot).filter(c => c.type === type).reduce((n, c) => n + c.stacks, 0) : 0;
}
/** What changes this actor's next roll: Sinking takes a die per stack off any roll; Poise adds a die per stack to a Pride roll. */
export const rollConditions = (tracker, actorId) => ({ sinking: stacksOf(tracker, actorId, "sinking"), poise: stacksOf(tracker, actorId, "poise") });
/** Remove every condition of these types from an actor's slot (they were used up). Returns true if anything went. */
export function clearForActor(tracker, actorId, types) {
  const slot = slotForActor(tracker, actorId);
  if (!slot) return false;
  const before = conditionsOf(slot).length;
  slot.conditions = conditionsOf(slot).filter(c => !types.includes(c.type));
  return slot.conditions.length !== before;
}

/* ---- applying Hurt ---- */

/**
 * Hurt from Burn only ever sets Harm to Hurt (tier 1): "bruises, winding, a scare", no penalty (Part VI §2). Someone already
 * Hurt, Injured or worse is not made worse by it. Returns { from, harm, changed } for a given current tier.
 */
export function hurtResult(currentHarm) {
  const from = Math.max(0, Math.min(4, Math.floor(Number(currentHarm) || 0)));
  const harm = Math.max(from, 1);
  return { from, harm, changed: harm > from };
}
/** Use up one waiting Hurt on a slot. Returns false if none was waiting. */
export function takeHurtDue(slot) {
  if (!(slot.hurtDue > 0)) return false;
  slot.hurtDue -= 1;
  return true;
}
