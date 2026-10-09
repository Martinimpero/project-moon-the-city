/**
 * The party journal: notes the whole table can read and add to (what the crew knows, clues, the Contract's terms), kept by the GM's page and
 * sent to everyone. Anyone can add; you can change or remove your own; the GM can change, remove or pin any. Plus private notes that never leave your
 * browser, and a recap helper. Plain functions, so Node can test them.
 */
import { uid } from "./model.mjs";

export const MAX_ENTRIES = 100, MAX_TEXT = 4000, MAX_TITLE = 80, MAX_NOTES = 200;
const clip = (v, n) => String(v ?? "").slice(0, n);
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export function makeEntry({ title = "", text = "", author = "", kind = "note", id } = {}, now = Date.now()) {
  return { id: id || uid(), title: clip(title, MAX_TITLE).trim() || "Untitled", text: clip(text, MAX_TEXT), author: clip(author, 30), at: now, kind: kind === "recap" ? "recap" : "note", pinned: false };
}
/** Fill in anything a saved or received entry lacks, and drop what is not an entry. */
export function cleanList(list) {
  return (Array.isArray(list) ? list : []).filter(e => e && typeof e === "object" && e.id).slice(0, MAX_ENTRIES)
    .map(e => ({ id: String(e.id), title: clip(e.title, MAX_TITLE) || "Untitled", text: clip(e.text, MAX_TEXT), author: clip(e.author, 30), at: Number(e.at) || 0, kind: e.kind === "recap" ? "recap" : "note", pinned: !!e.pinned }));
}
export const canChange = (entry, who, gm) => gm || same(entry.author, who);

/**
 * Apply one change to the shared journal. `who` is the name of whoever did it (the host fills this in; a player cannot claim to be someone else),
 * `gm` is true for the GM. Returns { list, ok, entry }; the list is changed in place and returned.
 */
export function applyOp(list, op, entry, who, { gm = false } = {}, now = Date.now()) {
  if (!entry) return { list, ok: false };
  if (op === "add") {
    const e = makeEntry({ ...entry, author: who, kind: gm ? entry.kind : "note" }, now);
    list.push(e);
    while (list.length > MAX_ENTRIES) { const i = list.findIndex(x => !x.pinned); list.splice(i < 0 ? 0 : i, 1); }
    return { list, ok: true, entry: e };
  }
  const i = list.findIndex(e => e.id === entry.id);
  if (i < 0) return { list, ok: false };
  const cur = list[i];
  if (op === "pin") { if (!gm) return { list, ok: false }; cur.pinned = !cur.pinned; return { list, ok: true, entry: cur }; }
  if (!canChange(cur, who, gm)) return { list, ok: false };
  if (op === "del") { list.splice(i, 1); return { list, ok: true, entry: cur }; }
  if (op === "edit") { cur.title = clip(entry.title, MAX_TITLE).trim() || cur.title; cur.text = clip(entry.text, MAX_TEXT); cur.edited = now; return { list, ok: true, entry: cur }; }
  return { list, ok: false };
}
/** Pinned first, then newest first. */
export const sorted = list => [...list].sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));

/* ---- private notes: the same shape, never sent anywhere ---- */
export function addNote(notes, { title = "", text = "" } = {}, now = Date.now()) {
  if (notes.length >= MAX_NOTES) return null;
  const n = makeEntry({ title, text, author: "" }, now); notes.push(n); return n;
}
export const editNote = (notes, id, { title, text }) => { const n = notes.find(x => x.id === id); if (!n) return null; n.title = clip(title, MAX_TITLE).trim() || n.title; n.text = clip(text, MAX_TEXT); return n; };
export const removeNote = (notes, id) => { const i = notes.findIndex(x => x.id === id); if (i < 0) return false; notes.splice(i, 1); return true; };

/* ---- the session recap ---- */

/**
 * One short line for each of the most recent log cards: who and what, and how it went. Log cards are stored with both languages
 * (a `<div lang="en">` and a `<div lang="es">` copy), so the one for `lang` is read.
 */
function pickLang(html, lang) {
  if (!html.includes("data-bi2")) return html;
  const open = `<div lang="${lang}">`, i = html.indexOf(open);
  if (i < 0) return html;
  const rest = html.slice(i + open.length), j = rest.indexOf('</div><div lang="');
  return j >= 0 ? rest.slice(0, j) : rest.replace(/<\/div><\/div>\s*$/, "");
}
const plain = h => h.replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&rarr;/g, "->").replace(/\s+/g, " ").trim();
export function logLines(entries, lang, max = 25) {
  const out = [];
  for (const e of entries.slice(-max * 3)) {
    // cards written with a span per language (the handout line) keep only this language's spans
    const html = pickLang(String(e.html ?? ""), lang).replace(/<span lang="(\w\w)">[\s\S]*?<\/span>/g, (m, l) => (l === lang ? m : ""));
    const head = /<div class="pm-card-head">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    const band = /<span class="pm-band[^"]*">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "";
    const note = band ? "" : (/<div class="pm-notes">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "");        // a card with no result: say what it was about
    const line = [head, band || plain(note).slice(0, 80)].map(plain).filter(Boolean).join(": ");
    if (line && !/^(room open|sala abierta)/i.test(line)) out.push(line);
  }
  return out.slice(-max);
}
/** The text a recap starts from. `tr(key)` translates the headings. */
export function recapText(tr, { lines = [], scenes = [], handouts = [] } = {}) {
  const part = (title, items) => `${title}\n${items.length ? items.map(i => `- ${i}`).join("\n") : "- "}`;
  return [
    part(tr("What happened"), lines.length ? lines : []),
    part(tr("Scenes"), scenes), part(tr("Shown to the table"), handouts),
    part(tr("What the crew now knows"), []), part(tr("Open threads"), []), part(tr("Next time"), [])
  ].join("\n\n");
}
