import test from "node:test";
import assert from "node:assert/strict";
import { parseIceServers, peerOptionsFor, classifyCandidates, connectionVerdict, testConnection, DEFAULT_ICE } from "../js/net.mjs";

test("relay settings: one server per line, with a login for TURN", () => {
  const { servers, errors } = parseIceServers(`
    # my relay
    turn:relay.example.org:3478 alice s3cret
    turns:relay.example.org:443?transport=tcp bob pass word with spaces
    stun:stun.example.org:3478
  `);
  assert.deepEqual(servers, [
    { urls: "turn:relay.example.org:3478", username: "alice", credential: "s3cret" },
    { urls: "turns:relay.example.org:443?transport=tcp", username: "bob", credential: "pass word with spaces" },
    { urls: "stun:stun.example.org:3478" }
  ]);
  assert.deepEqual(errors, []);
});

test("bad lines are reported, not guessed at", () => {
  const { servers, errors } = parseIceServers("http://nope\nturn:host:3478\nturn:host:3478 onlyuser\nstun:ok.example.org");
  assert.deepEqual(servers, [{ urls: "stun:ok.example.org" }]);
  assert.deepEqual(errors.map(e => [e.line, e.reason]), [[1, "address"], [2, "login"], [3, "login"]]);
  assert.deepEqual(parseIceServers("").servers, []);
  assert.deepEqual(parseIceServers(null).errors, []);
});

test("PeerJS options keep the default STUN servers and add the relay; nothing added means no options", () => {
  assert.equal(peerOptionsFor(""), null);
  assert.equal(peerOptionsFor("garbage"), null);
  const o = peerOptionsFor("turn:r.example.org:3478 u p");
  assert.deepEqual(o.config.iceServers.slice(0, DEFAULT_ICE.length), DEFAULT_ICE);
  assert.deepEqual(o.config.iceServers.at(-1), { urls: "turn:r.example.org:3478", username: "u", credential: "p" });
});

test("what the browser found means: relay, direct, blocked or nothing", () => {
  const host = "candidate:1 1 udp 2122260223 192.168.1.5 54321 typ host generation 0";
  const srflx = "candidate:2 1 udp 1686052607 203.0.113.9 54321 typ srflx raddr 192.168.1.5 rport 54321";
  const relay = "candidate:3 1 udp 41885439 198.51.100.1 60000 typ relay raddr 203.0.113.9 rport 54321";
  assert.deepEqual(classifyCandidates([host, srflx, relay, "junk"]), { host: 1, srflx: 1, relay: 1 });
  assert.equal(connectionVerdict(classifyCandidates([host, srflx, relay])), "relay");
  assert.equal(connectionVerdict(classifyCandidates([host, srflx])), "direct");
  assert.equal(connectionVerdict(classifyCandidates([host])), "blocked");
  assert.equal(connectionVerdict(classifyCandidates([])), "none");
});

test("the connection test never throws, even with no WebRTC and no PeerJS", async () => {
  const r = await testConnection({ timeoutMs: 20 });
  assert.deepEqual([r.broker, r.verdict], [false, "none"]);
  const bad = await testConnection({ PeerCtor: class { constructor() { throw new Error("x"); } }, timeoutMs: 20 });
  assert.equal(bad.broker, false);
  const good = await testConnection({ PeerCtor: class { constructor() { this.l = {}; queueMicrotask(() => this.l.open?.()); } on(e, f) { this.l[e] = f; } destroy() {} }, timeoutMs: 200 });
  assert.equal(good.broker, true);
});
