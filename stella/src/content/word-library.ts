export type WordLengthBucket =
  "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11+"
export type WordLengthRange = "0-5" | "5-10" | "10+"
export type WordAvailability = "available" | "planned"

export interface WordEntry {
  key: string
  label: string
  length: number
  availability: WordAvailability
  tags?: string[]
  audio: {
    word: string
    spellPrompt: string
  }
}

export const wordLengthBuckets: WordLengthBucket[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11+",
]

export const wordLengthRanges: WordLengthRange[] = ["0-5", "5-10", "10+"]

const wordBuckets: Record<WordLengthBucket, string[]> = {
  "3": [
    "cat",
    "dog",
    "sun",
    "sky",
    "red",
    "box",
    "hat",
    "bed",
    "pen",
    "map",
    "car",
    "run",
    "hop",
    "fox",
    "bee",
    "leg",
    "cup",
    "bat",
    "pig",
    "jam",
  ],
  "4": [
    "bird",
    "cake",
    "fish",
    "frog",
    "tree",
    "star",
    "lamp",
    "book",
    "duck",
    "hand",
    "moon",
    "boat",
    "rain",
    "coat",
    "ball",
    "door",
    "king",
    "ship",
    "play",
    "snow",
  ],
  "5": [
    "apple",
    "beach",
    "cloud",
    "dance",
    "truck",
    "grape",
    "smile",
    "stone",
    "chair",
    "light",
    "water",
    "house",
    "bread",
    "plant",
    "brain",
    "clock",
    "green",
    "sweet",
    "tiger",
    "zebra",
  ],
  "6": [
    "monkey",
    "purple",
    "garden",
    "rabbit",
    "planet",
    "castle",
    "rocket",
    "button",
    "yellow",
    "bridge",
    "banana",
    "orange",
    "pencil",
    "soccer",
    "dragon",
    "window",
    "kitten",
    "silver",
    "flower",
    "stream",
  ],
  "7": [
    "rainbow",
    "balloon",
    "dolphin",
    "monster",
    "tractor",
    "captain",
    "diamond",
    "giraffe",
    "library",
    "popcorn",
    "picture",
    "teacher",
    "journey",
    "lantern",
    "thunder",
    "penguin",
    "cupcake",
    "morning",
    "blanket",
    "freedom",
  ],
  "8": [
    "backpack",
    "elephant",
    "hospital",
    "notebook",
    "football",
    "airplane",
    "birthday",
    "computer",
    "dinosaur",
    "favorite",
    "building",
    "sandwich",
    "triangle",
    "umbrella",
    "vacation",
    "baseball",
    "sunshine",
    "treasure",
    "snowfall",
    "painting",
  ],
  "9": [
    "adventure",
    "blueberry",
    "breakfast",
    "butterfly",
    "chocolate",
    "classroom",
    "crocodile",
    "evergreen",
    "fireworks",
    "jellyfish",
    "landscape",
    "moonlight",
    "pineapple",
    "rainstorm",
    "spaceship",
    "sunflower",
    "telephone",
    "wonderful",
    "storybook",
    "seashells",
  ],
  "10": [
    "basketball",
    "blackboard",
    "campground",
    "flashlight",
    "friendship",
    "greenhouse",
    "headphones",
    "lighthouse",
    "motorcycle",
    "playground",
    "skateboard",
    "strawberry",
    "toothbrush",
    "watermelon",
    "wristwatch",
    "everything",
    "houseplant",
    "peppermint",
    "paintbrush",
    "sunglasses",
  ],
  "11+": [
    "caterpillar",
    "celebration",
    "countryside",
    "electricity",
    "grandfather",
    "grandmother",
    "imagination",
    "information",
    "mathematics",
    "masterpiece",
    "kindergarten",
    "refrigerator",
    "snowboarding",
    "thunderstorm",
    "encyclopedia",
    "constellation",
    "communication",
    "rollercoaster",
    "transportation",
    "environment",
  ],
}

const audioPath = (segment: "words" | "prompts/spell-word", file: string) =>
  `/audio/${segment}/${file}.mp3`

function toLabel(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export const wordLibrary: WordEntry[] = wordLengthBuckets.flatMap((length) =>
  wordBuckets[length].map((word) => ({
    key: word,
    label: toLabel(word),
    length: word.length,
    availability: "available",
    audio: {
      word: audioPath("words", word),
      spellPrompt: audioPath("prompts/spell-word", `spell-${word}-01`),
    },
  }))
)

export function wordIsInRange(word: WordEntry, range: WordLengthRange) {
  if (range === "0-5") {
    return word.length <= 5
  }

  if (range === "5-10") {
    return word.length >= 6 && word.length <= 10
  }

  return word.length > 10
}

export function normalizeWordLengthRange(
  value: string | undefined
): WordLengthRange {
  if (value === "0-5" || value === "5-10" || value === "10+") {
    return value
  }

  const exactLength = Number(value)
  if (Number.isFinite(exactLength)) {
    if (exactLength <= 5) {
      return "0-5"
    }
    if (exactLength <= 10) {
      return "5-10"
    }
    return "10+"
  }

  return "0-5"
}

export function getAvailableWordRanges() {
  return wordLengthRanges.filter((range) =>
    wordLibrary.some(
      (word) => word.availability === "available" && wordIsInRange(word, range)
    )
  )
}

export function getWordsByRange(
  range: WordLengthRange,
  options?: { availableOnly?: boolean }
) {
  return wordLibrary.filter(
    (word) =>
      wordIsInRange(word, range) &&
      (!options?.availableOnly || word.availability === "available")
  )
}

export function getWordsByExactLength(
  length: number,
  options?: { availableOnly?: boolean }
) {
  return wordLibrary.filter(
    (word) =>
      word.length === length &&
      (!options?.availableOnly || word.availability === "available")
  )
}

function pickRandomWordsFromPool(pool: WordEntry[], count: number) {
  const available = [...pool]
  const result: WordEntry[] = []

  for (let index = 0; index < count && available.length > 0; index += 1) {
    const selectionIndex = Math.floor(Math.random() * available.length)
    const [entry] = available.splice(selectionIndex, 1)
    if (entry) {
      result.push(entry)
    }
  }

  while (result.length < count && pool.length > 0) {
    result.push(pool[Math.floor(Math.random() * pool.length)]!)
  }

  return result
}

export function pickRandomWords(range: WordLengthRange, count: number) {
  return pickRandomWordsFromPool(
    getWordsByRange(range, { availableOnly: true }),
    count
  )
}

export function pickRandomWordsByExactLength(length: number, count: number) {
  return pickRandomWordsFromPool(
    getWordsByExactLength(length, { availableOnly: true }),
    count
  )
}
