// Stella prototype simulator — UI controller.
// Wires the reference engine (engine.js) to the clinician UI and a clickable
// on-screen keyboard that stands in for the physical device during development.

import { StellaEngine, eventsToJsonl, eventsToCsv } from "./engine.js";
import { AudioPlayer } from "./audio.js";
import { openCard } from "./sdcard.js";
import { PatientDb, initials, recordConfig } from "./patients.js";
import { StartScreen, esc } from "./start.js";
import {
  keyRowsForLayout, zoneLettersForLayout, CLIPS, LETTERS, WORDS, wordsForLength, loadWords,
} from "./content.js";

const $ = (sel, el = document) => el.querySelector(sel);

const state = {
  view: "letter_target",     // letter_target | letter_find | eye_pong | results
  running: false,
  demo: false,                // "Demo" pill — enables hands-free auto-press
  lastSummary: null,
  autoTimer: null,
  tickTimer: null,
  fromHistory: false,         // the Results page is showing a saved session, not the one just run
  viewEvents: null,           // raw events of that saved session (for the exports)
  saveNote: null,             // { kind: ok|err|demo|pending, text } shown on the Results page
  viewRecord: null,           // the saved History record being looked at (for "Repeat")
  repeatNote: null,           // { activity, when, words } shown on the settings page after "Repeat"
  idleMs: 5 * 60 * 1000,      // auto-lock after this long without activity
};

// Encryption of the patient list is switched OFF for now: the list is plain JSON on the card and opens straight away.
// Set this to true to bring back the passphrase set-up, unlock screen, auto-lock and encrypted files (vault.js).
// Lists that were already encrypted still ask for their passphrase either way.
const ENCRYPT_NEW_LISTS = false;

// Who the sessions are for: a patient (saved to their history) or demo mode (nothing saved).
const ctx = { mode: null, patient: null, revealTimer: null };   // mode: null | "patient" | "demo"
let db = null, start = null;

const player = new AudioPlayer({
  base: "sounds/",
  onEnded: (clip) => engine.audioEnded(clip),
});

const engine = new StellaEngine({
  onBoard: renderBoard,
  onStatus: renderStatus,
  onAudio: ({ clip }) => {
    showCaption(CLIPS[clip] || transcriptFor(clip));
    player.play(clip);
  },
  onEvent: (e) => { if (window.__log) console.log("event", e); },
  onResults: (summary) => {
    state.lastSummary = summary;
    state.viewEvents = null; state.fromHistory = false;
    endRunUI();
    state.view = "results";
    saveToPatient(summary);
    render();
    bumpIdle();
  },
});

// ---------------------------------------------------------------- config panels

function activityForView() {
  return (state.view === "results" || state.view === "history") ? engine.config.activity : state.view;
}

function render() {
  // sidebar active state
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === state.view));
  $("#demoPill").textContent = state.demo ? "ON" : "OFF";
  $("#demoPill").classList.toggle("off", !state.demo);

  renderCtx();
  const showResults = state.view === "results", showHistory = state.view === "history";
  $("#config").hidden = showResults || showHistory;
  $("#results").hidden = !showResults;
  $("#history").hidden = !showHistory;
  if (showResults) renderResults();
  else if (showHistory) renderHistory();
  else renderConfig();
}

function renderConfig() {
  const a = activityForView();
  const c = engine.config;
  const el = $("#config");
  const isPong = a === "eye_pong";
  const isIC = a === "inhibition_challenge";
  const isMSB = a === "motor_sequence_builder";
  const isLF = a === "letter_find";
  const words = c.content === "words" && (a === "letter_target" || a === "letter_find" || isMSB);

  // Keyboard Layout applies to every activity. Key Labels ("blank" keycaps)
  // is only offered where the patient isn't required to find/read a letter —
  // Letter Find is audio-only and needs the letter visible to search for it,
  // so it's forced to "letters" (SPEC §1.3) and the control is hidden there.
  const sideLetters = zoneLettersForLayout(c.layout, c.side);
  const keyboardBlock = `
    <div class="field">
      <div class="label">Keyboard Layout</div>
      <div class="seg" id="layoutSeg">
        ${segBtn("qwerty", "QWERTY", c.layout !== "alphabetical")}
        ${segBtn("alphabetical", "Alphabetical", c.layout === "alphabetical")}
      </div>
    </div>
    <div class="field">
      <div class="label">Keyboard Side</div>
      <div class="seg" id="sideSeg">
        ${segBtn("full", "Full", c.side === "full")}
        ${segBtn("left", "Left", c.side === "left")}
        ${segBtn("right", "Right", c.side === "right")}
      </div>
      <div class="hint" style="text-align:left">${c.side === "full"
        ? "all 30 keys"
        : `${c.side} five columns only &middot; ${sideLetters.length} letters: ${sideLetters.join(" ")}. The other side stays dark, and a press there is recorded but never scored.`}</div>
    </div>
    ${isLF ? "" : `
    <div class="field">
      <div class="label">Key Labels</div>
      <div class="seg" id="keyLabelSeg">
        ${segBtn("letters", "Show letters", c.key_label !== "blank")}
        ${segBtn("blank", "Blank", c.key_label === "blank")}
      </div>
      <div class="hint" style="text-align:left">blank keys still light up and respond to a press — useful once the patient doesn't need the letter cue</div>
    </div>`}`;

  const modeBlock = isPong ? `
    <div class="field">
      <div class="label">Mode</div>
      <div class="seg" id="modeSeg">
        ${segBtn("left_right", "Left / Right", c.pong_mode === "left_right")}
        ${segBtn("random", "Random", c.pong_mode === "random")}
      </div>
    </div>` : isIC ? "" : `
    <div class="field">
      <div class="label">Mode</div>
      <div class="seg" id="modeSeg">
        ${segBtn("letters", "Letters", c.content === "letters")}
        ${segBtn("words", "Words", c.content === "words")}
      </div>
      ${isMSB ? `<div class="hint" style="text-align:left">${c.content === "words"
        ? (c.side === "full" ? "prescribed words, nearest available length" : wordsForLength("all", sideLimit()).length
          ? `prescribed words that use only the ${c.side}-side letters (${wordsForLength("all", sideLimit()).length} on this layout), nearest available length`
          : `<span class="warnline">No words use only the ${c.side}-side letters on this layout. Choose another side or layout, or use Letters.</span>`)
        : `generated sequences from ${c.side === "full" ? "all 26" : "the " + sideLetters.length + " " + c.side + "-side"} letters`}</div>` : ""}
    </div>`;

  const primaryLabel = isPong ? "Target Changes" : isIC ? "Trials" : isMSB ? "Sequences" : "Exercise Duration";
  const primaryScale = isPong ? ["1 change", "10 changes"]
    : isIC ? ["1 trial", "10 trials"]
    : isMSB ? ["1 sequence", "10 sequences"]
    : ["1 " + (words ? "word" : "letter"), "10 " + (words ? "words" : "letters")];
  const primaryBlock = `
    <div class="field">
      <div class="label">${primaryLabel}</div>
      <div class="slider-row">
        <input type="range" id="itemsRange" min="1" max="10" step="1" value="${c.items}" />
        <div class="bubble" id="itemsBubble">${c.items}</div>
      </div>
      <div class="scale"><span>${primaryScale[0]}</span><span>${primaryScale[1]}</span></div>
    </div>`;

  const wordLengthBlock = (words && !isMSB) ? `
    <div class="field">
      <div class="label">Word Length</div>
      <div class="seg" id="wlSeg">
        ${segBtn("0-5", "0–5", c.word_length === "0-5")}
        ${segBtn("5-10", "5–10", c.word_length === "5-10")}
        ${segBtn("10+", "10+", c.word_length === "10+")}
      </div>
      <div class="hint" style="text-align:left">${wordListHint(c.word_length)}</div>
    </div>` : "";

  const icBlock = isIC ? `
    <div class="field">
      <div class="label">Response Window</div>
      <div class="slider-row">
        <input type="range" id="windowRange" min="500" max="10000" step="250" value="${c.response_window_ms}" />
        <div class="bubble" id="windowBubble">${formatWindow(c.response_window_ms)}</div>
      </div>
      <div class="scale"><span>Fast (0.5 s)</span><span>Relaxed (10 s)</span></div>
    </div>
    <div class="field">
      <div class="label">No-Go trials</div>
      <div class="slider-row">
        <input type="range" id="nogoRange" min="0" max="80" step="5" value="${c.nogo_percent}" />
        <div class="bubble" id="nogoBubble">${c.nogo_percent}%</div>
      </div>
    </div>
    <div class="field">
      <div class="label">Wait trials</div>
      <div class="slider-row">
        <input type="range" id="waitRange" min="0" max="50" step="5" value="${c.wait_percent}" />
        <div class="bubble" id="waitBubble">${c.wait_percent}%</div>
      </div>
      <div class="hint" style="text-align:left">remaining ${Math.max(0, 100 - c.nogo_percent - c.wait_percent)}% are Go trials</div>
    </div>` : "";

  const msbBlock = isMSB ? `
    <div class="field">
      <div class="label">Starting Length</div>
      <div class="slider-row">
        <input type="range" id="seqLenRange" min="2" max="5" step="1" value="${c.sequence_start_length}" />
        <div class="bubble" id="seqLenBubble">${c.sequence_start_length}</div>
      </div>
      <div class="scale"><span>2 letters</span><span>5 letters</span></div>
    </div>
    <div class="field">
      <div class="label">Progression</div>
      <div class="seg" id="progSeg">
        ${segBtn("on", "Increase each sequence", c.sequence_progression)}
        ${segBtn("off", "Fixed length", !c.sequence_progression)}
      </div>
    </div>` : "";

  const beatTempoBlock = `
    <div class="field">
      <div class="label">Beat</div>
      <div class="seg" id="beatSeg">
        ${segBtn("none", "None", c.beat === "none")}
        ${segBtn("metronome", "Metronome", c.beat === "metronome")}
        ${segBtn("music", "Music", c.beat === "music")}
      </div>
    </div>

    <div class="field" style="${c.beat === "none" ? "opacity:.4;pointer-events:none" : ""}">
      <div class="label">Tempo</div>
      <div class="slider-row">
        <input type="range" id="tempoRange" min="30" max="120" step="1" value="${c.tempo_bpm}" />
        <div class="bubble" id="tempoBubble">${c.tempo_bpm} BPM</div>
      </div>
      <div class="scale"><span>Slow (30)</span><span>Fast (120)</span></div>
    </div>`;

  el.innerHTML = `
    ${repeatBannerHtml()}
    ${keyboardBlock}
    ${modeBlock}
    ${primaryBlock}
    ${wordLengthBlock}
    ${icBlock}
    ${msbBlock}
    ${beatTempoBlock}

    ${ctx.mode === "patient" ? `
    <div class="field">
      <div class="label">Patient</div>
      <div class="patient-line">${esc(ctx.patient.id)}</div>
      <div class="hint" style="text-align:left">results and exports carry this ID, never the name</div>
    </div>` : `
    <div class="field">
      <div class="label">Participant (optional)</div>
      <input type="text" id="participantInput" class="text-input" maxlength="32"
        placeholder="e.g. demo participant"
        value="${escapeAttr(c.participant || "")}" />
    </div>`}

    <div class="start-wrap">
      <button class="btn-start" id="startBtn" ${wordsMissing(a, c) ? "disabled" : ""}>Start</button>
      <div class="hint">${title(a)} &middot;
        ${state.demo ? "Auto-press on: the correct key presses itself" : "click keys to respond"}</div>
    </div>
  `;

  $("#layoutSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ layout: v }); renderConfig();
  });
  $("#sideSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ side: v }); renderConfig();
  });
  $("#keyLabelSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ key_label: v }); renderConfig();
  });
  $("#modeSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure(isPong ? { pong_mode: v } : { content: v });
    renderConfig();
  });
  $("#wlSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ word_length: v }); renderConfig();
  });
  $("#beatSeg").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ beat: v }); renderConfig();
  });
  $("#progSeg")?.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v; if (!v) return;
    engine.configure({ sequence_progression: v === "on" }); renderConfig();
  });
  bindRange("#itemsRange", "#itemsBubble", (v) => v, (v) => engine.configure({ items: +v }));
  bindRange("#tempoRange", "#tempoBubble", (v) => v + " BPM",
    (v) => engine.configure({ tempo_bpm: +v }));
  bindRange("#windowRange", "#windowBubble", (v) => formatWindow(+v),
    (v) => engine.configure({ response_window_ms: +v }));
  bindRange("#nogoRange", "#nogoBubble", (v) => v + "%",
    (v) => { engine.configure({ nogo_percent: +v }); renderConfig(); });
  bindRange("#waitRange", "#waitBubble", (v) => v + "%",
    (v) => { engine.configure({ wait_percent: +v }); renderConfig(); });
  bindRange("#seqLenRange", "#seqLenBubble", (v) => v,
    (v) => engine.configure({ sequence_start_length: +v }));
  $("#participantInput")?.addEventListener("input", (e) =>
    engine.configure({ participant: e.target.value.slice(0, 32) }));
  $("#startBtn").addEventListener("click", startRun);
}

// Words that can be used with the current layout and side. "full" = the whole list; a side keeps only words spelled with
// that side's letters (SPEC §1.4), so the list is much shorter and depends on the layout.
function sideLimit() {
  const c = engine.config;
  return c.side === "full" ? null : zoneLettersForLayout(c.layout, c.side);
}
function wordListHint(bucket) {
  const c = engine.config;
  const words = wordsForLength(bucket, sideLimit());
  if (!words.length) {
    return c.side === "full" ? "no prescribed words in this bucket"
      : `<span class="warnline">No words of this length use only the ${c.side}-side letters on this layout. Choose another length, side or layout, or use Letters.</span>`;
  }
  const shown = words.slice(0, 12);
  const more = words.length - shown.length;
  const scope = c.side === "full" ? "" : ` use only ${c.side}-side letters`;
  const few = c.side !== "full" && words.length < c.items
    ? ` <span class="warnline">Only ${words.length}: some words will repeat in a ${c.items}-item session.</span>` : "";
  return `${words.length} word${words.length === 1 ? "" : "s"}${scope} &middot; ${shown.join(", ")}${more > 0 ? `, +${more} more` : ""}${few}`;
}
// Words mode needs at least one word that fits; otherwise Start is disabled.
function wordsMissing(activity, c) {
  if (c.content !== "words") return false;
  if (activity === "motor_sequence_builder") return !wordsForLength("all", sideLimit()).length;
  if (activity === "letter_target" || activity === "letter_find") return !wordsForLength(c.word_length, sideLimit()).length;
  return false;
}
function formatWindow(ms) {
  return (ms / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " s";
}
function segBtn(v, label, on) {
  return `<button data-v="${v}" class="${on ? "on" : ""}">${label}</button>`;
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function bindRange(rangeSel, bubbleSel, fmt, commit) {
  const r = $(rangeSel), b = $(bubbleSel);
  if (!r || !b) return;   // not every activity's config panel has every slider
  r.addEventListener("input", () => { b.textContent = fmt(r.value); });
  r.addEventListener("change", () => commit(r.value));
}

// ---------------------------------------------------------------- run overlay

function startRun() {
  state.repeatNote = null;
  player.unlock();
  state.running = true;
  buildBoardGrid();
  $("#overlay").hidden = false;
  $("#simNote").textContent = state.demo
    ? "Auto-press: the correct key presses itself. Click Early-stop (×) any time."
    : "Simulator: click a green / lit key to register a press.";
  engine.start();
  if (engine.config.beat !== "none") {
    player.startBeat(engine.config.beat, engine.config.tempo_bpm, () => {
      flashBeat();
      engine.beatTick();   // feeds rhythm-consistency metrics (SPEC §6.2/§8)
    });
  }
  state.tickTimer = setInterval(() => engine.tick(), 80);
}

function endRunUI() {
  state.running = false;
  player.stopBeat();
  clearInterval(state.tickTimer); state.tickTimer = null;
  clearTimeout(state.autoTimer); state.autoTimer = null;
  $("#overlay").hidden = true;
}

$("#closeBtn").addEventListener("click", () => engine.stop("clinician_stopped"));

// ---------------------------------------------------------------- board

function buildBoardGrid() {
  const board = $("#board");
  board.innerHTML = "";
  const blank = engine.config.key_label === "blank";
  for (const row of keyRowsForLayout(engine.config.layout, engine.config.side)) {
    const r = document.createElement("div");
    r.className = "row";
    for (const k of row) {
      const el = document.createElement("div");
      const hasLetter = k.letter !== "";
      // Every position has a working switch (SPEC §1.2) — all 30 keys are
      // clickable. Lettered keys start idle (blue); the reserved positions
      // (which 4 ids depends on the layout, SPEC §1.1/§1.2) have no letter
      // and sit dark until pressed. "Blank" key labels (SPEC §1.3) suppress
      // the printed letter but not the underlying letter identity/scoring.
      el.className = "key live";
      el.dataset.id = k.id;
      el.dataset.color = hasLetter ? "idle" : "off";
      el.innerHTML = `<div class="disc"><span>${hasLetter && !blank ? k.letter : ""}</span></div>`;
      el.addEventListener("click", () => engine.press(k.id));
      r.appendChild(el);
    }
    board.appendChild(r);
  }
}

function renderBoard({ keys }) {
  for (const k of keys) {
    const el = document.querySelector(`.key[data-id="${k.id}"]`);
    if (!el) continue;
    el.dataset.color = k.color;
    if (k.color === "invalid") {
      setTimeout(() => {
        if (el.dataset.color === "invalid") el.dataset.color = k.letter ? "idle" : "off";
      }, 400);
    }
  }
  if (state.demo && state.running) scheduleAutoPress();
}

function flashBeat() {
  if (!state.running) return;
  document.querySelectorAll(".key.live").forEach((el) => {
    if (el.dataset.color === "idle") {
      el.dataset.color = "beat";
      setTimeout(() => { if (el.dataset.color === "beat") el.dataset.color = "idle"; }, 260);
    }
  });
}

// Hands-free demo: after a target appears, press the correct key automatically.
// Inhibition Challenge: only Go cues get pressed — No-Go/Wait are correctly
// left alone so the response window can time out into "successful inhibition".
function scheduleAutoPress() {
  clearTimeout(state.autoTimer);
  const s = engine.getState().session;
  if (!s || engine.config.activity === "eye_pong") return;
  if (engine.phase !== "response") return;
  if (engine.config.activity === "inhibition_challenge" && engine.icCueType !== "go") return;
  const target = engine.expectedTargetId;
  if (!target) return;
  const delay = 450 + Math.random() * 700;
  state.autoTimer = setTimeout(() => {
    if (state.running && engine.phase === "response") engine.press(target);
  }, delay);
}

// ---------------------------------------------------------------- status

function renderStatus(s) {
  if (!state.running) return;
  if (s.activity === "eye_pong") {
    $("#progress").textContent = s.items ? `Target ${s.item} of ${s.items}` : "";
  } else if (s.activity === "inhibition_challenge") {
    $("#progress").textContent = s.items ? `Trial ${s.item} of ${s.items}` : "";
  } else if (s.activity === "motor_sequence_builder") {
    $("#progress").textContent = `Sequence ${s.item} of ${s.items}` +
      (s.trials > 1 ? `  ·  letter ${s.trial} of ${s.trials}` : "");
  } else {
    $("#progress").textContent =
      `Item ${s.item} of ${s.items}` + (s.trials > 1 ? `  ·  letter ${s.trial} of ${s.trials}` : "");
  }
  if (s.prompt_text) showCaption(s.prompt_text);
  if (state.demo && s.state === "response") scheduleAutoPress();
}

let captionHold = 0;
function showCaption(text) {
  const now = Date.now();
  if (now < captionHold && text && text.length < 24) return;
  $("#caption").textContent = text || "";
  if (text && text.length > 24) captionHold = now + 900;
}

function transcriptFor(clip) {
  if (clip.startsWith("letter_")) return clip.slice(-1).toUpperCase();
  if (clip.startsWith("word_")) return clip.slice(5).toUpperCase();
  if (clip.startsWith("spell_")) return "Spell " + clip.slice(6).toUpperCase() + ". Ready, go.";
  return clip.replace(/_/g, " ");
}

// ---------------------------------------------------------------- results

function renderResults() {
  const el = $("#results");
  const sm = state.lastSummary;
  if (!sm) {
    el.innerHTML = `<div class="empty">No results yet. Complete an activity to see results here.</div>`;
    return;
  }
  const m = sm.metrics;
  const tile = (v, k) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const pctv = (x) => x == null ? "—" : Math.round(x * 100) + "%";
  const pv = (x) => x == null ? "—" : x + "%";
  const ms = (x) => x == null ? "—" : x + " ms";

  let tiles = "", tables = "";

  if (sm.activity === "eye_pong") {
    tiles = `<div class="tiles">
      ${tile(sm.counts.items_completed + "/" + sm.settings.items, "Target changes completed")}
      ${tile(sm.settings.tempo_bpm + " BPM", "Tempo")}
      ${tile(sm.settings.pong_mode.replace("_", " / "), "Mode")}
    </div>`;
    tables = `<p class="guardrail">Eye Pong ran ${sm.counts.items_started} of
      ${sm.settings.items} programmed target changes at ${sm.settings.tempo_bpm} BPM
      (${sm.settings.pong_mode.replace("_", "/")} mode), ending
      "${sm.end_reason}". No eye-movement data is measured or reported.</p>`;

  } else if (sm.activity === "inhibition_challenge") {
    const im = sm.ic_metrics || {};
    tiles = `<div class="tiles">
      ${tile(sm.counts.items_completed + "/" + sm.settings.items, "Trials completed")}
      ${tile(pv(im.go_trial_accuracy), "Go-trial accuracy")}
      ${tile(pv(im.nogo_inhibition_accuracy), "No-Go inhibition accuracy")}
      ${tile(pv(im.false_response_rate), "False-response rate")}
      ${tile(pv(im.missed_go_rate), "Missed-Go rate")}
      ${tile(ms(im.mean_go_response_latency_ms), "Mean Go response latency")}
    </div>`;
    if (sm.ic_by_cue_type?.length) {
      tables = `<table class="grid"><thead><tr>
        <th>Cue type</th><th>Trials</th><th>Accuracy</th></tr></thead><tbody>` +
        sm.ic_by_cue_type.map((r) => `<tr><td>${r.cue_type}</td><td>${r.trials}</td>
          <td>${pv(r.accuracy)}</td></tr>`).join("") + `</tbody></table>`;
    }
    tables += `<p class="guardrail">Response window ${sm.settings.response_window_ms} ms &middot;
      cue mix ${100 - sm.settings.nogo_percent - sm.settings.wait_percent}% Go /
      ${sm.settings.nogo_percent}% No-Go / ${sm.settings.wait_percent}% Wait.</p>`;

  } else if (sm.activity === "motor_sequence_builder") {
    const mm = sm.msb_metrics || {};
    tiles = `<div class="tiles">
      ${tile(sm.counts.items_completed + "/" + sm.settings.items, "Sequences completed")}
      ${tile(pctv(mm.sequence_completion_rate), "Sequence completion rate")}
      ${tile(mm.first_attempt_sequence_accuracy == null ? "—" : mm.first_attempt_sequence_accuracy + "%",
        "First-attempt sequence accuracy")}
      ${tile(mm.longest_completed_sequence ?? "—", "Longest completed sequence")}
    </div>`;
    if (sm.by_sequence?.length) {
      tables += `<table class="grid"><thead><tr>
        <th>Sequence</th><th>Length</th><th>1st-attempt acc.</th>
        <th>Completion time</th><th>Inter-key</th></tr></thead><tbody>` +
        sm.by_sequence.map((r) => `<tr><td>${r.sequence}</td><td>${r.length}</td>
          <td>${r.first_attempt_accuracy == null ? "—" : r.first_attempt_accuracy + "%"}</td>
          <td>${ms(r.completion_time_ms)}</td><td>${ms(r.inter_key_interval_ms)}</td></tr>`).join("") +
        `</tbody></table>`;
    }
    if (mm.accuracy_by_position?.length) {
      tables += `<table class="grid"><thead><tr>
        <th>Position</th><th>Accuracy</th></tr></thead><tbody>` +
        mm.accuracy_by_position.map((r) => `<tr><td>${r.position}</td>
          <td>${pv(r.accuracy)}</td></tr>`).join("") + `</tbody></table>`;
    }

  } else {
    // Letter Target / Letter Find
    tiles = `<div class="tiles">
      ${tile(sm.counts.items_completed + "/" + sm.counts.items_started, "Items completed / started")}
      ${tile(pctv(m.item_completion_rate), "Item completion rate")}
      ${tile(pctv(m.first_attempt_accuracy), "First-attempt accuracy")}
      ${tile(pctv(m.eventual_accuracy), "Eventual accuracy")}
      ${tile(ms(m.mean_correct_response_latency_ms), "Mean correct-response latency")}
      ${tile(ms(m.median_correct_response_latency_ms), "Median correct-response latency")}
      ${tile(ms(m.mean_first_response_latency_ms), "Mean first-response latency")}
      ${tile(m.latency_sd_ms == null ? "—" : m.latency_sd_ms + " ms", "Latency SD")}
      ${tile(m.mean_incorrect_attempts_per_trial, "Mean incorrect attempts / trial")}
    </div>`;
    if (sm.by_key?.length) {
      tables += `<table class="grid"><thead><tr>
        <th>Letter</th><th>Trials</th><th>1st-attempt acc.</th>
        <th>Mean correct latency</th><th>Incorrect</th><th>Beat</th></tr></thead><tbody>` +
        sm.by_key.map((r) => `<tr><td>${r.letter}</td><td>${r.trials}</td>
          <td>${r.first_attempt_accuracy == null ? "—" : r.first_attempt_accuracy + "%"}</td>
          <td>${ms(r.mean_correct_latency_ms)}</td><td>${r.incorrect_attempts}</td>
          <td>${r.beat}</td></tr>`).join("") + `</tbody></table>`;
    }
    if (sm.by_word?.length) {
      tables += `<table class="grid"><thead><tr>
        <th>Word</th><th>Length</th><th>Trials</th><th>1st-attempt acc.</th>
        <th>Completion time</th><th>Inter-key</th><th>Beat</th></tr></thead><tbody>` +
        sm.by_word.map((r) => `<tr><td>${r.word}</td><td>${r.length}</td><td>${r.trials}</td>
          <td>${r.first_attempt_accuracy == null ? "—" : r.first_attempt_accuracy + "%"}</td>
          <td>${ms(r.completion_time_ms)}</td><td>${ms(r.inter_key_interval_ms)}</td>
          <td>${r.beat}</td></tr>`).join("") + `</tbody></table>`;
    }
  }

  el.innerHTML = `
    ${state.fromHistory ? `<div class="back-row"><button class="btn small" id="backHistory">&larr; Back to history</button>
      <button class="btn small" id="repeatFromResults">Repeat this exercise</button></div>` : ""}
    <h2>${title(sm.activity)} — ${sm.session_id}
      ${sm.participant ? " · " + sm.participant : ""}
      <span style="color:var(--muted);font-weight:400;font-size:13px">(${sm.end_reason})</span></h2>
    ${noteHtml()}
    ${tiles}
    ${tables}
    ${metricsForTomBlock(sm)}
    <div class="export-row">
      <button class="btn" id="expJsonl">Export events (JSONL)</button>
      <button class="btn" id="expCsv">Export events (CSV)</button>
      <button class="btn" id="expSummary">Export summary (JSON)</button>
    </div>
    <p class="guardrail">${sm.guardrail_note}</p>
  `;

  $("#backHistory")?.addEventListener("click", () => { state.view = "history"; state.fromHistory = false; render(); });
  $("#repeatFromResults")?.addEventListener("click", () => { if (state.viewRecord) repeatSession(state.viewRecord); });
  const evs = () => (state.viewEvents ?? engine.lastEvents) || [];
  $("#expJsonl").onclick = () =>
    download(`${sm.session_id}.events.jsonl`, eventsToJsonl(evs()));
  $("#expCsv").onclick = () =>
    download(`${sm.session_id}.events.csv`, eventsToCsv(evs()));
  $("#expSummary").onclick = () =>
    download(`${sm.session_id}.summary.json`, JSON.stringify(sm, null, 2));
}

// "Metrics for Tom" (product-owner spec, SPEC.md §6.2.1) — targeting,
// response-timing, rhythm, directional, and sequence-performance metrics.
// Present (non-null) only for Letter Target / Letter Find / Motor Sequence
// Builder; returns "" for Eye Pong / Inhibition Challenge so nothing renders.
function metricsForTomBlock(sm) {
  const tm = sm.targeting_metrics, rt = sm.response_timing_metrics,
    rm = sm.rhythm_metrics, dm = sm.directional_metrics, sp = sm.sequence_performance;
  if (!tm && !rt && !rm && !dm && !sp) return "";

  const tile = (v, k) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const pv = (x) => x == null ? "—" : x + "%";
  const ms = (x) => x == null ? "—" : x + " ms";

  let tiles = "";
  if (tm) tiles += `
    ${tile(tm.total_attempts, "Total attempts")}
    ${tile(tm.correct_hits, "Correct hits")}
    ${tile(pv(tm.accuracy_pct), "Accuracy")}
    ${tile(pv(tm.first_attempt_success_rate_pct), "First-attempt success rate")}
    ${tile(tm.mean_miss_distance == null ? "—" : tm.mean_miss_distance, "Mean miss distance (grid cells)")}`;
  if (rt) tiles += `
    ${tile(ms(rt.mean_response_latency_ms), "Mean response latency (all attempts)")}
    ${tile(rt.latency_sd_ms == null ? "—" : rt.latency_sd_ms + " ms", "Response latency SD")}`;
  if (rm) tiles += `
    ${tile(pv(rm.on_beat_accuracy_pct), `On-beat accuracy (±${rm.on_beat_window_ms} ms)`)}
    ${tile(rm.timing_variability_ms == null ? "—" : rm.timing_variability_ms + " ms", "Beat-offset variability")}`;
  if (dm) tiles += `
    ${tile(dm.dominant_direction, "Dominant error direction")}
    ${tile(pv(dm.directional_consistency_pct), "Directional consistency")}`;
  if (sp) tiles += `
    ${tile(pv(sp.sequence_completion_rate_pct), "Sequence completion rate")}
    ${tile(sp.most_common_breakdown_position ?? "—", "Most common breakdown position")}`;

  let extraTables = "";
  if (dm && dm.error_counts && Object.keys(dm.error_counts).length) {
    extraTables += `<table class="grid"><thead><tr>
      <th>Error direction</th><th>Count</th></tr></thead><tbody>` +
      Object.entries(dm.error_counts).map(([dir, n]) =>
        `<tr><td>${dir}</td><td>${n}</td></tr>`).join("") + `</tbody></table>`;
  }
  if (sp && sp.letters_completed_per_item?.length) {
    extraTables += `<table class="grid"><thead><tr>
      <th>Item</th><th>Letters in item</th><th>Letters completed</th></tr></thead><tbody>` +
      sp.letters_completed_per_item.map((r) =>
        `<tr><td>${r.item_index + 1}</td><td>${r.letters_in_item}</td><td>${r.letters_completed}</td></tr>`)
        .join("") + `</tbody></table>`;
  }

  return `
    <div class="section-label">Additional metrics (product-owner spec)</div>
    <div class="tiles">${tiles}</div>
    ${extraTables}`;
}

function title(a) {
  return {
    letter_target: "Letter Target", letter_find: "Letter Find", eye_pong: "Eye Pong",
    inhibition_challenge: "Inhibition Challenge", motor_sequence_builder: "Motor Sequence Builder",
  }[a] || a;
}
function download(name, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- nav

document.querySelectorAll(".nav-item, .nav-foot[data-view]").forEach((n) => {
  if (!n.dataset.view) return;
  n.addEventListener("click", () => {
    state.view = n.dataset.view;
    state.fromHistory = false;
    state.repeatNote = null;
    if (state.view !== "results" && state.view !== "history" && state.view !== engine.config.activity)
      engine.configure({ activity: state.view });
    if (state.view === "history" && ctx.mode === "patient") db.audit("history_viewed", { patient: ctx.patient.id });
    render();
  });
});
$("#demoToggle").addEventListener("click", () => { state.demo = !state.demo; render(); });

// ---------------------------------------------------------------- patients: context, history, saving, locking

function renderCtx() {
  const el = $("#ctx");
  document.querySelectorAll(".patient-only").forEach((n) => {
    n.hidden = ctx.mode !== "patient" || (n.id === "navLock" && !db.encrypted);     // no Lock button for a plain list
  });
  if (!ctx.mode) { el.hidden = true; return; }
  el.hidden = false;
  if (ctx.mode === "demo") {
    el.className = "ctx demo";
    el.innerHTML = `<div class="ctx-k">DEMO MODE</div><div class="ctx-note">No patient. Nothing is saved.</div>
      <button class="lnk" id="ctxBack">Back to patients</button>`;
  } else {
    const shown = !!ctx.revealTimer;
    el.className = "ctx";
    el.innerHTML = `<div class="ctx-k">PATIENT</div><div class="ctx-id">${esc(ctx.patient.id)}</div>
      <div class="ctx-name ${shown ? "shown" : ""}"><span>${esc(shown ? ctx.patient.name : initials(ctx.patient.name))}</span>
        <button class="lnk" id="ctxReveal">${shown ? "Hide" : "Show"}</button></div>
      <button class="lnk" id="ctxBack">Switch patient</button>`;
    $("#ctxReveal").onclick = () => {
      if (ctx.revealTimer) { hideCtxName(); return; }
      ctx.revealTimer = setTimeout(hideCtxName, 15000);
      db.audit("name_shown", { patient: ctx.patient.id });
      renderCtx();
    };
  }
  $("#ctxBack").onclick = leaveToStart;
}

function hideCtxName() {
  clearTimeout(ctx.revealTimer); ctx.revealTimer = null;
  if (ctx.mode) renderCtx();
}

function resetViews() {
  state.lastSummary = null; state.viewEvents = null; state.fromHistory = false; state.saveNote = null;
  state.viewRecord = null; state.repeatNote = null;
}

function enterPatient(p) {
  ctx.mode = "patient"; ctx.patient = { id: p.id, name: p.name };
  engine.configure({ participant: p.id });               // the ID is the only thing the engine, log and exports ever see
  resetViews();
  state.view = engine.config.activity;
  document.body.dataset.screen = "app";
  render();
  bumpIdle();
}

function enterDemo() {
  ctx.mode = "demo"; ctx.patient = null;
  engine.configure({ participant: "" });
  resetViews();
  state.view = engine.config.activity;
  document.body.dataset.screen = "app";
  render();
  bumpIdle();
}

function leaveToStart() {
  clearTimeout(ctx.revealTimer); ctx.revealTimer = null;
  ctx.mode = null; ctx.patient = null;
  engine.configure({ participant: "" });
  resetViews();
  start.show();
  bumpIdle();
}

async function lockNow(reason) {
  clearTimeout(ctx.revealTimer); ctx.revealTimer = null;
  ctx.mode = null; ctx.patient = null;
  engine.configure({ participant: "" });
  resetViews();
  clearTimeout(idleTimer);
  await start.lock(reason);
}

// Auto-lock: after state.idleMs without a click, key press or touch - but never in the middle of an exercise.
let idleTimer = null;
function bumpIdle() {
  clearTimeout(idleTimer);
  if (db && db.encrypted && db.unlocked) idleTimer = setTimeout(() => { if (state.running) bumpIdle(); else lockNow("idle"); }, state.idleMs);
}
["pointerdown", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, bumpIdle, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { start?.maskAll(); hideCtxName(); }
});
$("#navLock").addEventListener("click", () => lockNow("manual"));

function saveToPatient(summary) {
  if (ctx.mode !== "patient") {
    state.saveNote = { kind: "demo", text: "Demo mode: this session was not saved." };
    return;
  }
  const id = ctx.patient.id, events = [...(engine.lastEvents || [])];
  state.saveNote = { kind: "pending", text: "Saving to the card…" };
  db.saveSession(id, summary, events, { ...summary.settings })
    .then(() => { state.saveNote = { kind: "ok", text: `Saved to ${id}'s history.` }; })
    .catch((e) => { state.saveNote = { kind: "err", text: `Could not save to the card (${e.message}). Export the results below so they are not lost.` }; })
    .finally(() => { if (state.view === "results" && !state.fromHistory) renderResults(); });
}
function noteHtml() {
  const n = state.saveNote;
  return n && !state.fromHistory ? `<p class="savenote ${n.kind}" role="status">${esc(n.text)}</p>` : "";
}

function headline(sm) {
  const c = sm.counts || {}, m = sm.metrics || {};
  const pctv = (x) => x == null ? "—" : Math.round(x * 100) + "%";
  const pv = (x) => x == null ? "—" : x + "%";
  if (sm.activity === "eye_pong") return `${c.items_completed}/${sm.settings.items} target changes`;
  if (sm.activity === "inhibition_challenge")
    return `${c.items_completed}/${sm.settings.items} trials · go accuracy ${pv((sm.ic_metrics || {}).go_trial_accuracy)}`;
  if (sm.activity === "motor_sequence_builder")
    return `${c.items_completed}/${sm.settings.items} sequences · ${pctv((sm.msb_metrics || {}).sequence_completion_rate)} completed`;
  return `${c.items_completed}/${c.items_started} items · ${pctv(m.first_attempt_accuracy)} first attempt`;
}

async function renderHistory() {
  const el = $("#history");
  if (ctx.mode !== "patient") { el.innerHTML = ""; return; }
  const id = ctx.patient.id;
  el.innerHTML = `<h2>History — ${esc(id)}</h2><p class="muted">Loading…</p>`;
  let list;
  try { list = await db.getHistory(id); }
  catch (e) {
    if (state.view === "history") el.innerHTML = `<h2>History — ${esc(id)}</h2><p class="err">Could not read the history: ${esc(e.message)}</p>`;
    return;
  }
  if (state.view !== "history" || ctx.mode !== "patient" || ctx.patient.id !== id) return;
  if (!list.length) {
    el.innerHTML = `<h2>History — ${esc(id)}</h2><div class="empty">No saved sessions for ${esc(id)} yet. Complete an activity and it will appear here.</div>`;
    return;
  }
  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " +
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  el.innerHTML = `
    <h2>History — ${esc(id)} <span style="color:var(--muted);font-weight:400;font-size:13px">(${list.length} saved session${list.length === 1 ? "" : "s"})</span></h2>
    <p class="muted" style="margin:-8px 0 14px">Results shows what happened. Repeat loads the exercise settings so you can run it again.</p>
    <div class="tablewrap"><table class="grid history"><thead><tr>
      <th>Exercise</th><th>Settings</th><th>Result</th><th><span class="sr">Actions</span></th></tr></thead><tbody>` +
    list.map((r, i) => `<tr>
      <td><div class="when">${esc(title(r.summary.activity))}</div><div class="sub">${esc(when(r.saved_at))}</div></td>
      <td class="settings">${esc(settingsLine(recordConfig(r) || {}))}</td>
      <td>${esc(headline(r.summary))}${r.summary.end_reason && r.summary.end_reason !== "completed" ? `<div class="sub">stopped early</div>` : ""}</td>
      <td class="num"><div class="hist-actions"><button class="btn small" data-results="${i}">Results</button>
        <button class="btn small" data-repeat="${i}">Repeat</button></div></td></tr>`).join("") +
    `</tbody></table></div>`;
  el.querySelectorAll("button[data-results]").forEach((b) => b.addEventListener("click", async () => {
    const rec = list[+b.dataset.results];
    try { state.viewEvents = await db.loadEvents(rec.record_id); }
    catch (e) { state.viewEvents = []; }
    state.lastSummary = rec.summary; state.viewRecord = rec; state.fromHistory = true; state.saveNote = null;
    state.view = "results";
    render();
  }));
  el.querySelectorAll("button[data-repeat]").forEach((b) => b.addEventListener("click", () => repeatSession(list[+b.dataset.repeat])));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// One line describing how an exercise was set up, for the History list.
function settingsLine(c) {
  const bits = [c.layout === "alphabetical" ? "Alphabetical" : "QWERTY"];
  if (c.side && c.side !== "full") bits.push(`${c.side} side`);
  if (c.key_label === "blank") bits.push("blank keys");
  if (c.activity === "eye_pong") {
    bits.push(c.pong_mode === "random" ? "random" : "left / right", plural(c.items, "target"), `${c.tempo_bpm} BPM`);
  } else if (c.activity === "inhibition_challenge") {
    bits.push(plural(c.items, "trial"), `${+(c.response_window_ms / 1000).toFixed(2)} s window`, `${c.nogo_percent}% no-go / ${c.wait_percent}% wait`);
  } else if (c.activity === "motor_sequence_builder") {
    bits.push(c.content === "words" ? "words" : "letters", plural(c.items, "sequence"),
      `length ${c.sequence_start_length}${c.sequence_progression ? "–" + c.sequence_max_length : ""}`);
  } else {
    bits.push(c.content === "words" ? `words ${c.word_length}` : "letters", plural(c.items, c.content === "words" ? "word" : "letter"));
    if (c.timeout_enabled) bits.push(`timeout ${+(c.timeout_ms / 1000).toFixed(1)} s`);
  }
  if (c.beat && c.beat !== "none" && c.activity !== "eye_pong") bits.push(`${c.beat} ${c.tempo_bpm} BPM`);
  return bits.join(" · ");
}

// "Repeat": put a saved exercise's settings back on the settings page exactly as they were. The person can change
// anything, or just press Start. (Words are still picked at random each run.)
function repeatSession(rec) {
  const cfg = recordConfig(rec);
  if (!cfg || ctx.mode !== "patient") return;
  engine.loadConfig({ ...cfg, participant: ctx.patient.id });
  state.view = engine.config.activity;
  state.fromHistory = false; state.saveNote = null; state.viewRecord = null;
  state.repeatNote = { activity: engine.config.activity, when: rec.saved_at, words: engine.config.content === "words" };
  render();
  window.scrollTo(0, 0);
}
function repeatBannerHtml() {
  const n = state.repeatNote;
  if (!n) return "";
  const d = new Date(n.when);
  const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `<p class="savenote ok" role="status">Settings loaded from the ${esc(title(n.activity))} session of ${esc(when)}.
    Change anything you like, then press Start.${n.words ? " Words are chosen at random each time." : ""}</p>`;
}

// dev handle — inspect engine.lastEvents / engine.lastSummary from the console
window.__stella = { engine, player, state, ctx };

loadWords().then(async () => {
  // preload the clip set — all 26 letters plus every prescribed word
  player.preload(Object.keys(CLIPS).concat(
    LETTERS.map((x) => "letter_" + x.toLowerCase()),
    LETTERS.map((x) => "lf_letter_" + x.toLowerCase()),
    WORDS.map((w) => "spell_" + w.toLowerCase()),
    WORDS.map((w) => "word_" + w.toLowerCase()),
  ));
  const card = await openCard();
  db = new PatientDb(card);
  start = new StartScreen({ el: $("#start"), db, card, onPatient: enterPatient, onDemo: enterDemo,
    idleMinutes: Math.round(state.idleMs / 60000), encrypt: ENCRYPT_NEW_LISTS });
  Object.assign(window.__stella, { db, start, card, bumpIdle });
  await start.init();
  render();
});
