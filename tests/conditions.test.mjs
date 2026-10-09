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

/* ---- Sinking and Poise in the rolls ---- */
import * as E from "../js/engine.mjs";
import { newActor } from "../js/model.mjs";
import { Room } from "../js/room.mjs";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const roller = () => newActor("character", "Tomas", { attributes: { body: 1, mind: 3, presence: 3, resolve: 2 }, skills: { investigation: 3, persuasion: 2 }, resonance: { pride: 3 } });
const input = o => ({ attribute: "mind", skill: "investigation", difficulty: 2, ...o });

test("tracker lookups: stacks by actor, none when the actor is not in the order", () => {
  const tr = B.newTracker(); const s = B.addSlot(tr, { name: "Tomas", kind: "pc", actorId: "a1" });
  C.addCondition(s, "sinking", { stacks: 2 }); C.addCondition(s, "poise");
  assert.deepEqual(C.rollConditions(tr, "a1"), { sinking: 2, poise: 1 });
  assert.deepEqual(C.rollConditions(tr, "nobody"), { sinking: 0, poise: 0 });
  assert.equal(C.clearForActor(tr, "a1", ["sinking"]), true);
  assert.deepEqual(C.rollConditions(tr, "a1"), { sinking: 0, poise: 1 });
  assert.equal(C.clearForActor(tr, "a1", ["sinking"]), false);
});

test("Sinking takes a die per stack off the roll, and is used up", () => {
  const a = roller();
  const plain = E.rollDraft(a, input(), null, seq(8));
  const sunk = E.rollDraft(a, input({ sinking: 2 }), null, seq(8));
  assert.equal(sunk.pool, plain.pool - 2);
  const out = E.commitRoll(a, sunk);
  assert.equal(out.consumed.sinking, true);
  assert.match(out.html, /Sinking/);
  assert.equal(E.commitRoll(a, E.rollDraft(a, input(), null, seq(8))).consumed.sinking, false);
});

test("Sinking is capped at -3 and cannot make the pool negative", () => {
  const a = roller();
  assert.equal(E.rollDraft(a, input({ sinking: 9 }), null, seq(8)).pool, E.rollDraft(a, input(), null, seq(8)).pool - 3);
  assert.equal(E.rollDraft(a, input({ attribute: "body", skill: "", sinking: 3 }), null, seq(8)).pool, 0);
});

test("Poise adds dice only on a Pride roll; it is spent only if that roll fails", () => {
  const a = roller();
  const base = E.rollDraft(a, input({ tag: "pride" }), null, seq(8)).pool;
  const withPoise = E.rollDraft(a, input({ tag: "pride", poise: 2 }), null, seq(8));
  assert.equal(withPoise.pool, base + 2);
  assert.equal(E.commitRoll(a, withPoise).consumed.poise, false);          // a success keeps it
  const failing = E.rollDraft(a, input({ tag: "pride", poise: 2, difficulty: 6 }), null, seq(2));
  assert.equal(E.commitRoll(a, failing).consumed.poise, true);             // a Failure spends it all
  const notPride = E.rollDraft(a, input({ tag: "wrath", poise: 2 }), null, seq(8));
  assert.equal(notPride.pool, E.rollDraft(a, input({ tag: "wrath" }), null, seq(8)).pool);
  assert.equal(E.commitRoll(a, notPride).consumed.poise, false);
});

test("a Sinking opponent rolls fewer dice against you, and it is used up", () => {
  const a = roller(); const guard = newActor("npc", "Guard", { grade: 5 });
  const tg = E.targetInfo(guard); tg.sinking = 2;
  const d = E.rollDraft(a, input({ opposition: 4 }), tg, seq(8));
  assert.equal(d.oppDice, 2);
  assert.equal(E.commitRoll(a, d).consumed.targetSinking, true);
});

test("a Threat's own roll loses a die per Sinking stack", () => {
  const guard = newActor("npc", "Guard", { grade: 5 });
  assert.match(E.npcRoll(guard, seq(8, 8, 8, 8), { sinking: 2 }), /2 dice[\s\S]*Sinking -2/);
  assert.match(E.npcRoll(guard, seq(8, 8, 8, 8)), /4 dice/);
});

test("room: a player's used-up conditions reach the host", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const got = [];
  const gm = new Room({ Peer, handlers: { onLog() {}, onCond: (pid, id, types) => got.push([id, types]) } });
  const pl = new Room({ Peer, handlers: { onLog() {} } });
  await gm.host("CND01", "GM"); await pl.join("CND01", "Ana");
  pl.sendCond("a1", ["sinking", "poise"]);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(got, [["a1", ["sinking", "poise"]]]);
});

/* ---- Apply Hurt ---- */
test("Burn leaves one Hurt waiting per Exchange, and taking them is counted", () => {
  const tr = B.newTracker(); const s = B.addSlot(tr, { name: "Dax", kind: "pc", actorId: "d1" });
  C.addCondition(s, "burn");
  C.tickExchange(tr); C.tickExchange(tr);
  assert.equal(s.hurtDue, 2);
  assert.equal(C.takeHurtDue(s), true); assert.equal(C.takeHurtDue(s), true); assert.equal(C.takeHurtDue(s), false);
  assert.equal(s.hurtDue, 0);
});

test("Burn's Hurt only sets Harm to Hurt: never worse, and never makes anyone worse", () => {
  assert.deepEqual(C.hurtResult(0), { from: 0, harm: 1, changed: true });
  assert.deepEqual(C.hurtResult(1), { from: 1, harm: 1, changed: false });      // already Hurt: no change, however many Burns
  assert.deepEqual(C.hurtResult(2), { from: 2, harm: 2, changed: false });      // Injured stays Injured
  assert.deepEqual(C.hurtResult(4), { from: 4, harm: 4, changed: false });
  assert.equal(C.hurtResult("junk").harm, 1);
  let h = 0; for (let i = 0; i < 5; i++) h = C.hurtResult(h).harm;
  assert.equal(h, 1);                                                          // five Exchanges of Burn: still just Hurt
});

test("the Burn line in the log has a GM-only Apply Hurt button; the Hurt due survives saving", () => {
  const tr = B.newTracker(); const s = B.addSlot(tr, { name: "Dax", kind: "pc" });
  C.addCondition(s, "burn"); C.tickExchange(tr);
  S.state.actors = []; S.state.tracker = tr;
  const text = JSON.stringify(S.exportData()); S.state.tracker = B.newTracker(); S.importData(text);
  assert.equal(S.state.tracker.slots[0].hurtDue, 1);
});

test("room: the GM's Hurt reaches the player who owns the character, and nobody else", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const hits = { ana: [], ben: [] };
  const gm = new Room({ Peer, handlers: { onLog() {} } });
  const ana = new Room({ Peer, handlers: { onLog() {}, onHarm: (id, d) => hits.ana.push([id, d]) } });
  const ben = new Room({ Peer, handlers: { onLog() {}, onHarm: (id, d) => hits.ben.push([id, d]) } });
  await gm.host("HRT01", "GM"); await ana.join("HRT01", "Ana"); await ben.join("HRT01", "Ben");
  ana.sendSheets([{ id: "a-pc", name: "Wren" }]); ben.sendSheets([{ id: "b-pc", name: "Dax" }]);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(gm.sendHarm("b-pc", 1), true);
  assert.equal(gm.sendHarm("nobody", 1), false);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(hits, { ana: [], ben: [["b-pc", 1]] });
  assert.equal(ana.sendHarm("a-pc", 1), false);                      // only the host can do this
});
