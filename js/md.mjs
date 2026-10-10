/**
 * A small Markdown reader for the manual: headings, paragraphs, bullet and numbered lists, quotes, tables, rules, **bold**, *italic*, `code`.
 * Everything is escaped first, so the text can never add HTML of its own. "Part IV §2" turns into a link to that section.
 * `render(md)` -> { html, sections } where each "## " heading is numbered in order (data-sec) so the reader can jump to it.
 */
import { refFromCitation } from "./manualrefs.mjs";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline formatting of one line of (unescaped) text. */
export function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/\b(Part|Parte) (X|IX|VIII|VII|VI|IV|V|III|II|I)\b(?: §(\d{1,2}))?/g, (all, w, r, n) => {
    const ref = refFromCitation(w, r, n);
    return ref ? `<button type="button" class="man-link" data-action="manual" data-ref="${ref}">${all}</button>` : all;
  });
  return s;
}

const cells = line => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
const isRule = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");

export function render(md) {
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [], sections = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4}) (.+)$/.exec(line))) {
      const n = m[1].length;
      if (n === 2) { sections.push(m[2].trim()); out.push(`<h3 class="man-sec" id="sec-${sections.length}" data-sec="${sections.length}">${inline(m[2])}</h3>`); }
      else out.push(`<h${n === 1 ? 2 : n + 1}>${inline(m[2])}</h${n === 1 ? 2 : n + 1}>`);
      i++; continue;
    }
    if (/^\s*---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<div class="man-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(line)) {
      const q = []; while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      const paras = q.join("\n").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      out.push(`<blockquote>${paras.map(p => `<p>${p.split("\n").map(inline).join("<br>")}</p>`).join("")}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line), items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.) /, ""); i++;
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.) /.test(lines[i])) { item += " " + lines[i].trim(); i++; }
        items.push(item);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map(x => /^\[ \] /.test(x) ? `<li class="chk">☐ ${inline(x.slice(4))}</li>` : `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4} |>|\s*---+\s*$|\s*\|)/.test(lines[i]) && !/^\s*([-*]|\d+\.) /.test(lines[i])) { para.push(lines[i].trim()); i++; }
    if (!para.length) { out.push(`<p>${inline(line)}</p>`); i++; continue; }
    out.push(`<p>${para.map(inline).join(" ")}</p>`);
  }
  return { html: out.join("\n"), sections };
}

/** Plain text of a Markdown string, for searching. */
export const plain = md => String(md ?? "").replace(/[*`>|#_]/g, " ").replace(/\s+/g, " ").trim();

/** Every section of a part as { sec, title, text }, with section 0 for the text before the first "## ". */
export function splitSections(md) {
  const parts = String(md ?? "").replace(/\r\n/g, "\n").split(/^(?=## )/m), out = [];
  parts.forEach((chunk, idx) => {
    const m = /^## (.+)$/m.exec(chunk), first = idx === 0 && !/^## /.test(chunk);
    out.push({ sec: first ? 0 : (out.filter(x => x.sec > 0).length + 1), title: first ? "" : m[1].trim(), text: plain(first ? chunk : chunk.replace(/^## .+$/m, "")) });
  });
  return out.filter(x => x.text);
}

/** Search the loaded parts: docs is [{ part, partTitle, md }]. Returns hits ranked by how many words match, each with a short snippet. */
export function search(docs, query, limit = 30) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return [];
  const hits = [];
  for (const d of docs) for (const s of splitSections(d.md)) {
    const hay = (s.title + " " + s.text).toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    const score = words.reduce((n, w) => n + (s.title.toLowerCase().includes(w) ? 5 : 0) + Math.min(5, hay.split(w).length - 1), 0);
    const k = s.text.toLowerCase().indexOf(words[0]), from = k > 60 ? k - 60 : 0;
    hits.push({ part: d.part, partTitle: d.partTitle, sec: s.sec, title: s.title, score, snippet: (from ? "…" : "") + s.text.slice(from, from + 160).trim() });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
