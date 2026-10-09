export type WordLengthBucket = "3" | "4" | "5" | "6" | "7" | "8"
export type WordAvailability = "available" | "planned"

export interface WordEntry {
  key: string
  label: string
  length: WordLengthBucket
  availability: WordAvailability
  tags?: string[]
  audio: {
    word: string
    spellPrompt: string
  }
}

export const wordLengthBuckets: WordLengthBucket[] = ["3", "4", "5", "6", "7", "8"]

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
    length,
    availability: "available",
    audio: {
      word: audioPath("words", word),
      spellPrompt: audioPath("prompts/spell-word", `spell-${word}-01`),
    },
  }))
)

export function getAvailableWordLengths() {
  return wordLengthBuckets.filter((bucket) =>
    wordLibrary.some(
      (word) => word.availability === "available" && word.length === bucket
    )
  )
}

export function getWordsByLength(
  length: WordLengthBucket,
  options?: { availableOnly?: boolean }
) {
  return wordLibrary.filter(
    (word) =>
      word.length === length &&
      (!options?.availableOnly || word.availability === "available")
  )
}

export function pickRandomWords(length: WordLengthBucket, count: number) {
  const pool = getWordsByLength(length, { availableOnly: true })
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
