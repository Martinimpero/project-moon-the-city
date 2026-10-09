/**
 * The manual reader: a panel on the right that stays beside the sheet and the map. It lists the parts, reads one part with its sections,
 * searches all of them, and opens at a given section when a "?" on the sheet (or a "Part IV §2" in the text) is pressed.
 * The files are the manual's Markdown (webapp/manual/<lang>/<part>.md, made by tools/make_manual.mjs); each is loaded the first time it is needed.
 * Built with `createManualUI(ctx)`; ctx: { lang() -> "en" | "es", base? }.
 */
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import * as M from "./md.mjs";
import { parseRef } from "./manualrefs.mjs";

export function createManualUI(ctx) {
  const base = ctx.base ?? "manual";
  let el = null, index = null, open = false, shownLang = "", view = { mode: "toc", part: "", sec: 0 }, query = "";
  const docs = new Map(), pending = new Map();

  const fetchText = async url => { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r; };
  async function loadIndex() { if (!index) index = await (await fetchText(`${base}/index.json`)).json(); return index; }
  async function loadPart(id) {
    const key = `${ctx.lang()}/${id}`;
    if (docs.has(key)) return docs.get(key);
    if (!pending.has(key)) pending.set(key, fetchText(`${base}/${key}.md?v=${index.version}`).then(r => r.text()).then(md => { docs.set(key, md); return md; }).finally(() => pending.delete(key)));
    return pending.get(key);
  }
  const L = () => (ctx.lang() === "es" ? "es" : "en");
  const titleOf = p => p[L()].title;

  function ensure() {
    if (el) return el;
    el = document.createElement("aside"); el.id = "manual"; el.hidden = true; el.setAttribute("aria-label", t("Manual"));
    document.body.appendChild(el);
    el.addEventListener("input", e => { if (e.target.matches(".man-q")) { query = e.target.value; clearTimeout(ensure.timer); ensure.timer = setTimeout(runSearch, 200); } });
    el.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    return el;
  }

  function head(extra = "") {
    return `<div class="man-head"><button type="button" class="man-home" data-action="manual" data-ref="" title="${esc(t("All the parts"))}">${esc(t("Manual"))}</button>
      <input type="search" class="man-q" value="${esc(query)}" placeholder="${esc(t("Search the manual"))}" aria-label="${esc(t("Search the manual"))}">
      <button type="button" class="man-x" data-action="manualClose" aria-label="${esc(t("Close"))}">&times;</button></div>${extra}`;
  }

  function tocHtml() {
    const items = index.parts.map(p => `<li><button type="button" class="man-part" data-action="manual" data-ref="${p.id}">${esc(titleOf(p))}</button>
      <ol class="man-secs">${p[L()].sections.map((s, i) => `<li><button type="button" data-action="manual" data-ref="${p.id}#${i + 1}">${esc(s)}</button></li>`).join("")}</ol></li>`).join("");
    return `<div class="man-body"><p class="hint">${esc(t("The rules as written. Press a part to read it, or a section to go straight to it."))}</p><ul class="man-toc">${items}</ul></div>`;
  }

  async function readHtml() {
    const part = index.parts.find(p => p.id === view.part); if (!part) return tocHtml();
    const md = await loadPart(part.id), { html } = M.render(md);
    const at = index.parts.findIndex(p => p.id === part.id), prev = index.parts[at - 1], next = index.parts[at + 1];
    const nav = `<div class="man-nav"><button type="button" data-action="manual" data-ref="${prev?.id ?? ""}" ${prev ? "" : "disabled"}>&lsaquo; ${esc(prev ? titleOf(prev) : "")}</button><button type="button" data-action="manual" data-ref="${next?.id ?? ""}" ${next ? "" : "disabled"}>${esc(next ? titleOf(next) : "")} &rsaquo;</button></div>`;
    const jump = `<nav class="man-jump" aria-label="${esc(t("Sections"))}">${part[L()].sections.map((s, i) => `<button type="button" data-action="manual" data-ref="${part.id}#${i + 1}" class="${view.sec === i + 1 ? "on" : ""}">${esc(s.replace(/^\d+\.\s*/, ""))}</button>`).join("")}</nav>`;
    return `<div class="man-body" id="man-body"><h2 class="man-title">${esc(titleOf(part))}</h2>${jump}<div class="man-text">${html}</div>${nav}</div>`;
  }

  async function paint() {
    ensure(); el.hidden = !open;
    el.style.top = innerWidth > 820 ? Math.round(document.querySelector("#top")?.getBoundingClientRect().bottom ?? 0) + "px" : ""; document.body.classList.toggle("manual-open", open);
    if (!open) return;
    try { await loadIndex(); } catch { el.innerHTML = head() + `<div class="man-body"><p class="hint">${esc(t("The manual could not be loaded. It needs the page to be opened from its web address, not from a file."))}</p></div>`; return; }
    let body;
    if (view.mode === "search") body = `<div class="man-body" id="man-results"></div>`;
    else if (view.mode === "read") { try { body = await readHtml(); } catch { body = `<div class="man-body"><p class="hint">${esc(t("This part could not be loaded. Check the connection and try again."))}</p></div>`; } }
    else body = tocHtml();
    const keep = el.querySelector(".man-q") === document.activeElement;
    el.innerHTML = head() + body; shownLang = L();
    if (keep) { const q = el.querySelector(".man-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    if (view.mode === "search") await runSearch(true);
    if (view.mode === "read") {
      const target = view.sec ? el.querySelector(`#sec-${view.sec}`) : null, box = el.querySelector("#man-body");
      if (target) { target.scrollIntoView({ block: "start" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1800); }
      else if (box) box.scrollTop = 0;
    }
  }

  async function runSearch(quiet) {
    if (!index) return;
    const q = query.trim();
    if (q.length < 2) { if (view.mode === "search") { view = { mode: "toc", part: "", sec: 0 }; return paint(); } return; }
    if (view.mode !== "search") { view = { mode: "search", part: "", sec: 0 }; await paint(); }
    const box = el.querySelector("#man-results"); if (!box) return;
    if (!quiet) box.innerHTML = `<p class="hint">${esc(t("Searching…"))}</p>`;
    const list = await Promise.all(index.parts.map(async p => ({ part: p.id, partTitle: titleOf(p), md: await loadPart(p.id).catch(() => "") })));
    if (q !== query.trim()) return;                                       // the player kept typing
    const hits = M.search(list, q);
    box.innerHTML = hits.length ? `<ul class="man-hits">${hits.map(h => `<li><button type="button" data-action="manual" data-ref="${h.part}${h.sec ? "#" + h.sec : ""}"><b>${esc(h.title || h.partTitle)}</b> <small>${esc(h.title ? h.partTitle : "")}</small><span>${esc(h.snippet)}</span></button></li>`).join("")}</ul>` : `<p class="hint">${esc(t("Nothing found."))}</p>`;
  }

  async function go(ref) {
    open = true; ensure();
    if (!ref) { view = { mode: "toc", part: "", sec: 0 }; query = ""; return paint(); }
    try { await loadIndex(); } catch { return paint(); }
    const r = parseRef(ref, index); if (!r) { view = { mode: "toc", part: "", sec: 0 }; return paint(); }
    query = ""; view = { mode: "read", part: r.part, sec: r.sec }; return paint();
  }
  function close() { open = false; paint(); }

  return {
    isOpen: () => open,
    open: ref => go(ref),
    close,
    /** The app's language changed: show the open page in the new one. */
    refresh: () => { if (open && shownLang !== L()) paint(); },
    actions: {
      manual: el => go(el.dataset.ref || ""),
      manualClose: () => close()
    }
  };
}
