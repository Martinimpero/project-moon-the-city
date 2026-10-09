import test from "node:test";
import assert from "node:assert/strict";
import * as J from "../js/journal.mjs";
import * as E from "../js/engine.mjs";
import { bilingual, bilingualHtml } from "../js/i18n.mjs";
import { newActor } from "../js/model.mjs";
import * as S from "../js/store.mjs";

test("anyone can add; the author is who the host says, never what the entry claims", () => {
  const list = [];
  const r = J.applyOp(list, "add", { title: "The shipment", text: "Crate 4 is not what it says.", author: "Someone Else", kind: "recap", pinned: true }, "Ana", { gm: false });
  assert.equal(r.ok, true); assert.equal(list.length, 1);
  assert.deepEqual([list[0].author, list[0].kind, list[0].pinned], ["Ana", "note", false]);             // a player cannot sign as another, make a recap, or pin
  const gm = J.applyOp(list, "add", { title: "Recap", text: "x", kind: "recap" }, "GM", { gm: true });
  assert.equal(gm.entry.kind, "recap");
});

test("you can change or remove your own; the GM can change, remove or pin any", () => {
  const list = [];
  const mine = J.applyOp(list, "add", { title: "Mine", text: "a" }, "Ana", {}).entry;
  assert.equal(J.applyOp(list, "edit", { id: mine.id, title: "Hacked", text: "b" }, "Ben", {}).ok, false);
  assert.equal(J.applyOp(list, "del", { id: mine.id }, "Ben", {}).ok, false);
  assert.equal(J.applyOp(list, "pin", { id: mine.id }, "Ana", {}).ok, false);
  assert.equal(J.applyOp(list, "edit", { id: mine.id, title: "Mine, better", text: "b" }, "ana", {}).ok, true);       // names compare without case
  assert.deepEqual([list[0].title, list[0].text], ["Mine, better", "b"]);
  assert.equal(J.applyOp(list, "pin", { id: mine.id }, "GM", { gm: true }).ok, true); assert.equal(list[0].pinned, true);
  assert.equal(J.applyOp(list, "edit", { id: mine.id, title: "GM fix", text: "c" }, "GM", { gm: true }).ok, true);
  assert.equal(J.applyOp(list, "del", { id: mine.id }, "Ana", {}).ok, true); assert.equal(list.length, 0);
  assert.equal(J.applyOp(list, "del", { id: "nope" }, "GM", { gm: true }).ok, false);
  assert.equal(J.applyOp(list, "add", null, "Ana", {}).ok, false);
});

test("entries are capped in size and number; pinned ones are the last to go", () => {
  const list = [];
  const big = J.applyOp(list, "add", { title: "t".repeat(500), text: "x".repeat(9000) }, "Ana", {}).entry;
  assert.equal(big.title.length, J.MAX_TITLE); assert.equal(big.text.length, J.MAX_TEXT);
  const keep = list[0]; keep.pinned = true;
  for (let i = 0; i < J.MAX_ENTRIES + 5; i++) J.applyOp(list, "add", { title: `n${i}` }, "Ana", {});
  assert.equal(list.length, J.MAX_ENTRIES); assert.ok(list.includes(keep));
  assert.equal(J.applyOp([], "add", { title: "   " }, "Ana", {}).entry.title, "Untitled");
});

test("a received or saved list is repaired", () => {
  const out = J.cleanList([null, { nope: 1 }, { id: "a", title: "T", text: "x", author: "Ana", at: 5, kind: "weird", pinned: 1 }, "junk"]);
  assert.deepEqual(out, [{ id: "a", title: "T", text: "x", author: "Ana", at: 5, kind: "note", pinned: true }]);
  assert.deepEqual(J.cleanList("nope"), []);
});

test("pinned first, then newest first", () => {
  const l = [{ id: "1", at: 1, pinned: false }, { id: "2", at: 3, pinned: false }, { id: "3", at: 2, pinned: true }];
  assert.deepEqual(J.sorted(l).map(e => e.id), ["3", "2", "1"]);
});

test("private notes stay a plain list with their own limits", () => {
  const notes = [];
  const n = J.addNote(notes, { title: "Idea", text: "Ask Tabbi" });
  assert.equal(notes.length, 1); assert.equal(J.editNote(notes, n.id, { title: "Idea 2", text: "x" }).title, "Idea 2");
  assert.equal(J.removeNote(notes, n.id), true); assert.equal(J.removeNote(notes, n.id), false);
});

test("a recap starts from the last log cards, in the reader's language", () => {
  const dax = newActor("character", "Dax", { attributes: { body: 4, mind: 1, presence: 1, resolve: 2 }, skills: { combat: 3 } });
  const draft = bilingual(() => E.rollDraft(dax, { attribute: "body", skill: "combat", difficulty: 2, opposition: 0, tag: "", target: "", context: "other", gear: "", ego: 0, help: 0, modifier: 0, bond: "", borrowedFace: false }, null, () => 9));
  const card = bilingualHtml(bilingual(() => E.commitRoll(dax, draft)).html);
  const log = [{ html: "<div class=\"pm-card\"><div class=\"pm-card-head\">Room open</div></div>" }, { html: card }, { html: "" }];
  const en = J.logLines(log, "en"), es = J.logLines(log, "es");
  assert.ok(en.some(l => /Dax .*Combat.*(Critical|Success)/i.test(l)), en.join("|"));
  assert.ok(es.some(l => /Dax .*Combate.*(Éxito|Crítico)/i.test(l)), es.join("|"));
  assert.equal(J.logLines([], "en").length, 0);
  const text = J.recapText(k => k, { lines: en, scenes: ["Backstreet"], handouts: ["Coldwater Contract"] });
  assert.match(text, /^What happened\n- Dax/); assert.match(text, /Scenes\n- Backstreet/); assert.match(text, /Open threads\n- $/m);
});

test("the party journal and private notes survive saving", () => {
  S.state.actors = []; S.state.journal = []; S.state.notes = [];
  J.applyOp(S.state.journal, "add", { title: "Clue", text: "Marl owes the Row." }, "GM", { gm: true });
  J.addNote(S.state.notes, { title: "Private", text: "Do not tell" });
  const text = JSON.stringify(S.exportData());
  S.state.journal = []; S.state.notes = []; S.importData(text);
  assert.equal(S.state.journal.length, 1); assert.equal(S.state.notes[0].title, "Private");
  S.importData(JSON.stringify({ actors: [] }));
  assert.deepEqual([S.state.journal, S.state.notes], [[], []]);
});

/* ---- the room carries the journal ---- */
import { Room } from "../js/room.mjs";
test("room: a new player gets the journal on joining; a player's change goes to the host, which signs it and tells everyone", async () => {
  const peers = new Map(); let n = 0;
  class Em { constructor() { this.l = {}; } on(e, f) { (this.l[e] ??= []).push(f); } emit(e, ...a) { (this.l[e] ?? []).forEach(f => f(...a)); } }
  class Conn extends Em { constructor(p) { super(); this.peer = p; } send(m) { const o = this.other; queueMicrotask(() => o.emit("data", JSON.parse(JSON.stringify(m)))); } close() { } }
  class Peer extends Em {
    constructor(id) { super(); this.id = id ?? `p${++n}`; queueMicrotask(() => { peers.set(this.id, this); this.emit("open", this.id); }); }
    connect(t) { const m = new Conn(t); queueMicrotask(() => { const th = new Conn(this.id); m.other = th; th.other = m; peers.get(t).emit("connection", th); m.emit("open"); }); return m; }
    destroy() { peers.delete(this.id); }
  }
  const tick = () => new Promise(r => setTimeout(r, 25));
  const journal = [];
  J.applyOp(journal, "add", { title: "Welcome", text: "x" }, "GM", { gm: true });
  let gm;
  gm = new Room({ Peer, handlers: { onLog() {}, hostJournal: () => journal, onJournalOp: (name, op, entry) => { const r = J.applyOp(journal, op, entry, name, { gm: false }); if (r.ok) gm.sendJournal(journal); } } });
  const seen = { ana: [], ben: [] };
  const mk = who => new Room({ Peer, handlers: { onLog() {}, onJournal: list => seen[who].push(list.map(e => `${e.title}/${e.author}`)) } });
  const ana = mk("ana"), ben = mk("ben");
  await gm.host("JRN01", "GM"); await ana.join("JRN01", "Ana"); await ben.join("JRN01", "Ben"); await tick();
  assert.deepEqual(seen.ana[0], ["Welcome/GM"]);                                           // on joining
  ana.sendJournalOp("add", { title: "A clue", text: "Tabbi knows", author: "Ben" }); await tick();
  assert.deepEqual(seen.ben.at(-1), ["Welcome/GM", "A clue/Ana"]);                           // signed by who sent it, not by what it said
  assert.deepEqual(seen.ana.at(-1), seen.ben.at(-1));
  const id = journal[1].id;
  ben.sendJournalOp("del", { id }); await tick();
  assert.equal(journal.length, 2);                                                           // Ben cannot remove Ana's
  ana.sendJournalOp("edit", { id, title: "A better clue", text: "y" }); await tick();
  assert.equal(journal[1].title, "A better clue");
});

test("recap lines keep the right language for handout cards and say what a plain card was about", () => {
  const card = '<div class="pm-card pm-handout" data-bi><div class="pm-card-head"><span lang="en">The GM shows a handout</span><span lang="es">El DJ muestra un documento</span></div><div class="pm-notes"><p><b><span lang="en">Contract</span><span lang="es">Contrato</span></b></p></div></div>';
  assert.deepEqual(J.logLines([{ html: card }], "en"), ["The GM shows a handout: Contract"]);
  assert.deepEqual(J.logLines([{ html: card }], "es"), ["El DJ muestra un documento: Contrato"]);
});
