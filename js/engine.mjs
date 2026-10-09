/**
 * The game engine: rolls, Hail Mary, Signature Techniques, scene and downtime bookkeeping.
 * Works on plain actor objects (see model.mjs), mutates them, and returns chat-card HTML for the log.
 * No browser APIs: dice come from an injectable `rng` (a function returning 1..10), so Node can test it.
 */
import * as R from "./rules.mjs";
import { SIN_LABEL, SKILL_LABEL, ATTRIBUTE_LABEL, SIN_TEXT, SIGNATURE, BOND_TYPE_LABEL } from "./config.mjs";
import { verdictCandidates, verdictCardHtml, flashpointShape, voiceText, bothSides } from "./voice.mjs";
import { t, tNow, localized } from "./i18n.mjs";
import { refresh, newItem, gearOf, bondsOf } from "./model.mjs";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = v => (v > 0 ? `+${v}` : `${v}`);
const successesText = n => (n === 1 ? t("{n} Success", { n }) : t("{n} Successes", { n }));
const bandLabel = band => t(R.BAND_LABEL[band]);
export const ASSET_LABEL = localized({ safehouse: "Safehouse", getaway: "Getaway", workshop: "Workshop contact", informant: "Informant", clinic: "Clinic", cover: "Cover" });

export function defaultRng() {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    return () => { let x; do { globalThis.crypto.getRandomValues(buf); x = buf[0]; } while (x >= 4294967290); return (x % 10) + 1; };
  }
  return () => 1 + Math.floor(Math.random() * 10);
}
const rollN = (n, rng) => Array.from({ length: Math.max(0, n) }, () => rng());

export function diceHtml(base, ego, changed = new Set()) {
  const die = (v, cls, key) => `<span class="pm-die ${cls} ${v >= 7 ? "hit" : (v === 1 ? "one" : "")} ${changed.has(key) ? "rerolled" : ""}">${v}</span>`;
  return `<div class="pm-dice">${base.map((v, i) => die(v, "", `b${i}`)).join("")}${ego.map((v, i) => die(v, "ego", `e${i}`)).join("")}</div>`;
}
export const card = (head, body) => `<div class="pm-card"><div class="pm-card-head">${head}</div><div class="pm-notes">${body}</div></div>`;
const actorCard = (actor, head, body) => card(`${esc(actor.name)} &middot; ${head}`, body);

/* ------------------------------------------------------------------ targets */

/** What a roll needs to know about the opposing actor: its dice, its Sin and any effect on it. */
export function targetInfo(target) {
  if (!target) return null;
  const s = target.system;
  if (target.type === "npc") return { actor: target, name: target.name, dice: target.derived.dice, sin: s.alignment || "", unmoved: false, weight: s.nextPenalty ?? 0 };
  if (target.type === "character") return { actor: target, name: target.name, dice: 0, sin: target.derived.alignment || "", unmoved: !!s.scene.unmoved, weight: s.scene.nextPenalty ?? 0 };
  return null;
}
export const penaltyPath = actor => (actor.type === "npc" ? "nextPenalty" : "scene.nextPenalty");
export function setPenalty(actor, value) {
  if (actor.type === "npc") actor.system.nextPenalty = value; else actor.system.scene.nextPenalty = value;
}

export function techniqueAvailable(actor, sin) {
  const s = actor.system;
  return R.canUseTechnique({ rating: s.resonance[sin] ?? 0, used: s.scene.techniques[sin] ?? 0, strained: s.strained === sin }).ok;
}

/** The E.G.O. state transitions that call for the Voice: returns "unsteady", "empty" or null. */
export function voiceTransition(before, actor) {
  const a = actor.derived;
  if (a.empty && !before.empty) return "empty";
  if (a.unsteady && !before.unsteady && !a.empty) return "unsteady";
  return null;
}
export function voiceCardHtml(actor, level) {
  const v = voiceText({ ...actor.system, alignment: actor.derived.alignment }, level);
  return `<div class="pm-card pm-voicecard ${v.loud ? "loud" : ""}"><div class="pm-card-head">${esc(actor.name)} &middot; ${esc(t("The Voice"))}</div>
    <div class="pm-notes"><p class="pm-voice">${esc(v.player)}</p><p class="hint"><b>${esc(t("GM"))}:</b> ${esc(v.gm)}</p></div></div>`;
}

/* ------------------------------------------------------------------ the roll */

/**
 * Roll the dice for a character without committing anything. `input` is the roll dialog's answers:
 * { attribute, skill, difficulty, opposition, tag, target (their Sin), context, gear (item id), ego, help, modifier, bond (item id), borrowedFace }.
 * Returns a draft. Call `unbowed(draft)` to reroll, then `commitRoll(draft)`.
 */
export function rollDraft(actor, input, target, rng = defaultRng()) {
  const s = actor.system, d = actor.derived;
  const n = (k, def = 0) => Number(input[k] ?? def) || def;
  const attribute = input.attribute, skill = input.skill || "";
  const attrVal = s.attributes[attribute] ?? 0, skillVal = skill ? (s.skills[skill] ?? 0) : 0;
  const underSin = s.riding || s.under || "";
  const rampage = s.scene.armed === "rampage";
  let tagSin = rampage ? "wrath" : (input.tag || s.riding || "");
  const targetSin = input.target || "";
  const gear = input.gear ? gearOf(actor).find(g => g.id === input.gear) : null;
  const notes = [];

  let bf = false;
  if (input.borrowedFace && targetSin && techniqueAvailable(actor, "envy")) { bf = true; tagSin = targetSin; }

  let boon = 0, borrowing = false;
  if (gear) {
    const gearRating = s.resonance[gear.system.sin] ?? 0;
    borrowing = gearRating < 2;
    if (!tagSin && gear.system.sin) tagSin = gear.system.sin;
    boon = R.gearBoon({ kind: gear.system.kind, gearSin: gear.system.sin, tagSin, fine: gear.system.fine, attunedRating: gearRating, context: input.context, skill });
  }
  const ownRating = tagSin ? (s.resonance[tagSin] ?? 0) : 0;
  const tagRating = bf ? 0 : (tagSin ? R.effectiveTagRating(ownRating, borrowing && gear?.system.sin === tagSin) : 0);
  const fitSin = borrowing && !s.riding ? "" : underSin;
  const sin = R.sinDice({ tagSin, tagRating, targetSin, underSin: fitSin, underRating: fitSin ? (s.resonance[fitSin] ?? 0) : 0, skill, boon });

  const unmovedTarget = !!target?.unmoved;
  const helpDice = unmovedTarget ? 0 : n("help");
  const sinking = Math.max(0, Math.min(3, Math.floor(Number(input.sinking) || 0)));      // Sinking on the roller: a die off per stack
  const poise = tagSin === "pride" ? Math.max(0, Math.floor(Number(input.poise) || 0)) : 0;   // Poise: a die on per stack, on a Pride roll
  const effects = (rampage ? -1 : 0) + (unmovedTarget ? -2 : 0) + (bf ? 1 : 0) + (s.scene.nextPenalty ?? 0) - sinking + poise;
  if (rampage) notes.push(`<b>${esc(t("Rampage:"))}</b> ${esc(t("the second attack, at -1 die."))}`);
  if (unmovedTarget) notes.push(`<b>${esc(t("{name} is Unmoved:", { name: target.name }))}</b> ${esc(t("-2 dice to this roll and no Help."))}`);
  if (bf) notes.push(`<b>${esc(t("Borrowed Face:"))}</b> ${esc(t("you copy {sin}. The matchup is neutral and you add +1 die.", { sin: SIN_LABEL[targetSin] }))}`);
  if (s.scene.nextPenalty < 0) notes.push(`<b>${esc(t("Sorrow's Weight:"))}</b> ${esc(t("{n} dice on this roll.", { n: s.scene.nextPenalty }))}`);
  if (sinking) notes.push(`<b>${esc(t("Sinking:"))}</b> ${esc(t("-{n} dice on this roll. It is used up.", { n: sinking }))}`);
  if (poise) notes.push(`<b>${esc(t("Poise:"))}</b> ${esc(t("+{n} dice on this Pride roll. A Failure spends it all.", { n: poise }))}`);

  const bond = input.bond ? bondsOf(actor).find(b => b.id === input.bond) : null;
  const bondDie = bond && bond.system.strength >= 1 ? 1 : 0;

  const harmPen = d.harmPenalty;
  const pool = Math.max(0, attrVal + skillVal - harmPen + sin.total + helpDice + bondDie + n("modifier") + effects);
  const egoSpend = Math.max(0, Math.min(n("ego"), d.egoCurrent));
  const difficulty = Math.max(1, n("difficulty", 2));
  let oppDice = Math.max(0, n("opposition"));
  let targetSinking = 0;
  if (oppDice > 0 && target?.sinking > 0) { targetSinking = Math.min(3, target.sinking); oppDice = Math.max(0, oppDice - targetSinking); notes.push(`<b>${esc(t("{name} is Sinking:", { name: target.name }))}</b> ${esc(t("-{n} dice on their roll. It is used up.", { n: targetSinking }))}`); }
  if (oppDice > 0 && target && target.weight < 0) { oppDice = Math.max(0, oppDice + target.weight); notes.push(`<b>${esc(t("{name} is weighed down:", { name: target.name }))}</b> ${esc(t("{n} dice on their roll.", { n: target.weight }))}`); }

  const base = rollN(pool, rng), ego = rollN(egoSpend, rng);
  let oppSuccesses = null;
  if (oppDice > 0) oppSuccesses = R.countSuccesses(rollN(oppDice, rng));

  const draft = {
    actorId: actor.id, rng, input, target, attribute, skill, attrVal, skillVal, harmPen, tagSin, tagRating, sin, boon, borrowing, gear, bond, bondDie, bf,
    sinking, poise, targetSinking, helpDice, effects, pool, egoSpend, difficulty, oppDice, oppSuccesses, base, ego, notes, rampage,
    startUnsteady: d.unsteady, startEmpty: d.empty, changed: new Set(), unbowedUsed: false, modifier: n("modifier")
  };
  evaluateDraft(draft);
  draft.canUnbowed = techniqueAvailable(actor, "pride") && failingDice(draft).length > 0 && ["failure", "partial", "criticalFailure"].includes(draft.band);
  return draft;
}
function failingDice(draft) {
  const out = [];
  draft.base.forEach((v, i) => { if (v < 7) out.push({ arr: draft.base, i, v, key: `b${i}` }); });
  draft.ego.forEach((v, i) => { if (v < 7) out.push({ arr: draft.ego, i, v, key: `e${i}` }); });
  return out;
}
function evaluateDraft(draft) {
  const all = [...draft.base, ...draft.ego];
  draft.successes = R.countSuccesses(all);
  draft.anyOne = all.includes(1);
  draft.band = draft.oppSuccesses !== null ? R.opposedBand(draft.successes, draft.oppSuccesses, draft.anyOne) : R.unopposedBand(draft.successes, draft.difficulty, draft.anyOne);
}

/** Pride's Unbowed: reroll up to three dice that didn't succeed. Mutates the draft. */
export function unbowed(draft, rng = draft.rng) {
  const failing = failingDice(draft).sort((a, b) => a.v - b.v).slice(0, 3);
  const fresh = rollN(failing.length, rng);
  failing.forEach((p, k) => { p.arr[p.i] = fresh[k]; draft.changed.add(p.key); });
  draft.unbowedUsed = true;
  evaluateDraft(draft);
  draft.notes.push(`<b>${esc(t("Unbowed:"))}</b> ${esc(t("rerolled {n} dice.", { n: failing.length }))}` + (["success", "critical"].includes(draft.band) ? "" : ` ${esc(t("It still fails:"))} <b>${esc(t("take a Complication"))}</b>.`));
  draft.canUnbowed = false;
  return draft;
}

/** Apply a draft to the character and return `{ html, voice }`: the chat card and the Voice level (if E.G.O. just dropped). */
export function commitRoll(actor, draft) {
  const s = actor.system, d = actor.derived;
  const { tagSin, tagRating, gear, bond, band, anyOne, successes, base, ego, target, sin, boon, borrowing, rampage, bf, notes } = draft;
  const before = { ...d };
  const complications = ego.filter(v => v <= 2).length;
  const flashpoint = R.flashpointFires({ anyOne, empty: draft.startEmpty, unsteady: draft.startUnsteady, alreadyThisScene: s.scene.flashpoint });
  let pull = false;
  if (gear && anyOne) {
    const gSin = gear.system.sin;
    const every = borrowing || s.riding === gSin || s.under === gSin || (s.resonance[gSin] ?? 0) >= 4;
    pull = every || !s.scene.pullUsed;
  }
  if (rampage && (anyOne || s.scene.rampageOne)) notes.push(`<b>${esc(t("Rampage collateral:"))}</b> ${esc(t("a 1 showed on one of the two attacks, so an unintended person takes Hurt."))}`);

  s.scene.armed = ""; s.scene.rampageOne = false; s.scene.unmoved = false; s.scene.nextPenalty = 0;
  s.scene.last = { sin: tagSin || "", success: ["success", "critical"].includes(band), anyOne };
  if (draft.egoSpend) s.ego.value = d.egoCurrent - draft.egoSpend;
  if (flashpoint) s.scene.flashpoint = true;
  if (pull) { s.scene.pullUsed = true; gear.system.wear = Math.min(3, gear.system.wear + 1); }
  if (draft.unbowedUsed) s.scene.techniques.pride = (s.scene.techniques.pride ?? 0) + 1;
  if (bf) s.scene.techniques.envy = (s.scene.techniques.envy ?? 0) + 1;
  if (tagSin && tagRating >= 2) s.tally[tagSin] = (s.tally[tagSin] ?? 0) + (borrowing && gear?.system.sin === tagSin ? 2 : 1);
  if (target && target.weight < 0 && draft.oppDice > 0) setPenalty(target.actor, 0);
  if (draft.bondDie) {
    if (bond.system.temporary && bond.system.strength <= 1) actor.items.splice(actor.items.indexOf(bond), 1);
    else bond.system.strength -= 1;
  }
  refresh(actor);

  const lines = [];
  lines.push(`${esc(ATTRIBUTE_LABEL[draft.attribute])} ${draft.attrVal}${draft.skill ? ` + ${esc(SKILL_LABEL[draft.skill])} ${draft.skillVal}` : ""}${draft.harmPen ? ` &minus; ${draft.harmPen} ${esc(t("Harm"))}` : ""}`);
  if (tagSin) lines.push(t("Tag {sin}: matchup {m}, Fit {f}", { sin: esc(SIN_LABEL[tagSin]), m: fmt(sin.matchup), f: fmt(sin.fit) }) + (borrowing && gear?.system.sin === tagSin ? ` ${esc(t("(borrowed, as rating 2)"))}` : "") + (boon ? t(", Boon {b}", { b: fmt(boon) }) : "") + ` = ${fmt(sin.total)} ${esc(t("dice"))}`);
  if (draft.helpDice || draft.bondDie || draft.modifier || draft.effects) lines.push(`${esc(t("Help"))} ${draft.helpDice}${draft.bondDie ? `, ${esc(t("Bond"))} ${esc(bond.system.person || bond.name)} +1` : ""}${draft.modifier ? `, ${esc(t("other"))} ${fmt(draft.modifier)}` : ""}${draft.effects ? `, ${esc(t("effects"))} ${fmt(draft.effects)}` : ""}`);
  lines.push(`${esc(t("Pool"))} ${draft.pool}${draft.egoSpend ? ` + ${draft.egoSpend} E.G.O.` : ""} ${esc(t("vs"))} ${draft.oppDice > 0 ? esc(t("{n} opposing dice", { n: draft.oppDice })) : esc(t("Difficulty {n}", { n: draft.difficulty }))}${target ? ` &middot; ${esc(t("target {name}", { name: target.name }))}` : ""}`);

  if (complications) notes.push(`<b>${esc(complications > 1 ? t("{n} Complications", { n: complications }) : t("1 Complication"))}</b>${tagSin ? `: ${esc(SIN_TEXT[tagSin].complication)}` : `: ${esc(t("a concrete cost the GM chooses."))}`}`);
  if (flashpoint) {
    const fSin = tagSin || d.alignment;
    const shape = flashpointShape(s.attributes);
    notes.push(`<b>${esc(t("Flashpoint:"))}</b> ${esc(fSin ? t("the Vice or {sin}'s Urge ({urge}) takes the wheel for a beat.", { sin: SIN_LABEL[fSin], urge: SIN_TEXT[fSin].urge }) : t("the Vice takes the wheel for a beat."))} ${esc(t("Shape (highest Attribute, {attr}): {shape}.", { attr: ATTRIBUTE_LABEL[shape.attribute], shape: shape.shape }))}`);
  }
  if (pull) notes.push(`<b>${esc(t("Pull:"))}</b> ${esc(t("{gear} provokes {sin}: {text} (Wear {w}/3)", { gear: gear.name, sin: SIN_LABEL[gear.system.sin], text: SIN_TEXT[gear.system.sin].complication, w: gear.system.wear }))}`);

  const html = `<div class="pm-card">
    <div class="pm-card-head">${esc(actor.name)}${draft.skill ? ` &middot; ${esc(SKILL_LABEL[draft.skill])}` : ""}</div>
    <div class="pm-card-lines">${lines.map(l => `<div>${l}</div>`).join("")}</div>
    ${diceHtml(base, ego, draft.changed)}
    <div class="pm-result">${esc(successesText(successes))}${draft.oppSuccesses !== null ? ` ${esc(t("vs"))} ${draft.oppSuccesses}` : ""}
      <span class="pm-band ${band}">${esc(bandLabel(band))}</span></div>
    ${notes.length ? `<div class="pm-notes">${notes.map(x => `<p>${x}</p>`).join("")}</div>` : ""}
  </div>`;
  // Conditions this roll used up, for the app to clear: Sinking always; Poise only if a Pride roll failed
  const consumed = { sinking: draft.sinking > 0, poise: draft.poise > 0 && (band === "failure" || band === "criticalFailure"), targetSinking: draft.targetSinking > 0 };
  return { html, voice: voiceTransition(before, actor), consumed };
}

/* ------------------------------------------------------------------ the Hail Mary */

/** `input`: { verdict, acceptance, skill, base, desire, dig, drastic, bond }. Returns { error } or { html: [verdict card, result card], voice }. */
export function hailMary(actor, input, rng = defaultRng()) {
  const s = actor.system, d = actor.derived;
  if (input.dig && d.egoCurrent < 2) return { error: t("Digging deep needs at least 2 E.G.O.") };
  const before = { ...d };
  const acceptance = bothSides(input.acceptance);                 // each of these is a string or { en, es }
  const accepted = acceptance.en.length > 0;
  const verdictHtml = verdictCardHtml(actor.name, input.verdict, input.acceptance, d.alignment);

  const difficulty = R.hailMaryDifficulty({ base: Number(input.base) || 2, digDeep: !!input.dig, fraying: d.fraying, drastic: !!input.drastic });
  const pool = Math.max(0, s.attributes.resolve + (s.skills[input.skill] ?? 0) + (input.bond ? 1 : 0) - s.broken - d.harmPenalty);
  const base = rollN(pool, rng);
  const successes = R.countSuccesses(base);
  let band = R.unopposedBand(successes, difficulty, base.includes(1));
  const notes = [];
  if ((band === "success" || band === "critical") && !accepted) { band = "partial"; notes.push(`<b>${esc(t("No Acceptance:"))}</b> ${esc(t("the Success becomes a Partial Distortion."))}`); }
  else if (band === "success" || band === "critical") notes.push(esc(t("The denial holds: the Verdict is answered.")));
  if (band === "partial" && accepted) notes.push(esc(t("Half-believing the Verdict.")));
  if (band === "failure" || band === "criticalFailure") notes.push(esc(t("The Verdict is louder than they are.")));
  if (!input.desire) notes.push(`<b>${esc(t("GM"))}:</b> ${esc(t("no sincere Desire is on the line, so this may not be a Hail Mary moment (Part IV §4). It can't be a tragedy the character already thought they deserved."))}`);
  const stressGain = band === "critical" || band === "success" ? 1 : 2;
  s.stress = Math.min(5, s.stress + stressGain);
  if (input.dig) s.ego.value = 0;
  if (band === "critical") s.ego.value = 1;
  refresh(actor);
  const html = `<div class="pm-card pm-hailmary"><div class="pm-card-head">${esc(actor.name)} &middot; ${esc(t("Hail Mary"))}</div>
    <div class="pm-card-lines"><div>${esc(ATTRIBUTE_LABEL.resolve)} ${s.attributes.resolve} + ${esc(SKILL_LABEL[input.skill])} ${s.skills[input.skill] ?? 0}${input.bond ? ` + ${esc(t("Bond"))}` : ""}${s.broken ? ` &minus; ${s.broken} ${esc(t("broken"))}` : ""} = ${pool} ${esc(t("dice"))} ${esc(t("vs Difficulty {n}", { n: difficulty }))}${d.fraying ? ` (${esc(t("Fraying"))})` : ""}${input.dig ? `, ${esc(t("digging deep"))}` : ""}${input.drastic ? `, ${esc(t("drastic moment"))}` : ""}</div></div>
    ${diceHtml(base, [])}
    <div class="pm-result">${esc(successesText(successes))} <span class="pm-band ${band}">${esc(bandLabel(band))}</span></div>
    <div class="pm-notes"><p>${esc(t(R.HAIL_MARY_RESULT[band]))}</p>${notes.map(x => `<p>${x}</p>`).join("")}<p>${esc(t("Stress +{n} applied.", { n: stressGain }))}${input.dig ? ` ${esc(t("E.G.O. spent."))}` : ""}</p></div></div>`;
  return { html: [verdictHtml, html], band, voice: voiceTransition(before, actor) };
}
export { verdictCandidates };

/* ------------------------------------------------------------------ Threats */

export function npcRoll(actor, rng = defaultRng(), { sinking = 0 } = {}) {
  const s = actor.system, dd = actor.derived;
  const weight = s.nextPenalty ?? 0;
  const sunk = Math.max(0, Math.min(3, sinking));
  const dice = Math.max(0, dd.dice + weight - sunk);
  const base = rollN(dice, rng);
  const successes = R.countSuccesses(base);
  if (weight < 0) s.nextPenalty = 0;
  return `<div class="pm-card"><div class="pm-card-head">${esc(actor.name)} (${esc(t("Grade"))} ${s.grade}${s.isGroup ? `, ${esc(t("group"))}` : ""})</div>
    <div class="pm-card-lines"><div>${dice} ${esc(t("dice"))}${weight < 0 ? ` (${esc(t("{a} less Sorrow's Weight {b}", { a: dd.dice, b: -weight }))})` : ""}${sunk ? ` (${esc(t("Sinking -{n}", { n: sunk }))})` : ""}${s.alignment ? ` &middot; ${esc(SIN_LABEL[s.alignment])} ${esc(t("rating"))} ${dd.sinRating}` : ""}</div></div>
    ${diceHtml(base, [])}<div class="pm-result">${esc(successesText(successes))}</div></div>`;
}

/* ------------------------------------------------------------------ Signature Techniques */

/**
 * Use a Sin's Signature Technique. `answers` = { follow: bool (use even after a non-matching roll), target (actor), hookWho, hookType }.
 * Returns { status: "ok", html } | { status: "info", html } | { status: "need", need: "follow" | "target" | "hook" } | { status: "fail", reason }.
 */
export function useTechnique(actor, sin, answers = {}) {
  const s = actor.system, d = actor.derived;
  const rating = s.resonance[sin] ?? 0, used = s.scene.techniques[sin] ?? 0;
  const check = R.canUseTechnique({ rating, used, strained: s.strained === sin });
  if (!check.ok) return { status: "fail", reason: t(check.reason, check.data) };
  const [name, text] = SIGNATURE[sin];
  const before = { ...d };
  const notes = [`<p>${esc(text)}</p>`];
  const follows = () => (s.scene.last?.sin === sin && s.scene.last?.success) || answers.follow;

  switch (sin) {
    case "wrath":
      if (!follows()) return { status: "need", need: "follow", name };
      s.scene.armed = "rampage"; s.scene.rampageOne = !!s.scene.last?.anyOne;
      notes.push(`<p><b>${esc(t("Armed."))}</b> ${esc(t("Your next roll is the second attack: tagged Wrath, at -1 die, and the dialog is preset for it. If either attack shows a 1, an unintended person takes Hurt."))}</p>`);
      break;
    case "lust": {
      if (!follows()) return { status: "need", need: "follow", name };
      if (!answers.hookType) return { status: "need", need: "hook", name };
      const who = answers.hookWho || t("the target");
      actor.items.push(newItem("bond", tNow("Hooked: {who}", { who }), { type: answers.hookType, strength: 1, person: who, temporary: true }));
      notes.push(`<p><b>${esc(t("{who} holds a 1-point {bond} Bond toward you until the scene ends.", { who, bond: BOND_TYPE_LABEL[answers.hookType] }))}</b> ${esc(t("It appears in your Bonds and in the roll dialog; spend it once like one of your own. The GM may veto if it crosses your Boundary."))}</p>`);
      break;
    }
    case "sloth":
      s.scene.unmoved = true;
      notes.push(`<p><b>${esc(t("Unmoved is up"))}</b> ${esc(t("until your next action. Anyone targeting you with the roll dialog takes -2 dice and can't add Help dice. Rolling anything yourself ends it."))}</p>`);
      break;
    case "gluttony": {
      const gain = Math.min(R.refundGranted(s.scene.refunds, 1), s.ego.max - d.egoCurrent);
      if (gain > 0) {
        s.ego.value = d.egoCurrent + gain; s.scene.refunds += gain;
        notes.push(`<p><b>+${gain} E.G.O.</b> ${esc(t("applied (refunds this scene: {n}/{cap}). You still owe the scene a cost: the GM names one.", { n: s.scene.refunds, cap: R.REFUND_CAP }))}</p>`);
      } else {
        notes.push(`<p>${esc(t("No E.G.O. to regain (full, or the {cap}-per-scene refund cap is reached). Take something instead: an object or a secret. You still owe the scene a cost.", { cap: R.REFUND_CAP }))}</p>`);
      }
      break;
    }
    case "gloom": {
      if (!follows()) return { status: "need", need: "follow", name };
      if (!answers.target) return { status: "need", need: "target", name };
      setPenalty(answers.target, -2);
      notes.push(`<p><b>${esc(answers.target.name)}</b> ${esc(t("takes -2 dice on their next roll this scene. It is applied automatically to their next roll, and to your roll if they are the target of it."))}</p>`);
      break;
    }
    case "pride":
    case "envy": {
      const how = sin === "pride"
        ? t("Unbowed is offered automatically after a roll that fails or comes up Partial: you may reroll up to three dice that didn't succeed, and if it still fails you take a Complication.")
        : t("Borrowed Face appears as a checkbox in the roll dialog. Choose the opponent's Sin, tick it, and you tag the same Sin: the matchup is neutral and you add +1 die.");
      return { status: "info", html: actorCard(actor, `${esc(SIN_LABEL[sin])}: ${esc(name)}`, `<p>${esc(text)}</p><p>${esc(how)} ${esc(t("This button spends nothing ({used}/{max} used this scene).", { used, max: check.max }))}</p>`) };
    }
  }
  s.scene.techniques[sin] = used + 1;
  refresh(actor);
  return { status: "ok", html: actorCard(actor, `${esc(SIN_LABEL[sin])}: ${esc(name)} <small>(${esc(t("{n}/{max} this scene", { n: used + 1, max: check.max }))})</small>`, notes.join("")), voice: voiceTransition(before, actor) };
}

/** Invoke a Vice: +1 E.G.O., once per scene, inside the refund cap. */
export function invokeVice(actor) {
  const s = actor.system, d = actor.derived;
  if (s.scene.viceUsed) return { status: "fail", reason: t("A Vice pays out E.G.O. at most once per scene.") };
  const gain = Math.min(R.refundGranted(s.scene.refunds, 1), s.ego.max - d.egoCurrent);
  s.scene.viceUsed = true;
  if (gain > 0) { s.ego.value = d.egoCurrent + gain; s.scene.refunds += gain; }
  refresh(actor);
  return { status: "ok", html: actorCard(actor, esc(t("Vice invoked")), `<p>${t("<b>{vice}</b> creates a complication in the scene.", { vice: esc(s.vice || t("Their Vice")) })}</p><p>${gain > 0 ? esc(t("+{n} E.G.O. (refunds this scene: {r}/{cap}).", { n: gain, r: s.scene.refunds, cap: R.REFUND_CAP })) : esc(t("No E.G.O. gained (full, or the refund cap is reached)."))}</p>`) };
}

/* ------------------------------------------------------------------ scene and character upkeep */

export function newScene(actor) {
  const s = actor.system;
  Object.assign(s.scene, { flashpoint: false, pullUsed: false, viceUsed: false, refunds: 0, armed: "", rampageOne: false, unmoved: false, nextPenalty: 0, last: { sin: "", success: false, anyOne: false } });
  for (const k of R.SINS) s.scene.techniques[k] = 0;
  s.riding = "";
  actor.items = actor.items.filter(i => !(i.type === "bond" && i.system.temporary));
  refresh(actor);
}
export function rest(actor) {
  const s = actor.system;
  s.ego.value = Math.min(s.ego.max, actor.derived.egoCurrent + 1);
  refresh(actor);
}
export function ride(actor, sin) {
  const s = actor.system;
  if (s.riding === sin) { s.riding = ""; refresh(actor); return { ok: true }; }
  if ((s.resonance[sin] ?? 0) < 2) return { ok: false, reason: t("You need Resonance 2 or more in a Sin to Ride it.") };
  s.riding = sin; s.tally[sin] += 1;
  refresh(actor);
  return { ok: true };
}
/** End-of-fourth-session Drift. `clearAnyway` clears the tally even when no Sin leads by 8. Returns { drift, html }. */
export function drift(actor, clearAnyway = false) {
  const s = actor.system;
  const dr = R.computeDrift(s.resonance, s.tally);
  if (!dr && !clearAnyway) return { drift: null };
  if (dr) { s.resonance[dr.gain] += 1; s.resonance[dr.lose] -= 1; }
  for (const k of R.SINS) s.tally[k] = 0;
  refresh(actor);
  return { drift: dr, html: dr ? actorCard(actor, esc(t("Drift")), `<p>${t("<b>{gain}</b> gains 1; <b>{lose}</b> loses 1. The tally is cleared.", { gain: esc(SIN_LABEL[dr.gain]), lose: esc(SIN_LABEL[dr.lose]) })}</p>`) : null };
}
export function adjustWear(item, delta) {
  item.system.wear = Math.max(0, Math.min(3, item.system.wear + delta));
  item.derived = { spent: item.system.wear >= 3, attuned: !!item.system.sin && item.system.kind !== "mundane" };
}

/* ------------------------------------------------------------------ crew and downtime */

export const ownedAssets = crew => Object.keys(ASSET_LABEL).filter(k => crew?.system.assets[k]);
/** Office Grade: the best (lowest) Grade among the members, else 9. */
export function officeGrade(members) {
  return members.length ? Math.min(...members.map(a => a.system.grade)) : 9;
}
export function crewMembers(crew, all) {
  const chars = all.filter(a => a.type === "character");
  const ids = crew.system.memberIds;
  return ids.length ? chars.filter(a => ids.includes(a.id)) : chars;
}
export function maxRiskOffered(grade) {
  return grade <= 1 ? "any" : (grade <= 4 ? "4" : (grade <= 7 ? "3" : "2"));
}

/**
 * Downtime bookkeeping (Part VIII §10). `choice` = { [actorId]: { rest, repair } }; `dormantPick` is the Asset to sleep when the Fund can't pay.
 * Returns { lines, needsDormantPick } — if the Fund is empty and no pick was given, nothing is applied for the crew and `needsDormantPick` lists the options.
 */
export function runDowntime(actors, crew, choice, dormantPick = "") {
  const owned = ownedAssets(crew);
  const safehouse = !!crew?.system.assets.safehouse && crew.system.dormantAsset !== "safehouse";
  const fund = crew ? R.fundUpkeep({ assetCount: owned.length, fund: crew.system.fund }) : { pays: 0, ok: true };
  if (crew && owned.length >= 3 && !fund.ok && !dormantPick) return { needsDormantPick: owned };
  const lines = [];
  for (const a of actors) {
    const s = a.system;
    const spentItems = gearOf(a).filter(i => i.derived?.spent);
    const c = choice[a.id] ?? { rest: true, repair: false };
    const plan = R.upkeepPlan({ resources: s.resources, spentGear: spentItems.length, repair: !!c.repair });
    const was = s.resources;
    s.resources = plan.resources;
    if (plan.stressGain) s.stress = Math.min(5, s.stress + plan.stressGain);
    refresh(a);
    let gain = 0;
    if (c.rest) {
      const start = Math.min(a.derived.egoCurrent, s.ego.max);
      gain = R.restGain({ ego: start, max: s.ego.max, safehouse });
      s.ego.value = start + gain;
    }
    for (const item of spentItems.slice(0, plan.repaired)) { item.system.wear = 0; item.derived = { ...item.derived, spent: false }; }
    refresh(a);
    lines.push(`<b>${esc(a.name)}</b>: ${plan.stressGain ? t("could not pay upkeep, <b>Stress +1</b>") : t("paid {paid} (Resources {from} to {to})", { paid: plan.paid, from: was, to: plan.resources })}${plan.repaired ? `, ${esc(t("repaired {n} pieces of gear", { n: plan.repaired }))}` : ""}${gain ? `, ${t("rested <b>+{n} E.G.O.</b>", { n: gain })}` : ""}`);
  }
  if (crew) {
    if (owned.length < 3 || fund.ok) {
      if (fund.pays) { crew.system.fund -= fund.pays; lines.push(t("<b>Fund</b> paid {pays} to keep {n} Assets up (now {left}).", { pays: fund.pays, n: owned.length, left: crew.system.fund })); }
      else if (crew.system.dormantAsset) lines.push(esc(t("Fund no longer needed for upkeep: the dormant Asset is back.")));
      crew.system.dormantAsset = "";
    } else {
      crew.system.dormantAsset = dormantPick || owned[owned.length - 1];
      lines.push(t("<b>Fund</b> could not pay: <b>{asset}</b> goes dormant until it can.", { asset: esc(ASSET_LABEL[crew.system.dormantAsset]) }));
    }
    refresh(crew);
  }
  return { lines, html: card(esc(t("Downtime phase")), lines.map(l => `<p>${l}</p>`).join("")) };
}
/** Pay a Contract out to members: Resources equal to Risk (minus the Office's cut at Risk 3 or 4), capped at 5. */
export function payMembers(actors, risk, throughOffice = true) {
  const pay = R.contractPayment(risk, throughOffice);
  for (const a of actors) { a.system.resources = R.addResources(a.system.resources, pay); refresh(a); }
  return pay;
}
