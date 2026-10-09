import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as P from "../js/portrait.mjs";
import * as S from "../js/store.mjs";
import * as KIT from "../js/kit.mjs";
import * as BD from "../js/backup.mjs";
import { newActor, normalizeActor } from "../js/model.mjs";
import { TOKENS } from "../js/maplist.mjs";
import { Room } from "../js/room.mjs";

const DOT = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/";
const DOT2 = DOT.replace("/9j/4AAQ", "/9j/4BBQ");

test("only a bundled picture or a small image is kept; anything else is dropped", () => {
  assert.equal(P.clean("tokens/PC_Dax_Verrin.png"), "tokens/PC_Dax_Verrin.png");
  assert.equal(P.clean(DOT), DOT);
  for (const bad of ["", null, undefined, 42, "http://evil.example/x.png", "tokens/../../etc/passwd.png", "tokens/a b.png", "javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64," + "A".repeat(P.MAX_DATA)]) assert.equal(P.clean(bad), "", String(bad).slice(0, 30));
  assert.equal(P.cleanId("iabc123"), "iabc123"); assert.equal(P.cleanId("<x>"), ""); assert.equal(P.cleanId("a".repeat(40)), "");
});

test("a picture's id is its own: the same picture, the same id; another picture, another id", () => {
  assert.equal(P.idOf(DOT), P.idOf(DOT)); assert.notEqual(P.idOf(DOT), P.idOf(DOT2));
  assert.match(P.idOf(DOT), /^i[a-z0-9]+$/); assert.ok(P.cleanId(P.idOf(DOT)));
});

test("a big picture is fitted to its longest side, never enlarged", () => {
  assert.deepEqual(P.fitSize(1000, 500, 320), { w: 320, h: 160 });
  assert.deepEqual(P.fitSize(500, 1000, 320), { w: 160, h: 320 });
  assert.deepEqual(P.fitSize(100, 80, 320), { w: 100, h: 80 });
  assert.deepEqual(P.fitSize(0, 0, 320), { w: 1, h: 1 });
  assert.ok(P.STEPS.every(([max, q], i, a) => !i || max <= a[i - 1][0] && q <= a[i - 1][1] || max < a[i - 1][0]));      // each try is smaller or lower quality than the last
});

test("on its way through a room a chosen picture is replaced by its id; bundled art keeps its path", () => {
  const a = newActor("character", "Ana"); a.portrait = DOT;
  const out = P.forSync(a);
  assert.equal(out.portrait, undefined); assert.equal(out.portraitId, P.idOf(DOT)); assert.ok(JSON.stringify(out).length < 2000);
  const art = newActor("npc", "Marl"); art.portrait = "tokens/NPC_Marl_Vessey.png";
  assert.equal(P.forSync(art).portrait, "tokens/NPC_Marl_Vessey.png"); assert.equal(P.forSync(art).portraitId, undefined);
  assert.equal(P.forSync(newActor("character", "None")).portraitId, undefined);
  assert.equal(a.portrait, DOT);                                                       // the original is untouched
});

test("a sheet received with an id shows the picture the room sent for it, and only a picture that matches its id is accepted", () => {
  const cache = new Map();
  const a = normalizeActor({ type: "character", name: "Ana", portraitId: P.idOf(DOT) });
  assert.equal(P.srcOf(a, cache), "");                                                 // not arrived yet: no picture, no error
  assert.equal(P.remember(cache, P.idOf(DOT), DOT), true); assert.equal(P.srcOf(a, cache), DOT);
  assert.equal(P.remember(cache, P.idOf(DOT), DOT2), false);                           // a sheet cannot be given another picture
  assert.equal(P.remember(cache, "iwhatever", "javascript:alert(1)"), false);
  for (let i = 0; i < 120; i++) { const d = DOT + "A".repeat(i + 1); P.remember(cache, P.idOf(d), d, 100); }
  assert.ok(cache.size <= 100);
});

test("an actor keeps its picture through saving; junk in a save is dropped; older saves have none", () => {
  const a = newActor("character", "Ana"); a.portrait = DOT;
  S.state.actors = [a];
  const text = JSON.stringify(S.exportData()); S.state.actors = []; S.importData(text);
  assert.equal(S.state.actors[0].portrait, DOT);
  const raw = JSON.parse(text); raw.actors[0].portrait = "http://evil.example/x.png"; S.importData(JSON.stringify(raw));
  assert.equal(S.state.actors[0].portrait, "");
  S.importData(JSON.stringify({ actors: [{ type: "npc", name: "Old", system: {} }] }));
  assert.equal(S.state.actors[0].portrait, "");
  assert.equal(BD.characterFile(a).actor.portrait, DOT);                               // a character file carries it too
});

test("the pregenerated characters and the Session 01 kit come with the app's own art, and every file exists", () => {
  S.state.actors = [];
  S.importPregens();
  assert.deepEqual(S.state.actors.map(a => a.portrait), ["Wren_Okoro", "Dax_Verrin", "Lena_Hart", "Tomas_Quill"].map(n => `tokens/PC_${n}.png`));
  const kit = KIT.parseKit(fs.readFileSync(new URL("../kits/session01.json", import.meta.url), "utf8"));
  const st = { actors: [], scenes: [], handouts: [], notes: [], journal: [], clocks: [], tracker: { slots: [], active: false, exchange: 1 }, sceneId: "", viewId: "" };
  KIT.applyKit(st, kit, { mode: "add" });
  assert.equal(st.actors.find(a => a.name === "Marl Vessey").portrait, "tokens/NPC_Marl_Vessey.png");
  for (const a of [...st.actors, ...S.state.actors]) assert.ok(TOKENS.includes(a.portrait.replace(/^tokens\//, "").replace(/\.png$/, "")), a.name);
  for (const a of S.state.actors) assert.ok(fs.existsSync(new URL(`../${a.portrait}`, import.meta.url)), a.portrait);
});

function hub() {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  return class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  };
}
const tick = () => new Promise(r => setTimeout(r, 30));

test("room: a player's picture goes to the host once, reaches the other players, and a late joiner gets it on arriving; a wrong picture is refused", async () => {
  const Peer = hub(), got = { gm: [], ben: [], cy: [] };
  const mk = who => new Room({ Peer, handlers: { onLog() {}, onImage: (id, src) => got[who].push(id) } });
  const gm = mk("gm"), ana = mk("ana"), ben = mk("ben"), cy = mk("cy"); got.ana = [];
  await gm.host("IMG01", "GM"); await ana.join("IMG01", "Ana"); await ben.join("IMG01", "Ben"); await tick();
  assert.equal(ana.sendImage(P.idOf(DOT), DOT), true); await tick();
  assert.deepEqual(got.gm, [P.idOf(DOT)]); assert.deepEqual(got.ben, [P.idOf(DOT)]); assert.deepEqual(got.ana, []);      // not sent back to the one who sent it
  await cy.join("IMG01", "Cy"); await tick();
  assert.deepEqual(got.cy, [P.idOf(DOT)]);                                                                              // a late joiner gets what the host holds
  assert.equal(ana.sendImage("inotmine", DOT), false); assert.equal(ana.sendImage(P.idOf("data:text/html;base64,AAAA"), "data:text/html;base64,AAAA"), false);
  ana.hostConn.send({ k: "img", id: "iforged", src: DOT }); await tick();
  assert.equal(got.gm.length, 1);                                                                                       // the host ignores a picture whose id is not its own
  assert.equal(gm.sendImage(P.idOf(DOT2), DOT2), true); await tick();
  assert.ok(got.ben.includes(P.idOf(DOT2)));                                                                            // the host's own pictures go to everyone
  for (const r of [gm, ana, ben, cy]) r.leave();
});

test("the sheet a player sends carries a short id, not the picture", () => {
  const a = newActor("character", "Ana"); a.portrait = DOT.padEnd(60000, "A");        // a large picture
  assert.ok(P.isData(a.portrait));
  assert.ok(JSON.stringify(P.forSync(a)).length < JSON.stringify(a).length / 4);
});
