/**
 * Random tables, taken from the manual: the Contract generator (Part VIII §3), the Abnormality generator (§7), an NPC seed (§2, drawn from the
 * Bestiary's Want / Bond hook / Detail lines) and the Sin Complications (Part I). A table is a list of parts; rolling picks one item per part.
 * Items are { en, es } (or { sin } for a Sin Complication, which the app reads from its Sin text). Plain functions, so Node can test them.
 */
import { THREATS } from "./threatdata.mjs";

const SINS = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"];
const i = (en, es) => ({ en, es });

const CONTRACT = [
  { key: "client", en: "Client", es: "Cliente", items: [i("An Office manager", "Un gerente de la Oficina"), i("A Wing insider", "Alguien de dentro de un Ala"), i("A Syndicate go-between", "Un intermediario del Sindicato"), i("A stranger with no obvious affiliation", "Un desconocido sin filiación clara")] },
  { key: "objective", en: "Objective", es: "Objetivo", items: [i("Recover", "Recuperar"), i("Deliver", "Entregar"), i("Investigate", "Investigar"), i("Protect", "Proteger"), i("Remove", "Eliminar")] },
  { key: "seed", en: "Complication seed", es: "Semilla de Complicación", items: [i("A lie in the brief", "Una mentira en el encargo"), i("A rival crew after the same thing", "Una banda rival tras lo mismo"), i("A Bond the client didn't mention", "Un Vínculo que el cliente no mencionó"), i("An Abnormality is involved", "Hay una Anormalidad de por medio")] },
  { key: "risk", en: "Risk", es: "Riesgo", items: [
    i("1: a clear, safe path and a forgiving Complication Clause", "1: un camino claro y seguro y una Cláusula de Complicación indulgente"),
    i("2: one genuine unknown", "2: una incógnita real"),
    i("3: at least one Social Conflict or Combat scene of real consequence, engaging a PC's Bond, Desire or Fear", "3: al menos una escena de Conflicto Social o Combate con consecuencias reales, que toque un Vínculo, Deseo o Miedo de un PJ"),
    i("4: touches the psychological layer; a Trauma trigger or Hail Mary should be plausible", "4: toca la capa psicológica; un detonante de Trauma o un Hail Mary debe ser plausible")] }
];
const ABNO = [
  { key: "behavior", en: "Behavior", es: "Comportamiento", items: [i("Mimics something familiar, wrongly", "Imita algo familiar, mal"), i("Counts or sorts obsessively", "Cuenta u ordena de forma obsesiva"), i("Only acts when unobserved", "Solo actúa cuando nadie lo mira"), i("Responds to a specific word or name", "Responde a una palabra o nombre concretos")] },
  { key: "trigger", en: "Trigger", es: "Detonante", items: [i("Being touched", "Que lo toquen"), i("A lie spoken near it", "Una mentira dicha cerca"), i("A debt or promise being broken", "Una deuda o promesa rota"), i("Being looked at directly", "Que lo miren de frente")] },
  { key: "breach", en: "Breach category", es: "Categoría de Brecha", items: [i("A Harm-equivalent physical effect", "Un efecto físico equivalente a Daño"), i("A Clock starts or jumps", "Un Reloj empieza o salta"), i("A Trauma trigger with no physical Harm at all", "Un detonante de Trauma sin Daño físico"), i("Something is taken: an object, a memory, a name", "Se lleva algo: un objeto, un recuerdo, un nombre")] }
];
const uniq = key => [...new Set(THREATS.map(x => x[key]).filter(Boolean))];
const NPC = [
  { key: "want", en: "Want", es: "Deseo", items: uniq("want").map(x => i(x, "")) },
  { key: "bond", en: "Bond hook", es: "Gancho de Vínculo", items: uniq("bond").map(x => i(x, "")) },
  { key: "detail", en: "One detail", es: "Un detalle", items: uniq("detail").map(x => i(x, "")) },
  { key: "sin", en: "Alignment", es: "Alineamiento", items: [{ en: "None", es: "Ninguno", sin: "" }, ...SINS.map(s => ({ sin: s }))] }
];
const COMPLICATION = [{ key: "sin", en: "Sin", es: "Pecado", items: SINS.map(s => ({ sin: s, complication: true })) }];

export const TABLES = [
  { id: "contract", en: "Contract", es: "Contrato", note: { en: "Part VIII §3: combine one item from each list, then use the Contract template.", es: "Parte VIII §3: combina un elemento de cada lista y usa la plantilla de Contrato." }, parts: CONTRACT },
  { id: "abnormality", en: "Abnormality", es: "Anormalidad", note: { en: "Part VIII §7: combine one entry from each list.", es: "Parte VIII §7: combina una entrada de cada lista." }, parts: ABNO },
  { id: "npc", en: "NPC seed", es: "Semilla de PNJ", note: { en: "Part VIII §2: Want, Bond hook, one Detail, Sin. Drawn from the Bestiary (English).", es: "Parte VIII §2: Deseo, Gancho de Vínculo, un Detalle, Pecado. Sacado del Bestiario (en inglés)." }, parts: NPC },
  { id: "complication", en: "Complication by Sin", es: "Complicación por Pecado", note: { en: "A Complication for a roll tagged with that Sin.", es: "Una Complicación para una tirada etiquetada con ese Pecado." }, parts: COMPLICATION }
];
export const tableById = id => TABLES.find(x => x.id === id);

/** Roll a table: one item index per part. `keep` holds the indexes to leave as they are (parts the GM has locked). */
export function roll(table, rng = Math.random, keep = {}) {
  const picks = {};
  for (const p of table.parts) picks[p.key] = p.key in keep ? keep[p.key] : Math.min(p.items.length - 1, Math.floor(rng() * p.items.length));
  return picks;
}
export const rollPart = (part, rng = Math.random) => Math.min(part.items.length - 1, Math.floor(rng() * part.items.length));
export const itemOf = (table, picks, key) => table.parts.find(p => p.key === key)?.items[picks[key]];
/** The text of an item in a language. `sinText(sin, lang)` supplies a Sin Complication or Sin name. */
export function itemText(item, lang, sinText) {
  if (!item) return "";
  if ("sin" in item) return item.sin ? sinText(item.sin, lang, !!item.complication) : (lang === "es" ? item.es : item.en);
  return (lang === "es" && item.es) || item.en;
}
