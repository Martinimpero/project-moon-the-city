import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/board.mjs";
import { MAPS, TOKENS } from "../js/maplist.mjs";
import { newActor } from "../js/model.mjs";
import { Room } from "../js/room.mjs";
import fs from "node:fs";

test("tracker: order, acting, next Exchange", () => {
  const tr = B.newTracker();
  const a = B.addSlot(tr, { name: "Wren", kind: "pc", actorId: "w" });
  const b = B.addSlot(tr, { name: "Enforcers", kind: "threat", actorId: "e" });
  const c = B.addSlot(tr, { name: "Dax", kind: "pc", actorId: "d" });
  assert.equal(B.addSlot(tr, { name: "Wren again", actorId: "w" }), null);       // no duplicates
  B.startFight(tr);
  assert.equal(B.currentSlot(tr).name, "Wren");
  B.moveSlot(tr, c.id, -2);
  assert.deepEqual(tr.slots.map(s => s.name), ["Dax", "Wren", "Enforcers"]);
  assert.equal(B.moveSlot(tr, c.id, -1), false);                                  // already first
  B.toggleActed(tr, c.id);
  assert.equal(B.currentSlot(tr).name, "Wren");
  B.toggleActed(tr, a.id); B.toggleActed(tr, b.id);
  assert.equal(B.allActed(tr), true);
  assert.equal(B.currentSlot(tr), null);
  assert.equal(B.nextExchange(tr), 2);
  assert.equal(B.currentSlot(tr).name, "Dax");
  B.removeSlot(tr, b.id);
  assert.equal(tr.slots.length, 2);
  B.endFight(tr);
  assert.deepEqual([tr.active, tr.slots.length], [false, 0]);
});

test("tracker suggests every character then every Threat, groups as threats", () => {
  const pcs = [newActor("character", "Wren"), newActor("character", "Dax")];
  const npcs = [newActor("npc", "Enforcers", { isGroup: true }), newActor("npc", "Marl")];
  const s = B.suggestSlots(pcs, npcs);
  assert.deepEqual(s.map(x => x.kind), ["pc", "pc", "threat", "named"]);
});

test("map: tokens snap to square centres and stay on the map", () => {
  const m = B.newMap({ w: 2100, h: 1400, cell: 70 });
  const t = B.addToken(m, { name: "Wren Okoro", x: 100, y: 100 });
  B.moveToken(m, t.id, 150, 90);
  assert.deepEqual([t.x, t.y], [175, 105]);
  B.moveToken(m, t.id, 99999, -50);
  assert.ok(t.x <= m.w && t.y >= 0);
  m.snap = false; B.moveToken(m, t.id, 333, 222);
  assert.deepEqual([t.x, t.y], [333, 222]);
  assert.equal(B.squaresBetween(m, { x: 0, y: 0 }, { x: 350, y: 140 }), 5);
  assert.equal(B.initials("Wren Okoro"), "WO");
  assert.equal(B.initials(""), "?");
});

test("players do not get hidden tokens or a custom image", () => {
  const m = B.newMap({ src: "data:image/jpeg;base64,AAAA" });
  B.addToken(m, { name: "A" }); B.addToken(m, { name: "Ambusher", hidden: true });
  const p = B.mapForPlayers(m);
  assert.deepEqual(p.tokens.map(t => t.name), ["A"]);
  assert.equal(p.src, "");
  const bundled = B.newMap({ src: "maps/backstreet.jpg", bundled: "backstreet" });
  assert.equal(B.mapForPlayers(bundled).src, "maps/backstreet.jpg");
  assert.equal(B.mapForPlayers(null), null);
});

test("the bundled maps and tokens exist on disk", () => {
  assert.ok(MAPS.length >= 7);
  for (const m of MAPS) assert.ok(fs.existsSync(new URL(`../${m.file}`, import.meta.url)), m.file);
  for (const t of TOKENS) assert.ok(fs.existsSync(new URL(`../tokens/${t}.png`, import.meta.url)), t);
});

/* ---- the room carries the board ---- */
function hub() {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(peer) { super(); this.peer = peer; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  return class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const mine = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); mine.other = th; th.other = mine; peers.get(t).emit("connection", th); mine.emit("open"); }); return mine; }
    destroy() { peers.delete(this.id); }
  };
}
const tick = () => new Promise(r => setTimeout(r, 15));

test("room: board goes to players on join and on change, custom image once, token moves go to the host", async () => {
  const Peer = hub();
  const board = { tracker: B.newTracker(), map: B.newMap({ src: "data:image/jpeg;base64,AAAA" }), image: { rev: "r1", src: "data:image/jpeg;base64,AAAA" } };
  B.addSlot(board.tracker, { name: "Wren" });
  const gotBoards = [], gotImgs = [], moves = [];
  const gm = new Room({ Peer, handlers: { onLog() {}, onToken: (pid, id, x, y) => moves.push([pid, id, x, y]), hostBoard: () => ({ tracker: board.tracker, map: B.mapForPlayers(board.map), mapImage: board.image }) } });
  const pl = new Room({ Peer, handlers: { onLog() {}, onBoard: b => gotBoards.push(b), onMapImg: (rev, src) => gotImgs.push(rev) } });
  await gm.host("BRD01", "GM"); await pl.join("BRD01", "Ana"); await tick();
  assert.equal(gotBoards.length, 1);
  assert.equal(gotBoards[0].tracker.slots[0].name, "Wren");
  assert.deepEqual(gotImgs, ["r1"]);
  B.nextExchange(board.tracker); gm.sendBoard(); await tick();
  assert.equal(gotBoards.length, 2);
  assert.equal(gotBoards[1].tracker.exchange, 2);
  assert.deepEqual(gotImgs, ["r1"]);                       // not re-sent
  pl.sendToken("tk1", 140, 210); await tick();
  assert.deepEqual(moves[0].slice(1), ["tk1", 140, 210]);
});

test("fog: starts fully covered, paints squares, reveals a radius", () => {
  const m = B.newMap({ w: 700, h: 350, cell: 70 });
  m.fog = B.newFog(m); m.fog.on = true;
  assert.deepEqual([m.fog.cols, m.fog.rows, m.fog.bits.length], [10, 5, 50]);
  assert.equal(B.isRevealed(m, 100, 100), false);
  B.paintFog(m, 100, 100, true);                                   // the square at column 1, row 1
  assert.equal(B.isRevealed(m, 100, 100), true);
  assert.equal(B.isRevealed(m, 200, 100), false);
  B.paintFog(m, 100, 100, false);
  assert.equal(B.isRevealed(m, 100, 100), false);
  B.paintFog(m, 350, 175, true, 1);                                // radius 1: the square and all eight around it
  assert.equal(m.fog.bits.split("1").length - 1, 9);
  B.fogAll(m, true); assert.equal(m.fog.bits.includes("0"), false);
  B.fogAll(m, false); assert.equal(m.fog.bits.includes("1"), false);
  B.paintFog(m, -50, 9999, true); assert.equal(m.fog.bits.includes("1"), false);   // off the map: nothing
  m.fog.on = false; assert.equal(B.isRevealed(m, 100, 100), true);                 // fog off shows everything
});

test("fog: rectangles cover exactly the covered squares", () => {
  const m = B.newMap({ w: 280, h: 140, cell: 70 });
  m.fog = B.newFog(m);
  B.paintFog(m, 100, 30, true);                                    // reveal column 1, row 0
  const rects = B.fogRects(m.fog);
  const area = rects.reduce((a, [, , w, h]) => a + w * h, 0);
  assert.equal(area, 280 * 140 - 70 * 70);
  assert.deepEqual(rects[0], [0, 0, 70, 70]);                      // left of the revealed square
  assert.deepEqual(rects[1], [140, 0, 140, 70]);                   // a run to its right
});

test("fog: players do not get tokens standing in fog, except characters'", () => {
  const m = B.newMap({ w: 700, h: 350, cell: 70 });
  m.fog = B.newFog(m); m.fog.on = true;
  B.addToken(m, { name: "Guard", x: 105, y: 105, snap: false });
  B.addToken(m, { name: "Wren", x: 245, y: 105, pc: true });
  B.addToken(m, { name: "Door guard", x: 385, y: 105 });
  B.paintFog(m, 385, 105, true);
  assert.deepEqual(B.mapForPlayers(m).tokens.map(t => t.name), ["Wren", "Door guard"]);
  m.fog.on = false;
  assert.equal(B.mapForPlayers(m).tokens.length, 3);
  assert.ok(B.mapForPlayers(m).fog);                               // the fog state itself travels with the map
});

test("measuring counts the larger axis, so a diagonal square is one", () => {
  const m = B.newMap({ cell: 70 });
  assert.equal(B.squaresBetween(m, { x: 0, y: 0 }, { x: 210, y: 210 }), 3);
  assert.equal(B.squaresBetween(m, { x: 0, y: 0 }, { x: 35, y: 0 }), 1);   // half a square rounds up to one
  assert.equal(B.squaresBetween(m, { x: 10, y: 10 }, { x: 10, y: 10 }), 0);
});

/* ---- map pings ---- */
test("a ping stays on the map, belongs to that map, and fades", () => {
  const m = B.newMap({ w: 2100, h: 1400, cell: 70 });
  const p = B.makePing(m, 5000, -20, true, 1000);
  assert.deepEqual([p.x, p.y, p.look, p.rev], [2100, 0, true, m.rev]);
  assert.equal(B.makePing(m, NaN, 3), null); assert.equal(B.makePing(null, 1, 1), null);
  assert.equal(B.pingAlive(p, 1000 + B.PING_MS - 1), true); assert.equal(B.pingAlive(p, 1000 + B.PING_MS), false);
  assert.equal(B.pingFits(p, m), true);
  assert.equal(B.pingFits(p, B.newMap({ w: 2100, h: 1400 })), false);          // another map: ignored
  assert.equal(B.pingFits(p, null), false);
});

test("'look here' centres the view on the spot, keeps its zoom, and never leaves the map", () => {
  const m = B.newMap({ w: 2100, h: 1400 });
  assert.deepEqual(B.centreView({ x: 0, y: 0, w: 700, h: 400 }, m, 1000, 700), { w: 700, h: 400, x: 650, y: 500 });
  assert.deepEqual(B.centreView({ x: 0, y: 0, w: 700, h: 400 }, m, 10, 10), { w: 700, h: 400, x: 0, y: 0 });          // clamped at the corner
  assert.deepEqual(B.centreView({ x: 0, y: 0, w: 700, h: 400 }, m, 2100, 1400), { w: 700, h: 400, x: 1400, y: 1000 });
  assert.deepEqual(B.centreView({ x: 0, y: 0, w: 9999, h: 9999 }, m, 5, 5), { w: 2100, h: 1400, x: 0, y: 0 });        // zoomed all the way out
});

test("room: only the host's ping goes out, and every player gets it", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const got = { a: [], b: [] };
  const gm = new Room({ Peer, handlers: { onLog() {} } });
  const a = new Room({ Peer, handlers: { onLog() {}, onPing: p => got.a.push(p.id) } });
  const b = new Room({ Peer, handlers: { onLog() {}, onPing: p => got.b.push(p.id) } });
  await gm.host("PNG01", "GM"); await a.join("PNG01", "Ana"); await b.join("PNG01", "Ben");
  const ping = B.makePing(B.newMap(), 100, 100, true);
  gm.sendPing(ping); a.sendPing(ping);                                         // a player's call does nothing
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(got, { a: [ping.id], b: [ping.id] });
});

/* ---- player pings ---- */
test("a player's ping carries their name and a colour from it, and can never move anyone's view", () => {
  const m = B.newMap();
  const a = B.makePing(m, 100, 100, true, 0, "Ana"), a2 = B.makePing(m, 5, 5, false, 0, "Ana"), gm = B.makePing(m, 1, 1, true, 0);
  assert.equal(a.who, "Ana"); assert.equal(a.look, false);                     // "look here" is the GM's alone
  assert.equal(a.color, a2.color); assert.ok(B.TOKEN_COLORS.slice(0, -1).includes(a.color));
  assert.equal(gm.look, true); assert.equal(gm.color, "#c9a227"); assert.equal(gm.who, "");
  assert.equal(B.makePing(m, 1, 1, false, 0, "x".repeat(99)).who.length, 30);
  assert.equal(new Set(["Ana", "Ben", "Chen", "Dolores", "Eli"].map(B.pingColor)).size > 1, true);
});

test("room: a player's ping reaches the host, is passed to everyone else but the sender, and is rate-limited", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const seen = { host: [], ana: [], ben: [] };
  let gm;
  gm = new Room({ Peer, handlers: { onLog() {}, onPlayerPing: (pid, name, p) => { seen.host.push([name, p.x, p.y, p.rev]); gm.sendPing({ id: "relay-" + seen.host.length, who: name }, pid); } } });
  const ana = new Room({ Peer, handlers: { onLog() {}, onPing: p => seen.ana.push(p.id) } });
  const ben = new Room({ Peer, handlers: { onLog() {}, onPing: p => seen.ben.push(p.id) } });
  await gm.host("PNG02", "GM"); await ana.join("PNG02", "Ana"); await ben.join("PNG02", "Ben");
  ana.sendPlayerPing(300, 200, "rev1"); ana.sendPlayerPing(310, 210, "rev1");   // the second is inside the half second: dropped
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(seen.host, [["Ana", 300, 200, "rev1"]]);
  assert.deepEqual(seen.ana, []);                                               // not echoed to the sender
  assert.deepEqual(seen.ben, ["relay-1"]);
  gm.sendPlayerPing?.(1, 1, "x");                                               // the host has no such call to make
});
