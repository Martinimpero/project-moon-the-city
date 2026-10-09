/** Plain data for characters, Threats, crews and items, plus the derived numbers. No browser APIs, so Node can test it. */
import * as R from "./rules.mjs";

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const perSin = (v = 0) => Object.fromEntries(R.SINS.map(s => [s, v]));
const clone = o => JSON.parse(JSON.stringify(o));
const deepMerge = (base, over) => {
  for (const [k, v] of Object.entries(over ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
};

export function sceneDefaults() {
  return {
    flashpoint: false, pullUsed: false, viceUsed: false, refunds: 0, techniques: perSin(0),
    armed: "", rampageOne: false, unmoved: false, nextPenalty: 0, last: { sin: "", success: false, anyOne: false }
  };
}

export function characterDefaults() {
  return {
    concept: "", identity: "", occupation: "", affiliation: "", background: "",
    burden: "", fear: "", boundary: "", vice: "", desire: "", principle: "", ambition: "",
    lang: "en", alt: { burden: "", fear: "", boundary: "" },       // the words above are in `lang`; `alt` has the three the Voice and Verdict quote, in the other language
    attributes: Object.fromEntries(R.ATTRIBUTES.map(a => [a, 1])),
    skills: Object.fromEntries(R.SKILLS.map(s => [s, 0])),
    ego: { value: 2, max: 2 }, stress: 1, harm: 0, broken: 0, resources: 2, grade: 9,
    resonance: perSin(0), tally: perSin(0), riding: "", under: "", scars: "", strained: "",
    marks: { unspent: 0, earned: 0 }, unlocks: { skill4: "", attr5: "", skill5: "" }, growth: [],
    scene: sceneDefaults(), notes: ""
  };
}
export function npcDefaults() {
  return { concept: "", grade: 9, isGroup: false, alignment: "", harm: 0, threat: 0, nextPenalty: 0, want: "", bondHook: "", detail: "", notes: "" };
}
export function crewDefaults() {
  return {
    office: "", association: "", associate: true, officeFunction: "", grind: "", personBehindDesk: "",
    crewBondType: "trust", crewBond: 2, fund: 0, memberIds: [], dormantAsset: "",
    assets: { safehouse: false, getaway: false, workshop: false, informant: false, clinic: false, cover: false },
    clocks: [], ledger: [], notes: ""
  };
}
export function itemDefaults(type) {
  if (type === "gear") return { kind: "mundane", sin: "", fine: false, wear: 0, cost: 1, description: "" };
  if (type === "bond") return { type: "trust", strength: 1, person: "", temporary: false, description: "" };
  return { trigger: "", reaction: "", description: "" };
}

export function newItem(type, name, system = {}) {
  const item = { id: uid(), type, name, system: deepMerge(itemDefaults(type), system) };
  deriveItem(item);
  return item;
}
export function newActor(type, name, system = {}, items = []) {
  const base = type === "character" ? characterDefaults() : (type === "npc" ? npcDefaults() : crewDefaults());
  const actor = { id: uid(), type, name, system: deepMerge(base, system), items: items.map(i => newItem(i.type, i.name, i.system)) };
  refresh(actor);
  return actor;
}

export function deriveItem(item) {
  if (item.type !== "gear") return item;
  item.derived = { spent: item.system.wear >= 3, attuned: !!item.system.sin && item.system.kind !== "mundane" };
  return item;
}

/** Recompute everything derived from the stored numbers. Call after any change. */
export function refresh(actor) {
  const s = actor.system;
  actor.items.forEach(deriveItem);
  if (actor.type === "character") {
    const max = R.egoMax(s.attributes.resolve, s.stress);
    s.ego.max = max;
    const current = Math.min(s.ego.value, max);
    actor.derived = {
      egoCurrent: current, alignment: R.highestSin(s.resonance),
      unsteady: R.isUnsteady(current, max), empty: R.isEmpty(current),
      fraying: R.isFraying(s.stress), harmPenalty: R.harmPenalty(s.harm)
    };
  } else if (actor.type === "npc") {
    actor.derived = { dice: R.npcDice(s.grade, s.isGroup), difficulty: R.npcDifficulty(s.grade), sinRating: R.npcSinRating(s.grade) };
  } else {
    actor.derived = { fractured: s.crewBond <= 0 };
  }
  return actor;
}

/** Fill in any missing fields of data loaded from an older save, then refresh. */
export function normalizeActor(raw) {
  const base = raw.type === "character" ? characterDefaults() : (raw.type === "npc" ? npcDefaults() : crewDefaults());
  const actor = { id: raw.id || uid(), type: raw.type, name: raw.name || "?", system: deepMerge(base, clone(raw.system ?? {})), items: [], shared: !!raw.shared };
  actor.items = (raw.items ?? []).map(i => {
    const it = { id: i.id || uid(), type: i.type, name: i.name || "?", system: deepMerge(itemDefaults(i.type), clone(i.system ?? {})) };
    return deriveItem(it);
  });
  return refresh(actor);
}

export const gearOf = actor => actor.items.filter(i => i.type === "gear");
export const bondsOf = actor => actor.items.filter(i => i.type === "bond");
export const traumasOf = actor => actor.items.filter(i => i.type === "trauma");

/** Set a value at a dotted path ("scene.techniques.pride") on an object. */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}
export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}
