/**
 * The character sheet as a floating window over the map: drag it by its title bar, resize it from the corner, double-click the title bar to
 * minimise it to a small bar (which can sit anywhere) and again to open it. Where it is, how big and whether it is minimised are remembered
 * on this device. The geometry is plain functions (so Node can test them); `createWindow` wires a real element.
 */
export const MIN_W = 340, MIN_H = 200, BAR_H = 44, KEEP = 60;       // KEEP: at least this much of the bar stays on screen

/** The default place for the window: just right of the character list, below the header, about as wide as a sheet needs. */
export function defaultRect(vw, vh, left = 250, top = 70) {
  const w = Math.max(MIN_W, Math.min(600, vw - left - 380 - 20)), h = Math.max(MIN_H, vh - top - 24);
  return { x: left, y: top, w, h, min: false };
}
/** A saved rectangle repaired: numbers, within sensible sizes, and never off screen (some of the title bar is always reachable). */
export function clampRect(r, vw, vh) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const w = Math.min(Math.max(num(r?.w, 560), MIN_W), Math.max(MIN_W, vw - 8)), h = Math.min(Math.max(num(r?.h, 520), MIN_H), Math.max(MIN_H, vh - 8));
  const x = Math.min(Math.max(num(r?.x, 250), KEEP - w), vw - KEEP), y = Math.min(Math.max(num(r?.y, 70), 0), vh - BAR_H);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), min: !!r?.min };
}
/** Moving: where the window goes when the pointer has moved by (dx, dy) from where it started. */
export const movedRect = (start, dx, dy, vw, vh) => clampRect({ ...start, x: start.x + dx, y: start.y + dy }, vw, vh);

const KEY = "project-moon-the-city/window";
export function loadRect(vw, vh, storage = globalThis.localStorage) {
  try { const raw = JSON.parse(storage.getItem(KEY) || "null"); if (raw && typeof raw === "object") return clampRect(raw, vw, vh); } catch { /* unreadable: use the default */ }
  return defaultRect(vw, vh);
}
export function saveRect(r, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(r)); } catch { /* private window */ } }

/**
 * Make `el` a window. `el` must contain `.win-bar` (the title bar, with its buttons inside) and `.win-body`. Returns { rect(), minimise(on), toggle(), reset(), apply() }.
 * `onChange` is called after the window moves, resizes or is minimised.
 */
export function createWindow(el, { onChange = () => {} } = {}) {
  const vp = () => ({ vw: globalThis.innerWidth, vh: globalThis.innerHeight });
  let rect = (({ vw, vh }) => loadRect(vw, vh))(vp());
  let userH = rect.h;                                           // the height to come back to after minimising
  const apply = () => {
    el.style.setProperty("--wx", rect.x + "px"); el.style.setProperty("--wy", rect.y + "px");
    el.style.setProperty("--ww", rect.w + "px"); el.style.setProperty("--wh", userH + "px");
    el.classList.toggle("min", rect.min);
    el.querySelector(".win-bar")?.setAttribute("aria-expanded", String(!rect.min));
  };
  const commit = () => { rect = clampRect({ ...rect, h: rect.min ? userH : rect.h }, vp().vw, vp().vh); saveRect({ ...rect, h: userH }); apply(); onChange(rect); };
  const toggle = () => {
    rect.min = !rect.min;
    if (!rect.min) { const { vw, vh } = vp(); rect.x = Math.max(0, Math.min(rect.x, vw - rect.w)); rect.y = Math.max(0, Math.min(rect.y, vh - Math.min(userH, vh - 8))); }   // opening: bring the whole window back on screen
    commit();
  };
  apply();

  let drag = null;
  el.addEventListener("pointerdown", e => {
    const bar = e.target.closest(".win-bar");
    if (!bar || e.target.closest("button, input, select, a") || e.button > 0) return;
    drag = { sx: e.clientX, sy: e.clientY, start: { ...rect } };
    bar.setPointerCapture?.(e.pointerId); el.classList.add("moving"); e.preventDefault();
  });
  el.addEventListener("pointermove", e => {
    if (!drag) return;
    const { vw, vh } = vp(), r = movedRect(drag.start, e.clientX - drag.sx, e.clientY - drag.sy, vw, vh);
    rect.x = r.x; rect.y = r.y; apply();
  });
  const end = () => { if (!drag) return; drag = null; el.classList.remove("moving"); commit(); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("dblclick", e => { if (e.target.closest(".win-bar") && !e.target.closest("button, input, select, a")) toggle(); });
  // the corner handle (CSS resize) changes the element's size: remember it
  if (globalThis.ResizeObserver) new ResizeObserver(() => {
    if (rect.min || !el.offsetWidth || el.classList.contains("moving")) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (Math.abs(w - rect.w) > 2 || Math.abs(h - userH) > 2) { rect.w = w; userH = h; commit(); }
  }).observe(el);
  globalThis.addEventListener?.("resize", () => { rect = clampRect(rect, vp().vw, vp().vh); apply(); });
  return {
    rect: () => ({ ...rect, h: userH }),
    minimise: on => { if (rect.min !== !!on) toggle(); },
    toggle,
    reset: () => { const { vw, vh } = vp(); rect = defaultRect(vw, vh); userH = rect.h; commit(); },
    apply
  };
}
