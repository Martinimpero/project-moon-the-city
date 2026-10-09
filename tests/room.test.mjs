import test from "node:test";
import assert from "node:assert/strict";
import { Room, newCode, cleanCode, PREFIX } from "../js/room.mjs";

/** An in-memory PeerJS stand-in: peers register on a hub and exchange data asynchronously. */
function makeHub() {
  const peers = new Map();
  let n = 0;
  class Emitter { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Emitter {
    constructor(peer, other) { super(); this.peer = peer; this.other = other; this.open = false; }
    send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); }
    close() { const o = this.other; if (this.closed) return; this.closed = true; queueMicrotask(() => { this.emit("close"); o.closed = true; o.emit("close"); }); }
  }
  class Peer extends Emitter {
    constructor(id) {
      super();
      this.id = id ?? `anon${++n}`;
      queueMicrotask(() => {
        if (peers.has(this.id)) return this.emit("error", { type: "unavailable-id" });
        peers.set(this.id, this); this.emit("open", this.id);
      });
    }
    connect(target) {
      const mine = new Conn(target, null);
      queueMicrotask(() => {
        const t = peers.get(target);
        if (!t) return this.emit("error", { type: "peer-unavailable" });
        const theirs = new Conn(this.id, mine); mine.other = theirs;
        t.emit("connection", theirs);
        mine.emit("open"); theirs.emit("open");
      });
      return mine;
    }
    destroy() { peers.delete(this.id); }
  }
  return Peer;
}

function client(Peer, extra = {}) {
  const log = [], effects = [], tables = [];
  let scenes = 0;
  const room = new Room({
    Peer, timeoutMs: 200,
    handlers: { onStatus() {}, onLog: (e, h) => log.push(e), onTable: t => tables.push(t), onEffect: (id, v) => effects.push([id, v]), onScene: () => scenes++, hostNpcs: () => extra.npcs ?? [], hostOwns: id => (extra.owns ?? []).includes(id) }
  });
  return { room, log, effects, tables, get scenes() { return scenes; } };
}
const tick = () => new Promise(r => setTimeout(r, 10));

test("codes are 5 characters from the safe alphabet and are cleaned", () => {
  assert.match(newCode(), /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(cleanCode(" ab-c1 "), "ABC1");
});

test("a player joins, the host sees the roster, and logs flow both ways", async () => {
  const Peer = makeHub();
  const gm = client(Peer, { npcs: [{ id: "n1", name: "Enforcer" }] }), p1 = client(Peer), p2 = client(Peer);
  await gm.room.host("ROOM1", "GM");
  await p1.room.join("room1", "Ana");
  await p2.room.join("ROOM1", "Ben");
  await tick();
  assert.equal(gm.room.count, 3);
  assert.deepEqual(gm.room.table.players.map(p => p.name).sort(), ["Ana", "Ben"]);
  assert.equal(p1.room.table.npcs[0].name, "Enforcer");
  assert.deepEqual(p1.room.table.players.map(p => p.name), ["Ben"]);       // not itself

  p1.room.sendLog({ id: "a", html: "<p>Ana rolls</p>" });
  gm.room.sendLog({ id: "b", html: "<p>GM says</p>" });
  await tick();
  assert.deepEqual(gm.log.map(e => e.id), ["a"]);
  assert.deepEqual(p2.log.map(e => e.id).sort(), ["a", "b"]);
  assert.deepEqual(p1.log.map(e => e.id), ["b"]);                           // not echoed to the sender
});

test("private entries reach the host but not other players; whispers reach one player", async () => {
  const Peer = makeHub();
  const gm = client(Peer), p1 = client(Peer), p2 = client(Peer);
  await gm.room.host("PRIV1", "GM"); await p1.room.join("PRIV1", "Ana"); await p2.room.join("PRIV1", "Ben"); await tick();
  p1.room.sendLog({ id: "v", html: "voice", private: true });
  gm.room.sendLog({ id: "w", html: "psst", to: p2.room.myId });
  await tick();
  assert.deepEqual(gm.log.map(e => e.id), ["v"]);
  assert.deepEqual(p2.log.map(e => e.id), ["w"]);
  assert.deepEqual(p1.log, []);
});

test("late joiners receive recent public history", async () => {
  const Peer = makeHub();
  const gm = client(Peer), late = client(Peer);
  await gm.room.host("HIST1", "GM");
  gm.room.sendLog({ id: "1", html: "a" }); gm.room.sendLog({ id: "2", html: "b", private: true });
  await late.room.join("HIST1", "Late"); await tick();
  assert.deepEqual(late.log.map(e => e.id), ["1"]);
});

test("effects are routed to the owner of the actor", async () => {
  const Peer = makeHub();
  const gm = client(Peer, { owns: ["gm-pc"] }), p1 = client(Peer), p2 = client(Peer);
  await gm.room.host("EFF11", "GM"); await p1.room.join("EFF11", "Ana"); await p2.room.join("EFF11", "Ben"); await tick();
  p2.room.sendSheets([{ id: "ben-pc", name: "Ben's" }]); await tick();
  p1.room.sendEffect("ben-pc", -2); await tick();            // Ana -> host -> Ben
  assert.deepEqual(p2.effects, [["ben-pc", -2]]);
  gm.room.sendEffect("ben-pc", 0); await tick();
  assert.deepEqual(p2.effects.at(-1), ["ben-pc", 0]);
  p1.room.sendEffect("gm-pc", -2); await tick();             // the host owns it
  assert.deepEqual(gm.effects, [["gm-pc", -2]]);
});

test("scene reset reaches every player; leaving updates the roster", async () => {
  const Peer = makeHub();
  const gm = client(Peer), p1 = client(Peer), p2 = client(Peer);
  await gm.room.host("SCN11", "GM"); await p1.room.join("SCN11", "Ana"); await p2.room.join("SCN11", "Ben"); await tick();
  gm.room.broadcastScene(); await tick();
  assert.equal(p1.scenes, 1); assert.equal(p2.scenes, 1);
  p1.room.leave(); await tick();
  assert.equal(gm.room.peers.size, 1);
  assert.deepEqual(p2.room.table.players, []);
});

test("errors: unknown code, duplicate host code", async () => {
  const Peer = makeHub();
  const a = client(Peer), b = client(Peer), c = client(Peer);
  await assert.rejects(a.room.join("NOPE1", "Ana"));
  assert.equal(a.room.status, "error");
  assert.match(a.room.error, /No room/);
  await b.room.host("DUPE1", "GM");
  await assert.rejects(c.room.host("DUPE1", "GM2"));
  assert.match(c.room.error, /already in use/);
  assert.equal(PREFIX, "pmoon-city-");
});

test("a message before hello is ignored", async () => {
  const Peer = makeHub();
  const gm = client(Peer);
  await gm.room.host("EARLY", "GM");
  const rogue = new Peer();
  await tick();
  const conn = rogue.connect(PREFIX + "EARLY");
  await tick();
  conn.send({ k: "log", entry: { id: "x", html: "sneaky" } }); await tick();
  assert.deepEqual(gm.log, []);
});
