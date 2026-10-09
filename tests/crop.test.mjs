import test from "node:test";
import assert from "node:assert/strict";
import * as P from "../js/portrait.mjs";

const F = P.frameFor(P.RATIOS.tall), S = P.frameFor(P.RATIOS.square);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("the frame is centred in the view, tall (4:5) or square", () => {
  assert.equal(F.h, P.VIEW - 40); near(F.w / F.h, 0.8, 0.01);
  assert.deepEqual([S.w, S.h], [P.VIEW - 40, P.VIEW - 40]);
  for (const f of [F, S]) { near(f.x * 2 + f.w, P.VIEW, 1); near(f.y * 2 + f.h, P.VIEW, 1); }
});

test("the picture starts filling the frame, and can never leave a gap inside it", () => {
  for (const [iw, ih] of [[1000, 1000], [4000, 1500], [600, 2400], [320, 400]]) {
    const c = P.initialCrop(iw, ih, F), s = P.minScale(iw, ih, F);
    assert.equal(c.z, 1);
    assert.ok(c.ix <= F.x + 1e-9 && c.iy <= F.y + 1e-9 && c.ix + iw * s >= F.x + F.w - 1e-9 && c.iy + ih * s >= F.y + F.h - 1e-9, `${iw}x${ih} covers`);
    const far = P.clampPan({ ix: 5000, iy: -5000 }, iw, ih, s, F);                              // dragged far away: held back at the edge
    assert.ok(far.ix <= F.x && far.iy + ih * s >= F.y + F.h - 1e-9);
  }
});

test("it starts a little below the top of a tall picture, where faces are", () => {
  const c = P.initialCrop(1000, 3000, F), s = P.minScale(1000, 3000, F);
  const overflow = 3000 * s - F.h;
  near(F.y - c.iy, overflow * 0.2, 1e-6);
});

test("what is kept is exactly what is inside the frame", () => {
  const iw = 800, ih = 1200, c = P.initialCrop(iw, ih, F), r = P.sourceRect(c, iw, ih, F);
  near(r.sw / r.sh, F.w / F.h, 1e-9);                                                           // the same shape as the frame
  assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.sw <= iw + 1e-9 && r.sy + r.sh <= ih + 1e-9, "inside the picture");
  const z = P.zoomAbout(c, iw, ih, F, 2), r2 = P.sourceRect(z, iw, ih, F);
  near(r2.sw, r.sw / 2, 1e-6); near(r2.sh, r.sh / 2, 1e-6);                                     // twice the zoom keeps half as much
});

test("zooming keeps the point you zoom on where it is, within the limits", () => {
  const iw = 1000, ih = 1000, c = P.initialCrop(iw, ih, S), about = { x: S.x + 60, y: S.y + 80 };
  const z = P.zoomAbout(c, iw, ih, S, 3, about);
  const s0 = P.minScale(iw, ih, S) * c.z, s1 = P.minScale(iw, ih, S) * 3;
  if (z.ix > S.x - 1e-9 === false) near((about.x - z.ix) / s1, (about.x - c.ix) / s0, 1e-6);   // the same picture point under the cursor (unless held at an edge)
  assert.equal(P.zoomAbout(c, iw, ih, S, 99).z, P.MAX_ZOOM); assert.equal(P.zoomAbout(c, iw, ih, S, 0.1).z, 1);
  const back = P.zoomAbout(z, iw, ih, S, 1);
  const s = P.minScale(iw, ih, S);
  assert.ok(back.ix <= S.x + 1e-9 && back.ix + iw * s >= S.x + S.w - 1e-9);                      // zooming out never uncovers the frame
});

test("a found face is centred and about half the frame wide", () => {
  const iw = 2000, ih = 3000, box = { x: 700, y: 500, width: 400, height: 460 };
  const c = P.faceCrop(box, iw, ih, F), r = P.sourceRect(c, iw, ih, F);
  assert.ok(box.x >= r.sx && box.x + box.width <= r.sx + r.sw && box.y >= r.sy && box.y + box.height <= r.sy + r.sh, "the face is inside the kept part");
  assert.ok(box.width / r.sw > 0.35 && box.width / r.sw < 0.65, "about half the width");
  const corner = P.faceCrop({ x: 0, y: 0, width: 50, height: 50 }, iw, ih, F), rc = P.sourceRect(corner, iw, ih, F);
  assert.ok(rc.sx >= -1e-9 && rc.sy >= -1e-9, "a face at the edge still keeps the crop inside the picture");
  const tiny = P.faceCrop({ x: 10, y: 10, width: 1, height: 1 }, iw, ih, F); assert.equal(tiny.z, P.MAX_ZOOM);
});
