// Stella prototype — shared content constants. Mirrors SPEC.md §1 and §3.
// Keep this file in lock-step with firmware/core/stella_content.c and stella_keys.c.

// Physical grid: 30 positions, 3 rows x 10 columns (SPEC §1.1). Row/column are
// fixed by id regardless of keyboard layout — only which LETTER sits at a
// given id changes between layouts (see LAYOUTS below).
export const ALL_IDS = Array.from({ length: 30 }, (_, i) => i + 1);
export const KEY_ROW_IDS = [ALL_IDS.slice(0, 10), ALL_IDS.slice(10, 20), ALL_IDS.slice(20, 30)];
export const KEY_COLUMN = Object.fromEntries(ALL_IDS.map((id) => [id, (id - 1) % 10]));
export const KEY_ROW = Object.fromEntries(ALL_IDS.map((id) => [id, Math.floor((id - 1) / 10)]));

// SPEC §1.2 — QWERTY layout (default): vertically aligned, no stagger, ids
// 20/21/29/30 reserved (no letter).
const QWERTY_MAP = {
  1: "Q", 2: "W", 3: "E", 4: "R", 5: "T", 6: "Y", 7: "U", 8: "I", 9: "O", 10: "P",
  11: "A", 12: "S", 13: "D", 14: "F", 15: "G", 16: "H", 17: "J", 18: "K", 19: "L", 20: "",
  21: "", 22: "Z", 23: "X", 24: "C", 25: "V", 26: "B", 27: "N", 28: "M", 29: "", 30: "",
};

// SPEC §1.2 — Alphabetical layout: A-J fill row 1, K-T fill row 2 (both rows
// full, no reserved positions), and the last 6 letters (U-Z) sit centered in
// row 3 — 2 reserved positions on each side.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ALPHABETICAL_MAP = (() => {
  const m = {};
  for (let i = 0; i < 20; i++) m[i + 1] = ALPHABET[i];       // ids 1-20 -> A-T
  for (let i = 21; i <= 30; i++) m[i] = "";                   // row 3 starts all-reserved
  ALPHABET.slice(20).forEach((l, i) => { m[23 + i] = l; });   // ids 23-28 -> U-Z, centered
  return m;
})();

// SPEC §1.2 — which key ID shows which letter. The 4 reserved ("invalid",
// SPEC §4.0) positions move with the layout: QWERTY leaves ids 20/21/29/30
// blank; Alphabetical leaves ids 21/22/29/30 blank instead (row 3 centering).
export const LAYOUTS = { qwerty: QWERTY_MAP, alphabetical: ALPHABETICAL_MAP };
export const LAYOUT_NAMES = Object.keys(LAYOUTS);
export const DEFAULT_LAYOUT = "qwerty";

function layoutMap(layout) { return LAYOUTS[layout] || LAYOUTS[DEFAULT_LAYOUT]; }

// Keyboard side (SPEC §1.4): a session can be limited to the left or right half of the board. The split is by COLUMN, so it
// is the same for every layout: left = columns 1-5 (ids 1-5, 11-15, 21-25), right = columns 6-10. Which letters that is
// depends on the layout (QWERTY left = Q W E R T / A S D F G / Z X C V; alphabetical left = A-E / K-O / U V W).
export const SIDES = ["full", "left", "right"];
export const DEFAULT_SIDE = "full";
export function keyInSide(id, side) {
  if (side === "left") return KEY_COLUMN[id] <= 4;
  if (side === "right") return KEY_COLUMN[id] >= 5;
  return true;
}

/** All 30 {id, letter} pairs for a layout, grouped into 3 rows — for board rendering. Keys outside the chosen
 * side come back with an empty letter, so they draw dark like the reserved positions. */
export function keyRowsForLayout(layout, side = DEFAULT_SIDE) {
  const m = layoutMap(layout);
  return KEY_ROW_IDS.map((row) => row.map((id) => ({ id, letter: keyInSide(id, side) ? m[id] : "" })));
}
/** The functioning (lettered) keys for a layout that are inside the chosen side - 26 for "full". */
export function functioningKeysForLayout(layout, side = DEFAULT_SIDE) {
  const m = layoutMap(layout);
  return ALL_IDS.filter((id) => m[id] !== "" && keyInSide(id, side)).map((id) => ({ id, letter: m[id] }));
}
/** The 4 reserved, letterless positions for a layout (SPEC §1.1/§4.0). */
export function reservedKeysForLayout(layout) {
  const m = layoutMap(layout);
  return ALL_IDS.filter((id) => m[id] === "").map((id) => ({ id, letter: "" }));
}
/** Every key that stays dark and is not part of the exercise: the reserved positions plus, when a side is chosen,
 * all the lettered keys on the other side. A press on one is logged as `invalid_keypress`, never scored. */
export function invalidKeysForLayout(layout, side = DEFAULT_SIDE) {
  const m = layoutMap(layout);
  return ALL_IDS.filter((id) => m[id] === "" || !keyInSide(id, side)).map((id) => ({ id, letter: "" }));
}
/** The letters available on a side, in A-Z order. */
export function zoneLettersForLayout(layout, side = DEFAULT_SIDE) {
  return functioningKeysForLayout(layout, side).map((k) => k.letter).sort();
}
export function letterToIdForLayout(layout) {
  const m = layoutMap(layout);
  return Object.fromEntries(ALL_IDS.filter((id) => m[id] !== "").map((id) => [m[id], id]));
}
export function idToLetterForLayout(layout) {
  return { ...layoutMap(layout) };
}

// SPEC §3.1 — prescribed content. The 26-letter alphabet in canonical order —
// independent of physical layout; which key ID hosts a given letter comes
// from letterToIdForLayout() above. Used for "content: letters" cycling and
// Motor Sequence Builder's random-sequence generator.
export const LETTERS = ALPHABET;

// Small built-in fallback in case words.txt can't be fetched (e.g. opened via
// file:// with no server). Overwritten by loadWords() on a normal run.
export let WORDS = ["CAT", "DOG", "SUN", "BALL", "HOUSE"];

/** Fetch + parse sim/words.txt into WORDS. Call once at startup, before any
 * session starts. `#`-prefixed and blank lines are ignored; everything else
 * is upper-cased and letters-only-filtered so a stray typo in the file can't
 * produce a word the keyboard can't spell. */
export async function loadWords(url = "words.txt") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    const words = text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.toUpperCase())
      .filter((line) => /^[A-Z]+$/.test(line));
    if (words.length) WORDS = words;
  } catch (err) {
    console.warn(`words.txt not loaded (${err.message}); using the built-in fallback list.`);
  }
  return WORDS;
}

/** Words in a length bucket ("0-5", "5-10", "10+"; anything else = all). If `letters` is given, only words that are
 * spelled entirely with those letters - i.e. that fit on the chosen keyboard side. */
export function wordsForLength(bucket, letters = null) {
  const allowed = letters ? new Set(letters) : null;
  return WORDS.filter((w) => {
    if (allowed && ![...w].every((c) => allowed.has(c))) return false;
    if (bucket === "0-5") return w.length <= 5;
    if (bucket === "5-10") return w.length >= 6 && w.length <= 10;
    if (bucket === "10+") return w.length > 10;
    return true;
  });
}

// SPEC §1.3 — inner-disc colours by state.
export const STATE_COLORS = {
  off:       "#242433",
  idle:      "#1b4ee6",
  waiting:   "#00ff00",
  correct:   "#00ff00",
  incorrect: "#ff4444",
  beat:      "#7fd0ff",
  wait_cue:  "#ffd400",   // Inhibition Challenge "Wait" cue — steady, not a flash
  invalid:   "#9aa0ab",   // a reserved position was pressed (moves with layout, §4.0)
};

// SPEC §5 — clip ids (must exist as sim/sounds/<id>.wav).
export const CLIPS = {
  ready_go: "Ready. Go.",
  correct: "Correct.",
  try_again: "Try again.",
  great_job: "Great job.",
  youve_got_this: "You've got this.",
  session_complete: "Session complete. Great work.",
  lt_single: "Hit the green letter. Ready. Go.",
  lt_multi: "Hit the green letters. Ready. Go.",
  lt_single_beat: "Hit the green letter to the beat. Ready. Go.",
  lt_multi_beat: "Hit the green letters to the beat. Ready. Go.",
  follow_lights: "Follow the lights with your eyes. Ready. Go.",
  ic_instructions: "Green means hit. Red means stop. Yellow means wait. Ready. Go.",
  msb_watch: "Watch the letters. Then repeat the sequence. Ready. Go.",
  msb_your_turn: "Your turn. Ready. Go.",
};

export function instructionClip(activity, config, item) {
  const beat = config.beat !== "none";
  if (activity === "eye_pong") return "follow_lights";
  if (item.type === "word") return "spell_" + item.content.toLowerCase();
  if (activity === "letter_target") {
    if (config.content === "words") return "spell_" + item.content.toLowerCase();
    return beat ? "lt_single_beat" : "lt_single";
  }
  // letter_find, single letter
  const base = "lf_letter_" + item.content.toLowerCase();
  return beat ? base + "_beat" : base;
}

// Fisher-Yates shuffle (returns a new array). `rng` is injectable so tests can be repeatable.
export function shuffled(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Words for one session, in random order. Every word in `pool` is used once before any word repeats; if more words
// are asked for than the pool holds, the pool is reshuffled and the first word of the new round is never the same as
// the last word of the previous one. SPEC §3.1 ("Content order").
export function wordDeck(pool, count, rng = Math.random) {
  const out = [];
  while (out.length < count) {
    let round = shuffled(pool, rng);
    if (pool.length > 1 && out.length && round[0] === out[out.length - 1]) round.push(round.shift());
    out.push(...round);
  }
  return out.slice(0, count);
}

// Motor Sequence Builder — SPEC §3.1 / §4.6. "words" mode reuses WORDS, picking a word of (or closest to) the target
// length - at random among the equally close ones, and not one already used this session (`exclude`) while any other
// is available. "letters" mode generates a random sequence of that length (no letter 3-in-a-row).
export function wordNearestLength(len, exclude = [], rng = Math.random, letters = null) {
  const all = wordsForLength("all", letters);
  if (!all.length) return undefined;                       // nothing fits (a side with no words): the caller falls back
  const fresh = all.filter((w) => !exclude.includes(w));
  const pool = fresh.length ? fresh : all;
  const best = Math.min(...pool.map((w) => Math.abs(w.length - len)));
  const nearest = pool.filter((w) => Math.abs(w.length - len) === best);
  return nearest[Math.floor(rng() * nearest.length)];
}
export function randomSequence(len, letters = LETTERS) {
  let seq = "";
  for (let i = 0; i < len; i++) {
    let l;
    do { l = letters[Math.floor(Math.random() * letters.length)]; }
    while (seq.length >= 2 && l === seq[seq.length - 1] && l === seq[seq.length - 2]);
    seq += l;
  }
  return seq;
}

export function letterClip(letter) {
  return "letter_" + letter.toLowerCase();
}
export function wordClip(word) {
  return "word_" + word.toLowerCase();
}
