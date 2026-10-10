import { useCallback, useEffect, useRef } from "react"

import { getAudioContext } from "@/lib/audio/sound-manager"
import { stompBeatMap } from "@/lib/audio/stomp-beat-map"
import {
  contextTimeToPerformanceTime,
  performanceTimeToContextTime,
  type NearestBeatTiming,
} from "@/lib/audio/audio-clock"

interface UseMusicOptions {
  beatMode?: "beats" | "downbeats"
  playbackRate?: number
  volume?: number
  onBeat?: (scheduledTimeMs: number) => void
}

let cachedMusicBuffer: AudioBuffer | null = null

async function loadMusicBuffer() {
  if (cachedMusicBuffer) {
    return cachedMusicBuffer
  }

  const context = getAudioContext()
  const response = await fetch("/audio/music/stomp.mp3")

  if (!response.ok) {
    throw new Error("Failed to load stomp music asset.")
  }

  const arrayBuffer = await response.arrayBuffer()
  cachedMusicBuffer = await context.decodeAudioData(arrayBuffer)
  return cachedMusicBuffer
}

export function useMusic({
  beatMode = "downbeats",
  playbackRate = 1,
  volume = 0.7,
  onBeat,
}: UseMusicOptions = {}) {
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const timerIdRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)
  const onBeatRef = useRef(onBeat)
  const volumeRef = useRef(volume)
  const beatModeRef = useRef(beatMode)
  const playbackRateRef = useRef(playbackRate)
  const mutedRef = useRef(false)
  const nextBeatIndexRef = useRef(0)
  const loopOffsetRef = useRef(0)
  const audioStartTimeRef = useRef<number | null>(null)
  const loopDurationRef = useRef(stompBeatMap.duration)

  useEffect(() => {
    onBeatRef.current = onBeat
  }, [onBeat])

  useEffect(() => {
    beatModeRef.current = beatMode
  }, [beatMode])

  useEffect(() => {
    volumeRef.current = volume
    if (gainRef.current) {
      gainRef.current.gain.value = volume
    }
  }, [volume])

  useEffect(() => {
    playbackRateRef.current = playbackRate
    if (sourceRef.current) {
      sourceRef.current.playbackRate.value = playbackRate
    }
  }, [playbackRate])

  const start = useCallback(async () => {
    const context = getAudioContext()

    if (context.state === "suspended") {
      await context.resume()
    }

    if (isRunningRef.current) {
      return
    }

    const buffer = await loadMusicBuffer()
    const gain = context.createGain()
    gain.gain.value = mutedRef.current ? 0 : volumeRef.current
    gain.connect(context.destination)
    gainRef.current = gain

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = playbackRateRef.current
    source.connect(gain)
    const audioStartTime = context.currentTime + 0.05
    source.start(audioStartTime)
    sourceRef.current = source

    const beatTimes =
      beatModeRef.current === "beats"
        ? stompBeatMap.beats
        : stompBeatMap.downbeats
    loopDurationRef.current = buffer.duration
    const duration = loopDurationRef.current / playbackRateRef.current
    audioStartTimeRef.current = audioStartTime
    const lookAheadSeconds = 0.15

    nextBeatIndexRef.current = 0
    loopOffsetRef.current = 0
    isRunningRef.current = true

    const tick = () => {
      if (!isRunningRef.current) {
        return
      }

      const now = getAudioContext().currentTime
      const elapsed = now - audioStartTime
      const currentLoop = Math.max(0, Math.floor(elapsed / duration))

      if (currentLoop > loopOffsetRef.current) {
        loopOffsetRef.current = currentLoop
        nextBeatIndexRef.current = 0
      }

      const loopBase = audioStartTime + currentLoop * duration

      while (nextBeatIndexRef.current < beatTimes.length) {
        const adjustedBeatTime =
          beatTimes[nextBeatIndexRef.current] / playbackRateRef.current
        const beatAbsoluteTime = loopBase + adjustedBeatTime

        if (beatAbsoluteTime > now + lookAheadSeconds) {
          break
        }

        if (beatAbsoluteTime < now - 0.05) {
          nextBeatIndexRef.current += 1
          continue
        }

        const scheduledTimeMs = contextTimeToPerformanceTime(
          context,
          beatAbsoluteTime
        )
        const delayMs = scheduledTimeMs - performance.now()
        window.setTimeout(
          () => {
            onBeatRef.current?.(scheduledTimeMs)
          },
          Math.max(0, delayMs)
        )
        nextBeatIndexRef.current += 1
      }
    }

    timerIdRef.current = window.setInterval(tick, 25)
  }, [])

  const getNearestBeat = useCallback(
    (inputTimeMs = performance.now()): NearestBeatTiming | null => {
      const audioStartTime = audioStartTimeRef.current

      if (!isRunningRef.current || audioStartTime == null) {
        return null
      }

      const context = getAudioContext()
      const inputContextTime = performanceTimeToContextTime(
        context,
        inputTimeMs
      )
      const playbackRate = playbackRateRef.current
      const duration = loopDurationRef.current / playbackRate
      const beatTimes =
        beatModeRef.current === "beats"
          ? stompBeatMap.beats
          : stompBeatMap.downbeats
      const elapsed = inputContextTime - audioStartTime
      const centerLoop = Math.max(0, Math.floor(elapsed / duration))
      let nearest: NearestBeatTiming | null = null

      for (
        let loopIndex = Math.max(0, centerLoop - 1);
        loopIndex <= centerLoop + 1;
        loopIndex += 1
      ) {
        const loopBase = audioStartTime + loopIndex * duration

        beatTimes.forEach((beatTime, beatIndex) => {
          const beatContextTime = loopBase + beatTime / playbackRate
          const scheduledTimeMs = contextTimeToPerformanceTime(
            context,
            beatContextTime
          )
          const offsetMs = inputTimeMs - scheduledTimeMs

          if (!nearest || Math.abs(offsetMs) < Math.abs(nearest.offsetMs)) {
            nearest = {
              beatIndex: loopIndex * beatTimes.length + beatIndex,
              loopIndex,
              offsetMs,
              scheduledTimeMs,
            }
          }
        })
      }

      return nearest
    },
    []
  )

  const stop = useCallback(() => {
    if (timerIdRef.current) {
      window.clearInterval(timerIdRef.current)
      timerIdRef.current = null
    }

    isRunningRef.current = false
    audioStartTimeRef.current = null

    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
      } catch {
        // no-op
      }
      sourceRef.current = null
    }

    if (gainRef.current) {
      gainRef.current.disconnect()
      gainRef.current = null
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted

    if (!gainRef.current) {
      return
    }

    const context = getAudioContext()
    const now = context.currentTime
    gainRef.current.gain.cancelScheduledValues(now)
    gainRef.current.gain.setTargetAtTime(
      muted ? 0 : volumeRef.current,
      now,
      0.02
    )
  }, [])

  useEffect(() => () => stop(), [stop])

  return { getNearestBeat, setMuted, start, stop }
}
