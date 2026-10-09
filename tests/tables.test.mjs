import test from "node:test";
import assert from "node:assert/strict";
import * as X from "../js/tables.mjs";
import { SIN_TEXT_RAW } from "../js/config.mjs";
import { tIn } from "../js/i18n.mjs";

const sinText = (sin, lang, c) => (c ? tIn(lang, SIN_TEXT_RAW[sin].complication) : tIn(lang, sin[0].toUpperCase() + sin.slice(1)));
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test("the manual's generators are all here, each part with items in both languages", () => {
  assert.deepEqual(X.TABLES.map(t => t.id), ["contract", "abnormality", "npc", "complication"]);
  assert.deepEqual(X.tableById("contract").parts.map(p => p.key), ["client", "objective", "seed", "risk"]);
  assert.deepEqual(X.tableById("contract").parts.map(p => p.items.length), [4, 5, 4, 4]);          // Part VIII section 3
  assert.deepEqual(X.tableById("abnormality").parts.map(p => p.items.length), [4, 4, 4]);          // section 7
  for (const t of X.TABLES.filter(t => t.id !== "npc")) for (const p of t.parts) for (const it of p.items) assert.ok("sin" in it || (it.en && it.es), `${t.id}/${p.key}`);
});

test("rolling picks one item per part; the dice decide, and the ends are reachable", () => {
  const c = X.tableById("contract");
  assert.deepEqual(X.roll(c, () => 0), { client: 0, objective: 0, seed: 0, risk: 0 });
  assert.deepEqual(X.roll(c, () => 0.999999), { client: 3, objective: 4, seed: 3, risk: 3 });
  assert.equal(X.roll(c, () => 1).risk, 3);                                                         // never past the end
  assert.deepEqual(X.roll(c, () => 0, { objective: 2 }).objective, 2);                              // a kept part stays
  assert.equal(X.rollPart(c.parts[1], seq(0.5)), 2);
});

test("a result reads in the reader's language", () => {
  const c = X.tableById("contract"), picks = X.roll(c, () => 0);
  assert.equal(X.itemText(X.itemOf(c, picks, "client"), "en", sinText), "An Office manager");
  assert.equal(X.itemText(X.itemOf(c, picks, "client"), "es", sinText), "Un gerente de la Oficina");
});

test("Sin Complications are the manual's text, in either language", () => {
  const t = X.tableById("complication"), picks = X.roll(t, () => 0);                               // wrath
  assert.match(X.itemText(X.itemOf(t, picks, "sin"), "en", sinText), /^Collateral:/);
  assert.match(X.itemText(X.itemOf(t, picks, "sin"), "es", sinText), /^Colateral|Daño colateral/i);
  assert.equal(t.parts[0].items.length, 7);
});

test("the NPC seed draws from the Bestiary and may leave the Sin empty", () => {
  const n = X.tableById("npc");
  assert.ok(n.parts[0].items.length >= 30);
  const none = X.roll(n, () => 0);                                                                 // first Sin item is "None"
  assert.equal(X.itemText(X.itemOf(n, none, "sin"), "en", sinText), "None");
  const wrath = X.roll(n, () => 0.2);                                                              // 8 items: index 1 = wrath
  assert.equal(X.itemText(X.itemOf(n, wrath, "sin"), "en", sinText), "Wrath");
  assert.equal(X.itemText(X.itemOf(n, wrath, "sin"), "es", sinText), tIn("es", "Wrath"));
});
