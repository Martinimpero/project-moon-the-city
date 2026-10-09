/**
 * The shape of the City map: where each lettered District sits (a spiral out from A, District 1, to Y, District 25; Z is on no map). Each District's area is
 * worked out as the part of the City outline nearer to its centre than to any other's (a Voronoi cell), so the schematic keeps the real map's rings without
 * copying its art. Pure geometry; cityui.mjs draws it. Coordinates are in a 1200 x 930 picture.
 */
export const VIEW = { w: 1200, h: 930 };
/** Where each District's label sits. */
export const CENTRES = {
  A: [557, 497], B: [522, 425], C: [643, 425], D: [637, 553], E: [487, 598], F: [412, 455], G: [490, 325], H: [685, 328], I: [772, 480],
  J: [704, 655], K: [521, 708], L: [373, 633], M: [293, 458], N: [331, 273], O: [486, 210], P: [630, 208], Q: [835, 293], R: [913, 553],
  S: [843, 745], T: [657, 795], U: [451, 813], V: [257, 665], W: [153, 448], X: [182, 252], Y: [397, 115]
};
/** The edge of the City, clockwise. */
export const OUTLINE = [[470, 50], [560, 62], [720, 160], [910, 235], [1010, 455], [985, 690], [820, 822], [580, 882], [370, 882], [250, 790], [160, 600], [70, 440], [90, 255], [240, 120]];

/** Keep the part of polygon `poly` on the side of the line a*x + b*y <= c (Sutherland-Hodgman against one half-plane). */
export function clipHalf(poly, a, b, c) {
  const out = [], inside = p => a * p[0] + b * p[1] <= c + 1e-9;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], pin = inside(p), qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) { const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c, t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}
/** The area of the outline nearer to `site` than to any of `others`: a polygon (list of [x, y]). */
export function cell(site, others, outline = OUTLINE) {
  let poly = outline;
  for (const o of others) {
    if (o === site) continue;
    const a = o[0] - site[0], b = o[1] - site[1], c = (o[0] * o[0] + o[1] * o[1] - site[0] * site[0] - site[1] * site[1]) / 2;   // points nearer to `site`: a*x + b*y <= c
    poly = clipHalf(poly, a, b, c);
    if (poly.length < 3) return [];
  }
  return poly;
}
export const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export const centroid = poly => { const n = poly.length; return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]; };

let cached = null;
/** { letter: { poly, d, at } } for A to Y: the polygon, its SVG path, and the label position. */
export function plan() {
  if (cached) return cached;
  const letters = Object.keys(CENTRES), sites = letters.map(l => CENTRES[l]);
  cached = {};
  for (const l of letters) {
    const poly = cell(CENTRES[l], sites);
    cached[l] = { poly, d: poly.length ? "M" + poly.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z" : "", at: CENTRES[l] };
  }
  return cached;
}
