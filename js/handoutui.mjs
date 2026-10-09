/** The Handouts pane: the GM's library and what a player has been shown. Built with `createHandoutUI(ctx)`. */
import * as H from "./handouts.mjs";
import { shrinkImage } from "./board.mjs";
import { t, tIn } from "./i18n.mjs";
import { esc } from "./engine.mjs";

/** ctx: { state, lang() -> "en"|"es", room(), isGM(), received() -> [handout], changed(), ask(opts), toast(msg), $ } */
export function createHandoutUI(ctx) {
  const $ = ctx.$;
  const find = id => ctx.state.handouts.find(h => h.id === id) ?? ctx.received().find(h => h.id === id);

  function html() {
    if (ctx.isGM()) {
      const rows = ctx.state.handouts.map(h => `<li class="ho ${h.shown ? "shown" : ""}">
        ${h.img ? `<img src="${esc(h.img)}" alt="">` : `<span class="ph">&#9783;</span>`}
        <span class="who"><b>${esc(H.pick(h, ctx.lang()).title || t("Untitled"))}</b><small>${esc(H.hasAlt(h) ? "EN \u00B7 ES  " : H.LANG_NAME[h.lang].slice(0, 2).toUpperCase() + "  ")}${esc(h.shown ? (ctx.room()?.online ? t("Shown to the table") : t("Marked as shown")) : t("Hidden"))}</small></span>
        <span class="btns"><button type="button" data-action="hoView" data-id="${h.id}">${esc(t("View"))}</button>
        <button type="button" data-action="hoShow" data-id="${h.id}" class="${h.shown ? "on" : ""}">${esc(h.shown ? t("Take back") : t("Show"))}</button>
        <button type="button" data-action="hoEdit" data-id="${h.id}">${esc(t("Edit"))}</button><button type="button" data-action="hoDelete" data-id="${h.id}">&times;</button></span></li>`).join("");
      return `<div class="m-bar"><button type="button" data-action="hoNew">+ ${esc(t("Handout"))}</button><button type="button" data-action="hoContract">+ ${esc(t("Contract"))}</button></div>
        ${rows ? `<ul class="ho-list">${rows}</ul>` : `<p class="hint pad">${esc(t("No handouts yet. Add a note, a contract or a picture, then Show it to the table."))}</p>`}`;
    }
    const list = ctx.received();
    const rows = list.map(h => `<li class="ho"><button type="button" class="ho-open" data-action="hoView" data-id="${h.id}">
      ${h.img ? `<img src="${esc(h.img)}" alt="">` : `<span class="ph">&#9783;</span>`}<span class="who"><b>${esc(H.pick(h, ctx.lang()).title || t("Untitled"))}</b></span></button></li>`).join("");
    return rows ? `<ul class="ho-list">${rows}</ul>` : `<p class="hint pad">${esc(t("Nothing has been shown to you yet."))}</p>`;
  }

  /** Open a handout in a reading dialog, in the reader's language when the handout has it, with a button to flip to the other. */
  function view(h) {
    if (!h) return;
    H.normalizeHandout(h);
    let p = H.pick(h, ctx.lang());
    const paper = v => `${h.img ? `<img class="ho-img" src="${esc(h.img)}" alt="${esc(v.title)}">` : ""}${H.textToHtml(v.text, esc)}`;
    const note = v => (v.translated ? "" : t("This handout is only in {lang}.", { lang: H.LANG_NAME[v.lang] }));
    ctx.ask({
      title: p.title || t("Handout"), ok: t("Close"), cancel: false, wide: true, read: () => true,
      body: `${p.both ? `<div class="ho-langs"><button type="button" data-switchlang>${esc(t("Read in {lang}", { lang: H.LANG_NAME[H.otherLang(p.lang)] }))}</button></div>` : ""}
        <div class="handout-paper">${paper(p)}</div><p class="pm-note ho-note">${esc(note(p))}</p>`,
      setup: f => {
        f.querySelector("[data-switchlang]")?.addEventListener("click", ev => {
          const want = H.otherLang(p.lang), v = H.versionIn(h, want);
          if (!v) return;
          p = { ...v, translated: want === ctx.lang(), both: true };
          f.querySelector(".handout-paper").innerHTML = paper(p);
          f.querySelector(".ho-note").textContent = note(p);
          f.closest("dialog").querySelector("h2").textContent = p.title || t("Handout");
          ev.target.textContent = t("Read in {lang}", { lang: H.LANG_NAME[H.otherLang(p.lang)] });
        });
      }
    });
  }

  async function edit(existing, preset) {
    const h = H.normalizeHandout(existing ?? H.newHandout({ lang: ctx.lang(), ...(preset ?? {}) }));
    let img = h.img;
    const langOpts = H.LANGS.map(l => `<option value="${l}" ${h.lang === l ? "selected" : ""}>${H.LANG_NAME[l]}</option>`).join("");
    const r = await ctx.ask({
      title: existing ? t("Edit handout") : t("New handout"), ok: t("Save"), wide: true,
      body: `<div class="pm-row"><label>${esc(t("This version is in"))}</label><select name="lang">${langOpts}</select></div>
        <div class="pm-row"><label>${esc(t("Title"))}</label><input type="text" name="title" value="${esc(h.title)}" maxlength="80"></div>
        <div class="pm-row"><label class="full">${esc(t("Text (blank line = new paragraph; *italic*, **bold**)"))}</label><textarea name="text" rows="7" maxlength="${H.MAX_TEXT}">${esc(h.text)}</textarea></div>
        <div class="pm-row ho-other"><label class="full alt-label"></label><button type="button" data-swap title="${esc(t("Swap the two versions"))}">&#8645; ${esc(t("Swap the two versions"))}</button></div>
        <div class="pm-row"><label>${esc(t("Title"))}</label><input type="text" name="altTitle" value="${esc(h.alt.title)}" maxlength="80"></div>
        <div class="pm-row"><textarea name="altText" rows="7" maxlength="${H.MAX_TEXT}" placeholder="${esc(t("Optional. Players who read the other language see this version."))}">${esc(h.alt.text)}</textarea></div>
        <div class="pm-row"><label>${esc(t("Picture"))}</label><input type="file" name="file" accept="image/*"><button type="button" data-clearimg>${esc(t("No picture"))}</button><span class="pm-note imgnote">${img ? esc(t("A picture is attached.")) : ""}</span></div>`,
      read: f => ({ lang: f.elements.lang.value, title: f.elements.title.value.trim(), text: f.elements.text.value, alt: { title: f.elements.altTitle.value.trim(), text: f.elements.altText.value } }),
      setup: f => {
        const label = () => { f.querySelector(".alt-label").textContent = t("Version in {lang} (optional)", { lang: H.LANG_NAME[H.otherLang(f.elements.lang.value)] }); };
        label(); f.elements.lang.addEventListener("change", label);
        f.querySelector("[data-swap]").addEventListener("click", () => {      // the main version was written in the other language: swap them and the label
          const e = f.elements;
          [e.title.value, e.altTitle.value] = [e.altTitle.value, e.title.value];
          [e.text.value, e.altText.value] = [e.altText.value, e.text.value];
          e.lang.value = H.otherLang(e.lang.value); label();
        });
        f.elements.file.addEventListener("change", async () => {
          const file = f.elements.file.files[0]; if (!file) return;
          try { img = (await shrinkImage(file, 1400, 0.8)).src; f.querySelector(".imgnote").textContent = t("A picture is attached."); } catch { ctx.toast(t("That image could not be read.")); }
        });
        f.querySelector("[data-clearimg]").addEventListener("click", () => { img = ""; f.querySelector(".imgnote").textContent = ""; });
      }
    });
    if (!r) return;
    h.lang = r.lang; h.title = r.title || t("Untitled"); h.text = r.text; h.alt = { title: r.alt.title, text: r.alt.text }; h.img = img;
    H.normalizeHandout(h);
    if (!existing) ctx.state.handouts.push(h);
    ctx.changed(h);
  }

  const actions = {
    hoNew: () => { if (ctx.state.handouts.length >= H.MAX_HANDOUTS) return ctx.toast(t("That is the most handouts this app keeps.")); edit(null); },
    hoContract: () => {
      if (ctx.state.handouts.length >= H.MAX_HANDOUTS) return;
      edit(null, H.contractTemplate(tIn, ctx.lang()));
    },
    hoEdit: el => edit(ctx.state.handouts.find(h => h.id === el.dataset.id)),
    hoDelete: async el => {
      const h = ctx.state.handouts.find(x => x.id === el.dataset.id); if (!h) return;
      const ok = await ctx.ask({ title: t("Delete {name}?", { name: h.title }), ok: t("Delete"), body: `<p>${esc(t("This cannot be undone. Export first if you want a copy."))}</p>`, read: () => true });
      if (!ok) return;
      ctx.state.handouts = ctx.state.handouts.filter(x => x.id !== h.id);
      ctx.changed(h, true);
    },
    hoShow: el => {
      const h = ctx.state.handouts.find(x => x.id === el.dataset.id); if (!h) return;
      h.shown = !h.shown;
      ctx.changed(h, !h.shown);
      if (h.shown && !ctx.room()?.online) view(h);              // alone, showing it just opens it
    },
    hoView: el => view(find(el.dataset.id))
  };
  return { actions, render: () => { $("#pane-ho").innerHTML = html(); }, view };
}
