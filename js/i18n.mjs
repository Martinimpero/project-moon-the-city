/**
 * Localization. English is the source language and is also the lookup key, so a string with no translation simply
 * shows in English. Spanish lives in es.mjs. The language is chosen in the app (setLang) and remembered by the store.
 * Placeholders look like {name}.
 */
import { ES as RULES_ES } from "./es.mjs";
import { UI_ES } from "./ui_es.mjs";
import { ROOM_ES } from "./room_es.mjs";
import { BOARD_ES } from "./board_es.mjs";
import { HANDOUT_ES } from "./handout_es.mjs";
import { SAFETY_ES } from "./safety_es.mjs";
const ES = { ...RULES_ES, ...UI_ES, ...ROOM_ES, ...BOARD_ES, ...HANDOUT_ES, ...SAFETY_ES };

let lang = "en";
export function setLang(l) { lang = l === "es" ? "es" : "en"; }
export const currentLang = () => lang;
export const isSpanish = () => lang === "es";

const fill = (s, data) => (data ? s.replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m)) : s);

/* Bilingual mode: while a log card is being built, t() returns "\u0001English\u0002Spanish\u0003" markers instead of one language.
   `expandMarkers` then turns the finished card into an English copy and a Spanish copy (same dice, same numbers), and the page shows
   the copy that matches its own language. Markers can nest (a translated word inside a translated sentence). */
let bilingualDepth = 0;
export const MARKERS = /\u0001([^\u0001-\u0003]*)\u0002([^\u0001-\u0003]*)\u0003/g;
export const hasMarkers = s => typeof s === "string" && s.includes("\u0001");
export function expandMarkers(s, l) {
  if (!hasMarkers(s)) return s;
  let prev;
  do { prev = s; s = s.replace(MARKERS, (m, en, es) => (l === "es" ? es : en)); } while (s !== prev);
  return s;
}
/** Run `fn` (which builds a card) in bilingual mode. Whatever it returns may contain markers: pass the HTML through `bilingualHtml`. */
export function bilingual(fn) {
  bilingualDepth++;
  try { return fn(); } finally { bilingualDepth--; }
}
/** A finished card with markers, as the HTML to store: both languages, or one if nothing in it depends on the language. */
export function bilingualHtml(html) {
  if (!hasMarkers(html)) return html;
  const en = expandMarkers(html, "en"), es = expandMarkers(html, "es");
  return en === es ? en : `<div data-bi2><div lang="en">${en}</div><div lang="es">${es}</div></div>`;
}

/** Translate `key` (an English string) and fill in {placeholders} from `data`. */
export function t(key, data) {
  if (bilingualDepth > 0) {
    const en = fill(key, data), es = fill(ES[key] ?? key, data);
    return en === es ? en : `\u0001${en}\u0002${es}\u0003`;
  }
  return fill(isSpanish() ? (ES[key] ?? key) : key, data);
}
/**
 * Text that exists in both languages already (a handout, a character's Fear written twice): inside a bilingual card it becomes a marker
 * carrying both, anywhere else it is whichever suits the app's language.
 */
export function pair(en, es) {
  if (!es || es === en) return en;
  if (!en) return es;
  return bilingualDepth > 0 ? `\u0001${en}\u0002${es}\u0003` : (isSpanish() ? es : en);
}
/** Like t(), but always one language (the app's), even inside a bilingual card: for text that is stored, such as an item's name. */
export function tNow(key, data) {
  return fill(isSpanish() ? (ES[key] ?? key) : key, data);
}

/** Translate into a chosen language ("en" or "es") whatever the app is set to; used for the second-language version of a handout. */
export function tIn(l, key, data) {
  let s = l === "es" ? (ES[key] ?? key) : key;
  if (data) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m));
  return s;
}

/** Wrap a (nested) table of English labels so that every string read from it is translated at read time. */
export function localized(obj) {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v === "string") return t(v);
      if (v && typeof v === "object") return localized(v);
      return v;
    }
  });
}
