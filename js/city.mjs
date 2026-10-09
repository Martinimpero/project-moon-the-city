/**
 * The City, A to Z: the 26 lettered Wings (the "companies"), one per District, as the Project Moon games present them. The letter is the District's number
 * (A is District 1, Z is 26). Only facts are kept, each note in our own words. Details that the games leave open are marked unknown rather than invented:
 * your table's City is meant to differ (Part VII), so treat this as a starting map. Plain data; the picture is drawn in cityui.mjs.
 * `region` is where the games place the District (center, north, east, south, west) or "" when they do not say.
 */
export const REGIONS = ["center", "north", "west", "east", "south", ""];
const W = (letter, region, name, en, es, status = "active") => ({ letter, n: letter.charCodeAt(0) - 64, region, name, en, es, status });

export const WINGS = [
  W("A", "center", "A Corp.", "Run by the Head: patents, minting Ahn, and licensing every other Wing.", "La dirige la Cabeza: patentes, acuñar Ahn y dar licencia a todas las demás Alas."),
  W("B", "center", "B Corp.", "Run by the Eye: watches Singularities and tax evaders across the City.", "La dirige el Ojo: vigila las Singularidades y a quienes evaden impuestos en toda la Ciudad."),
  W("C", "center", "C Corp.", "Run by the Claw: the City's armed hand against anyone who breaks the rules.", "La dirige la Garra: el brazo armado de la Ciudad contra quien rompe las normas."),
  W("D", "south", "D Corp.", "Barely named on the map; very little is known.", "Apenas aparece nombrada en el mapa; se sabe muy poco."),
  W("E", "", "E Corp.", "A major power in the Smoke War; few other details.", "Una potencia importante en la Guerra del Humo; poco más se sabe."),
  W("F", "", "F Corp.", "Its Singularity makes fairies that open anything; fought in the Smoke War.", "Su Singularidad crea hadas que abren cualquier cosa; combatió en la Guerra del Humo."),
  W("G", "", "G Corp.", "Its Singularity, the Sphere, bends how heavy things are.", "Su Singularidad, la Esfera, altera cuánto pesan las cosas."),
  W("H", "east", "Hongyuan Bioengineering Group", "Healing boluses that also change whoever takes them.", "Bolos curativos que además cambian a quien los toma."),
  W("I", "", "I Corp.", "A major power in the Smoke War, against old L Corp.", "Una potencia importante en la Guerra del Humo, contra la antigua L Corp."),
  W("J", "south", "J Corp.", "A gambling Nest; its Singularity stops luck from being traded.", "Un Nido de juego; su Singularidad impide que se comercie con la suerte."),
  W("K", "south", "K Corp.", "Reverses the state of objects; the source of HP ampules.", "Revierte el estado de los objetos; origen de las ampollas de PV."),
  W("L", "south", "Lobotomy Corporation", "Energy supplier built on Abnormalities. Fallen; its Nest is unclaimed.", "Proveedora de energía basada en Anormalidades. Caída; su Nido no tiene dueño.", "fallen"),
  W("M", "west", "MDM Entreprise", "Moonlight stones that shield minds from psychological attack.", "Piedras de luz de luna que protegen la mente de los ataques psicológicos."),
  W("N", "north", "Nagel und Hammer", "Its Inquisition hunts people who use prosthetics.", "Su Inquisición caza a quienes usan prótesis."),
  W("O", "", "O Corp.", "Listed as existing, but nothing is established about it.", "Figura como existente, pero no hay nada establecido sobre ella.", "unknown"),
  W("P", "north", "P Corp.", "A space-elasticity Singularity: things resist damage; used for building and storage.", "Singularidad de elasticidad del espacio: las cosas resisten el daño; se usa para construir y almacenar."),
  W("Q", "east", "Q Corp.", "Glyph magic: hexes, and an ink that sets solid.", "Magia de glifos: maleficios y una tinta que se vuelve sólida."),
  W("R", "east", "RRR", "An elite private army that builds soldiers through cloning.", "Un ejército privado de élite que fabrica soldados mediante clonación."),
  W("S", "", "Salpippyeo Agroindustries", "Farming and livestock; now in political turmoil.", "Agricultura y ganadería; ahora en plena crisis política."),
  W("T", "south", "TimeTrack Corporation", "Time and light protocols; closely tied to L and W.", "Protocolos de tiempo y luz; muy ligada a L y W."),
  W("U", "south", "U Corp.", "Tuning forks and stasis packages that fuse items; stands by the Great Lake.", "Diapasones y paquetes de estasis que fusionan objetos; junto al Gran Lago."),
  W("V", "", "V Corp.", "Ruled by a council of Elders.", "La gobierna un consejo de Ancianos."),
  W("W", "west", "WARP Corp.", "Save-point technology behind the WARP Trains; declining after scandals.", "Tecnología de puntos de guardado tras los Trenes WARP; en declive tras varios escándalos."),
  W("X", "west", "X Corp.", "A hard alloy cut from punishing mines called the Hellhole.", "Una aleación dura extraída de minas brutales llamadas el Agujero Infernal."),
  W("Y", "north", "Y Corp.", "Named on the map only; no details.", "Solo figura en el mapa; sin detalles."),
  W("Z", "", "Z Corp.", "District 26 exists but is missing from every map.", "El Distrito 26 existe, pero falta en todos los mapas.", "unknown")
];

export const byLetter = l => WINGS.find(w => w.letter === String(l ?? "").toUpperCase()) ?? null;
/** The Wings of one region, in letter order. */
export const inRegion = r => WINGS.filter(w => w.region === r);
/** The Wings whose letter, name or note contains every word of the query. */
export function find(query, lang = "en") {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return WINGS;
  return WINGS.filter(w => { const hay = `${w.letter} ${w.n} ${w.name} ${lang === "es" ? w.es : w.en}`.toLowerCase(); return words.every(x => hay.includes(x)); });
}
/** Which section of the manual a Wing links to: the Head, Eye and Claw have their own, the others the Wings section. */
export const manualRef = w => (["A", "B", "C"].includes(w.letter) ? "p7#7" : "p7#2");
