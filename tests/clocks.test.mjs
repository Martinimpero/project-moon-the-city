import test from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/clocks.mjs";
import * as S from "../js/store.mjs";
import { Room } from "../js/room.mjs";

test("a Clock is kept between 0 and its size, and tells you when a step filled it", () => {
  const c = K.newClock({ name: "Open War", size: 6, filled: 2, consequence: "Open war on the Row." });
  assert.deepEqual(K.step(c, 1), { clock: c, filledNow: false, changed: true });
  K.step(c, 2); const r = K.step(c, 1);
  assert.equal(c.filled, 6); assert.equal(r.filledNow, true);
  assert.deepEqual([K.step(c, 1).filledNow, K.step(c, 1).changed], [false, false]);          // already full: nothing to announce
  K.step(c, -99); assert.equal(c.filled, 0);
  assert.equal(K.newClock({ size: 99 }).size, 6); assert.equal(K.newClock({ name: "  " }).name, "Clock");
  assert.equal(K.newClock({ size: 4, filled: 9 }).filled, 4);
});

test("players see only the Clocks the GM shows, and the consequence only once it is full", () => {
  const list = [K.newClock({ name: "Open War", filled: 2, consequence: "War", shown: true }), K.newClock({ name: "Secret", shown: false }), K.newClock({ name: "Heat", size: 4, filled: 4, consequence: "Enforcer at the door", shown: true })];
  const out = K.forPlayers(list);
  assert.deepEqual(out.map(c => c.name), ["Open War", "Heat"]);
  assert.equal(out[0].consequence, ""); assert.equal(out[1].consequence, "Enforcer at the door");
});

test("add, edit and remove; limits; junk is dropped", () => {
  const list = [];
  const c = K.addClock(list, { name: "Reinforcements", size: 4 });
  assert.equal(K.editClock(list, c.id, { name: "Reinforcements!", size: 8, shown: true }).size, 8);
  K.step(c, 5); K.editClock(list, c.id, { size: 4 }); assert.equal(c.filled, 4);              // shrinking keeps it inside
  assert.equal(K.removeClock(list, c.id), true); assert.equal(K.removeClock(list, c.id), false);
  for (let i = 0; i < K.MAX_CLOCKS + 3; i++) K.addClock(list, { name: `c${i}` });
  assert.equal(list.length, K.MAX_CLOCKS);
  assert.deepEqual(K.cleanClocks([null, { nope: 1 }, { id: "a", name: "Ok", size: 4, filled: 1 }]).map(x => x.id), ["a"]);
});

test("Clocks survive saving", () => {
  S.state.actors = []; S.state.clocks = [K.newClock({ name: "Open War", filled: 2, shown: true })];
  const text = JSON.stringify(S.exportData()); S.state.clocks = []; S.importData(text);
  assert.deepEqual([S.state.clocks[0].name, S.state.clocks[0].filled, S.state.clocks[0].shown], ["Open War", 2, true]);
  S.importData(JSON.stringify({ actors: [] })); assert.deepEqual(S.state.clocks, []);
});

test("room: a player gets the shown Clocks with the board, and sees them move", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const tick = () => new Promise(r => setTimeout(r, 25));
  const clocks = [K.newClock({ name: "Open War", filled: 2, shown: true }), K.newClock({ name: "Secret" })];
  const gm = new Room({ Peer, handlers: { onLog() {}, hostBoard: () => ({ tracker: { slots: [] }, map: null, clocks: K.forPlayers(clocks) }) } });
  const seen = [];
  const ana = new Room({ Peer, handlers: { onLog() {}, onBoard: b => seen.push(b.clocks.map(c => `${c.name}:${c.filled}`)) } });
  await gm.host("CLK01", "GM"); await ana.join("CLK01", "Ana"); await tick();
  assert.deepEqual(seen.at(-1), ["Open War:2"]);                                                // the hidden one never travels
  K.step(clocks[0], 1); gm.sendBoard(); await tick();
  assert.deepEqual(seen.at(-1), ["Open War:3"]);
  ana.leave(); gm.leave();
});
