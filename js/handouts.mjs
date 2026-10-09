/** Handouts: things the GM shows the table (a contract, a note, a photo). Plain data and helpers. */
import { uid } from "./model.mjs";

export const MAX_HANDOUTS = 60;
export const MAX_TEXT = 6000;

export const LANGS = ["en", "es"];
export const LANG_NAME = { en: "English", es: "Español" };
const clip = (v, n) => String(v ?? "").slice(0, n);

/**
 * A handout has a main version (title, text, in language `lang`) and an optional version in the other language (`alt`).
 * Players read the one in their own language when there is one, and can flip to the other.
 */
export function newHandout({ title = "", text = "", img = "", lang = "en", alt = null } = {}) {
  return { id: uid(), title: clip(title, 80), text: clip(text, MAX_TEXT), img, lang: LANGS.includes(lang) ? lang : "en", alt: { title: clip(alt?.title, 80), text: clip(alt?.text, MAX_TEXT) }, shown: false };
}
/** Fill in anything an older save lacks. */
export function normalizeHandout(h) {
  h.lang = LANGS.includes(h.lang) ? h.lang : "en";
  h.alt = { title: clip(h.alt?.title, 80), text: clip(h.alt?.text, MAX_TEXT) };
  return h;
}
export const hasAlt = h => !!(h.alt && (h.alt.title.trim() || h.alt.text.trim()));
/** The other language than `lang`. */
export const otherLang = lang => (lang === "es" ? "en" : "es");
/** The version to show someone reading in `lang`: theirs if there is one, else the main one. `translated` says whether it is in their language. */
export function pick(h, lang) {
  normalizeHandout(h);
  if (lang !== h.lang && hasAlt(h)) return { lang: otherLang(h.lang), title: h.alt.title || h.title, text: h.alt.text, translated: true, both: true };
  return { lang: h.lang, title: h.title, text: h.text, translated: lang === h.lang, both: hasAlt(h) };
}
/** The version in a specific language, if the handout has one. */
export function versionIn(h, lang) {
  normalizeHandout(h);
  if (lang === h.lang) return { lang, title: h.title, text: h.text };
  return hasAlt(h) ? { lang, title: h.alt.title || h.title, text: h.alt.text } : null;
}
/** What goes to players: no `shown` flag, nothing else of the GM's. */
export const forPlayers = h => ({ id: h.id, title: h.title, text: h.text, img: h.img, lang: h.lang, alt: h.alt });
export const shownList = list => list.filter(h => h.shown).map(forPlayers);

/**
 * A starter the GM can fill in: the paperwork of a Contract (Part V: Client, Risk, payment, Report), with the field names
 * in both languages. `tr(lang, key)` translates a label; `lang` is the language of the main version.
 */
export function contractTemplate(tr, lang) {
  const other = otherLang(lang);
  const build = l => ({
    title: tr(l, "Contract"),
    text: ["Client", "Risk", "The job", "Payment", "Deadline", "Terms"].map(k => `${tr(l, k)}: `).join("\n")
  });
  return { ...build(lang), lang, alt: build(other) };
}

/** Plain text to safe HTML: paragraphs on blank lines, line breaks kept, *emphasis* and **bold** only. */
export function textToHtml(text, esc) {
  return String(text ?? "").split(/\n{2,}/).filter(p => p.trim()).map(p =>
    `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>")}</p>`).join("");
}
