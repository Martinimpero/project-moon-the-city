/**
 * Prints the character sheet's HTML (the same page the app prints) for a pregenerated character, in one language, to stdout:
 *   node tools/sheet_html.mjs en|es [Name]        (default: Wren Okoro; "blank" prints the empty sheet)
 * Used by design/build/make_gm_docs.py to put the real sheet into the player's guide.
 */
import { PREGENS, PREGENS_ES } from "../js/pregens.mjs";
import { newActor, refresh } from "../js/model.mjs";
import { setLang, t } from "../js/i18n.mjs";
import * as PR from "../js/printout.mjs";

const lang = process.argv[2] === "es" ? "es" : "en", who = process.argv[3] ?? "Wren Okoro";
setLang(lang);
if (who === "blank") { process.stdout.write(PR.characterPage(null, (k, d) => t(k, d))); process.exit(0); }
const p = PREGENS.find(x => x.name === who) ?? PREGENS[0], esData = PREGENS_ES.find(x => x.name === p.name);
const es = lang === "es" ? esData : null;
const base = es ? { ...p.system, ...es.text, lang: "es" } : { ...p.system, lang: "en" };
const actor = newActor("character", p.name, base, es ? es.items : p.items);
refresh(actor);
process.stdout.write(PR.characterPage(actor, (k, d) => t(k, d)));
