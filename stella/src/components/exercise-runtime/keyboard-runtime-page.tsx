import { ArrowLeft, Check, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"

import { useSaveExerciseRun, usePatient } from "@/hooks/use-stella"
import { Button } from "@/components/ui/button"
import { KeyboardLayout } from "@/components/exercise-runtime/keyboard-layout"
import { getPromptById } from "@/content/prompt-library"
import {
  getAvailableWordLengths,
  pickRandomWords,
  type WordEntry,
} from "@/content/word-library"
import { getRuntimePreloadUrls } from "@/content/audio-manifest"
import { LETTER_KEYS, LETTER_TO_KEY, KEY_TO_LETTER, type KeyState } from "@/lib/audio/constants"
import { preloadAudio, playAudio, unlockAudio } from "@/lib/audio/sound-manager"
import { STOMP_DOWNBEAT_BPM } from "@/lib/audio/stomp-beat-map"
import { useKeyboardGameEngine, type AudioConfig, type LetterStat } from "@/hooks/use-keyboard-game-engine"
import { useMetronome } from "@/hooks/use-metronome"
import { useMusic } from "@/hooks/use-music"
import {
  clearPendingExerciseRun,
  loadPendingExerciseRun,
  saveRerunExerciseSetup,
} from "@/lib/exercise-runtime/session-storage"
import { supportsKeyboardRuntime } from "@/config/exercise-control"
import { exerciseDefinitions } from "@/config/exercises"
import { cn } from "@/lib/utils"
import type {
  ExerciseAudioMode,
  ExerciseSetup,
  ExerciseRunResult,
  EyePongRunResult,
  KeyboardRuntimeExerciseType,
  LetterFindRunResult,
  LetterFindSetup,
  LetterTargetRunResult,
  LetterTargetSetup,
} from "@/types/exercise-control"

function promptAudio(id: string) {
  const prompt = getPromptById(id)
  if (!prompt) {
    throw new Error(`Unknown prompt: ${id}`)
  }
  return prompt.audioPath
}

const CORRECT_PROMPT = "/audio/effects/legacy-correct.mp3"
const WRONG_PROMPTS = [promptAudio("wrong-01"), promptAudio("wrong-02"), promptAudio("wrong-03")]
const GREAT_JOB_PROMPT = promptAudio("great-job-01")
const ENCOURAGEMENT_PROMPT = promptAudio("youve-got-this-01")
const READY_TO_PLAY_PROMPT = promptAudio("ready-to-play-01")
const LETTER_TARGET_BEAT_PROMPT = promptAudio("tap-green-letters-beat-01")
const LETTER_TARGET_SILENT_PROMPT = promptAudio("tap-green-letters-01")
const LETTER_FIND_BEAT_PROMPT = promptAudio("find-letter-beat-01")
const LETTER_FIND_HIT_LETTER_PROMPT = promptAudio("hit-the-letter-01")
const EYE_PONG_PROMPT = promptAudio("follow-lights-01")

function getActualBpm(audioMode: ExerciseAudioMode, tempoBpm?: number, musicPlaybackRate?: number) {
  if (audioMode === "silent") {
    return undefined
  }

  if (audioMode === "music") {
    return STOMP_DOWNBEAT_BPM * (musicPlaybackRate ?? 1)
  }

  return tempoBpm
}

function buildLetterTargetAudioConfig(
  setup: LetterTargetSetup,
  selectedWords: WordEntry[],
  overrides?: Pick<AudioConfig, "hint" | "onCorrect">
): AudioConfig {
  const noBeat = setup.audioMode === "silent"
  const instructionPrompt = noBeat ? LETTER_TARGET_SILENT_PROMPT : LETTER_TARGET_BEAT_PROMPT

  if (setup.contentMode === "letters") {
    return {
      instruction: [READY_TO_PLAY_PROMPT, instructionPrompt],
      correct: CORRECT_PROMPT,
      wrong: WRONG_PROMPTS,
      letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
      finish: [GREAT_JOB_PROMPT],
      hint: [ENCOURAGEMENT_PROMPT, instructionPrompt],
      preload: getRuntimePreloadUrls([instructionPrompt, GREAT_JOB_PROMPT]),
    }
  }

  return {
    instruction: async () => {
      await playAudio(READY_TO_PLAY_PROMPT)
      await playAudio(instructionPrompt)
      const firstWord = selectedWords[0]
      if (firstWord) {
        await playAudio(firstWord.audio.spellPrompt)
      }
    },
    correct: CORRECT_PROMPT,
    wrong: WRONG_PROMPTS,
    letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
    finish: [],
    hint: overrides?.hint ?? [ENCOURAGEMENT_PROMPT, instructionPrompt],
    onCorrect: overrides?.onCorrect ?? (async (letter) => {
      await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
    }),
    preload: getRuntimePreloadUrls([
      instructionPrompt,
      ...selectedWords.flatMap((word) => [word.audio.spellPrompt, word.audio.word]),
    ]),
  }
}

function buildLetterFindAudioConfig(
  setup: LetterFindSetup,
  selectedWords: WordEntry[],
  overrides?: Pick<AudioConfig, "hint" | "onCorrect">
): AudioConfig {
  if (setup.contentMode === "letters") {
    return {
      instruction: async (sequence) => {
        await playAudio(READY_TO_PLAY_PROMPT)
        await playAudio(LETTER_FIND_BEAT_PROMPT)
        const firstLetter = KEY_TO_LETTER[sequence[0]!]
        await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
        await playAudio(`/audio/letters/${firstLetter.toLowerCase()}.mp3`)
      },
      correct: CORRECT_PROMPT,
      wrong: WRONG_PROMPTS,
      letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
      finish: [GREAT_JOB_PROMPT],
      hint: async (letter) => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
      },
      onCorrect: async (letter, nextLetter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        if (nextLetter) {
          await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
          await playAudio(`/audio/letters/${nextLetter.toLowerCase()}.mp3`)
        }
      },
      preload: getRuntimePreloadUrls([
        LETTER_FIND_BEAT_PROMPT,
        LETTER_FIND_HIT_LETTER_PROMPT,
        GREAT_JOB_PROMPT,
      ]),
    }
  }

  const runtimeWords = selectedWords

  return {
    instruction: async () => {
      await playAudio(READY_TO_PLAY_PROMPT)
      const firstWord = runtimeWords[0]
      if (firstWord) {
        await playAudio(firstWord.audio.spellPrompt)
      }
    },
    correct: CORRECT_PROMPT,
    wrong: WRONG_PROMPTS,
    letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
    finish: [],
    hint: overrides?.hint ?? (async () => {
      await playAudio(ENCOURAGEMENT_PROMPT)
      const firstWord = runtimeWords[0]
      if (firstWord) {
        await playAudio(firstWord.audio.spellPrompt)
      }
    }),
    onCorrect: overrides?.onCorrect ?? (async (letter) => {
      await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
    }),
    preload: getRuntimePreloadUrls(runtimeWords.flatMap((word) => [word.audio.spellPrompt, word.audio.word])),
  }
}

function buildRandomLetterSequence(count: number) {
  return Array.from({ length: count }, () => LETTER_KEYS[Math.floor(Math.random() * LETTER_KEYS.length)]!)
}

function buildWordSequence(words: WordEntry[]) {
  return words.flatMap((word) => word.key.toUpperCase().split("").map((letter) => LETTER_TO_KEY[letter]!))
}

function computeCompletedWords(stats: LetterStat[], words: WordEntry[]) {
  let offset = 0
  let completedWords = 0

  for (const word of words) {
    const nextOffset = offset + word.key.length
    if (stats.length >= nextOffset) {
      completedWords += 1
      offset = nextOffset
      continue
    }
    break
  }

  return completedWords
}

function getTotalUnits(setup: ExerciseSetup) {
  switch (setup.activity) {
    case "letter-target":
    case "letter-find":
      return setup.contentMode === "letters"
        ? setup.numberOfLetters
        : setup.numberOfWords
    case "eye-pong":
      return 20
  }
}

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function summarizeLetterStats(stats: LetterStat[]) {
  const totalAttempts = stats.reduce((sum, stat) => sum + stat.attempts, 0)
  const firstAttemptHits = stats.filter((stat) => stat.attempts === 1).length
  const averageLatencyMs =
    stats.length > 0
      ? Math.round(stats.reduce((sum, stat) => sum + stat.timeMs, 0) / stats.length)
      : 0

  return {
    averageLatencyMs,
    firstAttemptRate:
      stats.length > 0 ? Math.round((firstAttemptHits / stats.length) * 100) : 0,
    totalAttempts,
  }
}

function FinishedRuntimeSession({
  patientId,
  patientName,
  result,
  runStatus,
  completedUnits,
  setup,
  totalUnits,
}: {
  patientId: string
  patientName: string
  result: ExerciseRunResult
  runStatus: "completed" | "ended-early"
  completedUnits: number
  setup: ExerciseSetup
  totalUnits: number
}) {
  const navigate = useNavigate()
  const definition = exerciseDefinitions[result.activity]
  const completed = runStatus === "completed"

  const handleRunAgain = useCallback(() => {
    saveRerunExerciseSetup({
      patientId,
      savedAt: `${Date.now()}`,
      setup: { ...setup },
    })
    navigate(`/patients/${patientId}?tab=exercise-control`)
  }, [navigate, patientId, setup])

  const summaryCards =
    result.activity === "eye-pong"
      ? [
          { label: "Status", value: completed ? "Completed" : "Ended Early" },
          { label: "Duration", value: formatElapsedTime(result.elapsedSeconds) },
          { label: "Progress", value: `${completedUnits} of ${totalUnits}` },
          { label: "Mode", value: result.mode === "left-right" ? "Left / Right" : "Random" },
          { label: "Completion", value: `${Math.round(result.completionRatePercent)}%` },
          { label: "Target Changes", value: String(result.targetChanges) },
        ]
      : (() => {
          const metrics = summarizeLetterStats(result.stats)
          return [
            { label: "Status", value: completed ? "Completed" : "Ended Early" },
            { label: "Duration", value: formatElapsedTime(result.elapsedSeconds) },
            { label: "Progress", value: `${completedUnits} of ${totalUnits}` },
            {
              label: "Content",
              value:
                result.contentMode === "letters"
                  ? "Letters"
                  : `${result.wordLength ?? "?"}-letter words`,
            },
            { label: "Attempts", value: String(metrics.totalAttempts) },
            { label: "First-Try Accuracy", value: `${metrics.firstAttemptRate}%` },
            { label: "Avg Latency", value: `${metrics.averageLatencyMs} ms` },
            {
              label: "Beat",
              value:
                result.audioMode === "silent"
                  ? "None"
                  : result.audioMode === "music"
                    ? `Music${result.actualBpm ? ` · ${Math.round(result.actualBpm)} BPM` : ""}`
                    : `Metronome${result.actualBpm ? ` · ${Math.round(result.actualBpm)} BPM` : ""}`,
            },
          ]
        })()

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
      <section className="mx-auto w-full max-w-4xl rounded-lg border bg-card p-6">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            completed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {completed ? <Check /> : <Square />}
        </div>
        <div className="mt-5">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {completed ? "Session complete" : "Session ended early"}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{definition.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {patientName} · {completedUnits} of {totalUnits} completed
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div className="rounded-lg border bg-muted/30 p-4" key={card.label}>
              <div className="text-xs text-muted-foreground uppercase">{card.label}</div>
              <div className="mt-2 font-semibold">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          This session was saved to the patient dashboard and is ready for review.
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={handleRunAgain} type="button" variant="outline">
            Run Again
          </Button>
          <Button onClick={() => navigate(`/patients/${patientId}`)} type="button">
            Back to Dashboard
          </Button>
        </div>
      </section>
    </main>
  )
}

function LetterTargetRuntime({
  setup,
  selectedWords,
  startSignal,
  onPlayingChange,
  onRunComplete,
}: {
  setup: LetterTargetSetup
  selectedWords: WordEntry[]
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onRunComplete: (result: LetterTargetRunResult, completedUnits: number) => void
}) {
  const letterIndexRef = useRef(0)
  const wordIndexRef = useRef(0)
  const audio = useMemo(() => {
    if (setup.contentMode === "letters") {
      return buildLetterTargetAudioConfig(setup, selectedWords)
    }

    return buildLetterTargetAudioConfig(setup, selectedWords, {
      onCorrect: async (letter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        letterIndexRef.current += 1

        const currentWord = selectedWords[wordIndexRef.current]
        if (!currentWord) {
          return
        }

        const completedWord =
          letterIndexRef.current >=
          selectedWords
            .slice(0, wordIndexRef.current + 1)
            .reduce((sum, word) => sum + word.key.length, 0)

        if (!completedWord) {
          return
        }

        await playAudio(currentWord.audio.word)
        await playAudio(GREAT_JOB_PROMPT)
        wordIndexRef.current += 1

        const nextWord = selectedWords[wordIndexRef.current]
        if (nextWord) {
          await playAudio(nextWord.audio.spellPrompt)
        }
      },
      hint: async () => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        const currentWord = selectedWords[wordIndexRef.current]
        if (currentWord) {
          await playAudio(currentWord.audio.spellPrompt)
        }
      },
    })
  }, [selectedWords, setup])
  const engine = useKeyboardGameEngine({
    audio,
    beatSource: setup.audioMode,
    bpm: setup.tempoBpm ?? 54,
    musicPlaybackRate: setup.musicPlaybackRate,
    onComplete: (stats) => {
      const completedUnits =
        setup.contentMode === "letters" ? stats.length : computeCompletedWords(stats, selectedWords)

      onRunComplete(
        {
          activity: "letter-target",
          actualBpm: getActualBpm(setup.audioMode, setup.tempoBpm, setup.musicPlaybackRate),
          audioMode: setup.audioMode,
          contentMode: setup.contentMode,
          elapsedSeconds: 0,
          selectedWords: selectedWords.map((word) => word.label),
          stats,
          wordLength: setup.wordLength,
        },
        completedUnits
      )
    },
  })

  const { handleKeyClick, isPlaying, keyStates, letterStats, preload, startGame, stopGame } =
    engine

  useEffect(() => {
    preload()
  }, [preload])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal <= 0 || startSignal === previousStartSignalRef.current) {
      return
    }

    previousStartSignalRef.current = startSignal
    letterIndexRef.current = 0
    wordIndexRef.current = 0
    const sequence =
      setup.contentMode === "letters"
        ? buildRandomLetterSequence(setup.numberOfLetters)
        : buildWordSequence(selectedWords)
    void startGame(sequence)
  }, [selectedWords, setup.contentMode, setup.numberOfLetters, startGame, startSignal])

  useEffect(() => () => stopGame(), [stopGame])

  return (
    <KeyboardLayout
      foundLetters={
        setup.contentMode === "words"
          ? letterStats
              .slice(
                selectedWords
                  .slice(0, wordIndexRef.current)
                  .reduce((sum, word) => sum + word.key.length, 0)
              )
              .map((stat) => stat.letter)
          : letterStats.map((stat) => stat.letter)
      }
      keyStates={keyStates}
      onKeyClick={handleKeyClick}
    />
  )
}

function LetterFindRuntime({
  setup,
  selectedWords,
  startSignal,
  onPlayingChange,
  onRunComplete,
}: {
  setup: LetterFindSetup
  selectedWords: WordEntry[]
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onRunComplete: (result: LetterFindRunResult, completedUnits: number) => void
}) {
  const letterIndexRef = useRef(0)
  const wordIndexRef = useRef(0)
  const audio = useMemo(() => {
    if (setup.contentMode === "letters") {
      return buildLetterFindAudioConfig(setup, selectedWords)
    }

    return buildLetterFindAudioConfig(setup, selectedWords, {
      onCorrect: async (letter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        letterIndexRef.current += 1

        const currentWord = selectedWords[wordIndexRef.current]
        if (!currentWord) {
          return
        }

        const completedWord =
          letterIndexRef.current >=
          selectedWords
            .slice(0, wordIndexRef.current + 1)
            .reduce((sum, word) => sum + word.key.length, 0)

        if (!completedWord) {
          return
        }

        await playAudio(currentWord.audio.word)
        await playAudio(GREAT_JOB_PROMPT)
        wordIndexRef.current += 1

        const nextWord = selectedWords[wordIndexRef.current]
        if (nextWord) {
          await playAudio(nextWord.audio.spellPrompt)
        }
      },
      hint: async () => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        const currentWord = selectedWords[wordIndexRef.current]
        if (currentWord) {
          await playAudio(currentWord.audio.spellPrompt)
        }
      },
    })
  }, [selectedWords, setup])
  const engine = useKeyboardGameEngine({
    audio,
    beatSource: setup.audioMode,
    bpm: setup.tempoBpm ?? 54,
    musicPlaybackRate: setup.musicPlaybackRate,
    onComplete: (stats) => {
      const completedUnits =
        setup.contentMode === "letters" ? stats.length : computeCompletedWords(stats, selectedWords)

      onRunComplete(
        {
          activity: "letter-find",
          actualBpm: getActualBpm(setup.audioMode, setup.tempoBpm, setup.musicPlaybackRate),
          audioMode: setup.audioMode,
          contentMode: setup.contentMode,
          elapsedSeconds: 0,
          selectedWords: selectedWords.map((word) => word.label),
          stats,
          wordLength: setup.wordLength,
        },
        completedUnits
      )
    },
    showTarget: false,
  })

  const { handleKeyClick, isPlaying, keyStates, letterStats, preload, startGame, stopGame } =
    engine

  useEffect(() => {
    preload()
  }, [preload])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal <= 0 || startSignal === previousStartSignalRef.current) {
      return
    }

    previousStartSignalRef.current = startSignal
    letterIndexRef.current = 0
    wordIndexRef.current = 0
    const sequence =
      setup.contentMode === "letters"
        ? buildRandomLetterSequence(setup.numberOfLetters)
        : buildWordSequence(selectedWords)
    void startGame(sequence)
  }, [selectedWords, setup.contentMode, setup.numberOfLetters, startGame, startSignal])

  useEffect(() => () => stopGame(), [stopGame])

  return (
    <KeyboardLayout
      foundLetters={letterStats.map((stat) => stat.letter)}
      keyStates={keyStates}
      onKeyClick={handleKeyClick}
    />
  )
}

function EyePongRuntime({
  setup,
  startSignal,
  onPlayingChange,
  onRunComplete,
}: {
  setup: { audioMode: ExerciseAudioMode; mode: "left-right" | "random"; tempoBpm?: number; musicPlaybackRate?: number }
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onRunComplete: (result: EyePongRunResult) => void
}) {
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const indexRef = useRef(0)
  const beatTimerRef = useRef<number | null>(null)
  const completionTimerRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const targetChangesRef = useRef(0)

  const leftRightKeys = useMemo(() => [LETTER_TO_KEY.A, LETTER_TO_KEY.L], [])
  const randomKeys = useMemo(() => [LETTER_TO_KEY.A, LETTER_TO_KEY.L, LETTER_TO_KEY.N, LETTER_TO_KEY.E], [])

  const handleBeat = useCallback(() => {
    if (!playingRef.current) {
      return
    }

    const keys = setup.mode === "left-right" ? leftRightKeys : randomKeys
    let keyId: number

    if (setup.mode === "left-right") {
      keyId = keys[indexRef.current % 2]!
      indexRef.current += 1
    } else {
      keyId = keys[Math.floor(Math.random() * keys.length)]!
    }

    targetChangesRef.current += 1
    setKeyStates({ [keyId]: "waiting" })
    window.setTimeout(() => setKeyStates({}), 600)
  }, [leftRightKeys, randomKeys, setup.mode])

  const { start: startMetronome, stop: stopMetronome } = useMetronome({
    bpm: setup.tempoBpm ?? 54,
    volume: 0.5,
    onBeat: handleBeat,
  })

  const { start: startMusicBeat, stop: stopMusicBeat } = useMusic({
    beatMode: "downbeats",
    onBeat: handleBeat,
    playbackRate: setup.musicPlaybackRate ?? 1,
    volume: 0.5,
  })

  const startBeat = useCallback(() => {
    if (setup.audioMode === "silent") {
      const intervalMs = (60 / (setup.tempoBpm ?? 54)) * 1000
      beatTimerRef.current = window.setInterval(handleBeat, intervalMs)
      handleBeat()
      return
    }

    if (setup.audioMode === "music") {
      void startMusicBeat()
    } else {
      void startMetronome()
    }
  }, [handleBeat, setup.audioMode, setup.musicPlaybackRate, setup.tempoBpm, startMetronome, startMusicBeat])

  const stopBeat = useCallback(() => {
    stopMetronome()
    stopMusicBeat()
    if (beatTimerRef.current) {
      window.clearInterval(beatTimerRef.current)
      beatTimerRef.current = null
    }
  }, [stopMetronome, stopMusicBeat])

  useEffect(() => {
    void preloadAudio(getRuntimePreloadUrls([EYE_PONG_PROMPT, GREAT_JOB_PROMPT]))
  }, [])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const stopRuntime = useCallback(() => {
    stopBeat()
    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    playingRef.current = false
    setIsPlaying(false)
    setKeyStates({})
  }, [stopBeat])

  useEffect(() => () => stopRuntime(), [stopRuntime])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal <= 0 || startSignal === previousStartSignalRef.current) {
      return
    }

    previousStartSignalRef.current = startSignal

    const start = async () => {
      await unlockAudio()
      indexRef.current = 0
      targetChangesRef.current = 0
      playingRef.current = true
      setKeyStates({})
      setIsPlaying(true)

      await playAudio(EYE_PONG_PROMPT)
      startBeat()

      completionTimerRef.current = window.setTimeout(async () => {
        stopBeat()
        playingRef.current = false
        setKeyStates({})
        await playAudio(CORRECT_PROMPT)
        await playAudio(GREAT_JOB_PROMPT)
        setIsPlaying(false)
        completionTimerRef.current = null
        onRunComplete({
          activity: "eye-pong",
          audioMode: setup.audioMode,
          completionRatePercent: Math.min(100, Math.round((targetChangesRef.current / 20) * 100)),
          elapsedSeconds: 10,
          mode: setup.mode,
          targetChanges: targetChangesRef.current,
        })
      }, 10000)
    }

    void start()
  }, [onRunComplete, setup.audioMode, setup.mode, startBeat, startSignal, stopBeat])

  return <KeyboardLayout keyStates={keyStates} />
}

export function KeyboardRuntimePage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const { exerciseType, patientId } = useParams()
  const patientQuery = usePatient(patientId)
  const saveExerciseRun = useSaveExerciseRun()
  const [startSignal, setStartSignal] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [status, setStatus] = useState<"booting" | "running" | "saving" | "finished">("booting")
  const [completedUnits, setCompletedUnits] = useState(0)
  const [finishedRun, setFinishedRun] = useState<{
    completedUnits: number
    result: ExerciseRunResult
    runStatus: "completed" | "ended-early"
  } | null>(null)
  const activeStartTimeRef = useRef<number | null>(null)
  const resultRef = useRef<ExerciseRunResult | null>(null)

  const activity = exerciseType as KeyboardRuntimeExerciseType | undefined
  const validActivity =
    activity && supportsKeyboardRuntime(activity) ? activity : undefined
  const pendingRun = useMemo(
    () =>
      patientId && validActivity
        ? loadPendingExerciseRun(patientId, validActivity)
        : null,
    [patientId, validActivity]
  )

  useEffect(() => {
    if (!validActivity || !patientId || !pendingRun) {
      return
    }

    setStatus("running")
    activeStartTimeRef.current = Date.now()
    setStartSignal((current) => current + 1)
  }, [patientId, pendingRun?.savedAt, validActivity])

  useEffect(() => {
    if (status !== "running") {
      return
    }

    const interval = window.setInterval(() => {
      if (!activeStartTimeRef.current) {
        return
      }

      setElapsedSeconds(Math.max(1, Math.round((Date.now() - activeStartTimeRef.current) / 1000)))
    }, 250)

    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (status === "running" || status === "saving") {
        event.preventDefault()
      }
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [status])

  const finishAndSave = useCallback(
    async (
      runStatus: "completed" | "ended-early",
      result: ExerciseRunResult,
      nextCompletedUnits: number
    ) => {
      if (!patientId || !pendingRun || !validActivity) {
        return
      }

      setStatus("saving")
      const finalElapsedSeconds =
        runStatus === "completed"
          ? Math.max(result.elapsedSeconds, elapsedSeconds)
          : Math.max(1, elapsedSeconds)

      try {
        await saveExerciseRun.mutateAsync({
          completedUnits: nextCompletedUnits,
          elapsedSeconds: finalElapsedSeconds,
          patientId,
          result: {
            ...result,
            elapsedSeconds: finalElapsedSeconds,
          },
          runId: pendingRun.savedAt,
          setup: pendingRun.setup,
          status: runStatus,
        })
        clearPendingExerciseRun(patientId, validActivity)
        setFinishedRun({
          completedUnits: nextCompletedUnits,
          result: {
            ...result,
            elapsedSeconds: finalElapsedSeconds,
          },
          runStatus,
        })
        setStatus("finished")
        onToast(
          `${patientQuery.data?.firstName ?? "Patient"}'s ${validActivity.replace(/-/g, " ")} session was saved.`
        )
      } catch (error) {
        setStatus("running")
        onToast(error instanceof Error ? error.message : "Unable to save session.")
      }
    },
    [elapsedSeconds, onToast, patientId, patientQuery.data?.firstName, pendingRun, saveExerciseRun, validActivity]
  )

  const handleLetterTargetComplete = useCallback(
    (result: LetterTargetRunResult, nextCompletedUnits: number) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
      void finishAndSave("completed", result, nextCompletedUnits)
    },
    [finishAndSave]
  )

  const handleLetterFindComplete = useCallback(
    (result: LetterFindRunResult, nextCompletedUnits: number) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
      void finishAndSave("completed", result, nextCompletedUnits)
    },
    [finishAndSave]
  )

  const handleEyePongComplete = useCallback(
    (result: EyePongRunResult) => {
      resultRef.current = result
      setCompletedUnits(result.targetChanges)
      void finishAndSave("completed", result, result.targetChanges)
    },
    [finishAndSave]
  )

  const handleStopEarly = useCallback(() => {
    if (!pendingRun || status !== "running") {
      return
    }

    let result = resultRef.current

    if (!result) {
      if (pendingRun.setup.activity === "eye-pong") {
        result = {
          activity: "eye-pong",
          audioMode: pendingRun.setup.audioMode,
          completionRatePercent: 0,
          elapsedSeconds,
          mode: pendingRun.setup.mode,
          targetChanges: completedUnits,
        }
      } else {
        const letterSetup = pendingRun.setup as LetterTargetSetup | LetterFindSetup
        result = {
          activity: letterSetup.activity,
          actualBpm: getActualBpm(
            letterSetup.audioMode,
            letterSetup.tempoBpm,
            letterSetup.musicPlaybackRate
          ),
          audioMode: letterSetup.audioMode,
          contentMode: letterSetup.contentMode,
          elapsedSeconds,
          selectedWords: [],
          stats: [],
          wordLength: letterSetup.wordLength,
        }
      }
    }

    resultRef.current = result
    if (result) {
      void finishAndSave("ended-early", result, completedUnits)
    }
  }, [completedUnits, elapsedSeconds, finishAndSave, pendingRun, status])

  if (!validActivity || !patientId) {
    return <Navigate replace to="/" />
  }

  if (!pendingRun) {
    return <Navigate replace to={`/patients/${patientId}?tab=exercise-control`} />
  }

  const patientName = patientQuery.data
    ? `${patientQuery.data.firstName} ${patientQuery.data.lastName}`
    : "Patient"

  const selectedWords = useMemo(() => {
      if (
        pendingRun.setup.activity !== "letter-target" &&
        pendingRun.setup.activity !== "letter-find"
      ) {
        return []
      }

      if (pendingRun.setup.contentMode !== "words") {
        return []
      }

      return pickRandomWords(
        pendingRun.setup.wordLength ?? getAvailableWordLengths()[0] ?? "3",
        pendingRun.setup.numberOfWords
      )
    }, [pendingRun.savedAt])

  if (
    (pendingRun.setup.activity === "letter-target" || pendingRun.setup.activity === "letter-find") &&
    pendingRun.setup.contentMode === "words" &&
    selectedWords.length === 0
  ) {
    return <Navigate replace to={`/patients/${patientId}?tab=exercise-control`} />
  }

  if (status === "finished" && finishedRun) {
    const totalUnits = getTotalUnits(pendingRun.setup)

    return (
      <FinishedRuntimeSession
        completedUnits={finishedRun.completedUnits}
        patientId={patientId}
        patientName={patientName}
        result={finishedRun.result}
        runStatus={finishedRun.runStatus}
        setup={pendingRun.setup}
        totalUnits={totalUnits ?? finishedRun.completedUnits}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button onClick={() => navigate(`/patients/${patientId}?tab=exercise-control`)} type="button" variant="ghost">
            <ArrowLeft data-icon="inline-start" />
            Back to setup
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">{patientName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Running {pendingRun.setup.activity.replace(/-/g, " ")}.
          </p>
        </div>
        <Button onClick={handleStopEarly} type="button" variant="destructive">
          <Square data-icon="inline-start" />
          Stop Early
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Status</div>
          <div className="mt-2 font-semibold">{status === "saving" ? "Saving" : status === "running" ? "Running" : "Preparing"}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Elapsed</div>
          <div className="mt-2 font-semibold tabular-nums">{elapsedSeconds}s</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Progress</div>
          <div className="mt-2 font-semibold tabular-nums">{completedUnits}</div>
        </div>
      </div>

      <section className="min-h-[640px] rounded-lg border bg-card p-4">
        {pendingRun.setup.activity === "letter-target" ? (
          <LetterTargetRuntime
            onPlayingChange={() => undefined}
            onRunComplete={handleLetterTargetComplete}
            selectedWords={selectedWords}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : pendingRun.setup.activity === "letter-find" ? (
          <LetterFindRuntime
            onPlayingChange={() => undefined}
            onRunComplete={handleLetterFindComplete}
            selectedWords={selectedWords}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : pendingRun.setup.activity === "eye-pong" ? (
          <EyePongRuntime
            onPlayingChange={() => undefined}
            onRunComplete={handleEyePongComplete}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : null}
      </section>
    </main>
  )
}
