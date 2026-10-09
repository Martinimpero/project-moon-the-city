// Lists English strings passed to t("...") in the app code that have no Spanish entry. Run: node tests/missing_keys.mjs
import fs from "node:fs";
import { ES } from "../js/es.mjs";
const UI = { ...(await import("../js/ui_es.mjs")).UI_ES, ...(await import("../js/room_es.mjs")).ROOM_ES, ...(await import("../js/board_es.mjs")).BOARD_ES, ...(await import("../js/handout_es.mjs")).HANDOUT_ES, ...(await import("../js/safety_es.mjs")).SAFETY_ES, ...(await import("../js/creation_es.mjs")).CREATION_ES, ...(await import("../js/journal_es.mjs")).JOURNAL_ES, ...(await import("../js/threat_es.mjs")).THREAT_ES };
const files = ["ui.mjs", "engine.mjs", "store.mjs", "voice.mjs", "config.mjs", "boardui.mjs", "handoutui.mjs", "conditions.mjs", "wizard.mjs", "journalui.mjs", "threatui.mjs", "threats.mjs", "tablesui.mjs"].map(f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8"));
const found = new Set();
const re = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
for (const src of files) for (const m of src.matchAll(re)) {
  let s = m[1].slice(1, -1);
  if (m[1][0] === "`" && s.includes("${")) continue;
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, "\n");
  found.add(s);
}
const missing = [...found].filter(k => !(k in ES) && !(k in UI));
console.log(JSON.stringify(missing, null, 1));
console.log(missing.length, "missing of", found.size);
