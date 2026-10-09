import { useCallback, useEffect, useRef } from "react"

import { getAudioContext } from "@/lib/audio/sound-manager"

interface UseMetronomeOptions {
  bpm?: number
  volume?: number
  onBeat?: () => void
}

export function useMetronome({
  bpm = 120,
  volume = 0.7,
  onBeat,
}: UseMetronomeOptions = {}) {
  const nextNoteTimeRef = useRef(0)
  const timerIdRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)
  const onBeatRef = useRef(onBeat)
  const bpmRef = useRef(bpm)
  const volumeRef = useRef(volume)

  useEffect(() => {
    onBeatRef.current = onBeat
  }, [onBeat])

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  const start = useCallback(async () => {
    const context = getAudioContext()

    if (context.state === "suspended") {
      await context.resume()
    }

    if (isRunningRef.current) {
      return
    }

    nextNoteTimeRef.current = context.currentTime + 0.05
    isRunningRef.current = true

    const scheduleAheadTime = 0.1

    const tick = () => {
      const audioContext = getAudioContext()

      if (!isRunningRef.current) {
        return
      }

      while (nextNoteTimeRef.current < audioContext.currentTime + scheduleAheadTime) {
        const time = nextNoteTimeRef.current
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()

        gain.gain.setValueAtTime(0.0001, time)
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, volumeRef.current),
          time + 0.001
        )
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03)

        oscillator.frequency.setValueAtTime(1600, time)
        oscillator.type = "square"
        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start(time)
        oscillator.stop(time + 0.05)

        const delay = (time - audioContext.currentTime) * 1000
        window.setTimeout(() => {
          onBeatRef.current?.()
        }, Math.max(0, delay))

        nextNoteTimeRef.current += 60 / bpmRef.current
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
  }, [])

  useEffect(() => () => stop(), [stop])

  return { start, stop }
}
