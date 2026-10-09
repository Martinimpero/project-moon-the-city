/**
 * The GM screen: the manual's quick-reference tables (Appendices B to H) as data, with a search. English is the key; Spanish is in screen_es.mjs.
 * A section is { id, title, blocks }; a block is { p } (a paragraph, with **bold**) or { head, rows } (a table). Plain data and functions.
 */
const SIN = ["Sloth", "Wrath", "Pride", "Envy", "Gluttony", "Lust", "Gloom"];
export const SECTIONS = [
  { id: "roll", title: "The Core Roll", blocks: [
    { p: "Pool = Attribute + Skill (Attribute alone if untrained). Roll that many d10s. A 7, 8, 9 or 10 is a Success." },
    { head: ["Difficulty", "What it represents"], rows: [["1", "Routine, but not risk-free"], ["2", "Genuinely challenging, professional-grade"], ["3", "The City actively pushing back"], ["4+", "Exceptional: needs prep, Help, or E.G.O."]] },
    { head: ["Result", "Successes vs. Difficulty"], rows: [["Critical Success", "Difficulty + 2 or more"], ["Success", "Difficulty or more"], ["Partial", "Difficulty - 1"], ["Failure", "Difficulty - 2 or less"], ["Critical Failure", "0 Successes and at least one die shows 1 (checked first; E.G.O. dice count)"]] },
    { p: "**Opposed rolls:** compare Successes from the side trying to change things. Margin +3 or more: Critical Success. +1 or +2: Success. 0 or -1: Partial. -2 or worse: Failure. Ties favor the defender." },
    { p: "At Difficulty 1 there is no Failure band; the worst ordinary result is a Partial." },
    { head: ["Die showing 1", "Effect"], rows: [["Any die, with zero Successes in the roll", "Critical Failure"], ["Any die, while Unsteady", "The first 1 each scene triggers a Flashpoint"], ["Any die, while Empty", "Every roll showing a 1 triggers a Flashpoint (one per roll)"], ["An E.G.O. die showing 1 or 2", "A Complication"]] }
  ] },
  { id: "ego", title: "E.G.O., Stress and Harm", blocks: [
    { p: "**Spending E.G.O.:** 1 E.G.O. = 1 extra die. Any die showing 1-2 = one Complication." },
    { p: "**Recovering E.G.O.:** +1 per full night's rest, +1 more per genuine downtime scene. Maximum +2 between Contracts." },
    { p: "**Running low:** below half E.G.O. maximum (judged at the start of the roll, before spending), a character is Unsteady. At 0 E.G.O., a character is Empty. A maximum of 2 or less skips Unsteady." },
    { p: "**What raises Stress:** +1 for a Trauma trigger, a Boundary violation, a Critical Failure, a Bond lost outright, or an E.G.O. Manifestation. +2 for a Distortion. Stress only comes down through downtime tied to a Bond (-1, at most once between Contracts) or a Reckoning. At Stress 2+, a forced E.G.O. loss takes 1 extra point; at Stress 4+, 2 extra." },
    { head: ["Stress", "E.G.O. max modifier"], rows: [["0-1", "None"], ["2-3", "-1"], ["4-5", "-2, and Fraying (+1 Difficulty on Hail Mary)"]] },
    { p: "E.G.O. maximum never drops below 1." },
    { head: ["Harm", "Effect"], rows: [["Hurt", "No penalty"], ["Injured", "-1 die"], ["Wounded", "-2 dice, needs treatment"], ["Maimed / Dying", "Out of the scene"]] },
    { p: "**The Hail Mary:** triggers when E.G.O. would hit 0 at a Boundary-level moment, or when a player digs deep (spends all remaining E.G.O., at least 2, and +1 Difficulty; not on a line with an unhealed Scar). A Success needs an **Acceptance** (the character states what they accept about themselves) or it becomes a Partial Distortion. Resolve + relevant Skill, Difficulty 2-3. -1 die per Boundary already broken this campaign; may spend a Bond for +1 die." },
    { head: ["Hail Mary result", "Outcome"], rows: [["Critical Success", "E.G.O. Manifestation, clean. Stress +1."], ["Success", "E.G.O. Manifestation, at a cost. Stress +1."], ["Partial", "Partial Distortion: transformed and monstrous, but the character keeps the wheel. Stress +2."], ["Failure", "Complete Distortion: the self is pushed out; lasts until the fiction brings them back. Stress +2."], ["Critical Failure", "Complete Distortion, already severe: death or permanence are live options. Stress +2."]] }
  ] },
  { id: "clocks", title: "Clocks", blocks: [
    { head: ["Size", "Use for"], rows: [["4 segments", "Scene-level, immediate pressure"], ["6 segments", "Faction Heat, spans several sessions"], ["8 segments", "Campaign-length stakes"]] },
    { p: "Fill 1 segment per meaningful setback, never more than 2." }
  ] },
  { id: "threat", title: "Threat Grade", blocks: [
    { head: ["Threat Grade", "Difficulty", "Dice it rolls", "Typical treatment"], rows: [["9-8", "1", "3", "Single mook / Threat track"], ["7-5", "2", "4", "Capable individual / Threat-tracked group"], ["4-2", "3", "6", "Named opponent, full Harm track"], ["1", "4", "8", "Named opponent, needs a full crew"]] },
    { p: "A group adds 2 dice. A Threat track runs Holding, Breaking, Routed; a Critical Success against a Threat at Holding pushes it straight to Breaking." },
    { p: "**Solo named opponents facing a full party:** a named opponent of Threat Grade 4 or lower gets one additional defensive response each Exchange: a second Defense roll against a different attacker, or a single counter-Harm reply against whoever just landed a hit. It is not an extra action, and it does not stack with itself." },
    { p: "**Retreat:** a character may concede before an Exchange resolves (no further Harm; the GM sets the terms) or try to retreat with an opposed roll; failing costs a further Exchange." }
  ] },
  { id: "templates", title: "GM quick templates", blocks: [
    { head: ["Template", "Parts"], rows: [["NPC", "Want, Bond hook, One detail (and Alignment)"], ["Contract", "Client, Objective, Payment, Complication Clause, Risk (1-4)"], ["District", "Name, Dominant institution, Texture, Tension, Clock"], ["Wing", "Industry, Singularity connection, Employment flavor, Secret, Whose suffering?"], ["Syndicate", "Territory, Racket, Recruitment style, Escalation ladder (3 steps), Terms, Flavor"]] },
    { head: ["Risk", "Calibration"], rows: [["1", "A clear, safe path and a forgiving Complication Clause"], ["2", "One genuine unknown"], ["3", "At least one Social Conflict or Combat scene of real consequence, engaging a PC's Bond, Desire or Fear"], ["4", "Touches the psychological layer: a Trauma trigger or Hail Mary should be plausible"]] }
  ] },
  { id: "sins", title: "The Sins", blocks: [
    { p: "**Resonance:** 6 points at creation, max 3; the highest Sin is the Alignment. Rating 1 is a flicker; rating 2 or more does things. Signature Technique at 2+." },
    { head: ["Sin", "Strong against", "Weak against"], rows: [["Sloth", "Wrath, Pride", "Gloom, Lust"], ["Wrath", "Pride, Envy", "Sloth, Gloom"], ["Pride", "Envy, Gluttony", "Wrath, Sloth"], ["Envy", "Gluttony, Lust", "Pride, Wrath"], ["Gluttony", "Lust, Gloom", "Envy, Pride"], ["Lust", "Gloom, Sloth", "Gluttony, Envy"], ["Gloom", "Sloth, Wrath", "Lust, Gluttony"]] },
    { p: `The wheel runs ${SIN.join(", ")}: each Sin is strong against the next two and weak against the two before.` },
    { p: "**Swing:** Strong +1 die, Weak -1 die (2 at rating 4, 3 at rating 5). Needs rating 2+. Matchup plus Fit never beyond 3." },
    { p: "**Fit (only while Under a Sin):** Favored +1, Hindered -2 (+2 / -3 at rating 4+)." },
    { head: ["Sin", "Favored", "Hindered"], rows: [["Wrath", "Combat, Athletics, Persuasion", "Stealth, Investigation, Medicine"], ["Lust", "Persuasion, Empathy, Deception", "Investigation, Technology, Corporate Knowledge"], ["Sloth", "Stealth, Medicine, Investigation", "Athletics, Combat, Streetwise"], ["Gluttony", "Investigation, Streetwise, Corporate Knowledge", "Stealth, Empathy, Medicine"], ["Gloom", "Empathy, Medicine, Investigation", "Persuasion, Deception, Athletics"], ["Pride", "Persuasion, Corporate Knowledge, Fixer Knowledge", "Empathy, Stealth, Deception"], ["Envy", "Deception, Stealth, Technology", "Persuasion, Medicine, Fixer Knowledge"]] },
    { p: "**Under a Sin:** Riding it (free, one per scene); its Urge took your Flashpoint; Distorted; Overtaken (4) and Unsteady or Empty; Saturated (5)." },
    { p: "**Drift:** every fourth session, a Sin leading by 8 or more tags gains +1 (max 4); the least-tagged Sin loses 1. **Saturated (5):** always Under, must tag each scene or +1 Stress." },
    { p: "**With the Self:** an E.G.O. Complication on a tagged roll is the Sin's; refunds are capped at 2 E.G.O. per scene; Permanent E.G.O. counts as rating 4; Distorted characters are Exposed (+1 die against them from any Sin that beats theirs)." }
  ] },
  { id: "gear", title: "Resources and attuned gear", blocks: [
    { p: "**Resources:** 0 to 5, start 2. A Contract pays Resources equal to its Risk (minus 1 for the Office's cut at Risk 3 or 4). Each downtime phase costs 1. Cost: 1 armor, Light weapon, kit; 2 Heavy weapon, attuned gear, Backstreets augmentation; 3 Fine attuned gear, Nest augmentation; 4 Workshop extraction. Short of money: a Debt Bond (up to 3)." },
    { p: "**Attuned gear:** Weapon +1 die on attacks tagged with its Sin; Suit +1 die on defense tagged with its Sin; Tool +1 die on a tagged roll using a Favored Skill of the Sin; Charm ignores the Sin's Complication once per scene. Fine (Cost 3): +2 if attuned at rating 3+." },
    { p: "**Attuned** = your rating in its Sin is 2+. **Borrowed** = rating 0 or 1: tag as if rating 2 (swing 1), no Fit, no Riding, no technique." },
    { p: "**Price:** Pull (the Sin's Complication on the first 1 each scene; every 1 if borrowing, Under, or Overtaken); Tally (a mark for the Sin; two if borrowing); Wear (1 per Pull; Spent at 3, repair costs 1 Resources and a downtime action)." },
    { p: "**Limits:** one Boon per roll; matchup + Fit + Boon never beyond +4; two pieces at once (three or more: all Pull on every 1)." }
  ] }
];

/** Split a table cell such as "Wrath, Pride" into its parts so each can be translated; a plain cell stays whole. */
export const cellParts = (cell, known) => (known(cell) || !cell.includes(", ") ? [cell] : cell.split(", "));

/**
 * The sections that match `query` (in the reader's language, through `tr`). A table keeps its header and only the rows that match; a section whose
 * title matches shows everything. `tr(key)` translates.
 */
export function search(query, tr, sections = SECTIONS) {
  const q = query.trim().toLowerCase();
  if (!q) return sections.map(s => ({ ...s, shown: s.blocks }));
  const has = s => tr(s).toLowerCase().includes(q) || String(s).toLowerCase().includes(q);
  const out = [];
  for (const s of sections) {
    if (has(s.title)) { out.push({ ...s, shown: s.blocks }); continue; }
    const shown = [];
    for (const b of s.blocks) {
      if (b.p) { if (has(b.p.replace(/\*\*/g, ""))) shown.push(b); }
      else { const rows = b.rows.filter(r => r.some(c => has(c))); if (rows.length) shown.push({ ...b, rows }); }
    }
    if (shown.length) out.push({ ...s, shown });
  }
  return out;
}
