/**
 * The turn timer. The GM's tracker carries `timer: { secs, auto, running, left, stamp }`:
 * `left` is the seconds remaining when the timer was last started, paused or reset, and `stamp` changes every time that happens.
 * Each browser turns that into its own end time when it sees a new stamp, so clocks need not agree.
 */
export const DURATIONS = [0, 15, 30, 45, 60, 90, 120, 180];     // 0 = no timer

let n = 0;
const newStamp = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export const newTimer = () => ({ secs: 60, auto: true, running: false, left: 60, stamp: "0" });
/** Make any loaded or received value into a complete timer. */
export function timerOf(tracker) {
  const t = tracker.timer && typeof tracker.timer === "object" ? tracker.timer : (tracker.timer = newTimer());
  t.secs = DURATIONS.includes(Number(t.secs)) ? Number(t.secs) : 60;
  t.left = Math.max(0, Math.min(t.secs, Number(t.left) || 0));
  t.running = !!t.running && t.secs > 0; t.auto = t.auto !== false; t.stamp = String(t.stamp ?? "0");
  return t;
}

export function timerStart(t) {
  if (!t.secs) return;
  if (t.left <= 0) t.left = t.secs;
  t.running = true; t.stamp = newStamp();
}
export function timerPause(t, remainingNow) {
  t.left = Math.max(0, Math.min(t.secs, Math.ceil(remainingNow))); t.running = false; t.stamp = newStamp();
}
export function timerReset(t) { t.left = t.secs; t.running = false; t.stamp = newStamp(); }
/** A new turn begins: back to full time, and running if the GM chose automatic. */
export function timerNewTurn(t) { timerReset(t); if (t.auto) timerStart(t); }
export function timerSetSecs(t, secs) { t.secs = DURATIONS.includes(secs) ? secs : t.secs; timerReset(t); }

export function fmt(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class TimerClock {
  constructor(now = () => Date.now()) { this.now = now; this.stamp = ""; this.endAt = 0; }
  /** Call whenever the timer may have changed (a board arrived, or the GM pressed something). */
  sync(t) {
    if (t.stamp !== this.stamp) { this.stamp = t.stamp; this.endAt = this.now() + t.left * 1000; }
  }
  remaining(t) { return t.running ? Math.max(0, (this.endAt - this.now()) / 1000) : t.left; }
}
