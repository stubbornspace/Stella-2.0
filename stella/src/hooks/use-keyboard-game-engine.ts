import { useCallback, useEffect, useRef, useState } from "react"

import type {
  ExerciseAudioMode,
  LetterRuntimeStat,
} from "@/types/exercise-control"
import { KEY_TO_LETTER, type KeyState } from "@/lib/audio/constants"
import { playAudio, preloadAudio, unlockAudio } from "@/lib/audio/sound-manager"
import { useMetronome } from "@/hooks/use-metronome"
import { useMusic } from "@/hooks/use-music"

export type LetterStat = LetterRuntimeStat

export interface AudioConfig {
  instruction: string[] | ((sequence: number[]) => Promise<void>)
  correct: string
  wrong: string[]
  letterSound: (letter: string) => string
  finish: string[]
  hint: string[] | ((letter: string, completedCount: number) => Promise<void>)
  preload?: string[]
  onCorrect?: (
    letter: string,
    nextLetter: string | null,
    completedCount: number
  ) => Promise<void>
}

interface KeyboardGameEngineConfig {
  bpm: number
  beatSource?: ExerciseAudioMode
  showTarget?: boolean
  audio: AudioConfig
  onComplete: (stats: LetterStat[]) => void
  onStatsChange?: (stats: LetterStat[]) => void
  musicPlaybackRate?: number
}

type AttemptEvent = NonNullable<LetterStat["attemptEvents"]>[number]

function scheduledWallClockTimestamp(scheduledTimeMs: number) {
  const elapsedSinceScheduled = performance.now() - scheduledTimeMs
  return new Date(Date.now() - elapsedSinceScheduled).toISOString()
}

export function useKeyboardGameEngine({
  bpm,
  beatSource = "metronome",
  showTarget = true,
  audio,
  onComplete,
  onStatsChange,
  musicPlaybackRate = 1,
}: KeyboardGameEngineConfig) {
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const [letterStats, setLetterStats] = useState<LetterStat[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInputEnabled, setIsInputEnabled] = useState(false)

  const sequenceRef = useRef<number[]>([])
  const indexRef = useRef(0)
  const statsRef = useRef<LetterStat[]>([])
  const attemptsRef = useRef(0)
  const attemptEventsRef = useRef<AttemptEvent[]>([])
  const letterStartRef = useRef(0)
  const targetStartedAtRef = useRef<string | undefined>(undefined)
  const lastBeatRef = useRef(0)
  const playingRef = useRef(false)
  const acceptingInputRef = useRef(false)
  const preloadRef = useRef<Promise<unknown> | null>(null)
  const onCompleteRef = useRef(onComplete)
  const onStatsChangeRef = useRef(onStatsChange)
  const audioRef = useRef(audio)
  const hintTimerRef = useRef<number | null>(null)
  const startHintTimerRef = useRef<() => void>(() => undefined)
  const audioPlayingRef = useRef(false)
  const wrongAudioPlayingRef = useRef(false)
  const beatSourceRef = useRef(beatSource)
  const showTargetRef = useRef(showTarget)
  const runVersionRef = useRef(0)

  useEffect(() => {
    onCompleteRef.current = onComplete
    onStatsChangeRef.current = onStatsChange
    audioRef.current = audio
    beatSourceRef.current = beatSource
    showTargetRef.current = showTarget
  }, [audio, beatSource, onComplete, onStatsChange, showTarget])

  const clearHintTimer = () => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
  }

  function handleBeat(scheduledTimeMs = performance.now()) {
    if (!playingRef.current || audioPlayingRef.current) {
      return
    }

    lastBeatRef.current = scheduledTimeMs

    if (!letterStartRef.current) {
      letterStartRef.current = scheduledTimeMs
      targetStartedAtRef.current = scheduledWallClockTimestamp(scheduledTimeMs)
    }

    acceptingInputRef.current = true
    setIsInputEnabled(true)

    if (!showTargetRef.current) {
      return
    }

    const targetKey = sequenceRef.current[indexRef.current]
    if (targetKey != null) {
      setKeyStates({ [targetKey]: "waiting" })
    }
  }

  const {
    setMuted: setMetronomeMuted,
    start: startMetronome,
    stop: stopMetronome,
  } = useMetronome({
    bpm,
    volume: 0.5,
    onBeat: handleBeat,
  })

  const {
    setMuted: setMusicMuted,
    start: startMusicBeat,
    stop: stopMusicBeat,
  } = useMusic({
    beatMode: "downbeats",
    onBeat: handleBeat,
    playbackRate: musicPlaybackRate,
    volume: 0.5,
  })

  const stopBeat = useCallback(() => {
    stopMetronome()
    stopMusicBeat()
  }, [stopMetronome, stopMusicBeat])

  const setBeatMuted = useCallback(
    (muted: boolean) => {
      setMetronomeMuted(muted)
      setMusicMuted(muted)
    },
    [setMetronomeMuted, setMusicMuted]
  )

  const startBeat = useCallback(() => {
    if (!playingRef.current || audioPlayingRef.current) {
      return
    }

    if (beatSourceRef.current === "silent") {
      const startedAt = performance.now()
      acceptingInputRef.current = true
      setIsInputEnabled(true)
      letterStartRef.current = startedAt
      targetStartedAtRef.current = new Date().toISOString()
      if (showTargetRef.current) {
        const targetKey = sequenceRef.current[indexRef.current]
        if (targetKey != null) {
          setKeyStates({ [targetKey]: "waiting" })
        }
      }
      return
    }

    setBeatMuted(false)

    if (beatSourceRef.current === "music") {
      void startMusicBeat()
    } else {
      void startMetronome()
    }
  }, [setBeatMuted, startMetronome, startMusicBeat])

  const startHintTimer = useCallback(() => {
    clearHintTimer()
    hintTimerRef.current = window.setTimeout(async () => {
      if (!playingRef.current || audioPlayingRef.current) {
        return
      }

      const targetKey = sequenceRef.current[indexRef.current]
      if (targetKey == null) {
        return
      }

      const runVersion = runVersionRef.current
      acceptingInputRef.current = false
      setIsInputEnabled(false)
      audioPlayingRef.current = true
      setBeatMuted(true)
      const { hint } = audioRef.current
      const letter = KEY_TO_LETTER[targetKey]

      if (typeof hint === "function") {
        await hint(letter, statsRef.current.length)
      } else {
        for (const url of hint) {
          await playAudio(url)
        }
      }

      if (runVersion !== runVersionRef.current || !playingRef.current) {
        return
      }

      audioPlayingRef.current = false
      lastBeatRef.current = 0
      letterStartRef.current = 0
      targetStartedAtRef.current = undefined
      if (beatSourceRef.current === "silent") {
        startBeat()
      } else {
        setBeatMuted(false)
      }
      startHintTimerRef.current()
    }, 10000)
  }, [setBeatMuted, startBeat])

  useEffect(() => {
    startHintTimerRef.current = startHintTimer
  }, [startHintTimer])

  const preload = useCallback(() => {
    preloadRef.current = preloadAudio([
      audio.correct,
      ...audio.wrong,
      ...(audio.preload ?? []),
    ])
  }, [audio.correct, audio.preload, audio.wrong])

  const startGame = useCallback(
    async (sequence: number[]) => {
      const runVersion = runVersionRef.current + 1
      runVersionRef.current = runVersion

      await unlockAudio()
      await preloadRef.current

      sequenceRef.current = sequence
      indexRef.current = 0
      statsRef.current = []
      attemptsRef.current = 0
      attemptEventsRef.current = []
      letterStartRef.current = 0
      targetStartedAtRef.current = undefined
      lastBeatRef.current = 0
      acceptingInputRef.current = false
      setIsInputEnabled(false)
      playingRef.current = false
      audioPlayingRef.current = true
      wrongAudioPlayingRef.current = false
      stopBeat()

      setKeyStates({})
      setLetterStats([])
      setIsPlaying(false)
      onStatsChangeRef.current?.([])

      const { instruction } = audioRef.current
      if (typeof instruction === "function") {
        await instruction(sequence)
      } else {
        for (const url of instruction) {
          await playAudio(url)
        }
      }

      if (runVersion !== runVersionRef.current) {
        return
      }

      audioPlayingRef.current = false
      playingRef.current = true
      setIsPlaying(true)
      await new Promise((resolve) => window.setTimeout(resolve, 100))
      startBeat()
      startHintTimer()
    },
    [startBeat, startHintTimer, stopBeat]
  )

  const handleKeyClick = useCallback(
    async (id: number) => {
      if (
        !playingRef.current ||
        !acceptingInputRef.current ||
        audioPlayingRef.current
      ) {
        return
      }

      const targetKey = sequenceRef.current[indexRef.current]
      const pressedLetter = KEY_TO_LETTER[id]
      const now = performance.now()
      const beatOffsetMs =
        beatSourceRef.current === "silent" || lastBeatRef.current === 0
          ? undefined
          : Math.max(0, Math.round(now - lastBeatRef.current))
      const attemptEvent: AttemptEvent = {
        beatOffsetMs,
        correct: id === targetKey,
        pressedLetter,
        timestamp: new Date().toISOString(),
      }

      attemptEventsRef.current = [...attemptEventsRef.current, attemptEvent]

      if (id !== targetKey) {
        attemptsRef.current += 1
        setKeyStates((current) => ({ ...current, [id]: "incorrect" }))
        const variants = audioRef.current.wrong
        const variant = variants[Math.floor(Math.random() * variants.length)]
        if (variant && !wrongAudioPlayingRef.current) {
          wrongAudioPlayingRef.current = true
          void playAudio(variant)
            .catch(() => undefined)
            .finally(() => {
              wrongAudioPlayingRef.current = false
            })
        }
        window.setTimeout(() => {
          setKeyStates((current) => {
            if (current[id] !== "incorrect") {
              return current
            }
            const next = { ...current }
            delete next[id]
            return next
          })
        }, 600)
        return
      }

      const runVersion = runVersionRef.current
      clearHintTimer()
      acceptingInputRef.current = false
      setIsInputEnabled(false)
      audioPlayingRef.current = true
      setBeatMuted(true)

      const currentIndex = indexRef.current
      const letter = KEY_TO_LETTER[id]
      const timeMs =
        letterStartRef.current > 0
          ? Math.max(0, Math.round(now - letterStartRef.current))
          : 0
      const isLast = currentIndex >= sequenceRef.current.length - 1
      const nextKey = sequenceRef.current[currentIndex + 1]
      const nextLetter = nextKey != null ? KEY_TO_LETTER[nextKey] : null

      setKeyStates({ [id]: "correct" })

      const stat: LetterStat = {
        attemptEvents: [...attemptEventsRef.current],
        attempts: attemptsRef.current + 1,
        beatOffsetMs,
        completedAt: attemptEvent.timestamp,
        letter,
        targetStartedAt: targetStartedAtRef.current,
        timeMs,
      }

      statsRef.current = [...statsRef.current, stat]
      setLetterStats([...statsRef.current])
      onStatsChangeRef.current?.([...statsRef.current])

      if (!isLast) {
        indexRef.current = currentIndex + 1
      }

      await playAudio(audioRef.current.correct)
      if (audioRef.current.onCorrect) {
        await audioRef.current.onCorrect(
          letter,
          nextLetter,
          statsRef.current.length
        )
      } else {
        await playAudio(audioRef.current.letterSound(letter))
      }

      if (runVersion !== runVersionRef.current) {
        return
      }

      if (isLast) {
        playingRef.current = false
        audioPlayingRef.current = false
        stopBeat()
        setIsPlaying(false)
        setKeyStates({})
        onCompleteRef.current(statsRef.current)
        for (const url of audioRef.current.finish) {
          await playAudio(url)
        }
        return
      }

      attemptsRef.current = 0
      attemptEventsRef.current = []
      letterStartRef.current = 0
      targetStartedAtRef.current = undefined
      lastBeatRef.current = 0
      setKeyStates({})
      audioPlayingRef.current = false
      if (beatSourceRef.current === "silent") {
        startBeat()
      } else {
        setBeatMuted(false)
      }
      startHintTimer()
    },
    [setBeatMuted, startBeat, startHintTimer, stopBeat]
  )

  const stopGame = useCallback(() => {
    runVersionRef.current += 1
    stopBeat()
    clearHintTimer()
    playingRef.current = false
    acceptingInputRef.current = false
    setIsInputEnabled(false)
    audioPlayingRef.current = false
    wrongAudioPlayingRef.current = false
    setIsPlaying(false)
    setKeyStates({})
  }, [stopBeat])

  useEffect(() => () => stopGame(), [stopGame])

  return {
    handleKeyClick,
    isPlaying,
    isInputEnabled,
    keyStates,
    letterStats,
    preload,
    startGame,
    stopGame,
  }
}
