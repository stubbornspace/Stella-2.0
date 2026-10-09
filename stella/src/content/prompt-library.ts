export type PromptAvailability = "available" | "planned"
export type PromptIntent =
  | "session_intro"
  | "exercise_instruction"
  | "spell_word_intro"
  | "hit_letter_intro"
  | "hint_retry"
  | "success_short"
  | "success_word_complete"
  | "success_session_complete"
  | "eye_pong_instruction"

export interface PromptVariant {
  id: string
  intent: PromptIntent
  exercise: "shared" | "letter-target" | "letter-find" | "eye-pong" | "spell-word"
  text: string
  availability: PromptAvailability
  audioPath: string
}

const shared = (file: string) => `/audio/prompts/shared/${file}.mp3`
const exercise = (
  folder: "letter-target" | "letter-find" | "eye-pong" | "spell-word",
  file: string
) => `/audio/prompts/${folder}/${file}.mp3`

export const promptLibrary: PromptVariant[] = [
  { id: "ready-to-play-01", intent: "session_intro", exercise: "shared", text: "Ready to play?", availability: "available", audioPath: shared("ready-to-play-01") },
  { id: "correct-01", intent: "success_short", exercise: "shared", text: "Correct.", availability: "available", audioPath: shared("correct-01") },
  { id: "wrong-01", intent: "hint_retry", exercise: "shared", text: "Try again.", availability: "available", audioPath: shared("wrong-01") },
  { id: "wrong-02", intent: "hint_retry", exercise: "shared", text: "Not that one. Try again.", availability: "available", audioPath: shared("wrong-02") },
  { id: "wrong-03", intent: "hint_retry", exercise: "shared", text: "Let’s try that again.", availability: "available", audioPath: shared("wrong-03") },
  { id: "great-job-01", intent: "success_session_complete", exercise: "shared", text: "Great job.", availability: "available", audioPath: shared("great-job-01") },
  { id: "youve-got-this-01", intent: "hint_retry", exercise: "shared", text: "You’ve got this.", availability: "available", audioPath: shared("youve-got-this-01") },
  { id: "keep-going-01", intent: "hint_retry", exercise: "shared", text: "Keep going.", availability: "available", audioPath: shared("keep-going-01") },
  { id: "nice-job-01", intent: "success_word_complete", exercise: "shared", text: "Nice job.", availability: "available", audioPath: shared("nice-job-01") },

  { id: "tap-green-letters-beat-01", intent: "exercise_instruction", exercise: "letter-target", text: "Tap the green letters to the beat.", availability: "available", audioPath: exercise("letter-target", "tap-the-green-letters-to-the-beat-01") },
  { id: "tap-green-letters-01", intent: "exercise_instruction", exercise: "letter-target", text: "Tap the green letters.", availability: "available", audioPath: exercise("letter-target", "tap-the-green-letters-01") },
  { id: "spell-word-beat-01", intent: "exercise_instruction", exercise: "letter-target", text: "Tap each letter to spell the word, to the beat.", availability: "available", audioPath: exercise("letter-target", "tap-each-letter-to-spell-the-word-to-the-beat-01") },
  { id: "spell-word-01", intent: "exercise_instruction", exercise: "letter-target", text: "Tap each letter to spell the word.", availability: "available", audioPath: exercise("letter-target", "tap-each-letter-to-spell-the-word-01") },

  { id: "find-letter-beat-01", intent: "exercise_instruction", exercise: "letter-find", text: "Find the letter and tap it to the beat.", availability: "available", audioPath: exercise("letter-find", "find-the-letter-and-tap-it-to-the-beat-01") },
  { id: "find-letter-01", intent: "exercise_instruction", exercise: "letter-find", text: "Find the letter and tap it.", availability: "available", audioPath: exercise("letter-find", "find-the-letter-and-tap-it-01") },
  { id: "find-letters-spell-word-01", intent: "exercise_instruction", exercise: "letter-find", text: "Find the letters to spell the word.", availability: "available", audioPath: exercise("letter-find", "find-the-letters-to-spell-the-word-01") },
  { id: "hit-the-letter-01", intent: "hit_letter_intro", exercise: "letter-find", text: "Hit the letter.", availability: "available", audioPath: exercise("letter-find", "hit-the-letter-01") },

  { id: "follow-lights-01", intent: "eye_pong_instruction", exercise: "eye-pong", text: "Follow the lights with your eyes.", availability: "available", audioPath: exercise("eye-pong", "follow-the-lights-with-your-eyes-01") },
  { id: "watch-lights-01", intent: "eye_pong_instruction", exercise: "eye-pong", text: "Watch the lights move across the keyboard.", availability: "available", audioPath: exercise("eye-pong", "watch-the-lights-move-across-the-keyboard-01") },
]

export function getPromptById(id: string) {
  return promptLibrary.find((prompt) => prompt.id === id)
}
