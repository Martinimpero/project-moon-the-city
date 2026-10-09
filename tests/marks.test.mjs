import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/rules.mjs";
import * as E from "../js/engine.mjs";
import * as S from "../js/store.mjs";
import { newActor, normalizeActor } from "../js/model.mjs";
import { Room } from "../js/room.mjs";

const pc = (sys = {}) => newActor("character", "Dax", { attributes: { body: 3, mind: 2, presence: 2, resolve: 3 }, skills: { combat: 3, stealth: 1 }, grade: 9, ...sys });

test("Marks per Contract: 1, +1 at Risk 3 or 4, +1 for a Reckoning or a Bond scene", () => {
  assert.equal(R.marksFor({ risk: 1 }), 1); assert.equal(R.marksFor({ risk: 2 }), 1);
  assert.equal(R.marksFor({ risk: 3 }), 2); assert.equal(R.marksFor({ risk: 4, bonus: true }), 3);
  assert.equal(R.marksFor({ risk: 1, bonus: true }), 2);
});

test("a Skill costs its new rating and an Attribute three times its new rating", () => {
  assert.deepEqual([R.skillCost(1), R.skillCost(3)], [1, 3]);
  assert.deepEqual([R.attrCost(2), R.attrCost(4)], [6, 12]);
  const a = pc(); a.system.marks.unspent = 5;
  assert.deepEqual(R.raiseInfo(a.system, "skill", "stealth"), { ok: true, cost: 2, next: 2 });         // 1 to 2 costs 2
  assert.deepEqual(R.raiseInfo(a.system, "attr", "mind"), { ok: false, reason: "marks", cost: 9, next: 3 });
  a.system.marks.unspent = 9;
  assert.equal(R.raiseInfo(a.system, "attr", "mind").ok, true);
});

test("Skills stop at 3 and Attributes at 4 until the Grade unlocks one", () => {
  const a = pc({ skills: { combat: 3 }, attributes: { body: 4, mind: 2, presence: 2, resolve: 3 } }); a.system.marks.unspent = 99;
  assert.equal(R.raiseInfo(a.system, "skill", "combat").reason, "cap");
  assert.equal(R.raiseInfo(a.system, "attr", "body").reason, "cap");
  a.system.grade = 7;                                                                              // Grade 7: Skill 4 in one Skill already at 3
  assert.deepEqual(R.unlockChoices(a.system, "skill4"), ["combat"]);
  assert.equal(E.chooseUnlock(a, "skill4", "stealth"), false);                                      // not at 3
  assert.equal(E.chooseUnlock(a, "skill4", "combat"), true);
  assert.deepEqual(R.unlockChoices(a.system, "skill4"), []);                                        // one dot only
  assert.equal(R.raiseInfo(a.system, "skill", "combat").ok, true);
  assert.equal(R.raiseInfo(a.system, "attr", "body").reason, "cap");                                // Attribute 5 needs Grade 5
  a.system.grade = 5; assert.deepEqual(R.unlockChoices(a.system, "attr5"), ["body"]);
  E.chooseUnlock(a, "attr5", "body"); assert.equal(R.raiseInfo(a.system, "attr", "body").ok, true);
  assert.equal(R.raiseInfo(a.system, "skill", "combat").next, 4);
});

test("a Grade too low (a higher number) gives no unlock, and 5 is the top", () => {
  const a = pc(); a.system.grade = 8;
  assert.deepEqual(R.unlocksFor(8), []); assert.deepEqual(R.unlockChoices(a.system, "skill4"), []);
  assert.deepEqual(R.unlocksFor(5).map(u => u.slot), ["skill4", "attr5"]); assert.deepEqual(R.unlocksFor(3).map(u => u.slot), ["skill4", "attr5", "skill5"]);
  const m = pc({ skills: { combat: 5 }, grade: 1 }); m.system.marks.unspent = 99;
  assert.equal(R.raiseInfo(m.system, "skill", "combat").reason, "max");
  assert.equal(R.raiseInfo(m.system, "skill", "nonsense").ok, false);
});

test("raising spends the Marks, changes the sheet and logs it; Resolve 3 to 4 costs 12 and raises the E.G.O. maximum", () => {
  const a = pc({ attributes: { body: 1, mind: 1, presence: 1, resolve: 3 }, stress: 0 }); a.system.marks.unspent = 12;
  const max0 = a.system.ego.max;
  const r = E.raiseTrait(a, "attr", "resolve", 5);
  assert.equal(r.ok, true); assert.equal(a.system.marks.unspent, 0); assert.equal(a.system.attributes.resolve, 4);
  assert.equal(a.system.ego.max, max0 + 1);
  assert.match(r.html, /Resolve/); assert.match(r.html, /rises to 4/); assert.match(r.html, /Marks spent: 12/); assert.match(r.html, /E\.G\.O\. maximum rises by 1/);
  assert.deepEqual(a.system.growth.at(-1), { kind: "attr", key: "resolve", to: 4, cost: 12, at: 5 });
  assert.equal(E.raiseTrait(a, "attr", "resolve").ok, false);                                       // no Marks left, and capped
});

test("a failed raise changes nothing", () => {
  const a = pc(); a.system.marks.unspent = 1;
  const snap = JSON.stringify(a.system);
  const r = E.raiseTrait(a, "skill", "combat");
  assert.deepEqual([r.ok, r.reason], [false, "cap"]); assert.equal(JSON.stringify(a.system), snap);
});

test("awarding Marks adds to the unspent and the total, within limits", () => {
  const a = pc();
  assert.equal(E.awardMarks(a, 2), 2); assert.equal(E.awardMarks(a, 99), 6); assert.equal(E.awardMarks(a, -3), 0);
  assert.deepEqual([a.system.marks.unspent, a.system.marks.earned], [8, 8]);
});

test("older sheets get Marks fields, and Marks survive saving", () => {
  const old = normalizeActor({ type: "character", name: "Old", system: { grade: 9 } });
  assert.deepEqual([old.system.marks, old.system.unlocks, old.system.growth], [{ unspent: 0, earned: 0 }, { skill4: "", attr5: "", skill5: "" }, []]);
  const a = pc(); E.awardMarks(a, 3); E.chooseUnlock(Object.assign(a, { system: { ...a.system, grade: 7 } }), "skill4", "combat");
  S.state.actors = [a]; const text = JSON.stringify(S.exportData()); S.state.actors = []; S.importData(text);
  assert.deepEqual([S.state.actors[0].system.marks.unspent, S.state.actors[0].system.unlocks.skill4], [3, "combat"]);
});

test("room: the GM awards Marks to a player's character and to its own", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const tick = () => new Promise(r => setTimeout(r, 30));
  const got = [], mine = [];
  const gm = new Room({ Peer, handlers: { onLog() {}, hostOwns: id => id === "hostpc", onGrant: (id, k) => mine.push([id, k]) } });
  const ana = new Room({ Peer, handlers: { onLog() {}, onGrant: (id, k) => got.push([id, k]) } });
  await gm.host("MRK01", "GM"); await ana.join("MRK01", "Ana");
  ana.sendSheets([{ id: "anapc", type: "character", name: "Ana's", system: {}, items: [] }]); await tick();
  assert.equal(gm.sendGrant("anapc", 2), true); await tick();
  assert.deepEqual(got, [["anapc", 2]]);
  assert.equal(gm.sendGrant("hostpc", 3), true); assert.deepEqual(mine, [["hostpc", 3]]);
  assert.equal(gm.sendGrant("nobody", 1), false);
  assert.equal(ana.sendGrant("anapc", 5), false);                                                    // a player cannot award Marks
  ana.leave(); gm.leave();
});
