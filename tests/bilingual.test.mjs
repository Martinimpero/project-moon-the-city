import test from "node:test";
import assert from "node:assert/strict";
import { t, tNow, setLang, bilingual, bilingualHtml, expandMarkers, hasMarkers } from "../js/i18n.mjs";
import * as E from "../js/engine.mjs";
import { newActor } from "../js/model.mjs";
import { PREGENS } from "../js/pregens.mjs";
import { soundForHtml } from "../js/sfx.mjs";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const pregen = name => { const p = PREGENS.find(x => x.name === name); return newActor("character", p.name, p.system, p.items); };
const dice = html => [...html.matchAll(/<span class="pm-die[^"]*">(\d+)<\/span>/g)].map(m => m[1]).join(",");
const input = o => ({ attribute: "body", skill: "combat", difficulty: 2, opposition: 0, tag: "", target: "", context: "other", gear: "", ego: 0, help: 0, modifier: 0, bond: "", borrowedFace: false, ...o });
const both = html => ({ html: bilingualHtml(html), en: expandMarkers(html, "en"), es: expandMarkers(html, "es") });

test("t() is one language normally and carries both inside bilingual()", () => {
  setLang("en");
  assert.equal(t("Failure"), "Failure"); assert.equal(hasMarkers(t("Failure")), false);
  const m = bilingual(() => t("Failure"));
  assert.equal(hasMarkers(m), true);
  assert.equal(expandMarkers(m, "en"), "Failure"); assert.equal(expandMarkers(m, "es"), t("Failure") === "Failure" ? expandMarkers(m, "es") : "x");
  assert.notEqual(expandMarkers(m, "es"), "Failure");
  setLang("es"); assert.equal(hasMarkers(t("Failure")), false); setLang("en");
});

test("text that does not change between languages stays plain, and stored text is always one language", () => {
  const plain = bilingual(() => t("E.G.O.")); assert.equal(hasMarkers(plain), false);
  setLang("es");
  const fixed = bilingual(() => tNow("Hooked: {who}", { who: "Guard" }));
  assert.equal(hasMarkers(fixed), false);                                   // always the app's language
  assert.match(fixed, /Guard/);
  setLang("en");
});

test("placeholders are filled in each language, and markers nest (a translated word inside a translated sentence)", () => {
  const s = bilingual(() => t("{n} Successes", { n: 3 }));
  assert.equal(expandMarkers(s, "en"), "3 Successes");
  assert.match(expandMarkers(s, "es"), /^3 /);
  const nested = bilingual(() => t("{name} is Unmoved:", { name: t("Failure") }));
  assert.equal(hasMarkers(expandMarkers(nested, "en")), false);
  assert.equal(hasMarkers(expandMarkers(nested, "es")), false);
  assert.ok(expandMarkers(nested, "en").startsWith("Failure is Unmoved"));
  assert.ok(!expandMarkers(nested, "es").includes("Failure"));
});

test("a card that does not depend on language is stored once; one that does is stored as two copies", () => {
  assert.equal(bilingualHtml("<p>hello</p>"), "<p>hello</p>");
  const html = bilingualHtml(bilingual(() => `<p>${t("Failure")}</p>`));
  assert.match(html, /^<div data-bi2><div lang="en"><p>Failure<\/p><\/div><div lang="es"><p>.+<\/p><\/div><\/div>$/);
});

test("a roll card has the same dice and numbers in both languages", () => {
  const dax = pregen("Dax Verrin");
  const draft = bilingual(() => E.rollDraft(dax, input({ ego: 0, tag: "wrath" }), null, seq(9, 8, 1, 7, 3, 4, 6)));
  const out = bilingual(() => E.commitRoll(dax, draft));
  const { html, en, es } = both(out.html);
  assert.equal(dice(en), dice(es));
  assert.ok(dice(en).length > 0);
  assert.match(en, /Pool \d+ vs Difficulty 2/); assert.match(es, /Pool|Reserva|Dados/);
  assert.notEqual(en, es);
  assert.match(html, /data-bi2/);
  assert.equal(soundForHtml(html).kind, "roll");                            // the sound still finds the card
  assert.match(en, /Success|Failure|Partial|Critical/);
  assert.match(es, /Éxito|Fallo|Parcial|Crítico/);
});

test("Hail Mary, techniques, Voice, downtime, Threats and Drift all come out in both languages", () => {
  const wren = pregen("Wren Okoro");
  const hm = bilingual(() => E.hailMary(wren, { verdict: "No lo conseguirás.", acceptance: "Sí puedo.", skill: "empathy", base: 2, desire: true }, seq(9)));
  for (const h of hm.html) { const b = both(h); assert.notEqual(b.en, b.es); assert.equal(dice(b.en), dice(b.es)); }
  assert.match(expandMarkers(hm.html[0], "en"), /No lo conseguirás\./);        // what the table typed is kept as typed, in both
  assert.match(expandMarkers(hm.html[0], "es"), /No lo conseguirás\./);

  wren.system.scene.last = { sin: "gloom", success: true, anyOne: false };
  const tech = bilingual(() => E.useTechnique(wren, "gloom", { target: newActor("npc", "Guard") }));
  assert.equal(tech.status, "ok"); assert.notEqual(expandMarkers(tech.html, "en"), expandMarkers(tech.html, "es"));

  wren.system.ego.value = 1;
  const voice = bilingual(() => E.voiceCardHtml(wren, "unsteady"));
  assert.notEqual(expandMarkers(voice, "en"), expandMarkers(voice, "es"));

  const crew = newActor("crew", "Gantry");
  const dt = bilingual(() => E.runDowntime([wren], crew, { [wren.id]: { rest: true, repair: false } }));
  assert.notEqual(expandMarkers(dt.html, "en"), expandMarkers(dt.html, "es"));

  const npc = bilingual(() => E.npcRoll(newActor("npc", "Guard", { grade: 5 }), seq(8, 8, 8, 8), { sinking: 1 }));
  assert.notEqual(expandMarkers(npc, "en"), expandMarkers(npc, "es")); assert.equal(dice(expandMarkers(npc, "en")), dice(expandMarkers(npc, "es")));

  const dax = pregen("Dax Verrin"); dax.system.tally = { wrath: 12, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 1, envy: 0 };
  const dr = bilingual(() => E.drift(dax));
  assert.notEqual(expandMarkers(dr.html, "en"), expandMarkers(dr.html, "es"));
});

test("a technique that is refused reports its reason in the app's language once markers are expanded", () => {
  const wren = pregen("Wren Okoro");
  const r = bilingual(() => E.useTechnique(wren, "wrath"));
  assert.equal(r.status, "fail");
  setLang("es");
  assert.equal(hasMarkers(expandMarkers(r.reason, "es")), false);
  setLang("en");
});

test("the log of a Spanish GM and an English player: both read one card in their own language", () => {
  const dax = pregen("Dax Verrin");
  setLang("es");                                                            // the poster is in Spanish
  const draft = bilingual(() => E.rollDraft(dax, input(), null, seq(9)));
  const card = bilingualHtml(bilingual(() => E.commitRoll(dax, draft)).html);
  setLang("en");
  assert.match(expandMarkers(card.match(/<div lang="en">([\s\S]*?)<\/div><div lang="es">/)?.[1] ?? "", "en"), /Pool|Difficulty/);
});
