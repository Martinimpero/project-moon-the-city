import test from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, search, cellParts } from "../js/screen.mjs";
import { tIn } from "../js/i18n.mjs";
import { npcDice, npcDifficulty } from "../js/rules.mjs";

const strings = [];
for (const s of SECTIONS) { strings.push(s.title); for (const b of s.blocks) { if (b.p) strings.push(b.p); else { strings.push(...b.head); for (const r of b.rows) strings.push(...r); } } }

test("every string on the screen has a Spanish version", () => {
  const known = k => tIn("es", k) !== k;
  const missing = strings.filter(s => /[A-Za-z]/.test(s) && !cellParts(s, known).every(known));
  assert.deepEqual([...new Set(missing)], []);
});

test("Spanish keeps the **bold** marks and numbers of the English", () => {
  for (const s of strings.filter(x => x.length > 30)) {
    const es = tIn("es", s).replace(/[−–]/g, "-");        // the Spanish manual writes a true minus sign and en dashes in ranges
    assert.equal((es.match(/\*\*/g) ?? []).length, (s.match(/\*\*/g) ?? []).length, s.slice(0, 40));
    assert.deepEqual((s.match(/[+-]\d/g) ?? []).sort(), (es.match(/[+-]\d/g) ?? []).sort(), s.slice(0, 50));
  }
});

test("the Threat Grade table agrees with the rules the app uses", () => {
  const rows = SECTIONS.find(s => s.id === "threat").blocks[0].rows;
  for (const [grades, diff, dice] of rows) {
    const top = Number(grades.split("-")[0]);
    assert.equal(npcDifficulty(top), Number(diff)); assert.equal(npcDice(top, false), Number(dice));
  }
});

test("search finds a rule in either language and keeps only the matching rows", () => {
  const tr = k => tIn("es", k);
  assert.equal(search("", tr).length, SECTIONS.length);
  const wheel = search("gluttony", k => k).find(s => s.id === "sins");
  assert.ok(wheel && wheel.shown.some(b => b.rows && b.rows.every(r => r.some(c => /gluttony/i.test(c)))));
  assert.ok(search("Último Recurso", tr).some(s => s.id === "ego"));                           // Spanish words match through the translation
  assert.deepEqual(search("zzzz", tr), []);
  assert.equal(search("core roll", k => k)[0].shown.length, SECTIONS[0].blocks.length);       // a title match shows the whole section
});
