import { STOMP_DOWNBEAT_BPM } from "@/lib/audio/stomp-beat-map"
import type { ExerciseAudioMode } from "@/types/exercise-control"

export const EYE_PONG_TARGET_COUNT = 20
export const EYE_PONG_DEFAULT_VISUAL_BPM = 54

export function getEyePongActualBpm(
  audioMode: ExerciseAudioMode,
  tempoBpm?: number,
  musicPlaybackRate?: number
) {
  if (audioMode === "music") {
    return STOMP_DOWNBEAT_BPM * (musicPlaybackRate ?? 1)
  }

  return tempoBpm ?? EYE_PONG_DEFAULT_VISUAL_BPM
}

export function getEyePongIntervalMs(actualBpm: number) {
  return Math.round(60_000 / actualBpm)
}

export function getEyePongCompletionRate(
  targetsPresented: number,
  targetCount = EYE_PONG_TARGET_COUNT
) {
  if (targetCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((targetsPresented / targetCount) * 100))
}
