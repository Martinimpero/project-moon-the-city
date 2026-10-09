/** The Clocks tab: everyone sees the Clocks the GM shows; the GM adds, moves, edits and hides them. Built with `createClocksUI(ctx)`. */
import * as K from "./clocks.mjs";
import { t, pair } from "./i18n.mjs";
import { esc } from "./engine.mjs";

/** ctx: { $, isGM(), list() -> clocks to show, mine() -> the GM's own list, svg(size, filled), changed(), post(builder), ask(opts), toast(msg) } */
export function createClocksUI(ctx) {
  const $ = ctx.$;
  const card = c => `<div class="pm-clockcard ${K.isFull(c) ? "full" : ""} ${ctx.isGM() && !c.shown ? "hidden-clock" : ""}" data-id="${esc(c.id)}">${ctx.svg(c.size, c.filled)}<div class="nm">${esc(c.name)}</div>
    <div class="ct">${c.filled} / ${c.size}${c.scope ? ` · ${esc(c.scope)}` : ""}</div>
    ${c.consequence && (ctx.isGM() || K.isFull(c)) ? `<div class="cq">${esc(c.consequence)}</div>` : ""}
    ${ctx.isGM() ? `<div class="ck-acts"><button type="button" data-action="ckStep" data-id="${esc(c.id)}" data-delta="-1" aria-label="-1">&minus;</button><button type="button" data-action="ckStep" data-id="${esc(c.id)}" data-delta="1" aria-label="+1">+</button>
      <button type="button" data-action="ckShow" data-id="${esc(c.id)}" class="${c.shown ? "on" : ""}" title="${esc(c.shown ? t("The players can see this Clock") : t("Hidden from the players"))}">${esc(c.shown ? t("Shown") : t("Hidden"))}</button>
      <button type="button" data-action="ckEdit" data-id="${esc(c.id)}">${esc(t("Edit"))}</button></div>` : ""}</div>`;

  function html() {
    const list = ctx.list();
    const bar = ctx.isGM() ? `<div class="m-bar"><button type="button" data-action="ckNew">+ ${esc(t("Clock"))}</button></div>` : "";
    return `${bar}${list.length ? `<div class="pm-clocks ck-grid">${list.map(card).join("")}</div>` : `<p class="hint pad">${esc(ctx.isGM() ? t("No Clocks yet. Add the ones the table is racing: Open War, Heat, a chase.") : t("The GM has not shown any Clocks."))}</p>`}`;
  }

  const form = c => `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" maxlength="40" value="${esc(c?.name ?? "")}"><label>${esc(t("Segments"))}</label><select name="size">${K.SIZES.map(n => `<option ${n === (c?.size ?? 6) ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="pm-row"><label>${esc(t("Where"))}</label><input type="text" name="scope" maxlength="60" value="${esc(c?.scope ?? "")}"></div>
    <div class="pm-row"><label>${esc(t("When it fills"))}</label><input type="text" name="consequence" maxlength="300" value="${esc(c?.consequence ?? "")}"></div>
    <div class="pm-row"><label class="chk"><input type="checkbox" name="shown" ${c?.shown ? "checked" : ""}> ${esc(t("Players can see this Clock"))}</label></div>`;
  const read = f => ({ name: f.elements.name.value, size: Number(f.elements.size.value), scope: f.elements.scope.value, consequence: f.elements.consequence.value, shown: f.elements.shown.checked });

  /** A Clock has just filled: say what happens, to the whole table. */
  function announce(c) {
    ctx.post(() => `<div class="pm-card"><div class="pm-card-head">${esc(pair("Clock full", "Reloj completo"))}: ${esc(c.name)}</div><div class="pm-notes"><p>${esc(c.consequence || pair("Something concrete happens. Never vague.", "Algo concreto ocurre. Nunca algo vago."))}</p></div></div>`);
  }
  const mine = id => ctx.mine().find(c => c.id === id);
  const actions = {
    ckNew: async () => {
      const r = await ctx.ask({ title: t("New Clock"), ok: t("Add"), wide: true, body: form(null), read });
      if (!r) return;
      if (!K.addClock(ctx.mine(), r)) return ctx.toast(t("That is the most Clocks this app keeps."));
      ctx.changed();
    },
    ckStep: el => {
      if (!ctx.isGM()) return;
      const c = mine(el.dataset.id); if (!c) return;
      const r = K.step(c, Number(el.dataset.delta));
      if (r.filledNow) announce(c);
      ctx.changed();
    },
    ckShow: el => { const c = ctx.isGM() && mine(el.dataset.id); if (c) { c.shown = !c.shown; ctx.changed(); } },
    ckEdit: async el => {
      const c = ctx.isGM() && mine(el.dataset.id); if (!c) return;
      const r = await ctx.ask({
        title: t("Edit Clock"), ok: t("Save"), wide: true, read,
        body: `${form(c)}<div class="pm-row"><button type="button" data-do="del">${esc(t("Delete"))}</button></div>`,
        setup: f => f.querySelector('[data-do="del"]').addEventListener("click", () => { K.removeClock(ctx.mine(), c.id); f.closest("dialog").close(); ctx.changed(); })
      });
      if (r) { K.editClock(ctx.mine(), c.id, r); ctx.changed(); }
    }
  };
  const render = () => { $("#pane-ck").innerHTML = html(); };
  return { actions, render };
}
