/**
 * Keeping your data safe. Everything is saved in one browser, which can lose it (cleared site data, a different device, a full disk),
 * so the app offers: files you can export (everything, or one character), snapshots it keeps by itself, an optional file it writes
 * to on every change, and a reminder when you have not exported in a while. This file is the plain logic; the browser parts are in ui.mjs.
 */
import { uid, normalizeActor } from "./model.mjs";

export const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER = 3 * DAY;

/** The name of the file "Finish session" writes: project-moon-session-2026-10-10-2105.json (local date and time, so files sort in order). */
export function sessionFileName(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `project-moon-session-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** A file holding one character (with their gear, Bonds and Traumas), small enough to send to a friend. */
export function characterFile(actor) {
  const { derived, remote, ...a } = actor;
  return { kind: "project-moon-character", version: 1, savedAt: new Date().toISOString(), actor: { ...a, items: a.items.map(({ derived: _d, ...i }) => i) } };
}

/**
 * Work out what a file is: a full save ({ kind: "all", data }) or one character ({ kind: "character", actor }).
 * Throws an Error with a plain message for anything else, and for files that are too big or damaged to trust.
 */
export function parseImport(text) {
  if (typeof text !== "string" || text.length > 40 * 1024 * 1024) throw new Error("That file is too large.");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file is not valid."); }
  if (data && data.kind === "project-moon-character" && data.actor && data.actor.type === "character") return { kind: "character", actor: data.actor };
  if (data && Array.isArray(data.actors)) return { kind: "all", data };
  throw new Error("Not a Project Moon file.");
}

/** A character from a file as a new character here: fresh ids (so it never overwrites anyone), a unique name, and it is checked and tidied. */
export function newCharacterFrom(raw, existingNames = []) {
  const a = normalizeActor({ ...raw, id: uid(), type: "character", items: (raw.items ?? []).map(i => ({ ...i, id: uid() })) });
  const taken = new Set(existingNames.map(n => n.toLowerCase()));
  const base = a.name;
  let n = 2;
  while (taken.has(a.name.toLowerCase())) a.name = `${base} (${n++})`;
  return a;
}

/** Keep the most recent `max` snapshots, and add a new one only if the last is at least `minGapMs` old (or `force`). */
export function pushSnapshot(list, entry, { max = 10, minGapMs = 10 * 60 * 1000, force = false } = {}) {
  const last = list.at(-1);
  if (!force && last && entry.at - last.at < minGapMs) return { list, added: false };
  const next = [...list, entry].slice(-max);
  return { list: next, added: true };
}

/**
 * Has it been a while since you backed up changes? `meta` = { changedAt, firstChangeAt, exportedAt } in ms (any may be 0).
 * True when there is something unbacked-up that is older than `REMIND_AFTER`.
 */
export function backupDue(meta, now = Date.now(), after = REMIND_AFTER) {
  if (!meta.changedAt) return false;
  if (meta.exportedAt && meta.exportedAt >= meta.changedAt) return false;           // everything is in the last export
  const since = meta.exportedAt || meta.firstChangeAt || meta.changedAt;            // the oldest thing not yet exported
  return now - since > after;
}

/** "3 days ago", for the backup screen. `tr(key, data)` translates. */
export function ageText(ms, now, tr) {
  if (!ms) return tr("never");
  const d = Math.max(0, now - ms), min = Math.floor(d / 60000), h = Math.floor(d / 3600000), days = Math.floor(d / DAY);
  if (min < 1) return tr("just now");
  if (min < 60) return tr("{n} minutes ago", { n: min });
  if (h < 48) return tr("{n} hours ago", { n: h });
  return tr("{n} days ago", { n: days });
}

/** A short size like "1.4 MB". */
export function sizeText(bytes) {
  if (!Number.isFinite(bytes)) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
