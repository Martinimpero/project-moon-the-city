/**
 * The Voice and the Verdict (Part IV §1 and §4, Part X §5).
 * The Voice is the quiet reading of a character's life that only they hear: soft when they are Unsteady, loud when Empty.
 * At the Hail Mary it becomes the Verdict, spoken by the GM in the words of the character's Fear and in their Sin's voice.
 * The text here is a prompt for the table, not a script: edit it freely.
 */
import { SIN_LABEL } from "./config.mjs";
import { t, localized, pair } from "./i18n.mjs";

const ATTRIBUTES = ["body", "mind", "presence", "resolve"];

/** The line each Sin's Voice tends to say. */
export const SIN_VOICE = localized({
  wrath: "You are going to let them get away with it again.",
  lust: "Hold on to them. Do not let them go.",
  sloth: "Wait. Do not choose. Someone else will.",
  gluttony: "More. You will never have enough.",
  gloom: "It is your fault. It was always your fault.",
  pride: "Do not let them see you stumble.",
  envy: "They have what you lost."
});

/** What a Flashpoint looks like, by the character's highest Attribute (Part IV §1). */
export const ATTRIBUTE_SHAPE = localized({
  body: "lashes out",
  mind: "withdraws or sabotages quietly",
  presence: "performs or provokes",
  resolve: "refuses and digs in"
});

/** Highest Attribute; ties go to the first in the order Body, Mind, Presence, Resolve. */
export function highestAttribute(attributes) {
  return ATTRIBUTES.reduce((best, a) => (attributes[a] > attributes[best] ? a : best), ATTRIBUTES[0]);
}
export function flashpointShape(attributes) {
  const a = highestAttribute(attributes);
  return { attribute: a, shape: ATTRIBUTE_SHAPE[a] };
}

const clean = s => String(s ?? "").trim();
/** What the character's own words in a field are, in both languages when the sheet has both (Fear, Burden, Boundary). */
function words(system, key) {
  const main = clean(system[key]), alt = clean(system.alt?.[key]);
  if (!alt) return main;
  return system.lang === "es" ? pair(alt, main) : pair(main, alt);
}
const fallbackLine = () => t("You know how this ends.");
const fearLine = fear => t('You are afraid of this, and it is already true: "{fear}"', { fear });

/** The Voice for a character who has just become Unsteady or Empty. `level` is "unsteady" or "empty". */
export function voiceText(system, level) {
  const sin = system.alignment;
  const line = SIN_VOICE[sin] ?? fallbackLine();
  const { shape } = flashpointShape(system.attributes);
  const fear = words(system, "fear"), burden = words(system, "burden");
  if (level === "empty") {
    const parts = [line];
    if (fear) parts.push(fearLine(fear));
    if (burden) parts.push(t("You remember. {burden}", { burden }));
    return { player: parts.join(" "), gm: t("Empty: the Voice is loud now. A Flashpoint on every 1. When it hits, they {shape} (their highest Attribute).", { shape }), loud: true };
  }
  return { player: line + (fear ? ` ${fear}` : ""), gm: t("Unsteady: the Voice is soft, just under their thoughts. The first 1 each scene is a Flashpoint; they {shape}.", { shape }), loud: false };
}

/** Three candidate Verdicts for the Hail Mary, all in the Fear's words and the Sin's voice. The GM picks or rewrites one. */
export function verdictCandidates(system) {
  const sin = system.alignment;
  const line = SIN_VOICE[sin] ?? fallbackLine();
  const fear = words(system, "fear"), burden = words(system, "burden"), boundary = words(system, "boundary");
  const out = [];
  out.push(`${line}${fear ? ` ${fearLine(fear)}` : ""}`);
  if (burden) out.push(t("You remember it. {burden} People like you always let it happen.", { burden }));
  if (boundary) out.push(t('You swore: "{boundary}" Say it again, and watch yourself break it.', { boundary }));
  return out;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** A Verdict or Acceptance may be one string or { en, es }; a missing side is filled from the other, so the card reads whole in both. */
export function bothSides(v) {
  if (v && typeof v === "object") {
    const en = clean(v.en), es = clean(v.es);
    return { en: en || es, es: es || en };
  }
  const x = clean(v);
  return { en: x, es: x };
}
/** Chat HTML for the Verdict and the Acceptance, so the table has them on the record. Each is a string or { en, es }. */
export function verdictCardHtml(actorName, verdict, acceptance, sin) {
  const v = bothSides(verdict), a = bothSides(acceptance);
  return `<div class="pm-card pm-verdict"><div class="pm-card-head">${esc(actorName)} &middot; ${esc(t("The Verdict"))}${sin ? ` <small>(${esc(SIN_LABEL[sin])})</small>` : ""}</div>
    <div class="pm-notes"><p class="pm-voice">&ldquo;${esc(pair(v.en, v.es))}&rdquo;</p>
    ${a.en ? `<p><b>${esc(t("Acceptance."))}</b> <i>${esc(pair(a.en, a.es))}</i></p>` : `<p><b>${esc(t("No Acceptance yet."))}</b> ${esc(t("The answer has not been spoken."))}</p>`}</div></div>`;
}
