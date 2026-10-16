// Stella prototype — reference activity engine. Implements SPEC.md §4 and §6.
// UI-agnostic and audio-agnostic: it emits intents (board / status / audio /
// event / results) and receives inputs (configure / start / stop / press /
// audioEnded / tick). The firmware core mirrors this state machine in C.

import {
  KEY_COLUMN, KEY_ROW, LETTERS, DEFAULT_LAYOUT,
  functioningKeysForLayout, invalidKeysForLayout, reservedKeysForLayout, zoneLettersForLayout, SIDES, DEFAULT_SIDE,
  letterToIdForLayout, idToLetterForLayout,
  wordsForLength, wordNearestLength, wordDeck, randomSequence,
  instructionClip, letterClip, wordClip,
} from "./content.js";

const DEFAULT_CONFIG = {
  activity: "letter_target",
  content: "letters",
  items: 4,
  word_length: "0-5",
  beat: "none",
  tempo_bpm: 54,
  pong_mode: "left_right",
  timeout_enabled: false,
  timeout_ms: 5000,
  // Board (SPEC §1.1/§1.2/§1.3) — applies to all activities.
  layout: DEFAULT_LAYOUT,        // "qwerty" | "alphabetical"
  side: DEFAULT_SIDE,            // "full" | "left" | "right" - which half of the board the exercise uses (SPEC §1.4)
  key_label: "letters",          // "letters" | "blank" — forced "letters" for letter_find
  // Inhibition Challenge (SPEC §3, §4.5)
  response_window_ms: 1500,
  nogo_percent: 40,
  wait_percent: 0,
  // Motor Sequence Builder (SPEC §3, §4.6)
  sequence_start_length: 2,
  sequence_progression: true,
  sequence_max_length: 5,
  participant: "",
};

const PHASE = { IDLE: "idle", INSTRUCTION: "instruction", RESPONSE: "response",
  FEEDBACK: "feedback", COMPLETE: "complete" };

let sessionCounter = 0;

export class StellaEngine {
  constructor(hooks = {}) {
    this.hooks = hooks;                       // { onBoard, onStatus, onAudio, onEvent, onResults }
    this.now = hooks.now || (() => Math.round(performance.now()));
    this.config = { ...DEFAULT_CONFIG };
    this.logBeats = false;
    this._applyLayout();
    this._resetSession();
  }

  // ---- public API --------------------------------------------------------

  configure(partial) {
    this.config = { ...this.config, ...partial };
    if (this.config.items < 1) this.config.items = 1;
    const maxItems = this.config.activity === "inhibition_challenge" ? 100
      : this.config.activity === "motor_sequence_builder" ? 20 : 10;
    if (this.config.items > maxItems) this.config.items = maxItems;
    if (this.config.tempo_bpm < 30) this.config.tempo_bpm = 30;
    if (this.config.tempo_bpm > 120) this.config.tempo_bpm = 120;
    if (this.config.response_window_ms < 500) this.config.response_window_ms = 500;
    if (this.config.response_window_ms > 10000) this.config.response_window_ms = 10000;
    if (this.config.nogo_percent < 0) this.config.nogo_percent = 0;
    if (this.config.nogo_percent > 100) this.config.nogo_percent = 100;
    this.config.wait_percent = 0;
    if (this.config.sequence_start_length < 2) this.config.sequence_start_length = 2;
    if (this.config.sequence_start_length > 5) this.config.sequence_start_length = 5;
    if (this.config.sequence_max_length < this.config.sequence_start_length)
      this.config.sequence_max_length = this.config.sequence_start_length;
    if (this.config.sequence_max_length > 5) this.config.sequence_max_length = 5;
    if (this.config.layout !== "alphabetical") this.config.layout = "qwerty";
    if (!SIDES.includes(this.config.side)) this.config.side = DEFAULT_SIDE;
    if (this.config.key_label !== "blank") this.config.key_label = "letters";
    // Letter Find requires reading the target letter off the board (SPEC
    // §1.3) — blank key caps aren't offered there, regardless of what was
    // last selected on another activity.
    if (this.config.activity === "letter_find") this.config.key_label = "letters";
    this._applyLayout();
    this._emitStatus();
    return this.config;
  }

  // Recompute the layout-dependent key maps (SPEC §1.1/§1.2). Cheap — safe to
  // call on every configure(), even when `layout` didn't change.
  _applyLayout() {
    const layout = this.config.layout, side = this.config.side;
    this.functioningKeys = functioningKeysForLayout(layout, side);      // lettered keys inside the chosen side
    this.functioningIds = this.functioningKeys.map((k) => k.id);
    this.invalidKeys = invalidKeysForLayout(layout, side);              // reserved keys + every key outside the side
    this.invalidIds = this.invalidKeys.map((k) => k.id);
    this.reservedIds = reservedKeysForLayout(layout).map((k) => k.id);
    this.zoneLetters = zoneLettersForLayout(layout, side);              // letters the exercise may use, A-Z order
    this.letterToId = letterToIdForLayout(layout);
    this.idToLetter = idToLetterForLayout(layout);
  }

  getState() {
    return {
      config: this.config,
      capabilities: { functioning_keys: this.functioningKeys, side: this.config.side, sim: true },
      session: this.phase === PHASE.IDLE ? null
        : { session_id: this.session.id, activity: this.config.activity,
            phase: this.phase, item: this.itemIndex + 1, items: this._itemCount() },
    };
  }

  start() {
    if (this.phase !== PHASE.IDLE) return null;
    this._resetSession();
    sessionCounter += 1;
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` +
      `${String(d.getDate()).padStart(2, "0")}`;
    this.session = {
      id: `S-${stamp}-${String(sessionCounter).padStart(4, "0")}`,
      config: { ...this.config },
      startTs: this.now(),
    };
    this.events = [];
    this.seq = 0;
    this._buildItems();
    this._emit("session_start", {
      activity: this.config.activity,
      settings: { ...this.config },
      participant: this.config.participant || null,
      ...(this.contentFallback ? { content_fallback: this.contentFallback } : {}),
    });
    this._allKeys("session-open");

    if (this.config.activity === "eye_pong") {
      this.phase = PHASE.INSTRUCTION;
      this._emitStatus("Follow the lights with your eyes.");
      this._playThen("follow_lights", () => this._pongBegin());
    } else if (this.config.activity === "inhibition_challenge") {
      this.phase = PHASE.INSTRUCTION;
      this._emitStatus("Green means go. Red means stop.");
      this._playThen("ready_go", () => this._icBegin());
    } else {
      this.itemIndex = 0;
      this._presentItem();
    }
    return this.session.id;
  }

  /** Replace the whole configuration with a saved one (e.g. to repeat an earlier exercise exactly). Anything the saved
   * config does not mention goes back to its default, so nothing from the current screen leaks in. */
  loadConfig(saved) {
    this.config = { ...DEFAULT_CONFIG, ...saved };
    return this.configure({});
  }

  stop(reason = "clinician_stopped") {
    if (this.phase === PHASE.IDLE) return;
    this._endSession(reason);
  }

  press(keyId) {
    if (this.invalidIds.includes(keyId)) { this._invalidPress(keyId); return; }
    if (!this.functioningIds.includes(keyId)) return;  // not a real key on the grid
    if (this.config.activity === "eye_pong") return;   // no button response
    if (this.config.activity === "inhibition_challenge") { this._icPress(keyId); return; }
    if (this.phase !== PHASE.RESPONSE) return;         // only between Go and completion

    const t = this.now();
    const expected = this.expectedTargetId;
    const correct = keyId === expected;
    const beatActive = this.config.beat !== "none";

    if (this.firstPressTs == null) {
      this.firstPressTs = t;
      this.firstPressLatency = t - this.goTs;
    }
    this._emit("keypress", {
      item_index: this.itemIndex,
      trial_index: this.trialIndex,
      expected_target: expected,
      expected_target_letter: this.idToLetter[expected] ?? null,
      pressed_key: keyId,
      pressed_key_letter: this.idToLetter[keyId] ?? null,
      correct,
      first_response_latency_ms: this.firstPressTs === t ? this.firstPressLatency : null,
      correct_response_latency_ms: correct ? t - this.goTs : null,
      // "Metrics for Tom" (product-owner spec) — response latency, movement
      // start / selection timestamps for EVERY attempt, not just the first or
      // the eventually-correct one. On this hardware (a momentary switch, no
      // continuous-motion sensor) a press is a single instant, so
      // movement_start_time and selection_time are currently identical.
      response_latency_ms: t - this.goTs,
      movement_start_time: t,
      selection_time: t,
      // Targeting accuracy (§1 "Accuracy") — grid distance / direction from
      // the pressed key to the intended target; null on a correct press.
      miss_distance: correct ? null : keyDistance(keyId, expected),
      error_direction: correct ? null : errorDirection(keyId, expected),
      // Rhythm consistency (§3/§8) — only meaningful while a beat is running;
      // beat_timestamp is the most recent tick's ts, fed in via beatTick().
      beat_active: beatActive,
      beat_timestamp: beatActive ? (this.lastBeatTs ?? null) : null,
    });

    if (correct) {
      this.correctLatency = t - this.goTs;
      this._setKey(keyId, "correct");
      this._emitBoard("correct");
      this.phase = PHASE.FEEDBACK;
      const letter = this.idToLetter[keyId];
      this._playThen(letterClip(letter), () => this._afterCorrectLetter());
    } else {
      this.incorrectAttempts.push(keyId);
      this._setKey(keyId, "incorrect");
      this._emitBoard("incorrect");
      this._playThen("try_again", () => this._reassertTarget());
    }
  }

  // Called by the host (app.js / hal_pico.c) on every metronome/music tick
  // while a beat is running, so keypress events can report how close a press
  // landed to the nearest beat ("Metrics for Tom" §3/§8). ts defaults to the
  // engine clock if the caller doesn't have its own.
  beatTick(ts) {
    this.lastBeatTs = ts ?? this.now();
    if (this.config.beat === "none") return;
    this.beatIndex = (this.beatIndex || 0) + 1;
    this._emit("beat", { index: this.beatIndex });
  }

  // A key that is not part of the exercise was pressed: one of the reserved
  // non-letter positions (reason "reserved"), or - when a keyboard side is
  // chosen - a key on the other side ("outside_side"). Every position has a
  // working switch (SPEC §1.2), so this is a real, detectable press — it's
  // logged, but it never counts as a wrong exercise answer and never affects
  // the current trial/cue/sequence, which keeps waiting for its real target.
  _invalidPress(keyId) {
    if (this.phase === PHASE.IDLE) return;   // no session running to attach it to
    this._emit("invalid_keypress", {
      item_index: this.itemIndex, trial_index: this.trialIndex, pressed_key: keyId,
      reason: this.reservedIds.includes(keyId) ? "reserved" : "outside_side",
    });
    this._setKey(keyId, "invalid");
    this._emitBoard("invalid");
  }

  audioEnded(clip) {
    if (this._pending && this._pending.clip === clip) {
      const cb = this._pending.cb;
      this._pending = null;
      cb && cb();
    }
  }

  // Drives Eye Pong / Inhibition Challenge timing and (optional) LT/LF timeout.
  tick() {
    const t = this.now();
    if (this.config.activity === "eye_pong" && this.pongActive) {
      if (t >= this.pongNextTs) this._pongAdvance();
      return;
    }
    if (this.config.activity === "inhibition_challenge" && this.icActive) {
      if (this.phase === PHASE.RESPONSE && !this.icPressed && t >= this.icDeadline) {
        this.icPressed = true;
        const outcome = this.icCueType === "go" ? "missed_go" : "successful_inhibition";
        this._icResolve(outcome, null);
      } else if (this.phase === PHASE.FEEDBACK && this.icNextTs != null && t >= this.icNextTs) {
        this.icNextTs = null;
        this.icIndex += 1;
        this._icNextTrial();
      }
      return;
    }
    if (this.phase === PHASE.RESPONSE && this.config.timeout_enabled &&
        this.goTs != null && t - this.goTs >= this.config.timeout_ms) {
      this._emit("missed", {
        item_index: this.itemIndex, trial_index: this.trialIndex,
        expected_target: this.expectedTargetId,
      });
      this.goTs = t;                 // re-present same target, restart the clock
      this.firstPressTs = null;
      this._emit("go", { item_index: this.itemIndex, trial_index: this.trialIndex });
    }
  }

  // ---- item / trial sequencing (Letter Target / Letter Find / Motor Sequence Builder) --

  _buildItems() {
    const cfg = this.config;
    this.items = [];
    this.contentFallback = null;
    if (cfg.activity === "eye_pong" || cfg.activity === "inhibition_challenge") return;

    // Everything below draws only from the letters on the chosen keyboard side (all 26 for "full"). The side is a
    // column split, so which words fit depends on the layout (SPEC §1.4).
    const zl = this.zoneLetters;
    const limit = cfg.side === "full" ? null : zl;

    if (cfg.activity === "motor_sequence_builder") {
      for (let i = 0; i < cfg.items; i++) {
        const len = cfg.sequence_progression
          ? Math.min(cfg.sequence_start_length + i, cfg.sequence_max_length)
          : cfg.sequence_start_length;
        const w = cfg.content === "words" ? wordNearestLength(len, this.items.map((it) => it.content), Math.random, limit) : null;
        if (w) {
          this.items.push({ type: "word", content: w, trials: w.split("") });
        } else {
          if (cfg.content === "words") this.contentFallback = "letters";     // no word fits this side: generate instead
          const s = randomSequence(len, zl);
          this.items.push({ type: "sequence", content: s, trials: s.split("") });
        }
      }
      return;
    }

    if (cfg.content === "words") {
      let list = wordsForLength(cfg.word_length, limit);
      if (!list.length) list = wordsForLength("0-5", limit);
      if (!list.length) list = wordsForLength("all", limit);
      if (list.length) {
        for (const w of wordDeck(list, cfg.items)) {                // random order, no repeats until the list runs out
          this.items.push({ type: "word", content: w, trials: w.split("") });
        }
        return;
      }
      this.contentFallback = "letters";                             // no word fits this side at all
    }
    for (let i = 0; i < cfg.items; i++) {
      const l = zl[i % zl.length];
      this.items.push({ type: "letter", content: l, trials: [l] });
    }
  }

  _presentItem() {
    if (this.config.activity === "motor_sequence_builder") { this._msbPresentItem(); return; }
    this.item = this.items[this.itemIndex];
    this.trialIndex = 0;
    this.incorrectAttempts = [];
    this.itemGoTs = null;
    this._presentTrial(true);
  }

  _presentTrial(withInstruction) {
    const item = this.item;
    const letter = item.trials[this.trialIndex];
    this.expectedTargetId = this.letterToId[letter];
    this.firstPressTs = null;
    this.correctLatency = null;

    this._emit("prompt_start", {
      item_index: this.itemIndex,
      item_type: item.type,
      requested_content: item.content,
      trial_index: this.trialIndex,
      expected_target: this.expectedTargetId,
      clip: withInstruction ? instructionClip(this.config.activity, this.config, item) : null,
    });

    // All keys stay neutral through the instruction — Letter Target's target
    // key doesn't reveal itself until the Go marker (_go()), so the green
    // light lands together with the spoken "Go", not before it.
    this._idleAllFunctioning();
    this._emitBoard(withInstruction ? "instruction" : "next-trial");

    if (withInstruction) {
      this.phase = PHASE.INSTRUCTION;
      this._emitStatus(this._promptText(item, letter));
      const clip = instructionClip(this.config.activity, this.config, item);
      this._playThen(clip, () => this._go());
    } else {
      this._go();
    }
  }

  _go() {
    this.goTs = this.now();
    if (this.itemGoTs == null) this.itemGoTs = this.goTs;
    this.phase = PHASE.RESPONSE;
    if (this.config.activity === "letter_target") {
      this._setKey(this.expectedTargetId, "waiting");
      this._emit("target_display", {
        item_index: this.itemIndex, trial_index: this.trialIndex,
        expected_target: this.expectedTargetId,
      });
    }
    this._emit("go", { item_index: this.itemIndex, trial_index: this.trialIndex });
    this._emitBoard("go");
    this._emitStatus(this._promptText(this.item, this.item.trials[this.trialIndex]));
  }

  _afterCorrectLetter() {
    this._idleAllFunctioning();
    this._emitBoard("clear");
    if (this.trialIndex + 1 < this.item.trials.length) {
      this.trialIndex += 1;
      this._presentTrial(false);
    } else {
      this._itemComplete();
    }
  }

  _reassertTarget() {
    if (this.phase !== PHASE.RESPONSE && this.phase !== PHASE.FEEDBACK) return;
    this.phase = PHASE.RESPONSE;
    this._idleAllFunctioning();
    if (this.config.activity === "letter_target") {
      this._setKey(this.expectedTargetId, "waiting");
    }
    this._emitBoard("retry");
  }

  _itemComplete() {
    this._emit("item_complete", {
      item_index: this.itemIndex,
      requested_content: this.item.content,
      item_completion_ts: this.now(),
      incorrect_attempts: [...this.incorrectAttempts],
    });
    this._idleAllFunctioning();
    this._emitBoard("item-complete");

    const praise = (this.itemIndex % 2 === 0) ? "great_job" : "youve_got_this";
    if (this.item.type === "word") {
      this._playThen(wordClip(this.item.content),
        () => this._playThen(praise, () => this._nextItem()));
    } else if (this.item.type === "sequence") {
      this._speakSequence(this.item.trials, () => this._playThen(praise, () => this._nextItem()));
    } else {
      this._playThen(praise, () => this._nextItem());
    }
  }

  // Speak each letter of a generated (non-dictionary) sequence back to back —
  // there's no single pre-recorded clip for an arbitrary sequence (SPEC §4.6).
  _speakSequence(letters, done, i = 0) {
    if (i >= letters.length) { done(); return; }
    this._playThen(letterClip(letters[i]), () => this._speakSequence(letters, done, i + 1));
  }

  _nextItem() {
    this.itemIndex += 1;
    if (this.itemIndex < this.items.length) {
      this._presentItem();
    } else {
      this.phase = PHASE.COMPLETE;
      this._emitStatus("Session complete.");
      this._playThen("session_complete", () => this._endSession("completed"));
    }
  }

  // ---- Motor Sequence Builder — demonstration phase (SPEC §4.6) ---------

  _msbPresentItem() {
    this.item = this.items[this.itemIndex];
    this.trialIndex = 0;
    this.incorrectAttempts = [];
    this.itemGoTs = null;
    this.msbDemoIndex = 0;
    this._idleAllFunctioning();
    this._emit("prompt_start", {
      item_index: this.itemIndex, item_type: this.item.type,
      requested_content: this.item.content, trial_index: 0,
      expected_target: this.letterToId[this.item.trials[0]], clip: "msb_watch",
    });
    this._emitBoard("msb-instruction");
    this.phase = PHASE.INSTRUCTION;
    this._emitStatus("Watch the letters, then repeat.");
    this._playThen("msb_watch", () => this._msbDemoStep());
  }

  _msbDemoStep() {
    const seq = this.item.trials;
    if (this.msbDemoIndex < seq.length) {
      const letter = seq[this.msbDemoIndex];
      const keyId = this.letterToId[letter];
      this._idleAllFunctioning();
      this._setKey(keyId, "waiting");
      this._emit("target_display", {
        item_index: this.itemIndex, trial_index: this.msbDemoIndex,
        expected_target: keyId, expected_target_letter: letter,
      });
      this._emitBoard("msb-demo");
      this._playThen(letterClip(letter), () => {
        this._idleAllFunctioning();
        this._emitBoard("msb-demo-off");
        this.msbDemoIndex += 1;
        this._msbDemoStep();
      });
    } else {
      this._idleAllFunctioning();
      this._emitBoard("msb-demo-done");
      this._emitStatus("Your turn.");
      this._playThen("msb_your_turn", () => this._msbBeginReproduction());
    }
  }

  _msbBeginReproduction() {
    this.expectedTargetId = this.letterToId[this.item.trials[0]];
    this.firstPressTs = null;
    this.correctLatency = null;
    this._go();
  }

  // ---- Eye Pong -------------------------------------------------------

  _pongBegin() {
    this.pongActive = true;
    this.pongIndex = 0;
    this.pongLastKey = null;
    this.goTs = this.now();
    this.pongNextTs = this.now();       // fire immediately on next tick
    this._idleAllFunctioning();         // keep the board populated between targets
    this._emitBoard("pong-begin");
    this._emitStatus("Follow the lights with your eyes.");
    this._pongAdvance();
  }

  _pongInterval() { return Math.round(60000 / this.config.tempo_bpm); }

  _pongAdvance() {
    if (this.pongLastKey != null) this._setKey(this.pongLastKey, "idle");
    if (this.pongIndex >= this.config.items) {
      this._idleAllFunctioning();
      this._allKeys("off");
      this.pongActive = false;
      this.phase = PHASE.COMPLETE;
      this._emitStatus("Session complete.");
      this._playThen("session_complete", () => this._endSession("completed"));
      return;
    }
    let key;
    if (this.config.pong_mode === "random") {
      const pool = this.functioningIds.filter((k) => k !== this.pongLastKey);
      key = pool[Math.floor(Math.random() * pool.length)];
    } else {
      const sorted = [...this.functioningIds].sort((a, b) => KEY_COLUMN[a] - KEY_COLUMN[b]);
      const ends = [sorted[0], sorted[sorted.length - 1]];
      key = (this.pongIndex % 2 === 0) ? ends[0] : ends[1];
    }
    this._setKey(key, "waiting");
    this._emit("prompt_start", {
      item_index: this.pongIndex, item_type: "pong_target",
      requested_content: this.idToLetter[key], trial_index: 0, expected_target: key, clip: null,
    });
    this._emitBoard("pong");
    this._emit("item_complete", {
      item_index: this.pongIndex, requested_content: this.idToLetter[key],
      item_completion_ts: this.now() + this._pongInterval(), incorrect_attempts: [],
    });
    this.pongLastKey = key;
    this.pongIndex += 1;
    this.pongNextTs = this.now() + this._pongInterval();
    this._emitStatus(`Target ${this.pongIndex} of ${this.config.items}`);
  }

  // ---- Inhibition Challenge (SPEC §4.5) --------------------------------

  _icCueSequence() {
    const cfg = this.config;
    const cues = ["go", "nogo"];
    const weights = [100 - cfg.nogo_percent, cfg.nogo_percent];
    const exact = weights.map((weight) => cfg.items * weight / 100);
    const counts = exact.map(Math.floor);
    const remaining = cfg.items - counts.reduce((sum, count) => sum + count, 0);
    const remainderOrder = exact.map((value, index) => ({ index, remainder: value - counts[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let i = 0; i < remaining; i++) counts[remainderOrder[i].index] += 1;

    const seq = cues.flatMap((cue, index) => Array(counts[index]).fill(cue));
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    return seq;
  }

  _icBegin() {
    this.icActive = true;
    this.icIndex = 0;
    this.icLastKey = null;
    this.icCueSeq = this._icCueSequence();
    this._idleAllFunctioning();
    this._emitBoard("ic-begin");
    this._icNextTrial();
  }

  _icNextTrial() {
    if (this.icIndex >= this.config.items) { this._icFinish(); return; }
    const pool = this.functioningIds.filter((k) => k !== this.icLastKey);
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.icLastKey = key;
    this.itemIndex = this.icIndex;
    this.expectedTargetId = key;
    this.icCueType = this.icCueSeq[this.icIndex];
    this.icPressed = false;
    this.icIncorrect = [];

    this._idleAllFunctioning();
    const color = this.icCueType === "go" ? "waiting" : "incorrect";
    this._setKey(key, color);
    this._emitBoard("ic-cue");

    this.goTs = this.now();
    this.firstPressTs = null;
    this._emit("prompt_start", {
      item_index: this.icIndex, item_type: "ic_trial",
      requested_content: this.icCueType, trial_index: 0, expected_target: key,
      expected_target_letter: this.idToLetter[key], clip: null,
    });
    this._emit("go", { item_index: this.icIndex, trial_index: 0 });
    this.phase = PHASE.RESPONSE;
    this.icDeadline = this.goTs + this.config.response_window_ms;
    this._emitStatus(`Trial ${this.icIndex + 1} of ${this.config.items}`);
  }

  _icPress(keyId) {
    if (this.phase !== PHASE.RESPONSE || !this.icActive) return;
    const t = this.now();
    const cue = this.icCueType;
    const isTarget = keyId === this.expectedTargetId;
    const ruleCorrect = cue === "go" && isTarget;

    if (this.firstPressTs == null) this.firstPressTs = t;
    this._emit("keypress", {
      item_index: this.icIndex, trial_index: 0, expected_target: this.expectedTargetId,
      expected_target_letter: this.idToLetter[this.expectedTargetId],
      pressed_key: keyId, pressed_key_letter: this.idToLetter[keyId], correct: ruleCorrect,
      first_response_latency_ms: t - this.goTs,
      correct_response_latency_ms: ruleCorrect ? t - this.goTs : null,
    });

    if (cue === "go" && !isTarget) {
      // off-target press during a Go trial: logged, but the window keeps running (SPEC §4.5)
      this.icIncorrect.push(keyId);
      return;
    }
    if (this.icPressed) return;
    this.icPressed = true;

    if (cue === "go") {
      this._setKey(keyId, "correct");
      this._emitBoard("ic-correct");
      this._icResolve("correct_go", t - this.goTs);
    } else {
      this.icIncorrect.push(keyId);
      this._setKey(keyId, "incorrect");
      this._emitBoard("ic-false");
      this._icResolve("false_response", t - this.goTs);
    }
  }

  _icResolve(outcome, latencyMs) {
    this.phase = PHASE.FEEDBACK;
    this._emit("item_complete", {
      item_index: this.icIndex, requested_content: this.icCueType,
      item_completion_ts: this.now(), incorrect_attempts: [...this.icIncorrect],
      outcome, response_latency_ms: latencyMs,
    });
    if (outcome === "correct_go") {
      this._playThen("correct", () => {});
    } else if (outcome === "false_response") {
      this._playThen("try_again", () => {});
    } else {
      this._idleAllFunctioning();
      this._emitBoard("ic-silent-advance");
    }
    this.icNextTs = this.now() + Math.round(60000 / this.config.tempo_bpm);
  }

  _icFinish() {
    this.icActive = false;
    this.icNextTs = null;
    this._idleAllFunctioning();
    this._allKeys("off");
    this.phase = PHASE.COMPLETE;
    this._emitStatus("Session complete.");
    this._playThen("session_complete", () => this._endSession("completed"));
  }

  // ---- session end + metrics ----------------------------------------

  _endSession(reason) {
    if (this.phase === PHASE.IDLE) return;
    this.pongActive = false;
    this.icActive = false;
    this.icNextTs = null;
    const started = this._itemsStarted();
    const completed = this.events.filter((e) => e.type === "item_complete").length;
    this._emit("session_end", {
      end_reason: reason, n_items_started: started, n_items_completed: completed,
    });
    const summary = this._computeSummary(reason);
    this.lastSummary = summary;
    this.lastEvents = [...this.events];
    this.phase = PHASE.IDLE;
    this._allKeys("off");
    this._emitStatus("");
    this.hooks.onResults && this.hooks.onResults(summary);
  }

  _computeSummary(reason) {
    const ev = this.events;
    const cfg = this.session.config;
    const keypresses = ev.filter((e) => e.type === "keypress");

    // group by trial
    const trials = new Map();
    for (const k of keypresses) {
      const key = `${k.item_index}:${k.trial_index}`;
      if (!trials.has(key)) trials.set(key, { presses: [], item_index: k.item_index });
      trials.get(key).presses.push(k);
    }
    const trialList = [...trials.values()];
    const completedTrials = trialList.filter((t) => t.presses.some((p) => p.correct));
    const firstAttemptCorrect = trialList.filter((t) => t.presses[0] && t.presses[0].correct);
    const incorrectPresses = keypresses.filter((k) => !k.correct);

    const correctLat = keypresses.filter((k) => k.correct)
      .map((k) => k.correct_response_latency_ms).filter((x) => x != null);
    const firstLat = trialList.map((t) => t.presses[0]?.first_response_latency_ms)
      .filter((x) => x != null);

    const itemsStarted = this._itemsStarted();
    const itemsCompleted = ev.filter((e) => e.type === "item_complete").length;

    // per-key
    const byKeyMap = new Map();
    for (const k of keypresses) {
      const id = k.expected_target;
      if (!byKeyMap.has(id)) byKeyMap.set(id, {
        id, letter: k.expected_target_letter ?? this.idToLetter[id],
        trials: 0, firstCorrect: 0, incorrect: 0, lat: [] });
      const b = byKeyMap.get(id);
      if (k.correct) b.lat.push(k.correct_response_latency_ms);
    }
    for (const t of trialList) {
      const id = t.presses[0].expected_target;
      const b = byKeyMap.get(id);
      b.trials += 1;
      if (t.presses[0].correct) b.firstCorrect += 1;
      b.incorrect += t.presses.filter((p) => !p.correct).length;
    }

    // per-word (Letter Target / Letter Find / Motor Sequence Builder "words" mode)
    const byWord = [];
    if (cfg.content === "words" && cfg.activity !== "motor_sequence_builder") {
      const items = ev.filter((e) => e.type === "item_complete");
      for (const it of items) {
        const goEv = ev.find((e) => e.type === "go" && e.item_index === it.item_index
          && e.trial_index === 0);
        const word = it.requested_content;
        const wordTrials = trialList.filter((t) => t.item_index === it.item_index);
        const firstOk = wordTrials.filter((t) => t.presses[0]?.correct).length;
        const correctPresses = wordTrials.map((t) => t.presses.find((p) => p.correct))
          .filter(Boolean).sort((a, b) => a.ts - b.ts);
        let iki = null;
        if (correctPresses.length > 1) {
          const gaps = [];
          for (let i = 1; i < correctPresses.length; i++)
            gaps.push(correctPresses[i].ts - correctPresses[i - 1].ts);
          iki = Math.round(mean(gaps));
        }
        byWord.push({
          word, length: word.length, trials: wordTrials.length,
          first_attempt_accuracy: pct(firstOk, wordTrials.length),
          completion_time_ms: goEv ? it.item_completion_ts - goEv.ts : null,
          inter_key_interval_ms: iki,
          beat: cfg.beat,
        });
      }
    }

    // Inhibition Challenge (SPEC §4.5, §6.2)
    let icMetrics = null, icByCueType = [];
    if (cfg.activity === "inhibition_challenge") {
      const trialEv = ev.filter((e) => e.type === "item_complete");
      const byType = (t) => trialEv.filter((e) => e.requested_content === t);
      const go = byType("go"), nogo = byType("nogo");
      const goCorrect = go.filter((e) => e.outcome === "correct_go");
      const nogoOk = nogo.filter((e) => e.outcome === "successful_inhibition");
      const falseResp = nogo.filter((e) => e.outcome === "false_response");
      const goLat = goCorrect.map((e) => e.response_latency_ms).filter((x) => x != null);
      icMetrics = {
        go_trial_accuracy: pct(goCorrect.length, go.length),
        nogo_inhibition_accuracy: pct(nogoOk.length, nogo.length),
        false_response_rate: pct(falseResp.length, nogo.length),
        missed_go_rate: pct(go.length - goCorrect.length, go.length),
        mean_go_response_latency_ms: goLat.length ? Math.round(mean(goLat)) : null,
      };
      icByCueType = [
        { cue_type: "Go", trials: go.length, accuracy: pct(goCorrect.length, go.length) },
        { cue_type: "No-Go", trials: nogo.length, accuracy: pct(nogoOk.length, nogo.length) },
      ].filter((r) => r.trials > 0);
    }

    // Motor Sequence Builder (SPEC §4.6, §6.2)
    let msbMetrics = null, bySequence = [];
    if (cfg.activity === "motor_sequence_builder") {
      const items = ev.filter((e) => e.type === "item_complete");
      const posStats = new Map();
      for (const it of items) {
        const goEv = ev.find((e) => e.type === "go" && e.item_index === it.item_index
          && e.trial_index === 0);
        const seq = it.requested_content;
        const seqTrials = trialList.filter((t) => t.item_index === it.item_index);
        const firstOkCount = seqTrials.filter((t) => t.presses[0]?.correct).length;
        const firstAttemptOk = firstOkCount === seqTrials.length && seqTrials.length > 0;
        const correctPresses = seqTrials.map((t) => t.presses.find((p) => p.correct))
          .filter(Boolean).sort((a, b) => a.ts - b.ts);
        let iki = null;
        if (correctPresses.length > 1) {
          const gaps = [];
          for (let i = 1; i < correctPresses.length; i++)
            gaps.push(correctPresses[i].ts - correctPresses[i - 1].ts);
          iki = Math.round(mean(gaps));
        }
        seqTrials.forEach((t, posIdx) => {
          if (!posStats.has(posIdx)) posStats.set(posIdx, { correct: 0, total: 0 });
          const st = posStats.get(posIdx);
          st.total += 1;
          if (t.presses[0]?.correct) st.correct += 1;
        });
        bySequence.push({
          sequence: seq, length: seq.length, trials: seqTrials.length,
          first_attempt_accuracy: pct(firstOkCount, seqTrials.length),
          first_attempt_clean: firstAttemptOk,
          completion_time_ms: goEv ? it.item_completion_ts - goEv.ts : null,
          inter_key_interval_ms: iki,
        });
      }
      const longestCompleted = bySequence.length ? Math.max(...bySequence.map((s) => s.length)) : 0;
      msbMetrics = {
        sequence_completion_rate: ratio(itemsCompleted, itemsStarted),
        first_attempt_sequence_accuracy: bySequence.length
          ? pct(bySequence.filter((s) => s.first_attempt_clean).length, bySequence.length) : null,
        longest_completed_sequence: longestCompleted,
        accuracy_by_position: [...posStats.entries()].sort((a, b) => a[0] - b[0])
          .map(([pos, st]) => ({ position: pos + 1, accuracy: pct(st.correct, st.total) })),
      };
    }

    // "Metrics for Tom" (product-owner spec) — accuracy, response timing,
    // rhythm consistency, directional error pattern, and sequence-performance
    // metrics for the letter-selection ("spelling") tasks: Letter Target,
    // Letter Find, Motor Sequence Builder. Eye Pong has no button response
    // and Inhibition Challenge isn't a targeting task (one lit key,
    // press/don't-press) — neither activity gets these blocks.
    let targetingMetrics = null, responseTimingMetrics = null, rhythmMetrics = null,
      directionalMetrics = null, sequencePerformance = null;
    const isSpellingTask = cfg.activity === "letter_target" || cfg.activity === "letter_find" ||
      cfg.activity === "motor_sequence_builder";

    if (isSpellingTask) {
      // 1. Accuracy (targeting during spelling)
      const totalAttempts = keypresses.length;
      const correctHits = keypresses.filter((k) => k.correct).length;
      const missDistances = keypresses.filter((k) => !k.correct && k.miss_distance != null)
        .map((k) => k.miss_distance);
      targetingMetrics = {
        total_attempts: totalAttempts,
        correct_hits: correctHits,
        accuracy_pct: pct(correctHits, totalAttempts),
        first_attempt_success_rate_pct: pct(firstAttemptCorrect.length, trialList.length),
        mean_miss_distance: missDistances.length ? round2(mean(missDistances)) : null,
      };

      // 2. Response timing (intent -> movement), every attempt, not just the
      // first press of a trial (that narrower figure is metrics.mean_first_
      // response_latency_ms above).
      const attemptLat = keypresses.map((k) => k.response_latency_ms).filter((x) => x != null);
      responseTimingMetrics = {
        mean_response_latency_ms: attemptLat.length ? Math.round(mean(attemptLat)) : null,
        latency_sd_ms: attemptLat.length > 1 ? Math.round(stddev(attemptLat)) : null,
      };

      // 3. Rhythm / timing consistency — only when a beat was running.
      if (cfg.beat !== "none") {
        const onBeatWindowMs = 150;
        const offsets = keypresses.filter((k) => k.beat_active && k.beat_timestamp != null)
          .map((k) => k.ts - k.beat_timestamp);
        const within = offsets.filter((o) => Math.abs(o) <= onBeatWindowMs).length;
        rhythmMetrics = {
          on_beat_window_ms: onBeatWindowMs,
          on_beat_accuracy_pct: offsets.length ? pct(within, offsets.length) : null,
          timing_variability_ms: offsets.length > 1 ? Math.round(stddev(offsets)) : null,
        };
      }

      // 4. Directional consistency (motor planning stability) — classify
      // each incorrect press by which side of the target it landed on; a
      // repeated bias across errors counts as "consistent" (simple rule).
      const errorDirs = keypresses.filter((k) => !k.correct && k.error_direction)
        .map((k) => k.error_direction);
      if (errorDirs.length) {
        const counts = {};
        for (const d of errorDirs) counts[d] = (counts[d] || 0) + 1;
        const [dominant, domCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        directionalMetrics = {
          error_counts: counts,
          dominant_direction: dominant,
          directional_consistency_pct: pct(domCount, errorDirs.length),
        };
      }

      // 5. Sequence performance (spelling-specific) — any item with more
      // than one letter: prescribed words (LT/LF) and MSB sequences alike.
      const completedItemEvents = ev.filter((e) => e.type === "item_complete");
      const multiTrialItems = completedItemEvents
        .map((it) => ({ it, trials: trialList.filter((t) => t.item_index === it.item_index) }))
        .filter((x) => x.trials.length > 1);
      if (multiTrialItems.length) {
        const perItem = multiTrialItems.map(({ it, trials: its }) => ({
          item_index: it.item_index,
          letters_in_item: its.length,
          letters_completed: its.filter((t) => t.presses.some((p) => p.correct)).length,
        }));
        const completedFull = perItem
          .filter((p) => p.letters_completed === p.letters_in_item).length;
        const breakdownCounts = {};
        for (const { trials: its } of multiTrialItems) {
          const sorted = [...its].sort((a, b) => a.presses[0].trial_index - b.presses[0].trial_index);
          const firstBad = sorted.find((t) => !(t.presses[0] && t.presses[0].correct));
          if (firstBad) {
            const pos = firstBad.presses[0].trial_index + 1;   // 1-based letter position
            breakdownCounts[pos] = (breakdownCounts[pos] || 0) + 1;
          }
        }
        const breakdownEntries = Object.entries(breakdownCounts).sort((a, b) => b[1] - a[1]);
        sequencePerformance = {
          letters_completed_per_item: perItem,
          sequence_completion_rate_pct: pct(completedFull, perItem.length),
          breakdown_point_counts: breakdownCounts,
          most_common_breakdown_position: breakdownEntries.length
            ? Number(breakdownEntries[0][0]) : null,
        };
      }
    }

    return {
      session_id: this.session.id,
      generated_utc: new Date().toISOString(),
      activity: cfg.activity,
      end_reason: reason,
      participant: cfg.participant || null,
      settings: cfg,
      counts: {
        items_requested: cfg.items,
        items_started: itemsStarted,
        items_completed: itemsCompleted,
        trials_total: trialList.length,
        trials_completed: completedTrials.length,
      },
      metrics: {
        item_completion_rate: ratio(itemsCompleted, itemsStarted),
        first_attempt_accuracy: ratio(firstAttemptCorrect.length, completedTrials.length),
        eventual_accuracy: ratio(completedTrials.length, trialList.length),
        mean_first_response_latency_ms: firstLat.length ? Math.round(mean(firstLat)) : null,
        mean_correct_response_latency_ms: correctLat.length ? Math.round(mean(correctLat)) : null,
        median_correct_response_latency_ms: correctLat.length ? Math.round(median(correctLat)) : null,
        latency_sd_ms: correctLat.length > 1 ? Math.round(stddev(correctLat)) : null,
        latency_iqr_ms: correctLat.length > 3 ? Math.round(iqr(correctLat)) : null,
        mean_incorrect_attempts_per_trial: completedTrials.length
          ? round2(incorrectPresses.length / completedTrials.length) : 0,
      },
      by_key: [...byKeyMap.values()].map((b) => ({
        key_id: b.id, letter: b.letter, trials: b.trials,
        first_attempt_accuracy: pct(b.firstCorrect, b.trials),
        mean_correct_latency_ms: b.lat.length ? Math.round(mean(b.lat)) : null,
        incorrect_attempts: b.incorrect,
        beat: cfg.beat,
      })),
      by_word: byWord,
      ic_metrics: icMetrics,
      ic_by_cue_type: icByCueType,
      msb_metrics: msbMetrics,
      by_sequence: bySequence,
      // "Metrics for Tom" — null on Eye Pong / Inhibition Challenge (§ above).
      targeting_metrics: targetingMetrics,
      response_timing_metrics: responseTimingMetrics,
      rhythm_metrics: rhythmMetrics,
      directional_metrics: directionalMetrics,
      sequence_performance: sequencePerformance,
      guardrail_note:
        "Accuracy is among detectable functioning-key presses only. Latency values " +
        "are response times, not clinical outcomes.",
    };
  }

  _itemsStarted() {
    const ids = new Set(this.events.filter((e) => e.type === "prompt_start")
      .map((e) => e.item_index));
    return ids.size;
  }
  _itemCount() {
    if (this.config.activity === "eye_pong" || this.config.activity === "inhibition_challenge")
      return this.config.items;
    return this.items ? this.items.length : this.config.items;
  }

  // ---- board / status / audio / event plumbing --------------------

  _resetSession() {
    this.phase = PHASE.IDLE;
    this.session = null;
    this.items = [];
    this.itemIndex = 0;
    this.trialIndex = 0;
    this.expectedTargetId = null;
    this.goTs = null;
    this.itemGoTs = null;
    this.firstPressTs = null;
    this.incorrectAttempts = [];
    this.events = [];
    this.seq = 0;
    this._pending = null;
    this.pongActive = false;
    this.icActive = false;
    this.icNextTs = null;
    this.lastBeatTs = null;
    this.beatIndex = 0;
    this.keyState = {};
    for (const k of this.functioningKeys) this.keyState[k.id] = "off";
    for (const k of this.invalidKeys) this.keyState[k.id] = "off";
  }

  _idleAllFunctioning() {
    for (const k of this.functioningKeys) this.keyState[k.id] = "idle";
    for (const k of this.invalidKeys) this.keyState[k.id] = "off";   // no letter -> stay dark at rest
  }
  _allKeys(_why) {
    for (const k of this.functioningKeys)
      if (this.phase === PHASE.IDLE) this.keyState[k.id] = "off";
      else this.keyState[k.id] = "idle";
    for (const k of this.invalidKeys) this.keyState[k.id] = "off";
  }
  _setKey(id, state) { this.keyState[id] = state; }

  _emitBoard(reason) {
    if (!this.hooks.onBoard) return;
    const keys = [...this.functioningKeys, ...this.invalidKeys].map((k) => ({
      id: k.id, letter: k.letter, color: this.keyState[k.id] || "off",
    }));
    this.hooks.onBoard({ keys, reason });
  }

  _emitStatus(promptText) {
    if (!this.hooks.onStatus) return;
    const item = this.items && this.items[this.itemIndex];
    this.hooks.onStatus({
      state: this.phase,
      activity: this.config.activity,
      prompt_text: promptText ?? "",
      item: this.config.activity === "eye_pong"
        ? this.pongIndex
        : Math.min(this.itemIndex + 1, this._itemCount()),
      items: this._itemCount(),
      trial: (this.trialIndex || 0) + 1,
      trials: item ? item.trials.length : 1,
      beat: this.config.beat,
      tempo_bpm: this.config.tempo_bpm,
      session_id: this.session ? this.session.id : null,
    });
  }

  _playThen(clip, cb) {
    this._pending = { clip, cb };
    this.hooks.onAudio && this.hooks.onAudio({ clip });
  }

  _promptText(item, letter) {
    const a = this.config.activity;
    if (a === "letter_target") {
      return item.type === "word"
        ? `Spell ${item.content} — press the green key (${letter})`
        : `Press the green key (${letter})`;
    }
    if (a === "letter_find") {
      return item.type === "word"
        ? `Spell ${item.content} — press ${letter}`
        : `Find and press ${letter}`;
    }
    if (a === "motor_sequence_builder") {
      return `Repeat the sequence: ${item.content}`;
    }
    return "";
  }

  _emit(type, fields) {
    this.seq += 1;
    const rec = {
      seq: this.seq,
      ts: this.now(),
      session_id: this.session ? this.session.id : null,
      type,
      ...fields,
    };
    this.events.push(rec);
    this.hooks.onEvent && this.hooks.onEvent(rec);
    return rec;
  }
}

// ---- small stats helpers ---------------------------------------------
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function median(a) {
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stddev(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function iqr(a) {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => {
    const idx = (s.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return q(0.75) - q(0.25);
}
function ratio(n, d) { return d ? round2(n / d) : null; }
function pct(n, d) { return d ? Math.round((n / d) * 100) : null; }
function round2(x) { return Math.round(x * 100) / 100; }

// "Metrics for Tom" §1/§4 — grid distance and error direction between two
// key ids. Row/column are layout-independent (KEY_COLUMN/KEY_ROW key off id,
// not letter), so this works the same under any keyboard layout. A discrete
// button grid has no continuous "miss distance" sensor — this is a geometric
// proxy (Euclidean distance in grid cells), not a physical measurement.
function keyDistance(fromId, toId) {
  const dc = KEY_COLUMN[fromId] - KEY_COLUMN[toId];
  const dr = KEY_ROW[fromId] - KEY_ROW[toId];
  return round2(Math.sqrt(dc * dc + dr * dr));
}
function errorDirection(pressedId, targetId) {
  const dc = KEY_COLUMN[pressedId] - KEY_COLUMN[targetId];
  const dr = KEY_ROW[pressedId] - KEY_ROW[targetId];
  if (dc === 0 && dr === 0) return null;
  if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? "right" : "left";
  if (Math.abs(dr) > Math.abs(dc)) return dr > 0 ? "below" : "above";
  return "random";   // equal-magnitude diagonal — no single dominant axis
}

// ---- export helpers (SPEC §6.1) -------------------------------------
export function eventsToJsonl(events) {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
export function eventsToCsv(events) {
  const cols = ["seq", "ts", "session_id", "type", "activity", "item_index",
    "item_type", "requested_content", "trial_index", "expected_target",
    "expected_target_letter", "pressed_key", "pressed_key_letter", "correct",
    "first_response_latency_ms", "correct_response_latency_ms", "response_latency_ms",
    "movement_start_time", "selection_time", "miss_distance", "error_direction",
    "beat_active", "beat_timestamp", "item_completion_ts", "incorrect_attempts",
    "outcome", "end_reason", "clip"];
  const esc = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) v = v.join("|");
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const e of events) lines.push(cols.map((c) => esc(e[c])).join(","));
  return lines.join("\n") + "\n";
}
