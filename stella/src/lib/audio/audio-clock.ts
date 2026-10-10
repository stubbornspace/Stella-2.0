export interface NearestBeatTiming {
  beatIndex: number
  loopIndex?: number
  offsetMs: number
  scheduledTimeMs: number
}

function getOutputTimestamp(context: AudioContext) {
  const timestamp = context.getOutputTimestamp?.()
  const contextTime = timestamp?.contextTime
  const performanceTime = timestamp?.performanceTime

  if (
    typeof contextTime === "number" &&
    typeof performanceTime === "number" &&
    Number.isFinite(contextTime) &&
    Number.isFinite(performanceTime) &&
    (contextTime > 0 || performanceTime > 0)
  ) {
    return { contextTime, performanceTime }
  }

  return null
}

export function contextTimeToPerformanceTime(
  context: AudioContext,
  contextTime: number
) {
  const outputTimestamp = getOutputTimestamp(context)

  if (outputTimestamp) {
    return (
      outputTimestamp.performanceTime +
      (contextTime - outputTimestamp.contextTime) * 1000
    )
  }

  const outputLatency =
    "outputLatency" in context && Number.isFinite(context.outputLatency)
      ? context.outputLatency
      : 0

  return (
    performance.now() +
    (contextTime - context.currentTime + outputLatency) * 1000
  )
}

export function performanceTimeToContextTime(
  context: AudioContext,
  performanceTime: number
) {
  const outputTimestamp = getOutputTimestamp(context)

  if (outputTimestamp) {
    return (
      outputTimestamp.contextTime +
      (performanceTime - outputTimestamp.performanceTime) / 1000
    )
  }

  const outputLatency =
    "outputLatency" in context && Number.isFinite(context.outputLatency)
      ? context.outputLatency
      : 0

  return (
    context.currentTime +
    (performanceTime - performance.now()) / 1000 -
    outputLatency
  )
}
