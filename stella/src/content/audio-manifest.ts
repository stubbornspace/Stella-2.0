import { promptLibrary } from "@/content/prompt-library"
import { wordLibrary } from "@/content/word-library"

export const availableLetterAudio = Array.from({ length: 26 }, (_, index) =>
  `/audio/letters/${String.fromCharCode(97 + index)}.mp3`
)

export const availablePromptAudio = promptLibrary
  .filter((prompt) => prompt.availability === "available")
  .map((prompt) => prompt.audioPath)

export const availableWordAudio = wordLibrary
  .filter((word) => word.availability === "available")
  .flatMap((word) => [word.audio.word, word.audio.spellPrompt])

export function getRuntimePreloadUrls(extraUrls: string[] = []) {
  return [...new Set([...availableLetterAudio, ...availablePromptAudio, ...extraUrls])]
}
