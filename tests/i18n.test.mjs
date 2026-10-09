import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ES } from "../js/es.mjs";
import { UI_ES } from "../js/ui_es.mjs";
import { ROOM_ES } from "../js/room_es.mjs";
import { BOARD_ES } from "../js/board_es.mjs";
import { HANDOUT_ES } from "../js/handout_es.mjs";
import { setLang, t } from "../js/i18n.mjs";
import { CONDITIONS } from "../js/conditions.mjs";

const all = { ...ES, ...UI_ES, ...ROOM_ES, ...BOARD_ES, ...HANDOUT_ES };
const sources = ["ui.mjs", "engine.mjs", "store.mjs", "voice.mjs", "config.mjs", "boardui.mjs", "handoutui.mjs", "conditions.mjs"].map(f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8"));
const re = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;

test("every English string the app passes to t() has a Spanish entry", () => {
  const missing = [];
  for (const src of sources) for (const m of src.matchAll(re)) {
    if (m[1][0] === "`" && m[1].includes("${")) continue;
    const key = m[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, "\n");
    if (!(key in all)) missing.push(key);
  }
  assert.deepEqual(missing, []);
});

test("Spanish keeps {placeholders} and <b> tags", () => {
  const bad = [];
  for (const [k, v] of Object.entries({ ...UI_ES, ...ROOM_ES, ...BOARD_ES, ...HANDOUT_ES })) {
    const ph = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
    if (ph(k) !== ph(v)) bad.push(k);
  }
  assert.deepEqual(bad, []);
});

test("t() switches language and fills placeholders", () => {
  setLang("es");
  assert.equal(t("Delete {name}?", { name: "Wren" }), "¿Eliminar a Wren?");
  setLang("en");
  assert.equal(t("Delete {name}?", { name: "Wren" }), "Delete Wren?");
});

test("the token colour names are translated", () => {
  for (const c of ["Red", "Orange", "Gold", "Green", "Teal", "Blue", "Purple", "White"]) assert.ok(c in all, c);
});

test("every condition rule is translated", () => {
  for (const [k, c] of Object.entries(CONDITIONS)) assert.ok(c.rule in all, k);
});
