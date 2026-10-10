export const ON_BEAT_TOLERANCE_MS = 150

function round(value: number) {
  return Math.round(value)
}

export function getSignedNearestBeatOffset(
  beatOffsetMs: number,
  beatIntervalMs: number
) {
  const normalizedOffset =
    ((beatOffsetMs % beatIntervalMs) + beatIntervalMs) % beatIntervalMs

  return normalizedOffset > beatIntervalMs / 2
    ? normalizedOffset - beatIntervalMs
    : normalizedOffset
}

export function summarizeBeatOffsets(offsets: number[], actualBpm?: number) {
  if (!actualBpm || offsets.length === 0) {
    return {
      onBeatAccuracyPercent: undefined,
      timingVariabilityStdDev: undefined,
    }
  }

  const beatIntervalMs = (60 / actualBpm) * 1000
  const signedOffsets = offsets.map((offset) =>
    getSignedNearestBeatOffset(offset, beatIntervalMs)
  )
  const toleranceMs = Math.min(ON_BEAT_TOLERANCE_MS, beatIntervalMs / 2)
  const onBeatHits = signedOffsets.filter(
    (offset) => Math.abs(offset) <= toleranceMs
  ).length
  const meanOffset =
    signedOffsets.reduce((sum, value) => sum + value, 0) / signedOffsets.length
  const timingVariabilityStdDev = round(
    Math.sqrt(
      signedOffsets.reduce((sum, value) => sum + (value - meanOffset) ** 2, 0) /
        signedOffsets.length
    )
  )

  return {
    onBeatAccuracyPercent: round((onBeatHits / signedOffsets.length) * 100),
    timingVariabilityStdDev,
  }
}
