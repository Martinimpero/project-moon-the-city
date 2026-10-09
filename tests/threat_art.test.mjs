import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as P from "../js/portrait.mjs";
import * as T from "../js/threats.mjs";
import * as PR from "../js/printout.mjs";
import { THREATS } from "../js/threatdata.mjs";
import { newActor } from "../js/model.mjs";

const file = p => new URL(`../${p}`, import.meta.url);

test("every Threat in the library has a picture that exists and is allowed", () => {
  const all = T.allTemplates();
  assert.equal(all.filter(x => !x.mine).length, THREATS.length);
  for (const x of all) {
    assert.equal(x.portrait, `portraits/threat-${x.id}.svg`);
    assert.equal(P.clean(x.portrait), x.portrait, x.id);
    assert.ok(fs.existsSync(file(x.portrait)), `${x.id} has no file`);
  }
});

test("the pictures are small, safe SVG: no scripts, no outside links, no event handlers", () => {
  for (const t of THREATS) {
    const svg = fs.readFileSync(file(`portraits/threat-${t.id}.svg`), "utf8");
    assert.ok(svg.startsWith("<svg"), t.id); assert.ok(svg.length < 6000, `${t.id}: ${svg.length}`);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|<use\b|\son\w+=|javascript:|href=|@import|url\(["']?https?:/i, t.id);
    assert.match(svg, /viewBox="0 0 160 200"/);
  }
});

test("an unknown or unsafe path is still refused, and the new kind of path is accepted", () => {
  assert.equal(P.clean("portraits/threat-fence.svg"), "portraits/threat-fence.svg");
  for (const bad of ["portraits/../x.svg", "portraits/a.png", "portraits/A.svg", "portraits/x.svg?x=1", "other/x.svg", "portraits/" + "a".repeat(80) + ".svg", "tokens/a.svg"]) assert.equal(P.clean(bad), "", bad);
  assert.equal(P.clean("tokens/PC_Dax_Verrin.png"), "tokens/PC_Dax_Verrin.png");
});

test("a Threat made from a template starts with its picture, one sheet each", () => {
  const solo = T.build(T.byId("knife-duelist"), { count: 2, newActor });
  assert.deepEqual(solo.map(a => a.portrait), ["portraits/threat-knife-duelist.svg", "portraits/threat-knife-duelist.svg"]);
  const group = T.build(T.byId("syndicate-enforcer"), { count: 3, newActor });
  assert.equal(group[0].portrait, "portraits/threat-syndicate-enforcer.svg");
});

test("your own template keeps the sheet's picture (art always; an upload only if small), and a made-up path is dropped", () => {
  const a = newActor("npc", "Marl", { grade: 5 }); a.portrait = "tokens/NPC_Marl_Vessey.png";
  assert.equal(T.fromActor(a).portrait, "tokens/NPC_Marl_Vessey.png");
  const small = "data:image/jpeg;base64," + "A".repeat(2000), big = "data:image/jpeg;base64," + "A".repeat(T.MAX_TEMPLATE_PICTURE + 10);
  a.portrait = small; assert.equal(T.fromActor(a).portrait, small);
  a.portrait = big; assert.equal(T.fromActor(a).portrait, "");
  const clean = T.cleanCustom([{ id: "x", name: "N", grade: 5, portrait: "http://evil.example/x.png" }, { id: "y", name: "M", grade: 5, portrait: "portraits/threat-fence.svg" }]);
  assert.deepEqual(clean.map(c => c.portrait), ["", "portraits/threat-fence.svg"]);
  const mine = T.allTemplates(clean).find(x => x.id === "y"); assert.equal(mine.mine, true);
  const made = T.build(mine, { newActor })[0]; assert.equal(made.portrait, "portraits/threat-fence.svg");
});

test("a printed Threat sheet shows its picture", () => {
  const a = T.build(T.byId("fence"), { newActor })[0];
  assert.match(PR.threatPage(a, k => k), /<img src="portraits\/threat-fence\.svg"/);
  a.portrait = ""; assert.doesNotMatch(PR.threatPage(a, k => k), /<img/);
});
