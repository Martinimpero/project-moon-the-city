import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as M from "../js/md.mjs";
import * as R from "../js/manualrefs.mjs";

const file = p => new URL(`../${p}`, import.meta.url);
const index = JSON.parse(fs.readFileSync(file("manual/index.json"), "utf8"));

test("the reader turns Markdown into safe HTML", () => {
  const { html, sections } = M.render("# Title\n\n## 1. First\n\nSome **bold** and *italic* text <script>alert(1)</script>.\n\n- one\n- two\n\n1. a\n2. b\n\n> **EXAMPLE**\n> quoted\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n## 2. Second");
  assert.deepEqual(sections, ["1. First", "2. Second"]);
  assert.match(html, /<h3 class="man-sec" id="sec-1" data-sec="1">1\. First<\/h3>/);
  assert.match(html, /<b>bold<\/b>/); assert.match(html, /<i>italic<\/i>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/); assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<blockquote>.*<b>EXAMPLE<\/b>/s); assert.match(html, /<table>.*<th>A<\/th>.*<td>2<\/td>/s); assert.match(html, /<hr>/);
  assert.doesNotMatch(html, /<script/); assert.match(html, /&lt;script&gt;/);
});

test("'Part IV §2' becomes a link to that section, and nothing else does", () => {
  const h = M.inline("See Part IV §2 and Parte X, but not Part XI or the part of Paris.");
  assert.match(h, /data-ref="p4#2">Part IV §2</); assert.match(h, /data-ref="p10">Parte X</);
  assert.equal((h.match(/man-link/g) ?? []).length, 2);
});

test("search finds the section, ranks a title match first, and needs every word", () => {
  const docs = [{ part: "p4", partTitle: "IV", md: "# T\n\n## 1. E.G.O.\n\nYou have E.G.O.\n\n## 4. The Hail Mary\n\nThe Hail Mary triggers when E.G.O. is empty." }, { part: "p2", partTitle: "II", md: "## 1. Roll\n\nA hail of dice." }];
  const hits = M.search(docs, "hail mary");
  assert.equal(hits.length, 1); assert.deepEqual([hits[0].part, hits[0].sec], ["p4", 2]);
  assert.equal(M.search(docs, "hail dice")[0].part, "p2");
  assert.deepEqual(M.search(docs, "x"), []); assert.deepEqual(M.search(docs, "zzzz"), []);
});

test("every part has the same sections in English and Spanish, and its file is there", () => {
  assert.equal(index.parts.length, R.PARTS.length);
  for (const p of index.parts) {
    assert.equal(p.en.sections.length, p.es.sections.length, p.id);
    for (const l of ["en", "es"]) {
      const md = fs.readFileSync(file(`manual/${l}/${p.id}.md`), "utf8");
      assert.equal(M.render(md).sections.length, p[l].sections.length, `${l}/${p.id}`);
    }
  }
});

test("every '?' on the sheet points at a real section, and cited parts exist", () => {
  for (const [k, ref] of Object.entries(R.REFS)) {
    const r = R.parseRef(ref, index); assert.ok(r, k); assert.ok(r.sec > 0 && r.sec <= index.parts.find(p => p.id === r.part).en.sections.length, `${k} -> ${ref}`);
  }
  assert.deepEqual(R.parseRef("p4", index), { part: "p4", sec: 0 }); assert.deepEqual(R.parseRef("p4#99", index), { part: "p4", sec: 0 });
  for (const bad of ["", "x9", "../p4", "p4#a", null]) assert.equal(R.parseRef(bad, index), null, String(bad));
});

test("the sheet's links go to sections about the same thing (spot checks against the headings)", () => {
  const title = ref => { const r = R.parseRef(ref, index); return index.parts.find(p => p.id === r.part).en.sections[r.sec - 1]; };
  assert.match(title(R.REFS.stress), /Stress/); assert.match(title(R.REFS.hailMary), /Hail Mary/); assert.match(title(R.REFS.harm), /Harm/);
  assert.match(title(R.REFS.bonds), /Bonds/); assert.match(title(R.REFS.resources), /Resources/); assert.match(title(R.REFS.wheel), /Wheel/);
  assert.match(title(R.REFS.drift), /Drift/); assert.match(title(R.REFS.skills), /Skills/); assert.match(title(R.REFS.attributes), /Attributes/);
  assert.match(title(R.REFS.glossary), /Glossary/); assert.match(title(R.REFS.threat), /Threat/); assert.match(title(R.REFS.vice), /Vice/);
});

test("the copies in manual/ are the manual's current text (skipped when the sources are not next to the app)", { skip: !fs.existsSync(file("../Manual_Part1_TheCity.md")) }, () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL("../tools/make_manual.mjs", import.meta.url)), "--check"], { encoding: "utf8" });
  assert.match(out, /up to date/);
});

test("log cards get a '?' by kind: rolls, Hail Mary, Voice, Exchange; chat and handouts none", () => {
  assert.equal(R.cardRef(["pm-card"], true), R.REFS.result);
  assert.equal(R.cardRef(["pm-card"], false), null);
  assert.equal(R.cardRef(["pm-card", "pm-hailmary"], true), R.REFS.hailMary);
  assert.equal(R.cardRef(["pm-card", "pm-voicecard"], false), R.REFS.ego);
  assert.equal(R.cardRef(["pm-card", "pm-exchange"], false), R.REFS.exchange);
  assert.equal(R.cardRef(["pm-card", "chat"], true), null); assert.equal(R.cardRef(["pm-card", "pm-handout"], true), null);
});

test("the extra '?' (conditions, contracts, offices...) point at the right sections, and refButton escapes its label", () => {
  const title = ref => { const r = R.parseRef(ref, index); return index.parts.find(p => p.id === r.part).en.sections[r.sec - 1]; };
  assert.match(title(R.REFS.conditions), /Detail/); assert.match(title(R.REFS.contracts), /Contracts/); assert.match(title(R.REFS.offices), /Offices/);
  assert.match(title(R.REFS.occupation), /Occupation/); assert.match(title(R.REFS.riding), /Riding/); assert.match(title(R.REFS.clocks), /Clocks/);
  const b = R.refButton("conditions", 'a "b" <c>'); assert.match(b, /data-ref="p10#7"/); assert.doesNotMatch(b, /<c>/); assert.match(b, /&quot;b&quot;/);
});
