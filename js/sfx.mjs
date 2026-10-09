/**
 * Sounds, synthesized with the Web Audio API (no sound files, nothing to download).
 * `soundForHtml` decides what a log card should sound like; `createSfx` plays it. Browsers only allow audio after a click or key press,
 * so the context is created and resumed by `unlock()`, which the app calls on the first interaction.
 */

/** What a log card sounds like, from its markup (the card classes are language-independent). */
export function soundForHtml(html) {
  const h = String(html ?? "");
  if (h.includes("pm-voicecard")) return { kind: "voice", loud: h.includes("loud") };
  if (h.includes("pm-verdict")) return { kind: "verdict" };
  if (h.includes("pm-dice")) {
    const m = /pm-band (\w+)/.exec(h);
    return { kind: "roll", band: m ? m[1] : null, hail: h.includes("pm-hailmary") };
  }
  if (h.includes("pm-handout")) return { kind: "handout" };
  if (h.includes("pm-exchange")) return { kind: "bell" };
  if (h.includes("pm-card chat")) return { kind: "chat" };
  return null;
}

export const DEFAULTS = { on: true, vol: 0.6 };

export function createSfx({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext, random = Math.random } = {}) {
  const settings = { ...DEFAULTS };
  let ctx = null, master = null, noise = null;

  function ensure() {
    if (ctx || !AudioCtx) return ctx;
    try {
      ctx = new AudioCtx();
      master = ctx.createGain(); master.gain.value = settings.vol; master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.12), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = random() * 2 - 1;
      noise = buf;
    } catch { ctx = null; }
    return ctx;
  }
  function unlock() { const c = ensure(); if (c?.state === "suspended") c.resume?.(); }
  function setVolume(v) { settings.vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = settings.vol; }

  /* ---- building blocks ---- */
  function tone(at, freq, dur, { type = "sine", gain = 0.25, to = 0, attack = 0.005 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.02);
  }
  function click(at, freq, gain = 0.3, dur = 0.05) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 1.4;
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + dur + 0.02);
  }
  /** Dice on a table: a handful of short clicks, quickening then settling. */
  function clatter(at, n = 8) {
    let t = at;
    for (let i = 0; i < n; i++) { click(t, 1400 + random() * 3200, 0.18 + random() * 0.22, 0.035 + random() * 0.04); t += 0.025 + random() * 0.06 + i * 0.008; }
    return t;
  }

  /* ---- the sounds ---- */
  const PLAYER_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];     // C D E G A C D: a pentatonic scale, so any mix of players sounds consonant
  const RESULT = {
    critical: at => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(at + i * 0.07, f, 0.45, { type: "triangle", gain: 0.22 }); tone(at + i * 0.07, f * 2, 0.35, { gain: 0.06 }); }); },
    success: at => { tone(at, 392, 0.2, { type: "triangle", gain: 0.22 }); tone(at + 0.11, 523.25, 0.4, { type: "triangle", gain: 0.24 }); },
    partial: at => { tone(at, 329.63, 0.38, { type: "triangle", gain: 0.2 }); tone(at + 0.02, 349.23, 0.38, { type: "sine", gain: 0.12 }); },
    failure: at => { tone(at, 196, 0.34, { type: "sawtooth", gain: 0.14, to: 110 }); click(at, 300, 0.25, 0.08); },
    criticalFailure: at => { tone(at, 98, 0.7, { type: "sawtooth", gain: 0.18, to: 55 }); tone(at, 138.6, 0.7, { type: "square", gain: 0.07, to: 78 }); click(at, 220, 0.3, 0.14); }
  };
  const SOUNDS = {
    roll: ({ band, hail }) => {
      const end = clatter(ctx.currentTime + 0.02, hail ? 5 : 8);
      if (hail) { for (let i = 0; i < 2; i++) tone(end + 0.1 + i * 0.28, 62, 0.22, { gain: 0.35, to: 40 }); }
      if (band && RESULT[band]) RESULT[band](end + (hail ? 0.75 : 0.12));
    },
    voice: ({ loud }) => { const t = ctx.currentTime; tone(t, loud ? 70 : 90, loud ? 1.1 : 0.8, { type: "sine", gain: loud ? 0.3 : 0.16, attack: 0.25, to: loud ? 55 : 80 }); if (loud) tone(t + 0.05, 74, 1.0, { type: "sawtooth", gain: 0.05, attack: 0.3 }); },
    verdict: () => { const t = ctx.currentTime; tone(t, 110, 1.2, { type: "sine", gain: 0.28, attack: 0.02, to: 98 }); tone(t + 0.02, 220, 0.9, { type: "triangle", gain: 0.1 }); },
    bell: () => { const t = ctx.currentTime; [880, 1318.5].forEach((f, i) => tone(t + i * 0.01, f, 1.1, { gain: 0.14 / (i + 1), attack: 0.003 })); },
    handout: () => { const t = ctx.currentTime; click(t, 2600, 0.12, 0.08); click(t + 0.07, 3400, 0.1, 0.1); tone(t + 0.12, 659.25, 0.3, { gain: 0.1 }); },
    chat: () => { const t = ctx.currentTime; tone(t, 700, 0.08, { gain: 0.12, to: 1000 }); },
    // a player's ping: a softer two-note pop whose pitch belongs to that player (the same name always sounds the same), so the table can tell who by ear
    pingPlayer: ({ note = 0 } = {}) => {
      const t = ctx.currentTime, f = PLAYER_NOTES[Math.max(0, Math.min(PLAYER_NOTES.length - 1, Math.floor(note) || 0))];
      tone(t, f, 0.16, { type: "triangle", gain: 0.14, attack: 0.004 }); tone(t + 0.09, f * 1.5, 0.3, { type: "triangle", gain: 0.11, attack: 0.004 });
    },
    ping: () => { const t = ctx.currentTime; tone(t, 880, 0.5, { gain: 0.16, to: 1320, attack: 0.01 }); tone(t + 0.16, 1320, 0.6, { gain: 0.08, attack: 0.01 }); },
    tick: () => { click(ctx.currentTime, 1800, 0.22, 0.03); },
    alarm: () => { const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone(t + i * 0.22, 440, 0.18, { type: "square", gain: 0.12, to: 400 }); },
    place: () => { click(ctx.currentTime, 900, 0.2, 0.04); }
  };

  /** Play a sound by name, or nothing if sound is off or the browser has no audio. Never throws. */
  function play(name, opts = {}) {
    if (!settings.on || settings.vol <= 0 || !SOUNDS[name]) return false;
    try { if (!ensure()) return false; if (ctx.state === "suspended") ctx.resume?.(); SOUNDS[name](opts); return true; } catch { return false; }
  }
  /** Play whatever suits a log card. */
  function forHtml(html) { const s = soundForHtml(html); return s ? play(s.kind, s) : false; }

  return { settings, unlock, setVolume, play, forHtml, get ready() { return !!ctx; } };
}
