/** The Threats tab (GM only): the library, the encounter being built, and your own saved templates. Built with `createThreatUI(ctx)`. */
import * as T from "./threats.mjs";
import { t } from "./i18n.mjs";
import { refButton } from "./manualrefs.mjs";
import { esc } from "./engine.mjs";
import { SIN_LABEL } from "./config.mjs";
import { newActor } from "./model.mjs";

/**
 * ctx: { state, $, lang(), create(actors, { exchange, map }) -> count, hasMap(), changed(), ask(opts), toast(msg) }
 */
export function createThreatUI(ctx) {
  const $ = ctx.$;
  const f = { q: "", band: "", sin: "", cat: "" };
  const enc = [], open = new Set();
  let opts = { exchange: true, map: true };
  const custom = () => ctx.state.library;
  const sinName = s => (s ? SIN_LABEL[s] : t("None"));

  const badges = x => `<span class="pm-badge">${esc(t("Grade"))} ${x.grade}${x.group ? ` · ${esc(t("group"))}` : ""}</span><span class="pm-badge">${x.dice} ${esc(t("dice"))}</span><span class="pm-badge">${esc(t("Difficulty {n}", { n: x.difficulty }))}</span>${x.sin ? `<span class="pm-badge sin sin-${x.sin}">${esc(SIN_LABEL[x.sin])} ${x.sinRating}</span>` : ""}`;

  function details(x) {
    const stats = x.atk || x.def || x.res ? `<p><b>${esc(t("Attack"))} ${x.atk} · ${esc(t("Defense"))} ${x.def} · ${esc(t("Resolve"))} ${x.res}</b> <small>${esc(x.track)}</small></p>` : (x.track ? `<p><small>${esc(x.track)}</small></p>` : "");
    const tech = (x.tech ?? []).map(y => `<li>${y.name ? `<b>${esc(y.name)}:</b> ` : ""}${esc(y.text)}</li>`).join("");
    const line = (k, v) => (v ? `<p><b>${esc(t(k))}:</b> ${esc(v)}</p>` : "");
    return `<div class="thr-more">${stats}${tech ? `<ul>${tech}</ul>` : ""}${line("Want", x.want)}${line("Bond hook", x.bond)}${line("Detail", x.detail)}${line("Use in play", x.use)}${x.mine ? `<p><button type="button" data-action="thrDel" data-id="${esc(x.id)}">${esc(t("Remove from my library"))}</button></p>` : ""}</div>`;
  }
  const row = x => `<li class="thr ${open.has(x.id) ? "open" : ""}"><div class="thr-head">${x.portrait ? `<img class="thr-pic" src="${esc(x.portrait)}" alt="">` : ""}<button type="button" class="thr-name" data-action="thrOpen" data-id="${esc(x.id)}" aria-expanded="${open.has(x.id)}"><b>${esc(T.nameIn(x, ctx.lang()))}</b><small>${esc(x.danger || x.cat)}</small></button>
    <span class="thr-badges">${badges(x)}</span><button type="button" class="thr-add" data-action="thrAdd" data-id="${esc(x.id)}" title="${esc(t("Add to the encounter"))}">+</button></div>${open.has(x.id) ? details(x) : ""}</li>`;

  function listHtml() {
    const list = T.filter(T.allTemplates(custom()), f);
    return list.length ? `<ul class="thr-list">${list.map(row).join("")}</ul>` : `<p class="hint pad">${esc(t("No Threat matches."))}</p>`;
  }
  function encounterHtml() {
    const s = T.summary(enc, custom());
    if (!s.rows.length) return `<p class="hint pad">${esc(t("Add Threats with + to build an encounter. Dice come from the Grade (Appendix E)."))}</p>`;
    const rows = s.rows.map(r => `<li>${r.tpl.portrait ? `<img class="thr-pic sm" src="${esc(r.tpl.portrait)}" alt="">` : ""}<span class="thr-n">${r.count}&times;</span> <b>${esc(T.nameIn(r.tpl, ctx.lang()))}</b> <small>${r.dice} ${esc(t("dice"))} · ${esc(t("Difficulty {n}", { n: r.difficulty }))}${r.tpl.group ? ` · ${esc(t("one group"))}` : ""}</small>
      <span class="thr-step"><button type="button" data-action="thrMinus" data-id="${esc(r.tpl.id)}" aria-label="-">&minus;</button><button type="button" data-action="thrAdd" data-id="${esc(r.tpl.id)}" aria-label="+">+</button><button type="button" data-action="thrDrop" data-id="${esc(r.tpl.id)}" aria-label="${esc(t("Remove"))}">&times;</button></span></li>`).join("");
    const warn = s.soloNamed.length ? `<p class="hint">${esc(t("A named opponent of Grade 4 or lower gets one extra defensive response each Exchange (Part VI)."))}</p>` : "";
    return `<ul class="thr-enc">${rows}</ul>
      <p class="thr-sum"><b>${esc(t("{n} Threat sheets", { n: s.sheets }))}</b> · ${esc(t("{n} dice rolled against the crew per Exchange, if every one acts", { n: s.diceTotal }))}</p>${warn}
      <div class="thr-go"><label class="chk"><input type="checkbox" data-opt="exchange" ${opts.exchange ? "checked" : ""}> ${esc(t("Add to the Exchange order"))}</label>
      <label class="chk"><input type="checkbox" data-opt="map" ${opts.map ? "checked" : ""} ${ctx.hasMap() ? "" : "disabled"}> ${esc(t("Put tokens on the map"))}</label>
      <button type="button" class="primary" data-action="thrCreate">${esc(t("Create these Threats"))}</button><button type="button" data-action="thrClear">${esc(t("Clear"))}</button></div>`;
  }
  const select = (name, value, choices) => `<select data-f="${name}">${choices.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

  function html() {
    const cats = T.categories(T.allTemplates(custom())), catName = c => ({ Backstreets: t("Backstreets"), Nests: t("Nests"), "Special humans": t("Special humans"), Colors: t("Colors"), Mine: t("Mine") }[c] ?? c);
    return `<div class="thr-top"><h3>${esc(t("Encounter"))}${refButton("threat", t("Open this in the manual"))}</h3><div id="thr-enc">${encounterHtml()}</div></div>
      <div class="thr-filters"><input type="search" data-f="q" value="${esc(f.q)}" placeholder="${esc(t("Search by name"))}" aria-label="${esc(t("Search by name"))}">
        ${select("band", f.band, [["", t("Any Grade")], ["8-9", t("Grade 9-8 (3 dice)")], ["5-7", t("Grade 7-5 (4 dice)")], ["2-4", t("Grade 4-2 (6 dice)")], ["1", t("Grade 1 (8 dice)")]])}
        ${select("sin", f.sin, [["", t("Any Sin")], ...Object.keys(SIN_LABEL).map(k => [k, SIN_LABEL[k]])])}
        ${select("cat", f.cat, [["", t("Everything")], ...cats.map(c => [c, catName(c)])])}</div>
      <div id="thr-list">${listHtml()}</div>
      <p class="hint pad">${esc(t("Text comes from the Bestiary in English. Open a Threat sheet and press Save to library to keep your own."))}</p>`;
  }

  function render() {
    const pane = $("#pane-thr"); if (!pane) return;
    pane.innerHTML = html();
    pane.querySelectorAll("[data-f]").forEach(el => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      f[el.dataset.f] = el.value; $("#thr-list").innerHTML = listHtml();
    }));
    pane.querySelectorAll("[data-opt]").forEach(el => el.addEventListener("change", () => { opts[el.dataset.opt] = el.checked; }));
  }
  const refreshEnc = () => { $("#thr-enc").innerHTML = encounterHtml(); $("#pane-thr").querySelectorAll("[data-opt]").forEach(el => el.addEventListener("change", () => { opts[el.dataset.opt] = el.checked; })); };

  const actions = {
    thrOpen: el => { const id = el.dataset.id; open.has(id) ? open.delete(id) : open.add(id); $("#thr-list").innerHTML = listHtml(); },
    thrAdd: el => { T.addTo(enc, el.dataset.id, 1); refreshEnc(); },
    thrMinus: el => { const r = enc.find(x => x.id === el.dataset.id); if (r && r.count > 1) r.count--; refreshEnc(); },
    thrDrop: el => { T.dropFrom(enc, el.dataset.id); refreshEnc(); },
    thrClear: () => { enc.length = 0; refreshEnc(); },
    thrCreate: async () => {
      const s = T.summary(enc, custom()); if (!s.rows.length) return;
      const choose = s.rows.filter(r => !r.tpl.sin);                                   // the "choose a Sin" templates ask, once
      let sins = {};
      if (choose.length) {
        const r = await ctx.ask({
          title: t("Choose a Sin"), ok: t("Create"), wide: true,
          body: choose.map((x, i) => `<div class="pm-row"><label>${esc(T.nameIn(x.tpl, ctx.lang()))}</label><select name="s${i}"><option value="">${esc(t("None"))}</option>${Object.keys(SIN_LABEL).map(k => `<option value="${k}">${esc(SIN_LABEL[k])}</option>`).join("")}</select></div>`).join(""),
          read: fm => choose.map((_, i) => fm.elements["s" + i].value)
        });
        if (!r) return;
        choose.forEach((x, i) => { sins[x.tpl.id] = r[i]; });
      }
      const made = s.rows.flatMap(r => T.build(r.tpl, { count: r.count, lang: ctx.lang(), sin: sins[r.tpl.id] || undefined, tr: t, newActor }));
      const n = ctx.create(made, opts);
      enc.length = 0; render();
      ctx.toast(t("{n} Threat sheets created.", { n }));
    },
    thrDel: el => { const i = custom().findIndex(x => x.id === el.dataset.id); if (i >= 0) { custom().splice(i, 1); open.delete(el.dataset.id); ctx.changed(); T.dropFrom(enc, el.dataset.id); render(); } },
    thrSave: (el, a) => {
      if (a?.type !== "npc") return;
      if (custom().length >= T.MAX_CUSTOM) return ctx.toast(t("That is the most templates this app keeps."));
      custom().push(T.fromActor(a)); ctx.changed();
      ctx.toast(t("{name} saved to your library.", { name: a.name }));
    }
  };
  return { actions, render, enc };
}
