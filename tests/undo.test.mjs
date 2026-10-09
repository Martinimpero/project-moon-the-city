import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as U from "../js/undo.mjs";
import * as E from "../js/engine.mjs";
import { tIn } from "../js/i18n.mjs";

const snap = (o, log = []) => JSON.stringify({ kind: "project-moon-save", lang: "en", sound: { on: true }, name: "GM", seenWarning: false, selected: "a", actors: [{ id: "a", name: "Dax", n: o }], log });

test("undo goes back one change and keeps the log as it is", () => {
  const stack = U.newStack();
  U.push(stack, "Roll", snap(1, []));                                  // before the roll
  const now = snap(2, [{ id: "c1", html: "card" }]);                    // after: the roll changed Dax and added a card
  const r = U.pop(stack, now);
  assert.equal(r.label, "Roll");
  const back = JSON.parse(r.json);
  assert.equal(back.actors[0].n, 1); assert.deepEqual(back.log.map(e => e.id), ["c1"]);     // sheet restored, the card everyone saw stays
  assert.equal(U.pop(stack, r.json), null);
});

test("an action that changed nothing (a cancelled dialog) is skipped", () => {
  const stack = U.newStack();
  U.push(stack, "Roll", snap(1)); U.push(stack, "Roll", snap(1)); U.push(stack, "Clock change", snap(1));
  const cur = snap(2, [{ id: "x" }]);
  assert.equal(U.peek(stack, cur), "Clock change");
  const only = U.newStack(); U.push(only, "Roll", snap(2)); assert.equal(U.peek(only, snap(2)), ""); assert.equal(U.pop(only, snap(2)), null);
});

test("several undos walk back in order", () => {
  const stack = U.newStack(); const states = [1, 2, 3, 4].map(n => snap(n));
  for (let i = 0; i < 3; i++) U.push(stack, "Step " + (i + 1), states[i]);
  let cur = states[3], seen = [];
  for (let r; (r = U.pop(stack, cur));) { seen.push([r.label, JSON.parse(r.json).actors[0].n]); cur = r.json; }
  assert.deepEqual(seen, [["Step 3", 3], ["Step 2", 2], ["Step 1", 1]]);
});

test("the stack is limited in steps and in size", () => {
  const stack = U.newStack();
  for (let i = 0; i < 40; i++) U.push(stack, "x", snap(i));
  assert.equal(stack.length, U.MAX_STEPS);
  const big = U.newStack(); const huge = JSON.stringify({ actors: [], pad: "x".repeat(9_000_000) });
  for (let i = 0; i < 5; i++) U.push(big, "big", huge);
  assert.ok(big.length <= 2);
  U.push(big, "bad", undefined); assert.ok(big.length <= 3);
});

test("a language, name or sound change is not undone along with a game change", () => {
  const stack = U.newStack(); U.push(stack, "Roll", snap(1));
  const cur = JSON.stringify({ ...JSON.parse(snap(2)), lang: "es", name: "Ana", sound: { on: false } });
  const back = JSON.parse(U.pop(stack, cur).json);
  assert.deepEqual([back.lang, back.name, back.sound.on], ["es", "Ana", false]);
});

test("every name the Undo button can show has a Spanish version", () => {
  const src = fs.readFileSync(new URL("../js/ui.mjs", import.meta.url), "utf8");
  const block = /const UNDO_LABEL = \{([\s\S]*?)\n\};/.exec(src)[1];
  const labels = [...new Set([...block.matchAll(/:\s*"([^"]+)"/g)].map(m => m[1]))];
  assert.ok(labels.length > 15);
  assert.deepEqual(labels.filter(l => tIn("es", l) === l), []);
});

test("a secret roll is a card with the dice and the result, and honours the limits", () => {
  const seq = [9, 8, 2]; let i = 0;
  const html = E.secretRoll({ label: "the guard <b>notices</b>", dice: 3, difficulty: 2 }, () => seq[i++]);
  assert.match(html, /Secret roll: the guard &lt;b&gt;notices&lt;\/b&gt;/); assert.match(html, /3 dice/); assert.match(html, /2 Successes/); assert.match(html, /pm-band success/);
  const miss = E.secretRoll({ dice: 2, difficulty: 3 }, () => 1);
  assert.match(miss, /0 Successes/); assert.match(miss, /criticalFailure/);
  assert.match(E.secretRoll({ dice: 999 }, () => 5), /20 dice/);
  assert.match(E.secretRoll({ dice: "x", difficulty: 99 }, () => 5), /Difficulty 6/);
});
