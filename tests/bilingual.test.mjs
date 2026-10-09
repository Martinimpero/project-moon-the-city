import test from "node:test";
import assert from "node:assert/strict";
import { t, tNow, setLang, bilingual, bilingualHtml, expandMarkers, hasMarkers } from "../js/i18n.mjs";
import * as E from "../js/engine.mjs";
import { newActor, refresh as refreshActor } from "../js/model.mjs";
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

/* ---- the Verdict, the Voice and a character's own words, in both languages ---- */
import { verdictCandidates, voiceText, verdictCardHtml, bothSides } from "../js/voice.mjs";
import * as S from "../js/store.mjs";

const twoSides = (html) => ({ en: expandMarkers(html, "en"), es: expandMarkers(html, "es") });

test("pregens are imported with their Fear, Burden and Boundary in both languages", () => {
  S.state.actors = []; S.state.lang = "en"; setLang("en");
  S.importPregens();
  const wren = S.state.actors.find(a => a.name === "Wren Okoro").system;
  assert.equal(wren.lang, "en"); assert.match(wren.fear, /Dying without anyone/); assert.match(wren.alt.fear, /Morir sin que nadie/);
  S.state.actors = []; S.state.lang = "es"; setLang("es");
  S.importPregens();
  const w2 = S.state.actors.find(a => a.name === "Wren Okoro").system;
  assert.equal(w2.lang, "es"); assert.match(w2.fear, /Morir sin que nadie/); assert.match(w2.alt.fear, /Dying without anyone/);
  S.state.lang = "en"; setLang("en");
});

test("the starting Verdicts quote the character's Fear in each language", () => {
  const wren = pregen("Wren Okoro");                                          // English main, Spanish alt
  wren.system.lang = "en"; wren.system.alt = { fear: "Morir sin que nadie sepa lo que me pasó.", burden: "Un guardia murió en sus brazos.", boundary: "No dejaré morir a nadie por dudar." };
  const c = bilingual(() => verdictCandidates({ ...wren.system, alignment: "gloom" }));
  const en = c.map(x => expandMarkers(x, "en")).join(" | "), es = c.map(x => expandMarkers(x, "es")).join(" | ");
  assert.match(en, /Dying without anyone knowing/); assert.doesNotMatch(en, /Morir sin que nadie/);
  assert.match(es, /Morir sin que nadie sepa/); assert.doesNotMatch(es, /Dying without anyone/);
  assert.match(en, /It is your fault/); assert.match(es, /Es culpa tuya/);        // and the Sin's own voice line
});

test("a sheet with no second language quotes its words as written, in both copies", () => {
  const a = newActor("character", "X", { fear: "Heights", burden: "", boundary: "" });
  const c = bilingual(() => verdictCandidates({ ...a.system, alignment: "pride" }));
  assert.match(expandMarkers(c[0], "en"), /Heights/); assert.match(expandMarkers(c[0], "es"), /Heights/);
});

test("the Voice quotes Fear and Burden in each language too, and a Spanish main works the other way round", () => {
  const sys = { alignment: "gloom", attributes: { body: 1, mind: 1, presence: 1, resolve: 3 }, lang: "es", fear: "Miedo a caer", burden: "Una caída", boundary: "", alt: { fear: "Fear of falling", burden: "A fall", boundary: "" } };
  const v = bilingual(() => voiceText(sys, "empty"));
  assert.match(expandMarkers(v.player, "en"), /Fear of falling[\s\S]*A fall/); assert.doesNotMatch(expandMarkers(v.player, "en"), /Miedo a caer/);
  assert.match(expandMarkers(v.player, "es"), /Miedo a caer[\s\S]*Una caída/);
});

test("the Verdict card shows each reader their language, both for the Verdict and the Acceptance", () => {
  const html = bilingualHtml(bilingual(() => verdictCardHtml("Wren", { en: "You will fail.", es: "Vas a fallar." }, { en: "I will not.", es: "No lo haré." }, "gloom")));
  assert.match(html, /data-bi2/);
  const { en, es } = twoSides(html.replace(/<div data-bi2><div lang="en">([\s\S]*?)<\/div><div lang="es">([\s\S]*?)<\/div><\/div>/, "$1\u0002$2"));
  assert.match(html.split('<div lang="es">')[0], /You will fail\./); assert.match(html.split('<div lang="es">')[0], /I will not\./);
  assert.match(html.split('<div lang="es">')[1], /Vas a fallar\./); assert.match(html.split('<div lang="es">')[1], /No lo haré\./);
  assert.ok(en && es);
});

test("one-language Verdicts and Acceptances are filled into the other side; no Acceptance stays empty", () => {
  assert.deepEqual(bothSides("Same"), { en: "Same", es: "Same" });
  assert.deepEqual(bothSides({ en: "Only English", es: "" }), { en: "Only English", es: "Only English" });
  assert.deepEqual(bothSides({ en: "", es: "Solo español" }), { en: "Solo español", es: "Solo español" });
  assert.deepEqual(bothSides(""), { en: "", es: "" });
  const none = bilingualHtml(bilingual(() => verdictCardHtml("Wren", "v", "", null)));
  assert.match(none, /No Acceptance yet\./); assert.match(none, /Todavía no hay Aceptación|Sin Aceptación|Aceptación/);
});

test("Hail Mary takes a Verdict and Acceptance in two languages; an empty Acceptance still means none", () => {
  const wren = pregen("Wren Okoro");
  const r = bilingual(() => E.hailMary(wren, { verdict: { en: "No.", es: "No (es)." }, acceptance: { en: "", es: "Sí puedo." }, skill: "empathy", base: 2, desire: true }, seq(9)));
  assert.notEqual(r.band, "partial");                                         // an Acceptance in either language counts
  assert.match(expandMarkers(r.html[0], "en"), /Sí puedo\./);                   // filled from the other side
  const none = bilingual(() => E.hailMary(pregen("Wren Okoro"), { verdict: "v", acceptance: { en: "", es: "" }, skill: "empathy", base: 2, desire: true }, seq(9)));
  assert.equal(none.band, "partial");
});

test("no English is left in the Spanish copy of the cards the app writes", () => {
  const dax = pregen("Dax Verrin"), wren = pregen("Wren Okoro"), lena = pregen("Lena Hart");
  const cards = [];
  const draft = bilingual(() => E.rollDraft(dax, input({ ego: 1, tag: "wrath", target: "pride", context: "attack", gear: dax.items.find(i => i.type === "gear").id, opposition: 2 }), null, seq(1, 2, 9, 8, 7, 1, 3)));
  cards.push(bilingual(() => E.commitRoll(dax, draft)).html);
  for (const h of bilingual(() => E.hailMary(wren, { verdict: { en: "x", es: "x" }, acceptance: "ok", skill: "empathy", base: 2, desire: false, dig: false }, seq(9))).html) cards.push(h);
  S.state.actors = []; S.state.lang = "en"; setLang("en"); S.importPregens();
  const lena2 = S.state.actors.find(a => a.name === "Lena Hart"); lena2.system.ego.value = 0; refreshActor(lena2);
  cards.push(bilingual(() => E.voiceCardHtml(lena2, "empty")));
  cards.push(bilingual(() => E.runDowntime([dax], newActor("crew", "G"), { [dax.id]: { rest: true, repair: false } })).html);
  cards.push(bilingual(() => E.npcRoll(newActor("npc", "Guard", { grade: 5 }), seq(8, 1, 8, 8))));
  const english = /\b(the|and|takes|Pool|Difficulty|Success|Failure|Complication|Harm|Resources|paid|rest|vs|dice|Verdict|Acceptance|GM)\b/;
  for (const html of cards) {
    const es = expandMarkers(html, "es").replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(es, english, es.slice(0, 160));
  }
});
