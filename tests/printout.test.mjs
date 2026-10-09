import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as P from "../js/printout.mjs";
import { newActor } from "../js/model.mjs";
import { newHandout } from "../js/handouts.mjs";
import { tIn, setLang, t } from "../js/i18n.mjs";
import * as T from "../js/threats.mjs";
import { PREGENS } from "../js/pregens.mjs";

const tr = (k, d) => t(k, d);

test("every word the print pages translate has a Spanish version", () => {
  const src = fs.readFileSync(new URL("../js/printout.mjs", import.meta.url), "utf8");
  const keys = new Set([...src.matchAll(/tr\(\s*"([^"]*)"/g)].map(m => m[1]));
  for (const k of ["Concept", "Identity", "Background", "Occupation", "Affiliation", "Desire", "Fear", "Relationship", "Principle", "Vice", "Boundary", "Burden", "Ambition", "Safehouse (3)", "Getaway (2)", "Workshop contact (2)", "Informant (2)", "Clinic (2)", "Cover (2)"]) keys.add(k);
  const missing = [...keys].filter(k => tIn("es", k) === k);
  assert.deepEqual(missing, []);
});

test("a character sheet prints every field with circles for the numbers", () => {
  const a = newActor("character", "Dax Verrin", { ...PREGENS.find(p => p.name === "Dax Verrin").system }, PREGENS.find(p => p.name === "Dax Verrin").items);
  const html = P.characterPage(a, tr);
  assert.match(html, /<h1>Dax Verrin<\/h1>/); assert.match(html, /Body/); assert.match(html, /Combat/); assert.match(html, /Wrath/);
  assert.ok((html.match(/&#9679;/g) ?? []).length > 5); assert.ok((html.match(/&#9675;/g) ?? []).length > 5);
  assert.match(html, /E\.G\.O\./); assert.match(html, /Harm/);
  assert.doesNotMatch(html, /undefined|NaN|\[object/);
});

test("a blank sheet has all the labels and empty circles only", () => {
  const html = P.characterPage(null, tr);
  assert.match(html, /Character sheet/); assert.doesNotMatch(html, /&#9679;/); assert.match(html, /Desire/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("a name with an apostrophe is escaped once, not twice", () => {
  const a = newActor("character", "X", {}, [{ type: "trauma", name: "A debtor's hands", system: {} }]);
  const html = P.characterPage(a, tr);
  assert.match(html, /A debtor&#39;s hands/); assert.doesNotMatch(html, /&amp;#39;/);
});

test("text typed by a player is escaped on the page", () => {
  const a = newActor("character", "<img src=x onerror=alert(1)>", { concept: "<script>x</script>" });
  const html = P.characterPage(a, tr);
  assert.doesNotMatch(html, /<script>|<img src=x/); assert.match(html, /&lt;script&gt;/);
});

test("Threat and crew sheets print", () => {
  const th = T.build(T.byId("syndicate-enforcer"), { newActor })[0];
  const h = P.threatPage(th, tr);
  assert.match(h, /Grade 7/); assert.match(h, /6 dice/); assert.match(h, /Difficulty 2/); assert.match(h, /Holding/);
  const c = newActor("crew", "Gantry & Sons", { office: "Gantry", fund: 2 });
  assert.match(P.crewPage(c, tr), /Gantry &amp; Sons/);
  assert.equal(P.actorPage(th, tr), h);
});

test("a handout prints in the reader's language, or in both on two pages", () => {
  const h = newHandout({ title: "Contract", text: "Client: X\n\nRisk: 3", lang: "en", alt: { title: "Contrato", text: "Cliente: X" } });
  const one = P.handoutPages(h, "es"); assert.match(one, /Contrato/); assert.doesNotMatch(one, />Contract</);
  const two = P.handoutPages(h, "es", { both: true });
  assert.equal((two.match(/pr-page/g) ?? []).length, 2); assert.ok(two.indexOf("Contrato") < two.indexOf("Contract"));
  const solo = newHandout({ title: "Note", text: "x" });
  assert.equal((P.handoutPages(solo, "es", { both: true }).match(/pr-page/g) ?? []).length, 1);          // no second version: one page
  assert.match(P.handoutPages(newHandout({ title: "T", text: "x", img: "data:image/png;base64,AA" }), "en"), /<img src="data:image\/png;base64,AA"/);
});

test("journal, clocks and the rules screen print", () => {
  const j = P.journalPage("Party journal", [{ title: "Clue", text: "Marl owes the Row.", author: "Ana", kind: "note", pinned: true }], tr);
  assert.match(j, /Clue/); assert.match(j, /Ana/); assert.match(j, /&#9733;/);
  assert.match(P.clocksPage([{ name: "Open War", size: 6, filled: 2, scope: "Row", consequence: "War" }], tr), /&#9679;&#9679;&#9675;/);
  const s = P.screenPages(tr); assert.match(s, /The Core Roll/); assert.match(s, /<table/);
  setLang("es"); try { assert.match(P.screenPages(k => t(k)), /La Tirada Básica/); } finally { setLang("en"); }
});
