import test from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/backup.mjs";
import { newActor, newItem } from "../js/model.mjs";
import * as S from "../js/store.mjs";

const tr = (key, d) => (d ? key.replace(/\{(\w+)\}/g, (m, k) => d[k]) : key);

test("one character exports to a small file and comes back as a new character with fresh ids", () => {
  const dax = newActor("character", "Dax", { fear: "Heights", skills: { combat: 3 } }, [{ type: "gear", name: "Knife", system: { kind: "weapon", sin: "wrath" } }, { type: "bond", name: "Marl", system: { person: "Marl" } }]);
  const file = K.characterFile(dax);
  assert.equal(file.kind, "project-moon-character");
  assert.equal(file.actor.derived, undefined); assert.equal(file.actor.items[0].derived, undefined);
  const parsed = K.parseImport(JSON.stringify(file));
  assert.equal(parsed.kind, "character");
  const copy = K.newCharacterFrom(parsed.actor, ["Dax"]);
  assert.equal(copy.name, "Dax (2)");                                       // never replaces or shadows an existing one
  assert.notEqual(copy.id, dax.id); assert.notEqual(copy.items[0].id, dax.items[0].id);
  assert.equal(copy.system.skills.combat, 3); assert.equal(copy.items.length, 2);
  assert.ok(copy.derived && copy.items[0].derived);                          // derived numbers are rebuilt
  assert.equal(K.newCharacterFrom(parsed.actor, ["Dax", "dax (2)"]).name, "Dax (3)");
});

test("a damaged or foreign character file is repaired or refused, never trusted", () => {
  const messy = K.newCharacterFrom({ name: "X", system: { attributes: { body: 99 }, stress: "lots" }, items: [{ type: "gear", name: "G", system: { wear: 50 } }, { type: "weird" }] });
  assert.equal(messy.type, "character");
  assert.ok(Number.isFinite(messy.derived.egoCurrent));
  assert.throws(() => K.parseImport("not json"), /not valid/);
  assert.throws(() => K.parseImport("{}"), /Not a Project Moon file/);
  assert.throws(() => K.parseImport(JSON.stringify({ kind: "project-moon-character", actor: { type: "npc" } })), /Not a Project Moon file/);
  assert.throws(() => K.parseImport(null), /too large/);
});

test("a full save is recognised, including one from before files had a kind", () => {
  S.state.actors = [newActor("character", "Wren")];
  const text = JSON.stringify(S.exportData());
  const r = K.parseImport(text);
  assert.equal(r.kind, "all"); assert.equal(r.data.actors.length, 1);
});

test("snapshots: one at most every few minutes, the last ten kept, forced ones always", () => {
  let list = [];
  const at = n => ({ at: n * 60_000, label: "auto", json: "{}" });
  for (const n of [0, 3, 9, 11, 22]) ({ list } = K.pushSnapshot(list, at(n)));        // 3 and 9 are inside ten minutes of the one before
  assert.deepEqual(list.map(s => s.at / 60_000), [0, 11, 22]);
  ({ list } = K.pushSnapshot(list, at(23), { force: true }));
  assert.equal(list.length, 4);
  for (let i = 0; i < 20; i++) ({ list } = K.pushSnapshot(list, at(100 + i * 20)));
  assert.equal(list.length, 10); assert.equal(list.at(-1).at / 60_000, 100 + 19 * 20);
});

test("the reminder: nothing changed, just exported, or a recent start stay quiet; unexported changes older than three days nag", () => {
  const D = K.DAY, now = 100 * D;
  assert.equal(K.backupDue({ changedAt: 0, firstChangeAt: 0, exportedAt: 0 }, now), false);                       // nothing to lose
  assert.equal(K.backupDue({ changedAt: now - D, firstChangeAt: now - D, exportedAt: 0 }, now), false);           // started yesterday
  assert.equal(K.backupDue({ changedAt: now - D, firstChangeAt: now - 10 * D, exportedAt: 0 }, now), true);       // ten days of work, never exported
  assert.equal(K.backupDue({ changedAt: now - 5 * D, firstChangeAt: now - 50 * D, exportedAt: now - D }, now), false);   // exported after the last change
  assert.equal(K.backupDue({ changedAt: now - 1000, firstChangeAt: now - 50 * D, exportedAt: now - 4 * D }, now), true);  // changed since an old export
  assert.equal(K.backupDue({ changedAt: now - 1000, firstChangeAt: now - 50 * D, exportedAt: now - 2 * D }, now), false); // export is recent enough
});

test("ages and sizes read as plain words", () => {
  const now = 1_000_000_000;
  assert.equal(K.ageText(0, now, tr), "never");
  assert.equal(K.ageText(now - 20_000, now, tr), "just now");
  assert.equal(K.ageText(now - 5 * 60_000, now, tr), "5 minutes ago");
  assert.equal(K.ageText(now - 5 * 3600_000, now, tr), "5 hours ago");
  assert.equal(K.ageText(now - 4 * K.DAY, now, tr), "4 days ago");
  assert.deepEqual([K.sizeText(900), K.sizeText(2048), K.sizeText(3 * 1024 * 1024)], ["900 B", "2 KB", "3.0 MB"]);
  assert.equal(K.sizeText(NaN), "?");
});
