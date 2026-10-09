import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/conditions.mjs";
import * as B from "../js/board.mjs";
import * as S from "../js/store.mjs";
import { SIN_TEXT } from "../js/config.mjs";
import { SINS } from "../js/rules.mjs";

const slotOf = (tr, name = "Wren") => B.addSlot(tr, { name, kind: "pc" });

test("every Sin has exactly one signature condition, named as in the sheet", () => {
  for (const sin of SINS) {
    const types = C.CONDITION_TYPES.filter(k => C.CONDITIONS[k].sin === sin);
    assert.equal(types.length, 1, sin);
    assert.equal(SIN_TEXT[sin].keyword.toLowerCase(), types[0]);        // Burn, Bleed, Tremor, ...
  }
});

test("Burn: Hurt at the end of each Exchange for three, then it fades; putting it out stops it", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  C.addCondition(s, "burn");
  const kinds = [];
  for (let i = 0; i < 4; i++) kinds.push(C.tickExchange(tr).map(e => e.kind).join("+"));
  assert.deepEqual(kinds, ["hurt", "hurt", "hurt+fade", ""]);
  assert.equal(C.conditionsOf(s).length, 0);
  const b = C.addCondition(s, "burn"); C.tickExchange(tr);
  C.removeCondition(s, b.id);
  assert.deepEqual(C.tickExchange(tr), []);                              // put out: nothing more
});

test("Burn is renewed, not stacked; Rupture and Sinking stack (Sinking up to 3)", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  const b = C.addCondition(s, "burn"); C.tickExchange(tr); C.addCondition(s, "burn");
  assert.equal(C.conditionsOf(s).length, 1); assert.equal(b.rounds, 3); assert.equal(b.stacks, 1);
  C.addCondition(s, "rupture"); C.addCondition(s, "rupture", { stacks: 2 });
  assert.equal(C.conditionsOf(s).find(c => c.type === "rupture").stacks, 3);
  C.addCondition(s, "sinking", { stacks: 2 }); C.addCondition(s, "sinking", { stacks: 5 });
  assert.equal(C.conditionsOf(s).find(c => c.type === "sinking").stacks, 3);
});

test("Tremor bursts at the end of the Exchange after the one it was placed in", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  C.addCondition(s, "tremor");
  assert.deepEqual(C.tickExchange(tr), []);                              // the Exchange it was placed in
  assert.deepEqual(C.tickExchange(tr).map(e => e.kind), ["burst"]);      // the next one
  assert.equal(C.conditionsOf(s).length, 0);
});

test("stacks are spent one at a time and the condition goes at zero", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  const c = C.addCondition(s, "charge", { stacks: 2 });
  assert.equal(C.stepCondition(s, c.id, -1).stacks, 1);
  assert.equal(C.stepCondition(s, c.id, 1).stacks, 2);
  C.stepCondition(s, c.id, -1);
  assert.equal(C.stepCondition(s, c.id, -1), null);
  assert.equal(C.conditionsOf(s).length, 0);
});

test("custom conditions: named, optional timer, several allowed", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  C.addCondition(s, "custom", { name: "Stunned", rounds: 2 }); C.addCondition(s, "custom", { name: "Prone" });
  assert.deepEqual(C.conditionsOf(s).map(c => c.name), ["Stunned", "Prone"]);
  assert.deepEqual(C.tickExchange(tr), []);
  assert.deepEqual(C.tickExchange(tr).map(e => [e.kind, e.cond.name]), [["fade", "Stunned"]]);
  assert.deepEqual(C.conditionsOf(s).map(c => c.name), ["Prone"]);       // no timer: stays
});

test("Bleed, Poise and Sinking have no timer", () => {
  const tr = B.newTracker(); const s = slotOf(tr);
  for (const k of ["bleed", "poise", "sinking"]) C.addCondition(s, k);
  for (let i = 0; i < 6; i++) assert.deepEqual(C.tickExchange(tr), []);
  assert.equal(C.conditionsOf(s).length, 3);
});

test("end of the fight: unspent Charge discharges, everything clears", () => {
  const tr = B.newTracker(); const a = slotOf(tr, "Dax"), b = slotOf(tr, "Guard");
  C.addCondition(a, "charge", { stacks: 2 }); C.addCondition(b, "burn"); C.addCondition(b, "poise");
  const ev = C.endScene(tr);
  assert.deepEqual(ev.map(e => [e.slot.name, e.kind, e.cond.stacks]), [["Dax", "discharge", 2]]);
  assert.equal(C.conditionsOf(a).length + C.conditionsOf(b).length, 0);
});

test("conditions survive saving and an older slot without them still works", () => {
  S.state.actors = []; S.state.tracker = B.newTracker();
  const s = slotOf(S.state.tracker); C.addCondition(s, "burn");
  const text = JSON.stringify(S.exportData());
  S.state.tracker = B.newTracker(); S.importData(text);
  assert.equal(C.conditionsOf(S.state.tracker.slots[0]).length, 1);
  S.importData(JSON.stringify({ actors: [], tracker: { active: true, exchange: 2, slots: [{ id: "x", name: "Old", kind: "pc", actorId: "", acted: false }] } }));
  assert.equal(C.conditionsOf(S.state.tracker.slots[0]).length, 0);
  assert.deepEqual(C.tickExchange(S.state.tracker), []);
});
