/**
 * Copies the manual's Markdown files into webapp/manual/ so the app can show them, and writes manual/index.json (parts, sections, a content hash).
 * Run it after the manual changes:   node tools/make_manual.mjs         (add --check to only report whether manual/ is up to date)
 * English comes from the project folder, Spanish from spanish_source/. A part's sections are matched by order, so both languages must have the same number of "## " sections.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PARTS } from "../js/manualrefs.mjs";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const check = process.argv.includes("--check");

const read = p => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const titleOf = md => (md.match(/^# (.+)$/m)?.[1] ?? "").trim();
const sectionsOf = md => [...md.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());

const index = { parts: [] }, files = new Map();
for (const p of PARTS) {
  const en = read(path.join(root, p.en)), es = read(path.join(root, "spanish_source", p.es));
  const se = sectionsOf(en), ss = sectionsOf(es);
  if (se.length !== ss.length) throw new Error(`${p.id}: ${se.length} English sections but ${ss.length} Spanish ones`);
  files.set(`manual/en/${p.id}.md`, en); files.set(`manual/es/${p.id}.md`, es);
  index.parts.push({ id: p.id, en: { title: titleOf(en), sections: se }, es: { title: titleOf(es), sections: ss } });
}
const hash = crypto.createHash("sha1"); for (const [k, v] of files) hash.update(k + "\n" + v);
index.version = hash.digest("hex").slice(0, 10);
files.set("manual/index.json", JSON.stringify(index, null, 1) + "\n");

let stale = 0;
for (const [rel, text] of files) {
  const full = path.join(web, rel);
  const same = fs.existsSync(full) && fs.readFileSync(full, "utf8") === text;
  if (same) continue;
  stale++;
  if (!check) { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, text); }
}
console.log(check ? (stale ? `${stale} manual file(s) out of date: run node tools/make_manual.mjs` : "manual/ is up to date") : `manual/: ${files.size} files (${stale} written)`);
if (check && stale) process.exit(1);
