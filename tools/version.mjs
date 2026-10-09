/**
 * Versions the app's files so a browser never mixes an old file with a new one.
 *
 * GitHub Pages lets a browser keep a file for ten minutes, so right after an update one page could load some new modules and some old ones.
 * This script gives every module, the stylesheet and the entry script a version taken from the file's own content (`?v=3fa9c1...`), written into
 * index.html: an import map rewrites every `import "./x.mjs"` to `./x.mjs?v=...`. A file that did not change keeps its address, so it stays in the cache;
 * a file that changed gets a new address, so it is fetched. index.html lists them all together, so one page always gets one consistent set.
 *
 *   node tools/version.mjs          rewrite index.html
 *   node tools/version.mjs --check  only say whether it is up to date (exit code 1 if not)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const START = "<!-- version:start (made by tools/version.mjs: do not edit) -->", END = "<!-- version:end -->";

/** A short fingerprint of a file's content (line endings ignored, so Windows and Linux agree). */
export const fingerprint = file => crypto.createHash("sha1").update(fs.readFileSync(file, "utf8").split("\r").join("")).digest("hex").slice(0, 10);

/** { "./js/ui.mjs": "./js/ui.mjs?v=..." } for every module in js/. */
export function moduleVersions(root = ROOT) {
  const out = {};
  for (const f of fs.readdirSync(path.join(root, "js")).filter(n => n.endsWith(".mjs")).sort()) out[`./js/${f}`] = `./js/${f}?v=${fingerprint(path.join(root, "js", f))}`;
  return out;
}
export const importMapBlock = (versions, nl = "\n") => `${START}${nl}<script type="importmap">${nl}${JSON.stringify({ imports: versions }, null, 1).split("\n").join(nl)}${nl}</script>${nl}${END}`;

/** index.html as it should be: the import map block, and versioned stylesheet and entry script. Returns the new text. */
export function versioned(html, root = ROOT) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const block = importMapBlock(moduleVersions(root), nl);
  let out;
  if (html.includes(START)) out = html.slice(0, html.indexOf(START)) + block + html.slice(html.indexOf(END) + END.length);
  else out = html.replace(/(<script type="module" src="js\/main\.mjs[^"]*"><\/script>)/, `${block}${nl}$1`);       // first time: before the entry script
  out = out.replace(/href="css\/style\.css[^"]*"/, `href="css/style.css?v=${fingerprint(path.join(root, "css/style.css"))}"`);
  out = out.replace(/src="js\/main\.mjs[^"]*"/, `src="js/main.mjs?v=${fingerprint(path.join(root, "js/main.mjs"))}"`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, "index.html"), html = fs.readFileSync(file, "utf8"), next = versioned(html);
  if (process.argv.includes("--check")) { console.log(next === html ? "index.html is up to date" : "index.html is out of date: run  node tools/version.mjs"); process.exit(next === html ? 0 : 1); }
  if (next !== html) { fs.writeFileSync(file, next); console.log("index.html updated:", Object.keys(moduleVersions()).length, "modules versioned"); } else console.log("index.html already up to date");
}
