export const KEY_TO_LETTER: Record<number, string> = {
  1: "Q",
  2: "W",
  3: "E",
  4: "R",
  5: "T",
  6: "Y",
  7: "U",
  8: "I",
  9: "O",
  10: "P",
  11: "A",
  12: "S",
  13: "D",
  14: "F",
  15: "G",
  16: "H",
  17: "J",
  18: "K",
  19: "L",
  22: "Z",
  23: "X",
  24: "C",
  25: "V",
  26: "B",
  27: "N",
  28: "M",
}

export const LETTER_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_LETTER).map(([key, value]) => [value, Number(key)])
) as Record<string, number>

export const LETTER_KEYS = Object.keys(KEY_TO_LETTER).map(Number)

export type KeyState =
  | "idle"
  | "waiting"
  | "beat"
  | "correct"
  | "incorrect"
