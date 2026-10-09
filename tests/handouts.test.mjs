import test from "node:test";
import assert from "node:assert/strict";
import * as H from "../js/handouts.mjs";
import { Room } from "../js/room.mjs";
import * as S from "../js/store.mjs";
import { tIn } from "../js/i18n.mjs";
import { soundForHtml } from "../js/sfx.mjs";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

test("players get title, text and picture, never the GM's flags", () => {
  const a = H.newHandout({ title: "Manifest", text: "Crate 4", img: "data:x" }), b = H.newHandout({ title: "Secret" });
  a.shown = true;
  const list = H.shownList([a, b]);
  assert.deepEqual(list.map(h => h.title), ["Manifest"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["alt", "id", "img", "lang", "text", "title"]);
});

test("titles and text are capped", () => {
  const h = H.newHandout({ title: "x".repeat(300), text: "y".repeat(H.MAX_TEXT + 50) });
  assert.equal(h.title.length, 80);
  assert.equal(h.text.length, H.MAX_TEXT);
});

test("text becomes safe paragraphs with light emphasis", () => {
  const html = H.textToHtml("Dear <b>Fixer</b>,\nmeet **me** at *dusk*.\n\nSigned.", esc);
  assert.match(html, /^<p>Dear &lt;b&gt;Fixer&lt;\/b&gt;,<br>meet <b>me<\/b> at <i>dusk<\/i>\.<\/p><p>Signed\.<\/p>$/);
  assert.equal(H.textToHtml("", esc), "");
  assert.doesNotMatch(H.textToHtml("<script>alert(1)</script>", esc), /<script>/);
});

test("the contract template has the paperwork fields, in both languages", () => {
  const c = H.contractTemplate(tIn, "en");
  assert.equal(c.title, "Contract"); assert.equal(c.lang, "en");
  assert.ok(c.text.startsWith("Client: \nRisk: "));
  assert.equal(c.alt.title, "Contrato");
  assert.ok(c.alt.text.startsWith("Cliente: \nRiesgo: "));
  const es = H.contractTemplate(tIn, "es");
  assert.equal(es.lang, "es"); assert.equal(es.title, "Contrato"); assert.equal(es.alt.title, "Contract");
});

test("a Spanish reader gets the Spanish version, an English reader the English one, and a one-language handout falls back", () => {
  const h = H.newHandout({ title: "Manifest", text: "Crate 4", lang: "en", alt: { title: "Manifiesto", text: "Caja 4" } });
  assert.deepEqual(H.pick(h, "es"), { lang: "es", title: "Manifiesto", text: "Caja 4", translated: true, both: true });
  assert.deepEqual(H.pick(h, "en"), { lang: "en", title: "Manifest", text: "Crate 4", translated: true, both: true });
  const solo = H.newHandout({ title: "Note", text: "Only English", lang: "en" });
  assert.deepEqual(H.pick(solo, "es"), { lang: "en", title: "Note", text: "Only English", translated: false, both: false });
  const spanishMain = H.newHandout({ title: "Nota", text: "Texto", lang: "es", alt: { text: "Text" } });
  assert.equal(H.pick(spanishMain, "en").text, "Text");
  assert.equal(H.pick(spanishMain, "en").title, "Nota");                   // no alt title: keeps the main one
  assert.equal(H.versionIn(solo, "es"), null);
  assert.equal(H.versionIn(h, "es").title, "Manifiesto");
});

test("older handouts without a language or a second version still work", () => {
  const old = { id: "x", title: "Old", text: "t", img: "", shown: true };
  H.normalizeHandout(old);
  assert.deepEqual([old.lang, old.alt], ["en", { title: "", text: "" }]);
  assert.equal(H.pick(old, "es").translated, false);
  S.state.actors = []; S.state.handouts = [{ id: "y", title: "Legacy", text: "", img: "", shown: false }];
  const text = JSON.stringify(S.exportData()); S.state.handouts = []; S.importData(text);
  assert.equal(S.state.handouts[0].lang, "en");
});

test("both versions travel to players, and a Spanish handout list is read in Spanish", () => {
  const h = Object.assign(H.newHandout({ title: "A", text: "x", lang: "en", alt: { title: "B", text: "y" } }), { shown: true });
  const sent = H.forPlayers(h);
  assert.equal(H.pick(sent, "es").title, "B");
});

test("handouts survive export and import, junk is dropped", () => {
  S.state.actors = []; S.state.handouts = [Object.assign(H.newHandout({ title: "A" }), { shown: true })];
  const text = JSON.stringify(S.exportData());
  S.state.handouts = [];
  S.importData(text);
  assert.equal(S.state.handouts.length, 1);
  assert.equal(S.state.handouts[0].shown, true);
  const raw = JSON.parse(text); raw.handouts.push(null, { nope: 1 });
  S.importData(JSON.stringify(raw));
  assert.equal(S.state.handouts.length, 1);
});

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

test("room: shown handouts reach players live and on joining; taking one back removes it", async () => {
  const Peer = hub();
  const shown = [{ id: "h1", title: "Manifest", text: "Crate 4", img: "" }];
  const gm = new Room({ Peer, handlers: { onLog() {}, hostHandouts: () => shown } });
  const got = [], gone = [];
  const mk = () => new Room({ Peer, handlers: { onLog() {}, onHandout: h => got.push(h.id), onUnhandout: id => gone.push(id) } });
  const early = mk(), late = mk();
  await gm.host("HND01", "GM"); await early.join("HND01", "Ana"); await tick();
  assert.deepEqual(got, ["h1"]);                                   // already shown when they joined
  gm.sendHandout({ id: "h2", title: "Note", text: "", img: "" }); await tick();
  assert.deepEqual(got, ["h1", "h2"]);
  gm.sendUnhandout("h2"); await tick();
  assert.deepEqual(gone, ["h2"]);
  await late.join("HND01", "Ben"); await tick();
  assert.equal(got.length, 3);                                     // h1 again, for Ben
});

test("the 'GM shows a handout' card carries both languages so each reader sees their own", () => {
  const h = H.newHandout({ title: "Contrato", text: "x", lang: "es", alt: { title: "Contract", text: "y" } });
  const html = H.announceHtml(h, tIn, esc);
  assert.match(html, /data-bi/);
  assert.match(html, /<span lang="en">The GM shows a handout<\/span><span lang="es">El DJ muestra un documento<\/span>/);
  assert.match(html, /<span lang="en">Contract<\/span><span lang="es">Contrato<\/span>/);      // the title in each language
  const solo = H.announceHtml(H.newHandout({ title: "Note <b>", text: "x" }), tIn, esc);
  assert.match(solo, /<b>Note &lt;b&gt;<\/b>/);                                                // one language: just the title, escaped
  assert.equal(soundForHtml(html).kind, "handout");
});

/* ---- private handouts ---- */
test("a handout shown to named players is visible to them only, by name and not by connection", () => {
  const h = Object.assign(H.newHandout({ title: "Secret" }), { shown: true, to: ["Ana", " ben ", "ANA"] });
  H.normalizeHandout(h);
  assert.deepEqual(h.to, ["ana", "ben"]);                                   // trimmed, lower case, no repeats
  assert.equal(H.isPrivate(h), true);
  assert.equal(H.visibleTo(h, "Ana"), true); assert.equal(H.visibleTo(h, "BEN"), true); assert.equal(H.visibleTo(h, "Cy"), false);
  assert.equal(H.visibleTo({ ...h, shown: false }, "Ana"), false);
  assert.deepEqual(H.sharedWith(h, ["Ana", "Cy", "Ben"]), ["Ana", "Ben"]);
  const open = Object.assign(H.newHandout({ title: "Open" }), { shown: true });
  assert.equal(H.isPrivate(open), false); assert.equal(H.visibleTo(open, "Anyone"), true);
  assert.deepEqual(H.sharedWith(open, ["Ana", "Cy"]), ["Ana", "Cy"]);
  assert.deepEqual(H.shownListFor([h, open], "Cy").map(x => x.title), ["Open"]);
  assert.deepEqual(H.shownListFor([h, open], "Ana").map(x => x.title), ["Secret", "Open"]);
  assert.equal("to" in H.forPlayers(h), false);                              // players never learn who else was shown it
});

test("older saves have no audience (everyone), and a private handout survives saving", () => {
  S.state.actors = []; S.state.handouts = [{ id: "z", title: "Old", text: "", img: "", shown: true }];
  const text = JSON.stringify(S.exportData()); S.state.handouts = []; S.importData(text);
  assert.deepEqual(S.state.handouts[0].to, []);
  S.state.handouts = [Object.assign(H.newHandout({ title: "P" }), { shown: true, to: ["ana"] })];
  const t2 = JSON.stringify(S.exportData()); S.state.handouts = []; S.importData(t2);
  assert.deepEqual(S.state.handouts[0].to, ["ana"]);
});

test("room: a private handout goes to the named players only, on the spot and when they reconnect", async () => {
  const Peer = hub();
  const handouts = [Object.assign(H.newHandout({ title: "For Ana" }), { id: "p1", shown: true, to: ["ana"] }), Object.assign(H.newHandout({ title: "For all" }), { id: "p2", shown: true })];
  const gm = new Room({ Peer, handlers: { onLog() {}, hostHandouts: name => H.shownListFor(handouts, name) } });
  const got = { ana: [], ben: [] };
  const mk = who => new Room({ Peer, handlers: { onLog() {}, onHandout: h => got[who].push(h.id), onUnhandout: id => got[who].push("-" + id) } });
  const ana = mk("ana"), ben = mk("ben");
  await gm.host("PRV01", "GM"); await ana.join("PRV01", "Ana"); await ben.join("PRV01", "Ben");
  await tick();
  assert.deepEqual(got.ana.sort(), ["p1", "p2"]); assert.deepEqual(got.ben, ["p2"]);     // on joining, each gets only theirs
  gm.sendHandout({ id: "p3", title: "Just Ben" }, ["Ben"]); await tick();
  assert.deepEqual(got.ben.at(-1), "p3"); assert.equal(got.ana.includes("p3"), false);
  gm.sendUnhandout("p1", ["Ana"]); await tick();
  assert.equal(got.ana.at(-1), "-p1"); assert.equal(got.ben.includes("-p1"), false);       // taking it back from one player does not tell the others
  gm.sendHandout({ id: "p4", title: "Nobody home" }, ["Zed"]); await tick();
  assert.equal(got.ana.includes("p4") || got.ben.includes("p4"), false);                   // a name nobody has: nobody gets it
});
