import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versioned, moduleVersions, fingerprint, START, END } from "../tools/version.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("index.html carries the current version of every file (if this fails, run: node tools/version.mjs)", () => {
  assert.equal(versioned(html), html);
});

test("the import map lists every module, each with a version taken from its content", () => {
  const map = JSON.parse(html.slice(html.indexOf(START), html.indexOf(END)).replace(/^[^{]*/, "").replace(/<\/script>[\s\S]*$/, "")).imports;
  const files = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".mjs"));
  assert.deepEqual(Object.keys(map).sort(), files.map(f => `./js/${f}`).sort());
  for (const f of files) assert.equal(map[`./js/${f}`], `./js/${f}?v=${fingerprint(path.join(ROOT, "js", f))}`);
  assert.match(html, /href="css\/style\.css\?v=[0-9a-f]{10}"/); assert.match(html, /src="js\/main\.mjs\?v=[0-9a-f]{10}"/);
});

test("the import map comes before the first module script, and every import in the app names a file that exists", () => {
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  const have = new Set(Object.keys(moduleVersions(ROOT)));
  for (const f of fs.readdirSync(path.join(ROOT, "js")).filter(n => n.endsWith(".mjs"))) {
    const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.\/[\w.-]+\.mjs)["']/g)) assert.ok(have.has(`./js/${m[1].slice(2)}`), `${f} imports ${m[1]}`);
  }
});

test("a changed file gets a new version and an unchanged one keeps its own; line endings do not matter", () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tests", ".v-"));
  try {
    fs.mkdirSync(path.join(tmp, "js")); fs.mkdirSync(path.join(tmp, "css"));
    fs.writeFileSync(path.join(tmp, "js/a.mjs"), "export const a = 1;\n"); fs.writeFileSync(path.join(tmp, "js/b.mjs"), "export const b = 2;\n");
    fs.writeFileSync(path.join(tmp, "js/main.mjs"), "import './a.mjs';\n"); fs.writeFileSync(path.join(tmp, "css/style.css"), "body{}\n");
    const page = '<link rel="stylesheet" href="css/style.css">\n<script type="module" src="js/main.mjs"></script>\n';
    const one = versioned(page, tmp), v1 = moduleVersions(tmp);
    assert.match(one, /type="importmap"/); assert.ok(one.indexOf("importmap") < one.indexOf('type="module"'));
    assert.equal(versioned(one, tmp), one);                                         // running it again changes nothing
    fs.writeFileSync(path.join(tmp, "js/a.mjs"), "export const a = 99;\n");
    const v2 = moduleVersions(tmp);
    assert.notEqual(v2["./js/a.mjs"], v1["./js/a.mjs"]); assert.equal(v2["./js/b.mjs"], v1["./js/b.mjs"]);
    fs.writeFileSync(path.join(tmp, "js/b.mjs"), "export const b = 2;\r\n");        // same text with Windows line endings
    assert.equal(moduleVersions(tmp)["./js/b.mjs"], v1["./js/b.mjs"]);
    const crlf = versioned(page.split("\n").join("\r\n"), tmp);
    assert.ok(crlf.includes("\r\n") && !/[^\r]\n/.test(crlf), "keeps the page's line endings");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
