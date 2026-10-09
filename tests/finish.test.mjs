import test from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/backup.mjs";

test("the session file is named by local date and time, so the files sort in order", () => {
  assert.equal(K.sessionFileName(new Date(2026, 9, 10, 21, 5)), "project-moon-session-2026-10-10-2105.json");
  assert.equal(K.sessionFileName(new Date(2027, 0, 3, 7, 9)), "project-moon-session-2027-01-03-0709.json");
  const a = K.sessionFileName(new Date(2026, 9, 10, 21, 5)), b = K.sessionFileName(new Date(2026, 9, 11, 9, 0));
  assert.ok(a < b);                                                    // plain text order is time order
  assert.match(K.sessionFileName(), /^project-moon-session-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
});

test("the file it writes is a normal save: a full export can be imported again", async () => {
  const S = await import("../js/store.mjs");
  S.state.actors = []; S.state.journal = []; S.state.notes = [];
  const text = JSON.stringify(S.exportData(), null, 1);
  assert.equal(K.parseImport(text).kind, "all");
});
