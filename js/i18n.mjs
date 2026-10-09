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
const ES = { ...RULES_ES, ...UI_ES, ...ROOM_ES, ...BOARD_ES, ...HANDOUT_ES };

let lang = "en";
export function setLang(l) { lang = l === "es" ? "es" : "en"; }
export const currentLang = () => lang;
export const isSpanish = () => lang === "es";

/** Translate `key` (an English string) and fill in {placeholders} from `data`. */
export function t(key, data) {
  let s = isSpanish() ? (ES[key] ?? key) : key;
  if (data) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m));
  return s;
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
