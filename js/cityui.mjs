/**
 * The City panel: a schematic map of the City (the 25 mapped Districts in their spiral, plus Z), always one button away.
 * Press a Wing to read what is known and to jump to the manual. Built with `createCityUI(ctx)`; ctx: { lang(), closeManual() }.
 */
import * as Y from "./city.mjs";
import * as P from "./cityplan.mjs";
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";

export function createCityUI(ctx) {
  let el = null, open = false, picked = "A", query = "";
  const label = r => ({ center: t("Centre"), north: t("North"), west: t("West"), east: t("East"), south: t("South"), "": t("Region not stated") })[r];
  const note = w => (ctx.lang() === "es" ? w.es : w.en);
  const status = w => (w.status === "fallen" ? t("Fallen") : w.status === "unknown" ? t("Unknown") : "");

  function tile(w, dim) {
    return `<button type="button" class="city-tile ${w.letter === picked ? "on" : ""} ${w.status} ${dim ? "dim" : ""}" data-action="cityPick" data-letter="${w.letter}" title="${esc(w.name)}"><b>${w.letter}</b><small>${w.n}</small></button>`;
  }
  function detail() {
    const w = Y.byLetter(picked); if (!w) return "";
    const s = status(w);
    return `<div class="city-card"><h2>${esc(w.name)} <small>${esc(t("District {n}", { n: w.n }))}</small></h2>
      <p class="city-meta">${[w.region ? esc(label(w.region)) : "", s ? `<b>${esc(s)}</b>` : ""].filter(Boolean).join(" &middot; ")}</p><p>${esc(note(w))}</p>
      <p><button type="button" data-action="manual" data-ref="${Y.manualRef(w)}">${esc(w.letter < "D" ? t("The Head, the Eye and the Claw in the manual") : t("Wings in the manual"))}</button></p></div>`;
  }
  function mapHtml() {
    const hit = new Set(Y.find(query, ctx.lang()).map(w => w.letter));
    const plan = P.plan();
    const cells = Object.entries(plan).map(([l, c]) => {
      const w = Y.byLetter(l), on = l === picked;
      return `<g class="city-cell ${on ? "on" : ""} ${w.status} ${hit.has(l) ? "" : "dim"}" data-action="cityPick" data-letter="${l}" tabindex="0" role="button" aria-label="${esc(w.name)}, ${esc(t("District {n}", { n: w.n }))}"><title>${esc(w.name)}</title><path d="${c.d}"/></g>`;
    }).join("");
    const z = Y.byLetter("Z");
    return `<svg class="city-svg" viewBox="0 0 ${P.VIEW.w} ${P.VIEW.h}" role="group" aria-label="${esc(t("City"))}"><image href="${P.IMAGE}" x="0" y="0" width="${P.VIEW.w}" height="${P.VIEW.h}" preserveAspectRatio="xMidYMid slice"/>${cells}</svg>
      <p class="city-z"><button type="button" class="city-tile ${picked === "Z" ? "on" : ""} unknown ${hit.has("Z") ? "" : "dim"}" data-action="cityPick" data-letter="Z" title="${esc(z.name)}"><b>Z</b><small>26</small></button> ${esc(t("District 26 is on no map."))}</p>`;
  }
  function paint() {
    if (!el) {
      el = document.createElement("aside"); el.id = "city"; el.hidden = true; el.setAttribute("aria-label", t("City")); document.body.appendChild(el);
      el.addEventListener("input", e => { if (e.target.matches(".man-q")) { query = e.target.value; paint(); const q = el.querySelector(".man-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
      el.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    }
    el.hidden = !open; document.body.classList.toggle("city-open", open);
    if (!open) return;
    el.style.top = innerWidth > 820 ? Math.round(document.querySelector("#top")?.getBoundingClientRect().bottom ?? 0) + "px" : "";
    el.innerHTML = `<div class="man-head"><span class="man-home">${esc(t("City"))}</span><input type="search" class="man-q" value="${esc(query)}" placeholder="${esc(t("Find a Wing"))}" aria-label="${esc(t("Find a Wing"))}"><button type="button" class="man-x" data-action="cityClose" aria-label="${esc(t("Close"))}">&times;</button></div>
      <div class="man-body">${detail()}${mapHtml()}<p class="hint">${esc(t("A schematic of the City, not to scale: the spiral out from A (District 1). The letter is the District's number. What the games leave open stays open: your table's City is yours to invent (Part VII)."))}</p></div>`;
  }
  const close = () => { open = false; paint(); };
  return {
    isOpen: () => open, close,
    refresh: () => { if (open) paint(); },
    actions: {
      city: () => { if (open) return close(); ctx.closeManual(); open = true; paint(); },
      cityPick: b => { picked = b.dataset.letter; paint(); },
      cityClose: () => close()
    }
  };
}
