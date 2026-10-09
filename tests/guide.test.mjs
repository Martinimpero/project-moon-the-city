import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tIn } from "../js/i18n.mjs";

// the guide is one HTML file; read its content table without a browser
const html = fs.readFileSync(new URL("../guia/index.html", import.meta.url), "utf8").split("\r").join("");
const start = html.indexOf("const PAGES = ["), end = html.indexOf("\n];\n", start) + 3;
const GROUPS = new Function(`${html.slice(html.indexOf("const GROUPS"), html.indexOf("// A button name differs"))}; return GROUPS;`)();
const PAGES = new Function(`${html.slice(start, end)}; return PAGES;`)();

const texts = [];                                    // every { lang, text } string of the guide
const walk = (v, lang) => { if (typeof v === "string") texts.push({ lang, text: v }); else if (Array.isArray(v)) v.forEach(x => walk(x, lang)); };
for (const p of PAGES) for (const lang of ["es", "en"]) {
  for (const k of ["title", "lead"]) if (p[k]) walk(p[k][lang], lang);
  for (const k of ["steps", "list"]) if (p[k]) walk(p[k][lang], lang);
  if (p.table) { walk(p.table.head[lang], lang); p.table.rows[lang].forEach(r => walk(r, lang)); }
  for (const n of p.notes ?? []) walk(n[lang], lang);
}

test("every page has a title and a lead in both languages, a real group and a unique id", () => {
  const ids = new Set();
  for (const p of PAGES) {
    assert.ok(!ids.has(p.id), p.id); ids.add(p.id);
    assert.ok(GROUPS[p.group], p.id);
    for (const lang of ["es", "en"]) { assert.ok(p.title[lang]?.length > 2, `${p.id} title ${lang}`); assert.ok(p.lead[lang]?.length > 5, `${p.id} lead ${lang}`); }
    assert.ok(p.steps || p.list || p.cards || p.table || p.diagram || p.url, `${p.id} has no body`);
  }
  assert.ok(PAGES.length >= 25);
});

test("both languages have the same number of steps, list items, notes and table rows", () => {
  for (const p of PAGES) {
    for (const k of ["steps", "list"]) if (p[k]) assert.equal(p[k].es.length, p[k].en.length, `${p.id}.${k}`);
    if (p.table) { assert.equal(p.table.rows.es.length, p.table.rows.en.length, `${p.id} rows`); assert.equal(p.table.head.es.length, p.table.head.en.length); }
    for (const n of p.notes ?? []) assert.ok(n.es && n.en, `${p.id} note`);
    for (const c of p.cards ?? []) assert.ok(PAGES.some(q => q.id === c.to), `${p.id} card -> ${c.to}`);
  }
});

test("pages are short: at most 130 words each", () => {
  for (const p of PAGES) for (const lang of ["es", "en"]) {
    const t = [p.title?.[lang], p.lead?.[lang], ...(p.steps?.[lang] ?? []), ...(p.list?.[lang] ?? []), ...(p.table ? [...p.table.head[lang], ...p.table.rows[lang].flat()] : []), ...(p.notes ?? []).map(n => n[lang]), ...(p.cards ?? []).flatMap(c => [c.t[lang], c.d[lang]])].join(" ").replace(/\[\[|\]\]|\*\*/g, "");
    assert.ok(t.split(/\s+/).length <= 130, `${p.id} ${lang}: ${t.split(/\s+/).length} words`);
  }
});

test("a button named in the guide is called that in the app, in each language", () => {
  const wrong = [];
  for (const { lang, text } of texts) for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const es = m[1], en = m[2] ?? m[1];
    const clean = s => s.replace(/^\+ /, "");
    const english = clean(en), spanish = clean(es);
    // the app shows the English key in English and its Spanish text in Spanish
    if (lang === "en") continue;                                    // the English names are the keys themselves: checked through the Spanish ones
    const partial = { "Lock the room": "Bloquear la sala", "Spend a Bond": "Gastar un Vínculo" };       // the app label goes on after these words
    if (partial[english] === spanish) continue;
    if (tIn("es", english) !== spanish && !/^(ES|EN)$/.test(spanish)) wrong.push(`${english} -> ${spanish} (app: ${tIn("es", english)})`);
  }
  assert.deepEqual([...new Set(wrong)], []);
});
