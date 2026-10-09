/**
 * Character creation, as Part III of the manual lays it out (§3 the fourteen steps, §4 the point-buy, §5 Occupation packages, §8 what is derived).
 * Plain logic: a `build` (the answers so far) goes in, problems and a finished character come out. The guided screens are in wizard.mjs.
 */
import { newActor } from "./model.mjs";
import { ATTRIBUTES, SKILLS, SINS, highestSin } from "./rules.mjs";

export const ATTR_POINTS = 6, ATTR_MAX = 4;                     // all start at 1; 6 more points; 4 at most (5 is earned in play)
export const PACKAGE_SKILLS = 3, PACKAGE_RATING = 2;            // the Occupation sets 3 Skills to 2
export const FREE_POINTS = 7, SKILL_MAX = 3;                    // then 7 more points; no Skill above 3 at creation
export const RESONANCE_POINTS = 6, RESONANCE_MAX = 3;           // six points across the Sins, at most 3 in one
export const START_STRESS = 1, START_RESOURCES = 2, START_GRADE = 9, GEAR_MAX_COST = 2;
export const BOND_TYPES = ["trust", "fear", "debt", "affection", "obligation", "hatred"];
export const AFFILIATION_BONDS = ["obligation", "debt"];        // "usually Obligation or Debt, Strength 1"

/** The Occupation packages (§5). A package is a template: the player may change the three Skills. Where the manual says "A or B", the first is picked. */
export const OCCUPATIONS = [
  { key: "fixer", name: "Fixer (any grade)", skills: ["streetwise", "fixer", "combat"], or: "Combat or Stealth" },
  { key: "researcher", name: "Wing Researcher", skills: ["corporate", "technology", "medicine"], or: "Medicine or Investigation" },
  { key: "employee", name: "Office Employee", skills: ["corporate", "persuasion", "investigation"] },
  { key: "survivor", name: "Backstreets Survivor", skills: ["streetwise", "athletics", "stealth"], or: "Stealth, Medicine or Technology" },
  { key: "syndicate", name: "Syndicate Member", skills: ["streetwise", "persuasion", "combat"] },
  { key: "medic", name: "Backstreets Medic (unlicensed)", skills: ["medicine", "streetwise", "empathy"] },
  { key: "security", name: "Wing Security", skills: ["combat", "investigation", "persuasion"] },
  { key: "investigator", name: "Independent Investigator", skills: ["investigation", "empathy", "deception"], or: "Deception or Persuasion" }
];

export const STEPS = ["name", "who", "ties", "wound", "wants", "attributes", "skills", "gear", "review"];

export function blankBuild() {
  return {
    name: "", concept: "", identity: "", background: "", occupation: "", occKey: "", package: [],
    affiliation: "", affBond: "obligation", relationship: "", relBond: "trust", principle: "",
    burden: "", fear: "", boundary: "", resonance: Object.fromEntries(SINS.map(s => [s, 0])),
    desire: "", vice: "", ambition: "",
    attrs: Object.fromEntries(ATTRIBUTES.map(a => [a, 1])),
    extra: Object.fromEntries(SKILLS.map(s => [s, 0])),
    bgSkill: "", bgBond: false,
    gearName: "", gearKind: "mundane", gearSin: "", gearNote: ""
  };
}

/** Choose a package: the three Skills are set from it (the player can change them afterwards). */
export function applyOccupation(build, key) {
  const occ = OCCUPATIONS.find(o => o.key === key);
  build.occKey = key;
  if (occ) { build.package = [...occ.skills]; }
  return build;
}

/* ---------------------------------------------------------------- the numbers */

export const attrValue = (b, a) => b.attrs[a];
export function skillValue(b, skill) {
  return (b.package.includes(skill) ? PACKAGE_RATING : 0) + (b.extra[skill] || 0) + (b.bgSkill === skill ? 1 : 0);
}
export const attrPointsLeft = b => ATTR_POINTS - ATTRIBUTES.reduce((n, a) => n + (b.attrs[a] - 1), 0);
export const skillPointsLeft = b => FREE_POINTS - SKILLS.reduce((n, s) => n + (b.extra[s] || 0), 0);
export const resonanceLeft = b => RESONANCE_POINTS - SINS.reduce((n, s) => n + b.resonance[s], 0);
export const alignmentOf = b => (SINS.some(s => b.resonance[s] > 0) ? highestSin(b.resonance) : "");
/** The Sins tied for highest (more than one means the first on the sheet is the Alignment; the player may want to break the tie). */
export function tiedTop(b) {
  const top = Math.max(...SINS.map(s => b.resonance[s]));
  return top > 0 ? SINS.filter(s => b.resonance[s] === top) : [];
}

/** Change one number by `delta` if the rules allow it. Returns true if it changed. */
export function bumpAttr(b, a, delta) {
  const next = b.attrs[a] + delta;
  if (next < 1 || next > ATTR_MAX) return false;
  if (delta > 0 && attrPointsLeft(b) < delta) return false;
  b.attrs[a] = next; return true;
}
export function bumpSkill(b, s, delta) {
  const next = (b.extra[s] || 0) + delta;
  if (next < 0) return false;
  if (delta > 0 && (skillPointsLeft(b) < delta || skillValue(b, s) + delta > SKILL_MAX)) return false;
  b.extra[s] = next; return true;
}
export function bumpResonance(b, sin, delta) {
  const next = b.resonance[sin] + delta;
  if (next < 0 || next > RESONANCE_MAX) return false;
  if (delta > 0 && resonanceLeft(b) < delta) return false;
  b.resonance[sin] = next; return true;
}
/** Tick or untick one of the three package Skills. A package is exactly three. */
export function togglePackageSkill(b, skill) {
  if (b.package.includes(skill)) { b.package = b.package.filter(s => s !== skill); return true; }
  if (b.package.length >= PACKAGE_SKILLS) return false;
  b.package = [...b.package, skill]; b.extra[skill] = b.extra[skill] || 0;
  return true;
}

/* ---------------------------------------------------------------- what is still wrong */

const TEXT_FIELDS = [
  ["concept", "who"], ["identity", "who"], ["background", "who"], ["occupation", "who"], ["affiliation", "ties"], ["relationship", "ties"],
  ["principle", "ties"], ["burden", "wound"], ["fear", "wound"], ["boundary", "wound"], ["desire", "wants"], ["vice", "wants"], ["ambition", "wants"]
];

/**
 * Everything the manual asks for that is not done or not allowed, as { step, code, severity, field? }.
 * "error" = against the rules (over a maximum, a package that is not three Skills); "todo" = not finished yet (blank answers, points left).
 */
export function problems(b) {
  const out = [];
  if (!b.name.trim()) out.push({ step: "name", code: "name", severity: "todo", field: "name" });
  for (const [field, step] of TEXT_FIELDS) if (!String(b[field] ?? "").trim()) out.push({ step, code: "blank", severity: "todo", field });
  if (b.package.length !== PACKAGE_SKILLS) out.push({ step: "who", code: "package", severity: "todo" });
  if (attrPointsLeft(b) > 0) out.push({ step: "attributes", code: "attrLeft", severity: "todo", n: attrPointsLeft(b) });
  if (attrPointsLeft(b) < 0 || ATTRIBUTES.some(a => b.attrs[a] > ATTR_MAX || b.attrs[a] < 1)) out.push({ step: "attributes", code: "attrOver", severity: "error" });
  if (skillPointsLeft(b) > 0) out.push({ step: "skills", code: "skillLeft", severity: "todo", n: skillPointsLeft(b) });
  if (skillPointsLeft(b) < 0 || SKILLS.some(s => skillValue(b, s) > SKILL_MAX)) out.push({ step: "skills", code: "skillOver", severity: "error" });
  if (resonanceLeft(b) > 0) out.push({ step: "wound", code: "resLeft", severity: "todo", n: resonanceLeft(b) });
  if (resonanceLeft(b) < 0 || SINS.some(s => b.resonance[s] > RESONANCE_MAX)) out.push({ step: "wound", code: "resOver", severity: "error" });
  if (b.gearName.trim() && b.gearKind !== "mundane" && !b.gearSin) out.push({ step: "gear", code: "gearSin", severity: "todo" });
  return out;
}
export const problemsFor = (b, step) => problems(b).filter(p => p.step === step);

/* ---------------------------------------------------------------- the finished character */

/** Turn the answers into a character. Whatever is unfinished is left as it stands (blank text, unspent points just are not there). */
export function buildCharacter(b, lang = "en") {
  const clean = v => String(v ?? "").trim();
  const attributes = Object.fromEntries(ATTRIBUTES.map(a => [a, Math.max(1, Math.min(ATTR_MAX, b.attrs[a]))]));
  const skills = Object.fromEntries(SKILLS.map(s => [s, Math.max(0, Math.min(SKILL_MAX, skillValue(b, s)))]));
  const resolve = attributes.resolve;
  const items = [];
  if (clean(b.relationship)) items.push({ type: "bond", name: clean(b.relationship).slice(0, 40), system: { type: BOND_TYPES.includes(b.relBond) ? b.relBond : "trust", strength: 2, person: clean(b.relationship) } });
  if (clean(b.affiliation)) items.push({ type: "bond", name: clean(b.affiliation).slice(0, 40), system: { type: AFFILIATION_BONDS.includes(b.affBond) ? b.affBond : "obligation", strength: 1, person: clean(b.affiliation) } });
  if (b.bgBond && clean(b.background)) items.push({ type: "bond", name: clean(b.background).slice(0, 40), system: { type: "trust", strength: 1, person: clean(b.background) } });
  if (clean(b.burden)) items.push({ type: "trauma", name: clean(b.burden).split(/[.!?]/)[0].slice(0, 50) || clean(b.burden).slice(0, 50), system: { trigger: clean(b.burden), reaction: "" } });
  if (clean(b.gearName)) {
    const attuned = b.gearKind !== "mundane" && !!b.gearSin;
    items.push({ type: "gear", name: clean(b.gearName), system: { kind: b.gearKind, sin: attuned ? b.gearSin : "", cost: GEAR_MAX_COST, description: clean(b.gearNote) } });
  }
  return newActor("character", clean(b.name) || clean(b.concept).slice(0, 30) || "New character", {
    lang, concept: clean(b.concept), identity: clean(b.identity), background: clean(b.background), occupation: clean(b.occupation), affiliation: clean(b.affiliation),
    burden: clean(b.burden), fear: clean(b.fear), boundary: clean(b.boundary), vice: clean(b.vice), desire: clean(b.desire), principle: clean(b.principle), ambition: clean(b.ambition),
    attributes, skills, resonance: Object.fromEntries(SINS.map(s => [s, Math.max(0, Math.min(RESONANCE_MAX, b.resonance[s]))])),
    ego: { value: resolve, max: resolve }, stress: START_STRESS, harm: 0, broken: 0, resources: START_RESOURCES, grade: START_GRADE
  }, items);
}
