import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/timer.mjs";
import { newTracker } from "../js/board.mjs";
import { soundForHtml, createSfx } from "../js/sfx.mjs";
import { newActor } from "../js/model.mjs";
import * as E from "../js/engine.mjs";
import * as S from "../js/store.mjs";

test("timer: start, pause keeps the time left, reset, new turn", () => {
  const t = T.newTimer();
  const clock = new T.TimerClock(() => now);
  let now = 1_000_000;
  T.timerStart(t); clock.sync(t);
  assert.equal(clock.remaining(t), 60);
  now += 15_000;
  assert.equal(Math.round(clock.remaining(t)), 45);
  T.timerPause(t, clock.remaining(t)); clock.sync(t);
  assert.equal(t.left, 45); assert.equal(t.running, false);
  now += 30_000;
  assert.equal(clock.remaining(t), 45);                          // paused: time does not pass
  T.timerStart(t); clock.sync(t); now += 45_000;
  assert.equal(clock.remaining(t), 0);                           // runs out and stays at zero
  T.timerReset(t); assert.deepEqual([t.left, t.running], [60, false]);
  T.timerNewTurn(t); assert.equal(t.running, true);             // auto is on
  t.auto = false; T.timerNewTurn(t); assert.equal(t.running, false);
});

test("timer: a new stamp re-bases each browser's clock; the same stamp does not", () => {
  const t = T.newTimer(); T.timerStart(t);
  let now = 0; const a = new T.TimerClock(() => now);
  a.sync(t); now = 20_000; a.sync(t);
  assert.equal(Math.round(a.remaining(t)), 40);                  // syncing again with the same stamp changes nothing
  T.timerReset(t); T.timerStart(t); a.sync(t);
  assert.equal(Math.round(a.remaining(t)), 60);
});

test("timer: no timer (0 s) never runs; durations are limited to the menu; loaded junk is repaired", () => {
  const t = T.newTimer(); T.timerSetSecs(t, 0); T.timerStart(t);
  assert.equal(t.running, false);
  T.timerSetSecs(t, 33); assert.equal(t.secs, 0);                // 33 is not on the menu
  const tr = { timer: { secs: 99, left: -4, running: true } };
  const fixed = T.timerOf(tr);
  assert.deepEqual([fixed.secs, fixed.left, fixed.running], [60, 0, true]);
  assert.equal(T.timerOf({}).secs, 60);
  assert.equal(T.fmt(65.2), "1:06"); assert.equal(T.fmt(0), "0:00"); assert.equal(T.fmt(-3), "0:00");
});

test("timer: a tracker carries it through save and load", () => {
  S.state.actors = [];
  S.state.tracker = newTracker(); S.state.tracker.timer.secs = 90; S.state.tracker.timer.left = 90;
  const text = JSON.stringify(S.exportData());
  S.state.tracker = newTracker();
  S.importData(text);
  assert.equal(S.state.tracker.timer.secs, 90);
  S.importData(JSON.stringify({ actors: [], tracker: { slots: [], active: true } }));          // an older save with no timer
  assert.equal(T.timerOf(S.state.tracker).secs, 60);
});

test("sound: cards are recognised without reading any text", () => {
  const roll = E.diceHtml([8, 9], []) + `<span class="pm-band critical">x</span>`;
  assert.deepEqual(soundForHtml(roll), { kind: "roll", band: "critical", hail: false });
  assert.equal(soundForHtml(roll.replace("critical", "criticalFailure")).band, "criticalFailure");
  assert.equal(soundForHtml(`<div class="pm-card pm-hailmary">${roll}</div>`).hail, true);
  assert.deepEqual(soundForHtml(`<div class="pm-card pm-voicecard loud">`), { kind: "voice", loud: true });
  assert.equal(soundForHtml(`<div class="pm-card pm-verdict">`).kind, "verdict");
  assert.equal(soundForHtml(`<div class="pm-card pm-exchange">`).kind, "bell");
  assert.equal(soundForHtml(`<div class="pm-card pm-handout">`).kind, "handout");
  assert.equal(soundForHtml(`<div class="pm-card chat">`).kind, "chat");
  assert.equal(soundForHtml(`<div class="pm-card"><div class="pm-notes">Downtime</div></div>`), null);
});

test("sound: real engine cards map to the right band", () => {
  const dax = newActor("character", "Dax", { attributes: { body: 4, mind: 1, presence: 1, resolve: 1 }, skills: { combat: 3 } });
  const d = E.rollDraft(dax, { attribute: "body", skill: "combat", difficulty: 2 }, null, () => 9);
  const html = E.commitRoll(dax, d).html;
  assert.equal(soundForHtml(html).band, "critical");
  const hm = E.hailMary(dax, { verdict: "v", acceptance: "a", skill: "empathy", base: 2, desire: true }, () => 9);
  assert.equal(soundForHtml(hm.html[1]).hail, true);
  assert.equal(soundForHtml(hm.html[0]).kind, "verdict");
});

/* a fake Web Audio that records what is built, so every sound can be "played" in Node */
function fakeAudio() {
  const made = { osc: 0, src: 0, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = extra => ({ connect() {}, ...extra });
  return {
    made,
    Ctx: class {
      constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = "suspended"; this.destination = {}; }
      resume() { made.resumed++; this.state = "running"; }
      createGain() { return node({ gain: param() }); }
      createOscillator() { made.osc++; return node({ type: "", frequency: param(), start() {}, stop() {} }); }
      createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
      createBufferSource() { made.src++; return node({ buffer: null, start() {}, stop() {} }); }
      createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    }
  };
}
test("sound: every sound plays on a fake audio context; off and silent do nothing; no audio never throws", () => {
  const fa = fakeAudio();
  const sfx = createSfx({ AudioCtx: fa.Ctx, random: () => 0.5 });
  for (const n of ["roll", "voice", "verdict", "bell", "handout", "chat", "tick", "alarm", "place"]) assert.equal(sfx.play(n, { band: "success", loud: true }), true, n);
  for (const band of ["critical", "success", "partial", "failure", "criticalFailure"]) assert.equal(sfx.play("roll", { band }), true, band);
  assert.equal(sfx.play("roll", { band: "success", hail: true }), true);
  assert.ok(fa.made.osc > 10 && fa.made.src > 10);
  assert.equal(sfx.play("nonsense"), false);
  sfx.settings.on = false; const before = fa.made.osc;
  assert.equal(sfx.play("alarm"), false); assert.equal(fa.made.osc, before);
  sfx.settings.on = true; sfx.setVolume(0);
  assert.equal(sfx.play("alarm"), false);
  const none = createSfx({ AudioCtx: undefined });
  assert.equal(none.play("roll", { band: "success" }), false);
  assert.equal(none.forHtml(`<div class="pm-dice"></div>`), false);
  none.unlock();
});

test("sound: the browser's autoplay lock is lifted by unlock() and by playing", () => {
  const fa = fakeAudio(); const sfx = createSfx({ AudioCtx: fa.Ctx });
  assert.equal(sfx.ready, false);
  sfx.unlock(); assert.equal(sfx.ready, true); assert.equal(fa.made.resumed, 1);
});
