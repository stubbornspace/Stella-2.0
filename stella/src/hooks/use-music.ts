import { useCallback, useEffect, useRef } from "react"

import { getAudioContext } from "@/lib/audio/sound-manager"
import { stompBeatMap } from "@/lib/audio/stomp-beat-map"

interface UseMusicOptions {
  beatMode?: "beats" | "downbeats"
  playbackRate?: number
  volume?: number
  onBeat?: () => void
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
  const nextBeatIndexRef = useRef(0)
  const loopOffsetRef = useRef(0)

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
    gain.gain.value = volumeRef.current
    gain.connect(context.destination)
    gainRef.current = gain

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = playbackRateRef.current
    source.connect(gain)
    source.start()
    sourceRef.current = source

    const beatTimes =
      beatModeRef.current === "beats" ? stompBeatMap.beats : stompBeatMap.downbeats
    const duration = stompBeatMap.duration / playbackRateRef.current
    const audioStartTime = context.currentTime
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
      const currentLoop = Math.floor(elapsed / duration)

      if (currentLoop > loopOffsetRef.current) {
        loopOffsetRef.current = currentLoop
        nextBeatIndexRef.current = 0
      }

      const loopBase = audioStartTime + currentLoop * duration

      while (nextBeatIndexRef.current < beatTimes.length) {
        const adjustedBeatTime = beatTimes[nextBeatIndexRef.current] / playbackRateRef.current
        const beatAbsoluteTime = loopBase + adjustedBeatTime

        if (beatAbsoluteTime > now + lookAheadSeconds) {
          break
        }

        if (beatAbsoluteTime < now - 0.05) {
          nextBeatIndexRef.current += 1
          continue
        }

        const delayMs = (beatAbsoluteTime - now) * 1000
        window.setTimeout(() => {
          onBeatRef.current?.()
        }, Math.max(0, delayMs))
        nextBeatIndexRef.current += 1
      }
    }

    timerIdRef.current = window.setInterval(tick, 25)
  }, [])

  const stop = useCallback(() => {
    if (timerIdRef.current) {
      window.clearInterval(timerIdRef.current)
      timerIdRef.current = null
    }

    isRunningRef.current = false

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

  useEffect(() => () => stop(), [stop])

  return { start, stop }
}
