/**
 * The Threat library: reusable opponents (the vault's Bestiary plus your own), and the arithmetic of an encounter. Plain functions, so Node can test them.
 * A template is { id, name, es, cat, danger, grade, sin, track, group, atk, def, res, tech[], want, bond, detail, use }. Dice and Difficulty always
 * come from the Grade through the rules (Appendix E), never from the template.
 */
import { THREATS } from "./threatdata.mjs";
import { npcDice, npcDifficulty, npcSinRating } from "./rules.mjs";
import { uid } from "./model.mjs";

export const MAX_CUSTOM = 100, MAX_ENCOUNTER = 40;
const clip = (v, n) => String(v ?? "").slice(0, n);
const SINS = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"];

/** Bundled templates followed by the table's own, each with its pool worked out. */
export function allTemplates(custom = []) {
  return [...THREATS.map(x => ({ ...x, mine: false })), ...cleanCustom(custom).map(x => ({ ...x, mine: true }))].map(withPool);
}
export function withPool(tpl) {
  return { ...tpl, dice: npcDice(tpl.grade, tpl.group), difficulty: npcDifficulty(tpl.grade), sinRating: tpl.sin ? npcSinRating(tpl.grade) : 0 };
}
export const nameIn = (tpl, lang) => (lang === "es" && tpl.es) || tpl.name;
export const byId = (id, custom = []) => allTemplates(custom).find(x => x.id === id);

/** Search by name (either language, any case) and narrow by Grade band, Sin and category. Grade bands follow Appendix E: "8-9", "5-7", "2-4", "1". */
export function filter(list, { q = "", band = "", sin = "", cat = "" } = {}) {
  const needle = q.trim().toLowerCase();
  const inBand = g => !band || { "8-9": g >= 8, "5-7": g >= 5 && g <= 7, "2-4": g >= 2 && g <= 4, "1": g === 1 }[band];
  return list.filter(x => inBand(x.grade) && (!sin || x.sin === sin) && (!cat || x.cat === cat) && (!needle || `${x.name} ${x.es} ${x.danger}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name));
}
export const categories = list => [...new Set(list.map(x => x.cat))];

/** The notes a new Threat starts with: the numbers the sheet has no field for. */
export function statNotes(tpl, tr = k => k) {
  const lines = [];
  if (tpl.atk || tpl.def || tpl.res) lines.push(`${tr("Attack")} ${tpl.atk} · ${tr("Defense")} ${tpl.def} · ${tr("Resolve")} ${tpl.res}`);
  if (tpl.track) lines.push(`${tr("Track")}: ${tpl.track}`);
  for (const x of tpl.tech ?? []) lines.push(x.name ? `${x.name}: ${x.text}` : x.text);
  if (tpl.use) lines.push(`${tr("Use in play")}: ${tpl.use}`);
  return lines.join("\n");
}

/**
 * The sheets for `count` of a template. A group template is one Threat (the group rolls +2 dice and has one track); anything else becomes `count`
 * separate Threats, numbered when there is more than one. `sin` overrides the template's Sin (for the "choose" ones).
 */
export function build(tpl, { count = 1, lang = "en", sin, tr = k => k, newActor }) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(count)) || 1)), base = nameIn(tpl, lang);
  const make = name => newActor("npc", name, {
    concept: tpl.danger || "", grade: tpl.grade, isGroup: !!tpl.group, alignment: SINS.includes(sin ?? tpl.sin) ? (sin ?? tpl.sin) : "",
    want: tpl.want || "", bondHook: tpl.bond || "", detail: tpl.detail || "", notes: statNotes(tpl, tr)
  });
  if (tpl.group) return [make(n > 1 ? `${base} x${n}` : base)];
  return Array.from({ length: n }, (_, i) => make(n > 1 ? `${base} ${i + 1}` : base));
}

/* ---- the encounter being built: [{ id, count }] ---- */
export function addTo(enc, id, by = 1) {
  const row = enc.find(r => r.id === id);
  if (row) row.count = Math.max(1, Math.min(20, row.count + by));
  else if (enc.length < MAX_ENCOUNTER) enc.push({ id, count: 1 });
  return enc;
}
export const dropFrom = (enc, id) => { const i = enc.findIndex(r => r.id === id); if (i >= 0) enc.splice(i, 1); return enc; };

/** What the encounter comes to: each row's pool, and the totals the GM needs at a glance. Unknown ids (a deleted custom template) are skipped. */
export function summary(enc, custom = []) {
  const all = allTemplates(custom), rows = [];
  for (const r of enc) {
    const tpl = all.find(x => x.id === r.id); if (!tpl) continue;
    const sheets = tpl.group ? 1 : r.count;
    rows.push({ tpl, count: r.count, sheets, dice: tpl.dice, difficulty: tpl.difficulty, diceTotal: tpl.dice * sheets });
  }
  return {
    rows, sheets: rows.reduce((s, r) => s + r.sheets, 0), foes: rows.reduce((s, r) => s + r.count, 0), diceTotal: rows.reduce((s, r) => s + r.diceTotal, 0),
    bestGrade: rows.length ? Math.min(...rows.map(r => r.tpl.grade)) : 0,
    soloNamed: rows.filter(r => r.tpl.grade <= 4 && !r.tpl.group).map(r => r.tpl)          // Part VI: a named opponent of Grade 4 or lower gets one extra defensive response
  };
}

/* ---- the table's own templates ---- */
export function cleanCustom(list) {
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x === "object" && x.id).slice(0, MAX_CUSTOM).map(x => ({
    id: String(x.id), name: clip(x.name, 60) || "Threat", es: clip(x.es, 60), cat: "Mine", danger: clip(x.danger, 40), grade: Math.max(1, Math.min(9, Math.floor(Number(x.grade)) || 9)),
    sin: SINS.includes(x.sin) ? x.sin : "", track: clip(x.track, 60), group: !!x.group, atk: 0, def: 0, res: 0,
    tech: (Array.isArray(x.tech) ? x.tech : []).slice(0, 6).map(y => ({ name: clip(y?.name, 40), text: clip(y?.text, 400) })),
    want: clip(x.want, 200), bond: clip(x.bond, 200), detail: clip(x.detail, 200), use: clip(x.use, 400)
  }));
}
/** A template from a Threat sheet (the sheet's notes become the "use" text). */
export function fromActor(actor) {
  const s = actor.system;
  return { id: uid(), name: actor.name, es: "", cat: "Mine", danger: s.concept, grade: s.grade, sin: s.alignment, track: s.isGroup ? "Threat" : "", group: !!s.isGroup, atk: 0, def: 0, res: 0, tech: [], want: s.want, bond: s.bondHook, detail: s.detail, use: s.notes };
}
