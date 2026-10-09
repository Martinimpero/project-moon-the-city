/** Text tables used by sheets and chat cards. English here; read through `localized`, so they show in Spanish when the user's language is Spanish. */
import { localized } from "./i18n.mjs";

export const SIN_LABEL = localized({
  wrath: "Wrath", lust: "Lust", sloth: "Sloth", gluttony: "Gluttony", gloom: "Gloom", pride: "Pride", envy: "Envy"
});
export const SKILL_LABEL = localized({
  combat: "Combat", athletics: "Athletics", stealth: "Stealth", investigation: "Investigation", technology: "Technology",
  medicine: "Medicine", persuasion: "Persuasion", deception: "Deception", empathy: "Empathy", streetwise: "Streetwise",
  corporate: "Corporate Knowledge", fixer: "Fixer Knowledge"
});
export const ATTRIBUTE_LABEL = localized({ body: "Body", mind: "Mind", presence: "Presence", resolve: "Resolve" });
export const HARM_LABEL = localized(["Unhurt", "Hurt", "Injured (-1)", "Wounded (-2)", "Maimed / Dying"]);
export const GEAR_KIND_LABEL = localized({ mundane: "Mundane", weapon: "Weapon", suit: "Suit", tool: "Tool", charm: "Charm" });
export const BOND_TYPE_LABEL = localized({ trust: "Trust", fear: "Fear", debt: "Debt", affection: "Affection", obligation: "Obligation", hatred: "Hatred" });

export const SIN_TEXT = localized({
  wrath: { complication: "Collateral: something breaks, someone who wasn't the target is hurt, or a line is crossed in public.", urge: "Lashes out first, hardest, at the nearest target.", keyword: "Burn" },
  lust: { complication: "Attachment: a promise made in the moment, a new person pulled into the problem, or a Bond strained by what you offered.", urge: "Reaches for someone or something to cling to; overpromises.", keyword: "Bleed" },
  sloth: { complication: "Delay: the window closes, time is lost, an opportunity quietly passes.", urge: "Stops. Waits. Defers the choice and lets someone else make it.", keyword: "Tremor" },
  gluttony: { complication: "Excess: you took too much; it leaves a trace, a debt, a mess, or a rival who noticed.", urge: "Takes more than needed and consumes it.", keyword: "Rupture" },
  gloom: { complication: "Weight: your sorrow is contagious; an ally nearby takes -1 die on their next roll.", urge: "Collapses inward: takes the blame, mourns aloud, drags others down.", keyword: "Sinking" },
  pride: { complication: "Face: standing is lost, a witness saw you stumble, or someone now has something over your reputation.", urge: "Refuses help, doubles down, performs for the room.", keyword: "Poise" },
  envy: { complication: "Rivalry: someone becomes your rival, or covets what you have.", urge: "Copies, undercuts, sabotages whoever is better.", keyword: "Charge" }
});

export const SIGNATURE = localized({
  wrath: ["Rampage", "After a Wrath-tagged Success in a fight, make a second Wrath-tagged attack on a different target at -1 die. If either roll shows a 1, an unintended person takes Hurt."],
  lust: ["Hook", "On a Success on a Lust-tagged social roll, the target holds a 1-point Bond toward you until the scene ends, which you may spend once."],
  sloth: ["Unmoved", "Once per scene, do nothing as your Exchange action: until your next action, attacks and pressure against you are rolled at -2 dice and you can't be Helped."],
  gluttony: ["Devour", "Once per scene, when you inflict Harm or win a Social Conflict, regain 1 E.G.O. or take something. You owe the scene a cost."],
  gloom: ["Sorrow's Weight", "On a Success on a Gloom-tagged roll, the target takes -2 dice on their next roll this scene."],
  pride: ["Unbowed", "Once per scene, after rolling, reroll up to three dice that didn't succeed. If the reroll still fails, take a Complication."],
  envy: ["Borrowed Face", "Once per scene, after your opponent tags a Sin, tag the same one yourself: the matchup is neutral and you add +1 die."]
});
