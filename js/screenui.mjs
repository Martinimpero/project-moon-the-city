/** The Screen tab: the manual's quick references with a search box, for the GM and for players. Built with `createScreenUI(ctx)`. */
import { SECTIONS, search, cellParts } from "./screen.mjs";
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import { refButton, REFS } from "./manualrefs.mjs";

/** Each section of the Screen is one of the manual's quick-reference appendices. */
const REF_OF = { roll: "scRoll", ego: "scEgo", clocks: "scClocks", threat: "scThreat", templates: "scTemplates", sins: "scSins", gear: "scGear" };

/** ctx: { $ } */
export function createScreenUI(ctx) {
  const $ = ctx.$;
  let q = "";
  const closed = new Set();                                           // sections the reader folded away
  const known = s => t(s) !== s;
  const cell = c => cellParts(c, known).map(p => esc(t(p))).join(", ");
  const para = s => esc(t(s)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const table = b => `<table class="sc-table"><thead><tr>${b.head.map(h => `<th>${esc(t(h))}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? " class=\"k\"" : ""}>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  function listHtml() {
    const found = search(q, t, SECTIONS);
    if (!found.length) return `<p class="hint pad">${esc(t("Nothing matches."))}</p>`;
    return found.map(s => {
      const open = q.trim() || !closed.has(s.id);
      return `<section class="sc ${open ? "open" : ""}"><button type="button" class="sc-head" data-action="scToggle" data-id="${s.id}" aria-expanded="${open}"><h3>${esc(t(s.title))}</h3></button>${REF_OF[s.id] && REFS[REF_OF[s.id]] ? refButton(REF_OF[s.id], t("Open this in the manual")) : ""}${open ? `<div class="sc-body">${s.shown.map(b => (b.p ? `<p>${para(b.p)}</p>` : table(b))).join("")}</div>` : ""}</section>`;
    }).join("");
  }
  function render() {
    const pane = $("#pane-sc"); if (!pane) return;
    pane.innerHTML = `<div class="sc-top"><input type="search" id="sc-q" value="${esc(q)}" placeholder="${esc(t("Search the rules"))}" aria-label="${esc(t("Search the rules"))}"><p class="hint">${esc(t("Quick references from the manual (Appendices B to H)."))}</p></div><div id="sc-list">${listHtml()}</div>`;
    $("#sc-q").addEventListener("input", e => { q = e.target.value; $("#sc-list").innerHTML = listHtml(); });
  }
  const actions = { scToggle: el => { const id = el.dataset.id; closed.has(id) ? closed.delete(id) : closed.add(id); $("#sc-list").innerHTML = listHtml(); } };
  return { actions, render };
}
