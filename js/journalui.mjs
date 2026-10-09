/** The Journal tab: the party journal (shared, in a room) and your own private notes. Built with `createJournalUI(ctx)`. */
import * as J from "./journal.mjs";
import { textToHtml } from "./handouts.mjs";
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";

/**
 * ctx: { state, $, lang(), isGM(), myName(), party() -> entries, apply(op, entry), notesChanged(), ask(opts), toast(msg),
 *        recapParts() -> { lines, scenes, handouts } }
 */
export function createJournalUI(ctx) {
  const $ = ctx.$;
  let sub = "party";                                   // "party" | "mine"
  const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString(ctx.lang() === "es" ? "es" : "en", { day: "numeric", month: "short" }) : "");
  const excerpt = text => { const s = String(text ?? "").replace(/\s+/g, " ").trim(); return s.length > 130 ? s.slice(0, 127) + "..." : s; };

  const row = (e, mine) => `<li class="jr ${e.kind === "recap" ? "recap" : ""} ${e.pinned ? "pinned" : ""}" data-id="${esc(e.id)}">
    <button type="button" class="jr-open" data-action="jrOpen" data-id="${esc(e.id)}"><b>${e.pinned ? "&#9733; " : ""}${esc(e.title)}</b>
    <small>${esc([e.kind === "recap" ? t("Recap") : "", mine ? "" : e.author, fmtDate(e.at)].filter(Boolean).join(" · "))}</small>
    <span class="ex">${esc(excerpt(e.text))}</span></button></li>`;

  function html() {
    const tabs = `<div class="jr-tabs"><button type="button" data-action="jrSub" data-sub="party" class="${sub === "party" ? "on" : ""}">${esc(t("Party journal"))}</button><button type="button" data-action="jrSub" data-sub="mine" class="${sub === "mine" ? "on" : ""}">${esc(t("My notes"))}</button></div>`;
    if (sub === "mine") {
      const notes = J.sorted(ctx.state.notes);
      return `${tabs}<div class="m-bar"><button type="button" data-action="jrNew" data-own="1">+ ${esc(t("Note"))}</button></div>
        <p class="hint pad">${esc(t("Only you can see these. They stay in this browser and in your exports."))}</p>
        ${notes.length ? `<ul class="jr-list">${notes.map(n => row(n, true)).join("")}</ul>` : `<p class="hint pad">${esc(t("No notes yet."))}</p>`}`;
    }
    const list = J.sorted(ctx.party());
    return `${tabs}<div class="m-bar"><button type="button" data-action="jrNew">+ ${esc(t("Entry"))}</button>${ctx.isGM() ? `<button type="button" data-action="jrRecap">+ ${esc(t("Recap"))}</button>` : ""}</div>
      ${list.length ? `<ul class="jr-list">${list.map(e => row(e, false)).join("")}</ul>` : `<p class="hint pad">${esc(t("Nothing here yet. Write down what the crew knows: clues, names, the terms of a Contract."))}</p>`}`;
  }

  /** Write or change an entry. Resolves with { title, text } or null. */
  const editor = (entry, title) => ctx.ask({
    title, ok: t("Save"), wide: true,
    body: `<div class="pm-row"><label>${esc(t("Title"))}</label><input type="text" name="title" value="${esc(entry?.title ?? "")}" maxlength="${J.MAX_TITLE}"></div>
      <div class="pm-row"><textarea name="text" rows="12" maxlength="${J.MAX_TEXT}" placeholder="${esc(t("Write here."))}">${esc(entry?.text ?? "")}</textarea></div>`,
    read: f => ({ title: f.elements.title.value.trim(), text: f.elements.text.value })
  });

  const find = (id, own) => (own ? ctx.state.notes : ctx.party()).find(e => e.id === id);

  async function open(id) {
    const own = sub === "mine", e = find(id, own);
    if (!e) return;
    const who = ctx.myName(), can = own || J.canChange(e, who, ctx.isGM());
    ctx.ask({
      title: e.title, ok: t("Close"), cancel: false, wide: true, read: () => true,
      body: `<div class="handout-paper">${textToHtml(e.text, esc) || `<p class="hint">-</p>`}</div>
        <p class="pm-note">${esc([e.kind === "recap" ? t("Recap") : "", own ? "" : e.author, fmtDate(e.at)].filter(Boolean).join(" · "))}</p>
        <div class="pm-row jr-acts">${can ? `<button type="button" data-do="edit">${esc(t("Edit"))}</button><button type="button" data-do="del">${esc(t("Delete"))}</button>` : ""}${!own && ctx.isGM() ? `<button type="button" data-do="pin">${esc(e.pinned ? t("Unpin") : t("Pin"))}</button>` : ""}</div>`,
      setup: f => {
        const close = () => f.closest("dialog").close();
        f.querySelector('[data-do="edit"]')?.addEventListener("click", async () => {
          close();
          const r = await editor(e, t("Edit entry"));
          if (!r) return;
          if (own) { J.editNote(ctx.state.notes, id, r); ctx.notesChanged(); } else ctx.apply("edit", { id, ...r });
        });
        f.querySelector('[data-do="del"]')?.addEventListener("click", async () => {
          close();
          const ok = await ctx.ask({ title: t("Delete {name}?", { name: e.title }), ok: t("Delete"), body: `<p>${esc(t("This cannot be undone."))}</p>`, read: () => true });
          if (!ok) return;
          if (own) { J.removeNote(ctx.state.notes, id); ctx.notesChanged(); } else ctx.apply("del", { id });
        });
        f.querySelector('[data-do="pin"]')?.addEventListener("click", () => { close(); ctx.apply("pin", { id }); });
      }
    });
  }

  const actions = {
    jrSub: el => { sub = el.dataset.sub; render(); },
    jrOpen: el => open(el.dataset.id),
    jrNew: async el => {
      const own = !!el.dataset.own || sub === "mine";
      if (own && ctx.state.notes.length >= J.MAX_NOTES) return ctx.toast(t("That is the most notes this app keeps."));
      const r = await editor(null, own ? t("New note") : t("New journal entry"));
      if (!r) return;
      if (own) { J.addNote(ctx.state.notes, r); ctx.notesChanged(); } else ctx.apply("add", r);
    },
    jrRecap: async () => {
      const parts = ctx.recapParts();
      const day = new Date().toLocaleDateString(ctx.lang() === "es" ? "es" : "en", { day: "numeric", month: "long", year: "numeric" });
      const r = await editor({ title: `${t("Session recap")} ${day}`, text: J.recapText(t, parts) }, t("New recap"));
      if (r) ctx.apply("add", { ...r, kind: "recap" });
    }
  };
  const render = () => { $("#pane-jr").innerHTML = html(); };
  return { actions, render };
}
