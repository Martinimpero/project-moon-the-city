/**
 * Pictures for characters, Threats and crews. An actor's `portrait` is either the path of a picture that ships with the app ("tokens/NPC_Marl_Vessey.png",
 * the same on every device, so nothing is sent) or a small picture the player chose, kept as a data URL. Chosen pictures are shrunk to a few tens of
 * kilobytes so that saving, exporting and the room stay light. In a room a chosen picture is not repeated inside every sheet: the sheet carries a short
 * `portraitId`, and the picture itself travels once, as its own message. Plain functions here (the canvas part is in `fileToPortrait`).
 */
export const MAX_DATA = 90_000;                                             // longest data URL kept (characters)
export const BUNDLED_RE = /^tokens\/[A-Za-z0-9_-]{1,60}\.png$/;
export const DATA_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const isBundled = p => typeof p === "string" && BUNDLED_RE.test(p);
export const isData = p => typeof p === "string" && p.length <= MAX_DATA && DATA_RE.test(p);
/** A portrait value that is safe to keep: a bundled path or a small image data URL; anything else becomes "". */
export const clean = p => (isBundled(p) || isData(p) ? p : "");
export const cleanId = id => (typeof id === "string" && /^[a-z0-9]{1,24}$/.test(id) ? id : "");

/** A short id for a picture (FNV-1a over the text, plus its length): the same picture always has the same id. */
export function idOf(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) { h ^= data.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "i" + h.toString(36) + data.length.toString(36);
}
/** The width and height to draw a w x h picture at so that its longest side is at most `max` (never enlarged). */
export function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/** Sizes and qualities to try, from the best to the smallest, until the picture fits in MAX_DATA. */
export const STEPS = [[320, 0.85], [320, 0.72], [256, 0.72], [256, 0.58], [192, 0.58], [160, 0.5]];

/** The sheet as it travels: a chosen picture is replaced by its id (bundled art keeps its path). */
export function forSync(actor) {
  const { portrait, ...rest } = actor;
  const out = { ...rest };
  if (isBundled(portrait)) out.portrait = portrait;
  else if (isData(portrait)) out.portraitId = idOf(portrait);
  return out;
}
/** What to show for an actor: its own picture, or the one a room sent for its id (`cache` is a Map), or "". */
export function srcOf(actor, cache) {
  if (!actor) return "";
  if (actor.portrait && clean(actor.portrait)) return actor.portrait;
  return (actor.portraitId && cache?.get(actor.portraitId)) || "";
}

/** Cache of pictures received from a room, limited in size (the oldest go first). */
export function remember(cache, id, src, max = 100) {
  if (!cleanId(id) || !isData(src) || idOf(src) !== id) return false;       // the id must be the picture's own: a sheet cannot be given a different picture
  cache.delete(id); cache.set(id, src);
  while (cache.size > max) cache.delete(cache.keys().next().value);
  return true;
}

/** In the browser: read an image file and shrink it to a data URL that fits. Rejects if it is not an image or cannot be made small enough. */
export async function fileToPortrait(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("That is not a picture.");
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    bmp = await new Promise((ok, no) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => no(new Error("That picture could not be read.")); img.src = u; });
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  for (const [max, q] of STEPS) {
    const s = fitSize(w, h, max), canvas = document.createElement("canvas");
    canvas.width = s.w; canvas.height = s.h;
    const c = canvas.getContext("2d"); c.fillStyle = "#1b1d26"; c.fillRect(0, 0, s.w, s.h); c.drawImage(bmp, 0, 0, s.w, s.h);
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_DATA) return url;
  }
  throw new Error("That picture is too detailed to keep small. Try another.");
}
