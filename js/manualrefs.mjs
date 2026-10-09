/**
 * Where things are in the manual, and which part of the character sheet points to which section.
 * A reference is "p4#2": part id, then the section's number (the "## 2." heading, counted in order, in either language).
 * Plain data and functions, no browser needed.
 */
export const PARTS = [
  { id: "front", en: "Manual_00_FrontMatter.md", es: "Manual_00_FrontMatter_ES.md" },
  { id: "primer", en: "Manual_PlayerPrimer.md", es: "Manual_PlayerPrimer_ES.md" },
  { id: "p1", en: "Manual_Part1_TheCity.md", es: "Manual_Part1_TheCity_ES.md" },
  { id: "p2", en: "Manual_Part2_PlayingTheGame.md", es: "Manual_Part2_PlayingTheGame_ES.md" },
  { id: "p3", en: "Manual_Part3_Characters.md", es: "Manual_Part3_Characters_ES.md" },
  { id: "p4", en: "Manual_Part4_TheSelf.md", es: "Manual_Part4_TheSelf_ES.md" },
  { id: "p5", en: "Manual_Part5_SocialPlay.md", es: "Manual_Part5_SocialPlay_ES.md" },
  { id: "p6", en: "Manual_Part6_Danger.md", es: "Manual_Part6_Danger_ES.md" },
  { id: "p7", en: "Manual_Part7_CityToolkit.md", es: "Manual_Part7_CityToolkit_ES.md" },
  { id: "p8", en: "Manual_Part8_RunningTheGame.md", es: "Manual_Part8_RunningTheGame_ES.md" },
  { id: "p9", en: "Manual_Part9_Advancement.md", es: "Manual_Part9_Advancement_ES.md" },
  { id: "p10", en: "Manual_Part10_TheSins.md", es: "Manual_Part10_TheSins_ES.md" },
  { id: "apx", en: "Manual_Appendices.md", es: "Manual_Appendices_ES.md" }
];
export const PART_IDS = PARTS.map(p => p.id);

/** What each "?" on the sheet opens (the label is shown in the tooltip). */
export const REFS = {
  attributes: "p3#1", skills: "p3#2", roll: "p2#1", wound: "p3#7", vice: "p3#6", identity: "p3#7", sheet: "p3#9",
  ego: "p4#1", stress: "p4#2", traumas: "p4#3", hailMary: "p4#4", distortion: "p4#6",
  harm: "p6#2", exchange: "p6#3", gear: "p6#5", resources: "apx#8",
  bonds: "p5#1", crew: "p5#7", heat: "p5#5", clocks: "p2#4",
  sins: "p10#1", resonance: "p10#2", wheel: "p10#3", fit: "p10#4", drift: "p10#6",
  grade: "p9#1", unlocks: "p9#2", threat: "p9#4", growth: "p9#7",
  glossary: "apx#11"
};

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
/** "Part IV §2" / "Parte X" -> "p4#2" / "p10" (null if it is not a reference we know). */
export function refFromCitation(word, roman, sec) {
  const n = ROMAN[roman]; if (!n || !/^(?:Part|Parte)$/.test(word)) return null;
  return `p${n}` + (sec ? `#${Number(sec)}` : "");
}

/** Split a reference into { part, sec } ("p4#2" -> { part: "p4", sec: 2 }); null when it is not a valid one for this index. */
export function parseRef(ref, index) {
  const m = /^([a-z0-9]{1,8})(?:#(\d{1,2}))?$/.exec(String(ref ?? "")); if (!m) return null;
  const part = index?.parts?.find(p => p.id === m[1]); if (!part) return null;
  const sec = m[2] ? Number(m[2]) : 0;
  if (sec && sec > part.en.sections.length) return { part: part.id, sec: 0 };
  return { part: part.id, sec };
}
