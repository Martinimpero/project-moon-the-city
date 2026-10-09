import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "../js/city.mjs";

test("there are 26 Wings, A to Z, each the District with its letter's number", () => {
  assert.equal(Y.WINGS.length, 26);
  assert.equal(Y.WINGS.map(w => w.letter).join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  for (const w of Y.WINGS) { assert.equal(w.n, w.letter.charCodeAt(0) - 64); assert.ok(w.en && w.es && w.name, w.letter); assert.ok(Y.REGIONS.includes(w.region), w.letter); }
  assert.equal(Y.byLetter("l").n, 12); assert.equal(Y.byLetter("L").status, "fallen"); assert.equal(Y.byLetter("z").status, "unknown"); assert.equal(Y.byLetter("1"), null);
});

test("every Wing is in exactly one region, and the centre is A, B and C", () => {
  const seen = Y.REGIONS.flatMap(r => Y.inRegion(r).map(w => w.letter));
  assert.equal(seen.length, 26); assert.equal(new Set(seen).size, 26);
  assert.deepEqual(Y.inRegion("center").map(w => w.letter), ["A", "B", "C"]);
});

test("search matches a letter, a name or the note, in either language, and needs every word", () => {
  assert.deepEqual(Y.find("lobotomy").map(w => w.letter), ["L"]);
  assert.ok(Y.find("claw").some(w => w.letter === "C")); assert.ok(Y.find("garra", "es").some(w => w.letter === "C"));
  assert.deepEqual(Y.find("gambling nest").map(w => w.letter), ["J"]); assert.equal(Y.find("").length, 26); assert.equal(Y.find("zzzz").length, 0);
});

test("a Wing links to the manual: the Head, Eye and Claw to their section, the rest to Wings", () => {
  assert.equal(Y.manualRef(Y.byLetter("A")), "p7#7"); assert.equal(Y.manualRef(Y.byLetter("H")), "p7#2");
});

import * as P from "../js/cityplan.mjs";

const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

test("the traced outlines: 25 Districts, each holds its own label and no other's, and together they fill most of the City", () => {
  const plan = P.plan(), letters = Object.keys(plan);
  assert.equal(letters.join(""), "ABCDEFGHIJKLMNOPQRSTUVWXY");
  let total = 0;
  for (const l of letters) {
    assert.ok(plan[l].poly.length >= 4 && plan[l].d.startsWith("M") && plan[l].d.endsWith("Z"), l);
    assert.ok(inside(P.CENTRES[l], plan[l].poly), `${l} holds its label`);
    for (const o of letters) if (o !== l) assert.ok(!inside(P.CENTRES[o], plan[l].poly), `${l} must not hold ${o}`);
    total += P.area(plan[l].poly);
  }
  const city = P.area(P.OUTLINE); assert.ok(total > city * 0.85 && total < city * 1.1, `traced area ${Math.round(total)} vs City ${Math.round(city)}`);
});

test("the nearest-centre fallback cells add up to the whole City outline", () => {
  const sites = Object.values(P.CENTRES); let total = 0;
  for (const s of sites) total += P.area(P.cell(s, sites));
  assert.ok(Math.abs(total - P.area(P.OUTLINE)) / P.area(P.OUTLINE) < 0.001);
});

test("A is in the middle: the nearest Districts to it are B, C, D and E", () => {
  const d = l => Math.hypot(P.CENTRES[l][0] - P.CENTRES.A[0], P.CENTRES[l][1] - P.CENTRES.A[1]);
  const nearest = Object.keys(P.CENTRES).filter(l => l !== "A").sort((a, b) => d(a) - d(b)).slice(0, 4).sort().join("");
  assert.equal(nearest, "BCDE");
});
