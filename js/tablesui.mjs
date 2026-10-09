/** The Tables tab (GM only): roll the manual's generators, re-roll one part, show the result to the table or keep it as a note. */
import * as X from "./tables.mjs";
import { t, tIn, pair } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import { SIN_TEXT_RAW } from "./config.mjs";

/** ctx: { $, lang(), rng?, post(html builder), addNote(title, text), toast(msg) } */
export function createTablesUI(ctx) {
  const $ = ctx.$, rng = () => (ctx.rng ?? Math.random)();
  const results = {};                                              // table id -> picks
  const sinText = (sin, lang, complication) => (complication ? tIn(lang, SIN_TEXT_RAW[sin].complication) : tIn(lang, sin[0].toUpperCase() + sin.slice(1)));
  const text = (item, lang = ctx.lang()) => X.itemText(item, lang, sinText);
  const label = (o, lang = ctx.lang()) => (lang === "es" ? o.es : o.en);
  const lines = (tb, lang) => tb.parts.map(p => [label(p, lang), text(tb.parts.length && X.itemOf(tb, results[tb.id], p.key), lang)]);

  function section(tb) {
    const picks = results[tb.id];
    const body = picks ? `<ul class="tb-res">${tb.parts.map(p => `<li><span class="tb-k">${esc(label(p))}</span><span class="tb-v">${esc(text(X.itemOf(tb, picks, p.key)))}</span><button type="button" data-action="tbPart" data-table="${tb.id}" data-key="${p.key}" title="${esc(t("Roll this part again"))}" aria-label="${esc(t("Roll this part again"))}">&#127922;</button></li>`).join("")}</ul>
      <div class="tb-acts"><button type="button" data-action="tbShow" data-table="${tb.id}">${esc(t("Show to the table"))}</button><button type="button" data-action="tbNote" data-table="${tb.id}">${esc(t("Keep as a note"))}</button></div>` : "";
    return `<section class="tb"><div class="tb-head"><h3>${esc(label(tb))}</h3><button type="button" class="primary" data-action="tbRoll" data-table="${tb.id}">${esc(picks ? t("Roll again") : t("Roll"))}</button></div>
      <p class="hint">${esc(label(tb.note))}</p>${body}</section>`;
  }
  const render = () => { $("#pane-tb").innerHTML = X.TABLES.map(section).join(""); };
  const tb = el => X.tableById(el.dataset.table);

  /** The card for the log: both languages, so each reader sees their own. Call inside bilingual(). */
  function card(table) {
    const rows = table.parts.map(p => `<p><b>${esc(pair(p.en, p.es))}:</b> ${esc(pair(text(X.itemOf(table, results[table.id], p.key), "en"), text(X.itemOf(table, results[table.id], p.key), "es")))}</p>`).join("");
    return `<div class="pm-card"><div class="pm-card-head">${esc(pair(table.en, table.es))}</div><div class="pm-notes">${rows}</div></div>`;
  }
  const actions = {
    tbRoll: el => { const x = tb(el); results[x.id] = X.roll(x, rng); render(); },
    tbPart: el => { const x = tb(el), p = x.parts.find(q => q.key === el.dataset.key); results[x.id][p.key] = X.rollPart(p, rng); render(); },
    tbShow: el => { const x = tb(el); ctx.post(() => card(x)); },
    tbNote: el => { const x = tb(el); ctx.addNote(label(x), lines(x, ctx.lang()).map(([k, v]) => `${k}: ${v}`).join("\n")); ctx.toast(t("Saved to your notes.")); }
  };
  return { actions, render, results, card };
}
