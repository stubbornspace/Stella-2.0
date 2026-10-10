import type { KeyboardLayoutMode, KeyboardSide } from "@/types/exercise-control"

const allKeyIds = Array.from({ length: 30 }, (_, index) => index + 1)
const keyRows = [
  allKeyIds.slice(0, 10),
  allKeyIds.slice(10, 20),
  allKeyIds.slice(20, 30),
]

const qwertyLetters = [
  "Q",
  "W",
  "E",
  "R",
  "T",
  "Y",
  "U",
  "I",
  "O",
  "P",
  "A",
  "S",
  "D",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "",
  "",
  "Z",
  "X",
  "C",
  "V",
  "B",
  "N",
  "M",
  "",
  "",
]

const alphabeticalLetters = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "",
  "",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "",
  "",
]

const layoutLetters: Record<KeyboardLayoutMode, string[]> = {
  alphabetical: alphabeticalLetters,
  qwerty: qwertyLetters,
}

export function keyIsOnSide(keyId: number, side: KeyboardSide) {
  const column = (keyId - 1) % 10
  return (
    side === "full" ||
    (side === "left" && column <= 4) ||
    (side === "right" && column >= 5)
  )
}

export function getKeyToLetterMap(layout: KeyboardLayoutMode) {
  return Object.fromEntries(
    layoutLetters[layout].map((letter, index) => [index + 1, letter])
  ) as Record<number, string>
}

export function getLetterToKeyMap(layout: KeyboardLayoutMode) {
  return Object.fromEntries(
    layoutLetters[layout]
      .map((letter, index) => [letter, index + 1] as const)
      .filter(([letter]) => Boolean(letter))
  ) as Record<string, number>
}

export function getKeyboardRows(
  layout: KeyboardLayoutMode,
  side: KeyboardSide = "full"
) {
  const letters = layoutLetters[layout]
  return keyRows.map((row) =>
    row.map((id) => ({
      id,
      letter: keyIsOnSide(id, side) ? (letters[id - 1] ?? "") : "",
    }))
  )
}

export function getLetterKeys(
  layout: KeyboardLayoutMode,
  side: KeyboardSide = "full"
) {
  return getKeyboardRows(layout, side)
    .flat()
    .filter((key) => Boolean(key.letter))
}

export function getKeyboardLetters(
  layout: KeyboardLayoutMode,
  side: KeyboardSide = "full"
) {
  return getLetterKeys(layout, side)
    .map((key) => key.letter)
    .sort()
}

export function getKeyCoordinates(keyId: number) {
  return {
    column: (keyId - 1) % 10,
    row: Math.floor((keyId - 1) / 10),
  }
}

export function getKeyMissMetrics(targetKeyId: number, pressedKeyId: number) {
  const target = getKeyCoordinates(targetKeyId)
  const pressed = getKeyCoordinates(pressedKeyId)
  const columnDelta = pressed.column - target.column
  const rowDelta = pressed.row - target.row
  const distance = Math.sqrt(columnDelta ** 2 + rowDelta ** 2)
  let direction: "above" | "below" | "left" | "right"

  if (Math.abs(columnDelta) >= Math.abs(rowDelta)) {
    direction = columnDelta < 0 ? "left" : "right"
  } else {
    direction = rowDelta < 0 ? "above" : "below"
  }

  return { direction, distance }
}
