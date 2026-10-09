/**
 * Scenes: the GM keeps several maps ready (each with its own tokens, grid and fog) and shows one to the table.
 * `shown` is the scene the players see; `viewed` is the one the GM is looking at or preparing, which can be a different one.
 * These are plain functions over the saved state ({ scenes, sceneId, viewId }), so Node can test them.
 */
import { uid } from "./model.mjs";

export const MAX_SCENES = 40;

export const newScene = (name = "Scene", map = null) => ({ id: uid(), name: String(name).slice(0, 40) || "Scene", map });
export const sceneById = (st, id) => st.scenes.find(s => s.id === id) ?? null;
export const shownScene = st => sceneById(st, st.sceneId) ?? st.scenes[0] ?? null;
export const viewedScene = st => sceneById(st, st.viewId) ?? shownScene(st);
export const shownMap = st => shownScene(st)?.map ?? null;
export const viewedMap = st => viewedScene(st)?.map ?? null;

/** Make sure there is at least one scene and that the two ids point at real ones. */
export function ensureScenes(st) {
  if (!Array.isArray(st.scenes)) st.scenes = [];
  st.scenes = st.scenes.filter(s => s && s.id && typeof s.name === "string");
  if (!st.scenes.length) st.scenes.push(newScene("Scene 1"));
  if (!sceneById(st, st.sceneId)) st.sceneId = st.scenes[0].id;
  if (!sceneById(st, st.viewId)) st.viewId = st.sceneId;
  return st;
}

/** Saved data (new or from before scenes existed) as scenes: an older save's single map becomes the first scene. */
export function scenesFrom(data) {
  const st = { scenes: [], sceneId: data.sceneId, viewId: data.viewId };
  if (Array.isArray(data.scenes) && data.scenes.length) st.scenes = data.scenes.filter(s => s && typeof s === "object" && s.id).slice(0, MAX_SCENES).map(s => ({ id: s.id || uid(), name: String(s.name ?? "Scene").slice(0, 40), map: s.map && Array.isArray(s.map.tokens) ? s.map : null }));
  else if (data.map && Array.isArray(data.map.tokens)) st.scenes = [{ id: uid(), name: String(data.map.name || "Scene 1").slice(0, 40), map: data.map }];
  return ensureScenes(st);
}

export function addScene(st, name) {
  if (st.scenes.length >= MAX_SCENES) return null;
  const sc = newScene(name || `Scene ${st.scenes.length + 1}`);
  st.scenes.push(sc); st.viewId = sc.id;
  return sc;
}
export function renameScene(st, id, name) { const s = sceneById(st, id); if (s && String(name).trim()) s.name = String(name).trim().slice(0, 40); return s; }
/** A copy with a new id, a new map revision and new token ids (so nothing in it is confused with the original). */
export function duplicateScene(st, id) {
  const src = sceneById(st, id);
  if (!src || st.scenes.length >= MAX_SCENES) return null;
  const map = src.map ? JSON.parse(JSON.stringify(src.map)) : null;
  if (map) { map.rev = uid(); map.tokens.forEach(t => { t.id = uid(); }); }
  const sc = { id: uid(), name: `${src.name} (copy)`.slice(0, 40), map };
  st.scenes.splice(st.scenes.indexOf(src) + 1, 0, sc); st.viewId = sc.id;
  return sc;
}
/** Remove a scene. The last one cannot go. If it was the one on show, the table is moved to the first remaining scene. */
export function removeScene(st, id) {
  if (st.scenes.length <= 1) return false;
  const i = st.scenes.findIndex(s => s.id === id);
  if (i < 0) return false;
  st.scenes.splice(i, 1);
  if (st.sceneId === id) st.sceneId = st.scenes[Math.min(i, st.scenes.length - 1)].id;
  if (st.viewId === id) st.viewId = st.sceneId;
  return true;
}
export function viewScene(st, id) { if (sceneById(st, id)) st.viewId = id; return viewedScene(st); }
/** Show a scene to the table (and look at it). Returns true if the table's scene changed. */
export function showScene(st, id) {
  if (!sceneById(st, id)) return false;
  const changed = st.sceneId !== id;
  st.sceneId = id; st.viewId = id;
  return changed;
}
/** Is the GM looking at something the table cannot see? */
export const preparing = st => st.viewId !== st.sceneId;
