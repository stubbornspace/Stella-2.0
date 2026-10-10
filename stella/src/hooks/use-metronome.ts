import { useCallback, useEffect, useRef } from "react"

import { getAudioContext } from "@/lib/audio/sound-manager"

interface UseMetronomeOptions {
  bpm?: number
  volume?: number
  onBeat?: (scheduledTimeMs: number) => void
}

export function useMetronome({
  bpm = 120,
  volume = 0.7,
  onBeat,
}: UseMetronomeOptions = {}) {
  const nextNoteTimeRef = useRef(0)
  const timerIdRef = useRef<number | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const isRunningRef = useRef(false)
  const onBeatRef = useRef(onBeat)
  const bpmRef = useRef(bpm)
  const volumeRef = useRef(volume)
  const mutedRef = useRef(false)

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

    const masterGain = context.createGain()
    masterGain.gain.value = mutedRef.current ? 0 : 1
    masterGain.connect(context.destination)
    masterGainRef.current = masterGain

    const scheduleAheadTime = 0.1

    const tick = () => {
      const audioContext = getAudioContext()

      if (!isRunningRef.current) {
        return
      }

      while (
        nextNoteTimeRef.current <
        audioContext.currentTime + scheduleAheadTime
      ) {
        const time = nextNoteTimeRef.current
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()

        gain.gain.setValueAtTime(0.0001, time)
        const beatVolume = Math.max(0.0001, volumeRef.current)
        gain.gain.exponentialRampToValueAtTime(beatVolume, time + 0.001)
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03)

        oscillator.frequency.setValueAtTime(1600, time)
        oscillator.type = "square"
        oscillator.connect(gain)
        gain.connect(masterGain)
        oscillator.start(time)
        oscillator.stop(time + 0.05)

        const delay = (time - audioContext.currentTime) * 1000
        const scheduledTimeMs = performance.now() + delay
        window.setTimeout(
          () => {
            onBeatRef.current?.(scheduledTimeMs)
          },
          Math.max(0, delay)
        )

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

    if (masterGainRef.current) {
      masterGainRef.current.disconnect()
      masterGainRef.current = null
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted

    if (!masterGainRef.current) {
      return
    }

    const context = getAudioContext()
    const now = context.currentTime
    masterGainRef.current.gain.cancelScheduledValues(now)
    masterGainRef.current.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01)
  }, [])

  useEffect(() => () => stop(), [stop])

  return { setMuted, start, stop }
}
