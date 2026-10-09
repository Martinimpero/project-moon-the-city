import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Room, DENIED } from "../js/room.mjs";

/** An in-memory PeerJS stand-in where a peer can be killed (a crash or a dropped network) and a code can be taken or free. */
function makeHub() {
  const peers = new Map();
  let n = 0;
  class Emitter { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Emitter {
    constructor(peer) { super(); this.peer = peer; this.closed = false; }
    send(m) { if (this.closed) throw new Error("closed"); const o = this.other; queueMicrotask(() => { if (!o.closed) o.emit("data", JSON.parse(JSON.stringify(m))); }); }
    close() { if (this.closed) return; this.closed = true; const o = this.other; queueMicrotask(() => { this.emit("close"); if (o && !o.closed) { o.closed = true; o.emit("close"); } }); }
  }
  class Peer extends Emitter {
    constructor(id, opts) {
      super(); this.opts = opts; this.id = id ?? `anon${++n}`; this.conns = [];
      queueMicrotask(() => {
        if (peers.has(this.id)) return this.emit("error", { type: "unavailable-id" });
        peers.set(this.id, this); this.emit("open", this.id);
      });
    }
    connect(target) {
      const mine = new Conn(target); this.conns.push(mine);
      queueMicrotask(() => {
        const t = peers.get(target);
        if (!t) return this.emit("error", { type: "peer-unavailable" });
        const theirs = new Conn(this.id); mine.other = theirs; theirs.other = mine; t.conns.push(theirs);
        t.emit("connection", theirs); mine.emit("open"); theirs.emit("open");
      });
      return mine;
    }
    destroy() { if (peers.get(this.id) === this) peers.delete(this.id); this.conns.forEach(c => c.close()); this.destroyed = true; }
  }
  Peer.kill = id => { const p = peers.get(id); if (p) { peers.delete(id); p.conns.forEach(c => c.close()); } };       // a crash: no goodbye
  Peer.registered = id => peers.has(id);
  return Peer;
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await tick(5); } };

const allRooms = [];
after(() => allRooms.forEach(r => r.leave()));           // stop every retry loop so the test process can end
function client(Peer, extra = {}) {
  const log = [], statuses = []; let resumed = 0;
  const room = new Room({
    Peer, timeoutMs: 300, backoff: [10, 20, 40], maxRetryMs: extra.maxRetryMs ?? 5000,
    handlers: { onStatus: () => statuses.push(room.status), onLog: e => log.push(e.id), onResumed: () => resumed++, hostNpcs: () => [] }
  });
  allRooms.push(room);
  return { room, log, statuses, get resumed() { return resumed; } };
}

test("a player whose GM crashes keeps trying and is back when the GM re-opens the same code", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer);
  await gm.room.host("RSL01", "GM"); await ana.room.join("RSL01", "Ana"); await tick();
  Peer.kill("pmoon-city-RSL01");                                      // the GM's browser dies
  await until(() => ana.room.status === "reconnecting");
  assert.match(ana.room.error, /GM left/);
  const gm2 = client(Peer);
  await gm2.room.host("RSL01", "GM");                                  // the GM reloads and re-opens the room
  await until(() => ana.room.online);
  await until(() => gm2.room.peers.size === 1);
  assert.equal(ana.resumed, 1);
  assert.deepEqual([...gm2.room.peers.values()].map(p => p.name), ["Ana"]);
  gm2.room.sendLog({ id: "after", html: "x" }); await tick();
  assert.ok(ana.log.includes("after"));                                // and the room works again
});

test("a rolling-reload GM re-opens a code the broker still thinks is taken, by retrying", async () => {
  const Peer = makeHub();
  const old = client(Peer);
  await old.room.host("RSL02", "GM");                                  // the code is registered...
  const gm = client(Peer);
  gm.room.resume({ role: "host", code: "RSL02", name: "GM" });         // ...and a reloaded page resumes it at once: refused at first
  await tick(60);
  assert.equal(gm.room.status, "reconnecting");
  Peer.kill("pmoon-city-RSL02");                                       // the broker lets go
  await until(() => gm.room.online);
  assert.equal(gm.room.attempt, 0);                                    // reset once online
});

test("log entries a player makes while disconnected are sent when they are back", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer);
  await gm.room.host("RSL03", "GM"); await ana.room.join("RSL03", "Ana"); await tick();
  Peer.kill("pmoon-city-RSL03");
  await until(() => ana.room.status === "reconnecting");
  ana.room.sendLog({ id: "while-away", html: "x" }); ana.room.sendLog({ id: "private-one", html: "v", private: true });
  const gm2 = client(Peer); await gm2.room.host("RSL03", "GM");
  await until(() => ana.room.online); await tick(60);
  assert.deepEqual(gm2.log, ["while-away"]);                           // the public one arrived; the private one is not queued
});

test("leaving on purpose does not reconnect, and a refusal stops the trying", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer);
  await gm.room.host("RSL04", "GM"); await ana.room.join("RSL04", "Ana"); await tick();
  ana.room.leave(); await tick(100);
  assert.equal(ana.room.status, "idle"); assert.equal(gm.room.peers.size, 0);
  gm.room.setPassword("sesame");                                       // now a player who is trying to come back with the wrong password
  const ben = client(Peer);
  await assert.rejects(ben.room.join("RSL04", "Ben", { password: "nope" }));
  assert.equal(ben.room.error, DENIED.password); assert.equal(ben.room.session, null);
  await tick(100); assert.equal(ben.room.status, "error");              // it does not keep retrying
});

test("a player gives up after maxRetryMs when the GM never comes back", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer, { maxRetryMs: 150 });
  await gm.room.host("RSL05", "GM"); await ana.room.join("RSL05", "Ana"); await tick();
  Peer.kill("pmoon-city-RSL05");
  await until(() => ana.room.status === "error", 4000);
  assert.match(ana.room.error, /Could not reconnect/); assert.equal(ana.room.session, null);
});

test("the same name coming back replaces the old connection instead of making a second player", async () => {
  const Peer = makeHub();
  const gm = client(Peer), a1 = client(Peer), a2 = client(Peer);
  await gm.room.host("RSL06", "GM"); await a1.room.join("RSL06", "Ana"); await tick();
  await a2.room.join("RSL06", "Ana");                                  // a second tab or a reload while the first is still connected
  await tick(60);
  assert.equal(gm.room.peers.size, 1);
  assert.deepEqual([...gm.room.peers.values()].map(p => p.name), ["Ana"]);
});

test("password, lock and removal", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer), ben = client(Peer), cy = client(Peer);
  await gm.room.host("RSL07", "GM", { password: "pw" });
  await assert.rejects(ana.room.join("RSL07", "Ana"));                          // no password
  assert.equal(ana.room.error, DENIED.password);
  await ana.room.join("RSL07", "Ana", { password: "pw" });
  await ben.room.join("RSL07", "Ben", { password: "pw" });
  gm.room.setLocked(true);
  await assert.rejects(cy.room.join("RSL07", "Cy", { password: "pw" }));        // a new name is refused while locked
  assert.equal(cy.room.error, DENIED.locked);
  await tick(); Peer.kill(ana.room.myId);                                       // Ana's phone drops...
  await until(() => ana.room.status === "reconnecting");
  await until(() => ana.room.online);                                           // ...and she may come back: she was let in before
  gm.room.setLocked(false);
  const benPid = [...gm.room.peers].find(([, p]) => p.name === "Ben")[0];
  assert.equal(gm.room.kick(benPid), true);
  await until(() => ben.room.status === "error");
  assert.equal(ben.room.error, DENIED.removed); assert.equal(ben.room.session, null);
  await tick(150);
  assert.equal(ben.room.status, "error");                                       // removed players do not reconnect
  const ben2 = client(Peer);
  await assert.rejects(ben2.room.join("RSL07", "ben", { password: "pw" }));     // and not under the same name
  assert.equal(ben2.room.error, DENIED.removed);
  gm.room.unblock("Ben");
  await ben2.room.join("RSL07", "Ben", { password: "pw" });
  assert.equal(ben2.room.online, true);
});

test("a snapshot of the room can be resumed after a reload, keeping the lock and who was let in", async () => {
  const Peer = makeHub();
  const gm = client(Peer), ana = client(Peer);
  await gm.room.host("RSL08", "GM", { password: "pw" }); await ana.room.join("RSL08", "Ana", { password: "pw" });
  gm.room.setLocked(true);
  const snap = gm.room.snapshot();
  assert.deepEqual([snap.role, snap.code, snap.password, snap.locked, snap.known], ["host", "RSL08", "pw", true, ["ana"]]);
  Peer.kill("pmoon-city-RSL08");                                       // the GM's page is reloaded
  const gm2 = client(Peer); gm2.room.resume(snap);
  await until(() => gm2.room.online);
  await until(() => ana.room.online && gm2.room.peers.size === 1);      // Ana comes back despite the lock, and with the password
  assert.equal(gm2.room.locked, true);
  const stranger = client(Peer);
  await assert.rejects(stranger.room.join("RSL08", "Stranger", { password: "pw" }));
  assert.equal(stranger.room.error, DENIED.locked);
});

test("peer options (a TURN relay) are handed to PeerJS", async () => {
  const Peer = makeHub(); let seen = null;
  const Spy = class extends Peer { constructor(id, opts) { super(id, opts); seen = opts; } };
  const room = new Room({ Peer: Spy, handlers: {}, peerOptions: { config: { iceServers: [{ urls: "turn:example.org" }] } } });
  await room.host("RSL09", "GM");
  assert.equal(seen.config.iceServers[0].urls, "turn:example.org");
});
