/**
 * Print pages: plain HTML for paper (black on white), one `<section class="pr-page">` per page. The app puts this in a print-only area and
 * calls the browser's print, where "Save as PDF" makes the file. Plain functions (they take the translator), so Node can test them.
 */
import * as R from "./rules.mjs";
import { SIN_LABEL, SKILL_LABEL, ATTRIBUTE_LABEL, HARM_LABEL, GEAR_KIND_LABEL, BOND_TYPE_LABEL } from "./config.mjs";
import { pick, textToHtml } from "./handouts.mjs";
import { SECTIONS, cellParts } from "./screen.mjs";
import { esc } from "./engine.mjs";

const dots = (n, max) => Array.from({ length: max }, (_, i) => (i < n ? "&#9679;" : "&#9675;")).join("");   // filled and empty circles
const box = on => (on ? "&#9746;" : "&#9744;");
const line = (label, value) => `<div class="pr-f"><b>${esc(label)}</b><span>${esc(value ?? "") || "&nbsp;"}</span></div>`;
const page = (title, body, cls = "") => `<section class="pr-page ${cls}"><h1>${esc(title)}</h1>${body}</section>`;
const ATTR_MAX = 5, SKILL_MAX = 5;
const ASSET_LABEL = { safehouse: "Safehouse (3)", getaway: "Getaway (2)", workshop: "Workshop contact (2)", informant: "Informant (2)", clinic: "Clinic (2)", cover: "Cover (2)" };

/** The character sheet (Appendix A). `a` null prints a blank one to fill in by hand. */
export function characterPage(a, tr) {
  const s = a?.system, d = a?.derived;
  const ids = [["Concept", s?.concept], ["Identity", s?.identity], ["Background", s?.background], ["Occupation", s?.occupation], ["Affiliation", s?.affiliation], ["Desire", s?.desire], ["Fear", s?.fear], ["Relationship", ""], ["Principle", s?.principle], ["Vice", s?.vice], ["Boundary", s?.boundary], ["Burden", s?.burden], ["Ambition", s?.ambition]];
  const attrs = R.ATTRIBUTES.map(k => `<div class="pr-row"><b>${esc(ATTRIBUTE_LABEL[k])}</b><span class="pr-dots">${dots(s ? s.attributes[k] : 0, ATTR_MAX)}</span></div>`).join("");
  const skills = R.SKILLS.map(k => `<div class="pr-row"><b>${esc(SKILL_LABEL[k])}</b><span class="pr-dots">${dots(s ? s.skills[k] : 0, SKILL_MAX)}</span></div>`).join("");
  const sins = R.SINS.map(k => `<div class="pr-row"><b>${esc(SIN_LABEL[k])}</b><span class="pr-dots">${dots(s ? s.resonance[k] : 0, 5)}</span></div>`).join("");
  const harm = [1, 2, 3, 4].map(i => `${box(s && s.harm >= i)} ${esc(HARM_LABEL[i])}`).join("&nbsp;&nbsp; ");
  const items = type => (a?.items ?? []).filter(i => i.type === type);
  const gear = items("gear").map(g => `<li>${esc(g.name)} <small>${esc(GEAR_KIND_LABEL[g.system.kind])}${g.system.sin ? ` · ${esc(SIN_LABEL[g.system.sin])}` : ""}${g.system.fine ? ` · ${esc(tr("Fine"))}` : ""} · ${esc(tr("Wear"))} ${g.system.wear}/3</small></li>`).join("") || "<li>&nbsp;</li><li>&nbsp;</li>";
  const bonds = items("bond").map(b => `<li>${esc(b.name)} <small>${esc(BOND_TYPE_LABEL[b.system.type])} ${b.system.strength}${b.system.temporary ? ` · ${esc(tr("temporary"))}` : ""}</small></li>`).join("") || "<li>1. &nbsp;</li><li>2. &nbsp;</li><li>3. &nbsp;</li>";
  const trauma = items("trauma").map(x => x.name).join("; ");
  return page(a ? a.name : tr("Character sheet"), `
    ${a?.portrait ? `<p class="pr-portrait"><img src="${esc(a.portrait)}" alt=""></p>` : ""}<div class="pr-grid2">${ids.map(([k, v]) => line(tr(k), v)).join("")}</div>
    <div class="pr-cols"><div><h2>${esc(tr("Attributes"))}</h2>${attrs}</div><div><h2>${esc(tr("Skills"))}</h2>${skills}</div><div><h2>${esc(tr("Resonance"))}</h2>${sins}${line(tr("Alignment"), d?.alignment ? SIN_LABEL[d.alignment] : "")}</div></div>
    <div class="pr-grid2">${line("E.G.O.", a ? `${d.egoCurrent} / ${s.ego.max}` : " /")}${line(tr("Stress"), a ? `${s.stress} (0-5)` : "(0-5)")}${line(tr("Resources"), a ? `${s.resources} / 5` : " / 5")}${line(tr("Institutional Grade"), a ? s.grade : "")}</div>
    <p class="pr-harm"><b>${esc(tr("Harm"))}:</b> ${harm}</p>
    <div class="pr-cols2"><div><h2>${esc(tr("Gear"))}</h2><ul>${gear}</ul></div><div><h2>${esc(tr("Bonds"))}</h2><ul>${bonds}</ul></div></div>
    ${line(tr("Trauma"), trauma)}${line(tr("Scars"), s?.scars)}
    ${s?.notes ? `<h2>${esc(tr("Notes"))}</h2><div class="pr-text">${textToHtml(s.notes, esc)}</div>` : ""}`, "pr-sheet");
}

/** A Threat's sheet. */
export function threatPage(a, tr) {
  const s = a.system, d = a.derived, harm = [0, 1, 2, 3, 4].map(i => `${box(s.harm >= i && i > 0)} ${esc(HARM_LABEL[i])}`).join("&nbsp;&nbsp; ");
  return page(a.name, `
    <p class="pr-badges"><b>${esc(tr("Grade"))} ${s.grade}</b>${s.isGroup ? ` · ${esc(tr("group"))}` : ""} · ${d.dice} ${esc(tr("dice"))} · ${esc(tr("Difficulty {n}", { n: d.difficulty }))}${s.alignment ? ` · ${esc(SIN_LABEL[s.alignment])} ${d.sinRating}` : ""}</p>
    <div class="pr-grid2">${line(tr("Concept"), s.concept)}${line(tr("Want"), s.want)}${line(tr("Bond hook"), s.bondHook)}${line(tr("Detail"), s.detail)}</div>
    <p class="pr-harm"><b>${esc(tr("Threat Clock"))}:</b> ${box(false)} ${esc(tr("Holding"))} &nbsp; ${box(false)} ${esc(tr("Breaking"))} &nbsp; ${box(false)} ${esc(tr("Routed"))}</p>
    <p class="pr-harm"><b>${esc(tr("Harm"))}:</b> ${harm}</p>
    ${s.notes ? `<h2>${esc(tr("Notes"))}</h2><div class="pr-text">${textToHtml(s.notes, esc)}</div>` : ""}`, "pr-sheet");
}

/** A crew's sheet: office, bond, fund, assets and Clocks. */
export function crewPage(a, tr) {
  const s = a.system, assets = Object.entries(s.assets).map(([k, on]) => `<li>${box(on)} ${esc(tr(ASSET_LABEL[k] ?? k))}</li>`).join("");
  const clocks = s.clocks.map(c => `<li>${esc(c.name)}: <span class="pr-dots">${dots(c.filled, c.size)}</span></li>`).join("") || "<li>&nbsp;</li>";
  return page(a.name, `<div class="pr-grid2">${line(tr("Office"), s.office)}${line(tr("Fund"), s.fund)}${line(tr("Crew Bond"), s.crewBond)}</div>
    <div class="pr-cols2"><div><h2>${esc(tr("Assets"))}</h2><ul>${assets}</ul></div><div><h2>${esc(tr("Clocks"))}</h2><ul>${clocks}</ul></div></div>
    ${s.notes ? `<h2>${esc(tr("Notes"))}</h2><div class="pr-text">${textToHtml(s.notes, esc)}</div>` : ""}`, "pr-sheet");
}
export const actorPage = (a, tr) => (a.type === "character" ? characterPage(a, tr) : a.type === "npc" ? threatPage(a, tr) : crewPage(a, tr));

/** A handout as a page, in one language (or two pages, one in each, with `both`). */
export function handoutPages(h, lang, { both = false } = {}) {
  const one = l => { const v = pick(h, l); return page(v.title, `${h.img ? `<p class="pr-img"><img src="${esc(h.img)}" alt=""></p>` : ""}<div class="pr-paper">${textToHtml(v.text, esc)}</div>`, "pr-handout"); };
  const other = lang === "es" ? "en" : "es";
  return both && h.alt && (h.alt.title || h.alt.text) ? one(lang) + one(other) : one(lang);
}

/** The party journal (or private notes), each entry with its title and who wrote it. */
export function journalPage(title, entries, tr) {
  const rows = entries.map(e => `<article class="pr-entry"><h2>${e.pinned ? "&#9733; " : ""}${esc(e.title)}</h2>${e.author ? `<p class="pr-by">${esc(e.author)}${e.kind === "recap" ? ` · ${esc(tr("Recap"))}` : ""}</p>` : ""}<div class="pr-text">${textToHtml(e.text, esc)}</div></article>`).join("") || `<p>&nbsp;</p>`;
  return page(title, rows, "pr-journal");
}

/** The GM screen as one printable reference. `tr` translates the English keys. */
export function screenPages(tr) {
  const known = s => tr(s) !== s;
  const cell = c => cellParts(c, known).map(p => esc(tr(p))).join(", ");
  const body = SECTIONS.map(s => `<div class="pr-sec"><h2>${esc(tr(s.title))}</h2>${s.blocks.map(b => (b.p ? `<p>${esc(tr(b.p)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`
    : `<table class="pr-table"><thead><tr>${b.head.map(h => `<th>${esc(tr(h))}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`)).join("")}</div>`).join("");
  return page(tr("GM screen"), body, "pr-screen");
}

/** The shown and hidden Clocks as a list for the GM's table (segments as circles). */
export function clocksPage(clocks, tr) {
  const rows = clocks.map(c => `<tr><td><b>${esc(c.name)}</b>${c.scope ? `<br><small>${esc(c.scope)}</small>` : ""}</td><td class="pr-dots">${dots(c.filled, c.size)}</td><td>${esc(c.consequence)}</td></tr>`).join("") || `<tr><td colspan="3">&nbsp;</td></tr>`;
  return page(tr("Clocks"), `<table class="pr-table"><thead><tr><th>${esc(tr("Name"))}</th><th>${esc(tr("Segments"))}</th><th>${esc(tr("When it fills"))}</th></tr></thead><tbody>${rows}</tbody></table>`);
}
