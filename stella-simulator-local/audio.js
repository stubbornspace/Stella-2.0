// Stella prototype — browser audio for the simulator.
// Plays the pre-generated WAV clips (sim/sounds/<id>.wav) and reports when each
// finishes, which is how the engine gets its Go marker (SPEC §5, §7.1).
//
// Also provides a simple metronome / music bed at tempo_bpm.

export class AudioPlayer {
  constructor({ base = "sounds/", onEnded } = {}) {
    this.base = base;
    this.onEnded = onEnded || (() => {});
    this.enabled = true;
    this.captionsOnly = false;      // fallback when audio can't play
    this._cache = new Map();
    this._current = null;
    this._beat = null;
    this._ctx = null;
  }

  _ctxGet() {
    if (!this._ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) this._ctx = new C();
    }
    if (this._ctx && this._ctx.state === "suspended") this._ctx.resume();
    return this._ctx;
  }

  // Call once from a user gesture (the Start button) to satisfy autoplay rules.
  unlock() {
    this._ctxGet();
    const a = new Audio();
    a.muted = true;
    a.play().catch(() => {});
  }

  play(clip) {
    // Always fire onEnded even if muted / missing, so the engine keeps moving.
    if (!this.enabled || this.captionsOnly) {
      const wait = estimateDuration(clip);
      setTimeout(() => this.onEnded(clip), wait);
      return;
    }
    let el = this._cache.get(clip);
    if (!el) {
      el = new Audio(this.base + clip + ".wav");
      el.preload = "auto";
      this._cache.set(clip, el);
    }
    if (this._current && this._current !== el) {
      try { this._current.pause(); this._current.currentTime = 0; } catch {}
    }
    this._current = el;
    this._duck(true);

    const done = () => {
      el.removeEventListener("ended", done);
      el.removeEventListener("error", done);
      this._duck(false);
      this.onEnded(clip);
    };
    el.addEventListener("ended", done);
    el.addEventListener("error", done);
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {                     // autoplay blocked -> caption fallback
        this.captionsOnly = true;
        setTimeout(() => { this._duck(false); this.onEnded(clip); },
          estimateDuration(clip));
      });
    }
  }

  preload(clips) {
    for (const c of clips) {
      if (this._cache.has(c)) continue;
      const el = new Audio(this.base + c + ".wav");
      el.preload = "auto";
      this._cache.set(c, el);
    }
  }

  // ---- metronome / music bed --------------------------------------
  startBeat(kind, bpm, onTick) {
    this.stopBeat();
    if (kind === "none") return;
    const interval = 60000 / bpm;
    let n = 0;
    const tick = () => {
      if (kind === "metronome") this._click(n % 4 === 0);
      else this._click(n % 2 === 0, true);
      onTick && onTick(n);
      n += 1;
    };
    tick();
    this._beat = setInterval(tick, interval);
  }
  stopBeat() {
    if (this._beat) { clearInterval(this._beat); this._beat = null; }
  }

  _click(accent, soft) {
    const ctx = this._ctxGet();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = soft ? (accent ? 220 : 165) : (accent ? 1600 : 1000);
    o.type = soft ? "sine" : "square";
    const now = ctx.currentTime;
    const vol = (soft ? 0.12 : 0.2) * (this._ducked ? 0.25 : 1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (soft ? 0.18 : 0.06));
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.2);
  }

  _duck(on) { this._ducked = on; }
}

// Rough spoken-length estimate for the caption-only fallback.
function estimateDuration(clip) {
  if (clip.startsWith("letter_") || clip.startsWith("word_")) return 700;
  if (clip === "correct" || clip === "try_again") return 900;
  if (clip.startsWith("spell_") || clip.startsWith("lf_") ||
      clip.startsWith("lt_") || clip === "follow_lights") return 3200;
  return 1600;
}
