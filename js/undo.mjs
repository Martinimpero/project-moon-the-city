/**
 * Undo: a short stack of snapshots of the saved state, taken just before an action that changes something. Undoing puts the state back
 * but keeps the log as it is (a roll everyone saw stays in the log; the table is told it was undone). Plain functions, so Node can test them.
 */
export const MAX_STEPS = 15, MAX_CHARS = 20_000_000;

/** The state without its log: what "nothing changed" is judged on. */
export function core(json) {
  try { const d = JSON.parse(json); delete d.log; return JSON.stringify(d); } catch { return json; }
}
export const newStack = () => [];

/** Remember `json` (the state right now) before the action `label`. Drops the oldest when there are too many or too much. */
export function push(stack, label, json) {
  if (typeof json !== "string") return stack;
  stack.push({ label, json });
  while (stack.length > MAX_STEPS) stack.shift();
  let size = stack.reduce((n, e) => n + e.json.length, 0);
  while (stack.length > 1 && size > MAX_CHARS) size -= stack.shift().json.length;
  return stack;
}
/**
 * Take the last snapshot that differs from `currentJson` (ones where nothing happened, such as a cancelled dialog, are dropped on the way).
 * Returns { label, json } with the log of `currentJson` carried over, or null if there is nothing to undo.
 */
export function pop(stack, currentJson) {
  const now = core(currentJson);
  while (stack.length) {
    const e = stack.pop();
    if (core(e.json) === now) continue;
    let data, cur;
    try { data = JSON.parse(e.json); cur = JSON.parse(currentJson); } catch { continue; }
    data.log = cur.log; data.lang = cur.lang; data.sound = cur.sound; data.name = cur.name; data.seenWarning = cur.seenWarning;
    if ((data.actors ?? []).some(a => a.id === cur.selected)) data.selected = cur.selected;
    return { label: e.label, json: JSON.stringify(data) };
  }
  return null;
}
/** The label of what the next undo would undo (the last real change), or "". */
export function peek(stack, currentJson) {
  const now = core(currentJson);
  for (let i = stack.length - 1; i >= 0; i--) if (core(stack[i].json) !== now) return stack[i].label;
  return "";
}
