import { useCallback, useEffect, useRef, useState } from "react"

import type { ExerciseAudioMode } from "@/types/exercise-control"
import { KEY_TO_LETTER, type KeyState } from "@/lib/audio/constants"
import { playAudio, preloadAudio, unlockAudio } from "@/lib/audio/sound-manager"
import { useMetronome } from "@/hooks/use-metronome"
import { useMusic } from "@/hooks/use-music"

export interface LetterStat {
  letter: string
  attempts: number
  timeMs: number
  beatOffsetMs?: number
}

export interface AudioConfig {
  instruction: string[] | ((sequence: number[]) => Promise<void>)
  correct: string
  wrong: string[]
  letterSound: (letter: string) => string
  finish: string[]
  hint: string[] | ((letter: string) => Promise<void>)
  preload?: string[]
  onCorrect?: (letter: string, nextLetter: string | null) => Promise<void>
}

interface KeyboardGameEngineConfig {
  bpm: number
  beatSource?: ExerciseAudioMode
  showTarget?: boolean
  audio: AudioConfig
  onComplete: (stats: LetterStat[]) => void
  musicPlaybackRate?: number
}

export function useKeyboardGameEngine({
  bpm,
  beatSource = "metronome",
  showTarget = true,
  audio,
  onComplete,
  musicPlaybackRate = 1,
}: KeyboardGameEngineConfig) {
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const [letterStats, setLetterStats] = useState<LetterStat[]>([])
  const [isPlaying, setIsPlaying] = useState(false)

  const sequenceRef = useRef<number[]>([])
  const indexRef = useRef(0)
  const statsRef = useRef<LetterStat[]>([])
  const attemptsRef = useRef(0)
  const letterStartRef = useRef(0)
  const lastBeatRef = useRef(0)
  const playingRef = useRef(false)
  const waitingRef = useRef(false)
  const preloadRef = useRef<Promise<unknown> | null>(null)
  const onCompleteRef = useRef(onComplete)
  const audioRef = useRef(audio)
  const hintTimerRef = useRef<number | null>(null)
  const audioPlayingRef = useRef(false)
  const beatSourceRef = useRef(beatSource)
  const showTargetRef = useRef(showTarget)

  onCompleteRef.current = onComplete
  audioRef.current = audio
  beatSourceRef.current = beatSource
  showTargetRef.current = showTarget

  const clearHintTimer = () => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
  }

  const { start: startMetronome, stop: stopMetronome } = useMetronome({
    bpm,
    volume: 0.5,
    onBeat: handleBeat,
  })

  const { start: startMusicBeat, stop: stopMusicBeat } = useMusic({
    beatMode: "downbeats",
    onBeat: handleBeat,
    playbackRate: musicPlaybackRate,
    volume: 0.5,
  })

  function handleBeat() {
    if (!playingRef.current) {
      return
    }

    lastBeatRef.current = Date.now()

    if (!letterStartRef.current) {
      letterStartRef.current = Date.now()
    }

    waitingRef.current = true

    if (!showTargetRef.current) {
      return
    }

    const targetKey = sequenceRef.current[indexRef.current]
    if (targetKey != null) {
      setKeyStates({ [targetKey]: "waiting" })
    }
  }

  const stopBeat = useCallback(() => {
    stopMetronome()
    stopMusicBeat()
  }, [stopMetronome, stopMusicBeat])

  const startBeat = useCallback(() => {
    if (beatSourceRef.current === "silent") {
      waitingRef.current = true
      letterStartRef.current = Date.now()
      if (showTargetRef.current) {
        const targetKey = sequenceRef.current[indexRef.current]
        if (targetKey != null) {
          setKeyStates({ [targetKey]: "waiting" })
        }
      }
      return
    }

    if (beatSourceRef.current === "music") {
      void startMusicBeat()
    } else {
      void startMetronome()
    }
  }, [startMetronome, startMusicBeat])

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

      audioPlayingRef.current = true
      stopBeat()
      const { hint } = audioRef.current
      const letter = KEY_TO_LETTER[targetKey]

      if (typeof hint === "function") {
        await hint(letter)
      } else {
        for (const url of hint) {
          await playAudio(url)
        }
      }

      audioPlayingRef.current = false

      if (playingRef.current) {
        startBeat()
        startHintTimer()
      }
    }, 10000)
  }, [startBeat, stopBeat])

  const preload = useCallback(() => {
    preloadRef.current = preloadAudio([
      audio.correct,
      ...audio.wrong,
      ...(audio.preload ?? []),
    ])
  }, [audio.correct, audio.preload, audio.wrong])

  const startGame = useCallback(
    async (sequence: number[]) => {
      await unlockAudio()
      await preloadRef.current

      sequenceRef.current = sequence
      indexRef.current = 0
      statsRef.current = []
      attemptsRef.current = 0
      letterStartRef.current = 0
      lastBeatRef.current = 0
      waitingRef.current = false
      playingRef.current = true

      setKeyStates({})
      setLetterStats([])
      setIsPlaying(true)

      const { instruction } = audioRef.current
      if (typeof instruction === "function") {
        await instruction(sequence)
      } else {
        for (const url of instruction) {
          await playAudio(url)
        }
      }

      await new Promise((resolve) => window.setTimeout(resolve, 100))
      startBeat()
      startHintTimer()
    },
    [startBeat, startHintTimer]
  )

  const handleKeyClick = useCallback(
    async (id: number) => {
      if (!playingRef.current || !waitingRef.current) {
        return
      }

      const targetKey = sequenceRef.current[indexRef.current]
      if (id !== targetKey) {
        attemptsRef.current += 1
        setKeyStates((current) => ({ ...current, [id]: "incorrect" }))
        if (!audioPlayingRef.current) {
          const variants = audioRef.current.wrong
          const variant = variants[Math.floor(Math.random() * variants.length)]
          if (variant) {
            void playAudio(variant)
          }
        }
        window.setTimeout(() => {
          setKeyStates((current) => {
            const next = { ...current }
            delete next[id]
            return next
          })
        }, 600)
        return
      }

      clearHintTimer()
      waitingRef.current = false

      const letter = KEY_TO_LETTER[id]
      const timeMs = letterStartRef.current > 0 ? Date.now() - letterStartRef.current : 0
      const beatOffsetMs =
        beatSourceRef.current === "silent" || lastBeatRef.current === 0
          ? undefined
          : Date.now() - lastBeatRef.current

      setKeyStates({ [id]: "correct" })

      const stat: LetterStat = {
        attempts: attemptsRef.current + 1,
        beatOffsetMs,
        letter,
        timeMs,
      }

      statsRef.current = [...statsRef.current, stat]
      setLetterStats([...statsRef.current])

      await playAudio(audioRef.current.correct)
      const nextKey = sequenceRef.current[indexRef.current + 1]
      const nextLetter = nextKey != null ? KEY_TO_LETTER[nextKey] : null

      if (audioRef.current.onCorrect) {
        await audioRef.current.onCorrect(letter, nextLetter)
      } else {
        await playAudio(audioRef.current.letterSound(letter))
      }

      const isLast = indexRef.current >= sequenceRef.current.length - 1
      if (isLast) {
        stopBeat()
        playingRef.current = false
        setIsPlaying(false)
        for (const url of audioRef.current.finish) {
          await playAudio(url)
        }
        onCompleteRef.current(statsRef.current)
        return
      }

      indexRef.current += 1
      attemptsRef.current = 0
      letterStartRef.current = 0
      lastBeatRef.current = 0
      setKeyStates({})
      startHintTimer()

      if (beatSourceRef.current === "silent") {
        waitingRef.current = true
        letterStartRef.current = Date.now()
        if (showTargetRef.current) {
          const nextTargetKey = sequenceRef.current[indexRef.current]
          if (nextTargetKey != null) {
            setKeyStates({ [nextTargetKey]: "waiting" })
          }
        }
      }
    },
    [startHintTimer, stopBeat]
  )

  const stopGame = useCallback(() => {
    stopBeat()
    clearHintTimer()
    playingRef.current = false
    waitingRef.current = false
    setIsPlaying(false)
    setKeyStates({})
  }, [stopBeat])

  useEffect(() => () => stopGame(), [stopGame])

  return {
    handleKeyClick,
    isPlaying,
    keyStates,
    letterStats,
    preload,
    startGame,
    stopGame,
  }
}
