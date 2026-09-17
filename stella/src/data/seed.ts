import { exerciseTypes } from "@/config/exercises"
import type {
  ExerciseSession,
  ExerciseType,
  EyePongSession,
  InhibitionChallengeSession,
  LetterFindSession,
  LetterTargetSession,
  MotorSequenceBuilderSession,
  Patient,
} from "@/types"

const demoToday = new Date("2026-09-15T12:00:00")

export const seedPatients: Patient[] = [
  {
    id: "p-1021",
    patientCode: "P-1021",
    firstName: "Maria",
    lastName: "Sanchez",
    createdAt: "2026-06-02T09:15:00.000Z",
    notes: "Primary demonstration record.",
  },
  {
    id: "p-1022",
    patientCode: "P-1022",
    firstName: "Daniel",
    lastName: "Brooks",
    createdAt: "2026-06-09T10:00:00.000Z",
  },
  {
    id: "p-1023",
    patientCode: "P-1023",
    firstName: "Emily",
    lastName: "Carter",
    createdAt: "2026-06-13T11:30:00.000Z",
  },
  {
    id: "p-1024",
    patientCode: "P-1024",
    firstName: "Isaac",
    lastName: "Nguyen",
    createdAt: "2026-06-18T14:20:00.000Z",
  },
  {
    id: "p-1025",
    patientCode: "P-1025",
    firstName: "Aisha",
    lastName: "Patel",
    createdAt: "2026-06-21T15:40:00.000Z",
  },
  {
    id: "p-1026",
    patientCode: "P-1026",
    firstName: "Robert",
    lastName: "Kim",
    createdAt: "2026-06-27T09:45:00.000Z",
  },
  {
    id: "p-1027",
    patientCode: "P-1027",
    firstName: "Grace",
    lastName: "Walker",
    createdAt: "2026-07-01T08:25:00.000Z",
  },
  {
    id: "p-1028",
    patientCode: "P-1028",
    firstName: "Omar",
    lastName: "Haddad",
    createdAt: "2026-07-04T12:10:00.000Z",
  },
  {
    id: "p-1029",
    patientCode: "P-1029",
    firstName: "Lena",
    lastName: "Morris",
    createdAt: "2026-07-08T13:35:00.000Z",
  },
  {
    id: "p-1030",
    patientCode: "P-1030",
    firstName: "Thomas",
    lastName: "Reed",
    createdAt: "2026-07-12T16:05:00.000Z",
  },
  {
    id: "p-1031",
    patientCode: "P-1031",
    firstName: "Priya",
    lastName: "Shah",
    createdAt: "2026-07-16T10:50:00.000Z",
  },
  {
    id: "p-1032",
    patientCode: "P-1032",
    firstName: "Mateo",
    lastName: "Rivera",
    createdAt: "2026-07-20T11:45:00.000Z",
  },
  {
    id: "p-1033",
    patientCode: "P-1033",
    firstName: "Hannah",
    lastName: "Lewis",
    createdAt: "2026-07-25T09:20:00.000Z",
  },
  {
    id: "p-1034",
    patientCode: "P-1034",
    firstName: "Noah",
    lastName: "Bennett",
    createdAt: "2026-07-29T13:00:00.000Z",
  },
  {
    id: "p-1035",
    patientCode: "P-1035",
    firstName: "Chloe",
    lastName: "Martin",
    createdAt: "2026-08-03T14:15:00.000Z",
  },
]

type MetricPoint = {
  accuracy: number
  firstAttempt: number
  latency: number
  errors: number
  completion: number
  changes: number
  go: number
  noGo: number
  missedGo: number
  sequence: number
  sequenceFirst: number
  time: number
}

const progressTrendPatientIds = new Set(["p-1021"])

const patientPlans = [
  {
    patientId: "p-1021",
    startOffset: 95,
    activities: exerciseTypes,
    counts: [9, 7, 4, 7, 5],
  },
  {
    patientId: "p-1022",
    startOffset: 74,
    activities: [
      "letter-target",
      "letter-find",
      "eye-pong",
    ] satisfies ExerciseType[],
    counts: [7, 6, 4],
  },
  {
    patientId: "p-1023",
    startOffset: 88,
    activities: [
      "letter-find",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [6, 5],
  },
  {
    patientId: "p-1024",
    startOffset: 69,
    activities: [
      "letter-target",
      "eye-pong",
      "inhibition-challenge",
    ] satisfies ExerciseType[],
    counts: [6, 5, 4],
  },
  {
    patientId: "p-1025",
    startOffset: 62,
    activities: exerciseTypes,
    counts: [5, 5, 4, 4, 3],
  },
  {
    patientId: "p-1026",
    startOffset: 55,
    activities: [
      "letter-target",
      "letter-find",
      "eye-pong",
    ] satisfies ExerciseType[],
    counts: [5, 4, 3],
  },
  {
    patientId: "p-1027",
    startOffset: 50,
    activities: [
      "letter-target",
      "inhibition-challenge",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [6, 5, 4],
  },
  {
    patientId: "p-1028",
    startOffset: 45,
    activities: [
      "letter-find",
      "eye-pong",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [5, 4, 3],
  },
  {
    patientId: "p-1029",
    startOffset: 42,
    activities: ["letter-target", "letter-find"] satisfies ExerciseType[],
    counts: [4, 3],
  },
  {
    patientId: "p-1030",
    startOffset: 38,
    activities: ["eye-pong", "inhibition-challenge"] satisfies ExerciseType[],
    counts: [6, 5],
  },
  {
    patientId: "p-1031",
    startOffset: 33,
    activities: [
      "letter-target",
      "letter-find",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [8, 6, 5],
  },
  {
    patientId: "p-1032",
    startOffset: 30,
    activities: [
      "letter-find",
      "inhibition-challenge",
    ] satisfies ExerciseType[],
    counts: [5, 4],
  },
  {
    patientId: "p-1033",
    startOffset: 26,
    activities: ["letter-target", "eye-pong"] satisfies ExerciseType[],
    counts: [4, 3],
  },
  {
    patientId: "p-1034",
    startOffset: 22,
    activities: [
      "letter-target",
      "eye-pong",
      "inhibition-challenge",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [5, 4, 4, 3],
  },
  {
    patientId: "p-1035",
    startOffset: 18,
    activities: [
      "letter-find",
      "eye-pong",
      "motor-sequence-builder",
    ] satisfies ExerciseType[],
    counts: [5, 4, 4],
  },
]

function dateFor(
  startOffset: number,
  sessionIndex: number,
  activityIndex: number
) {
  const date = new Date(demoToday)
  date.setDate(
    demoToday.getDate() - startOffset + sessionIndex * 7 + activityIndex * 2
  )
  return date.toISOString()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, precision = 0) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function metricPoint(
  seed: number,
  sessionIndex: number,
  patientId: string,
  sessionCount: number
): MetricPoint {
  const base = seed % 9

  if (progressTrendPatientIds.has(patientId)) {
    const progress = sessionCount <= 1 ? 1 : sessionIndex / (sessionCount - 1)
    const wiggle = [-1, 0, 1, 0, 1, 0][sessionIndex % 6]

    return {
      accuracy: clamp(74 + base + progress * 14 + wiggle, 68, 96),
      firstAttempt: clamp(66 + base + progress * 18 + wiggle, 62, 94),
      latency: clamp(1140 - base * 8 - progress * 260 + wiggle * 8, 720, 1180),
      errors: clamp(Math.round(4 - progress * 4 + (wiggle > 0 ? 0 : 1)), 0, 5),
      completion: clamp(80 + base + progress * 15 + wiggle, 70, 100),
      changes: Math.round(34 + base + progress * 18 + wiggle * 2),
      go: clamp(81 + base + progress * 14 + wiggle, 72, 98),
      noGo: clamp(77 + base + progress * 16 + wiggle, 68, 96),
      missedGo: clamp(
        Math.round(12 - progress * 8 + (wiggle > 0 ? 0 : 1)),
        2,
        15
      ),
      sequence: clamp(74 + base + progress * 16 + wiggle, 65, 96),
      sequenceFirst: clamp(68 + base + progress * 18 + wiggle, 60, 93),
      time: clamp(6200 - base * 70 - progress * 1700 + wiggle * 70, 3200, 7000),
    }
  }

  const wave = [0, 6, 2, 8, 5, 11, 7, 13, 9, 15][sessionIndex % 10]

  return {
    accuracy: clamp(74 + base + wave, 68, 96),
    firstAttempt: clamp(
      68 + base + wave + (sessionIndex % 2 === 0 ? 2 : -1),
      62,
      94
    ),
    latency: clamp(
      1110 - wave * 18 - base * 9 + (sessionIndex % 3) * 34,
      720,
      1180
    ),
    errors: clamp(
      4 - Math.floor(wave / 5) + (sessionIndex % 3 === 0 ? 1 : 0),
      0,
      5
    ),
    completion: clamp(78 + base + wave, 70, 100),
    changes: 34 + base + sessionIndex * 2 + (sessionIndex % 3) * 3,
    go: clamp(80 + base + wave, 72, 98),
    noGo: clamp(76 + base + wave - (sessionIndex % 2 === 0 ? 0 : 3), 68, 96),
    missedGo: clamp(12 - Math.floor(wave / 3) + (sessionIndex % 2), 2, 15),
    sequence: clamp(72 + base + wave, 65, 96),
    sequenceFirst: clamp(66 + base + wave, 60, 93),
    time: clamp(
      6200 - wave * 120 - base * 80 + (sessionIndex % 4) * 180,
      3200,
      7000
    ),
  }
}

function sessionStatus(
  sessionIndex: number,
  patientId: string
): "completed" | "ended-early" {
  return sessionIndex > 1 && (sessionIndex + patientId.length) % 11 === 0
    ? "ended-early"
    : "completed"
}

function baseSession<TActivity extends ExerciseType>(
  patientId: string,
  activity: TActivity,
  sessionIndex: number,
  activityIndex: number,
  startOffset: number
): BaseSessionWithActivity<TActivity> {
  return {
    sessionId: `${patientId}-${activity}-${sessionIndex + 1}`,
    patientId,
    activity,
    sessionDate: dateFor(startOffset, sessionIndex, activityIndex),
    status: sessionStatus(sessionIndex, patientId),
    summary:
      "Session-level Stella reporting values captured from keyboard exercise activity.",
    activeEngagementTimeMinutes: round(
      12 + sessionIndex * 0.8 + activityIndex * 0.6,
      1
    ),
    totalSessionDurationMinutes: round(
      15 + sessionIndex * 0.9 + activityIndex * 0.8,
      1
    ),
    attemptsPerMinute: round(7 + sessionIndex * 0.3 + activityIndex * 0.2, 1),
    pauseBreakCount: sessionIndex % 4 === 0 ? 1 : 0,
  }
}

type BaseSessionWithActivity<TActivity extends ExerciseType> = {
  sessionId: string
  patientId: string
  activity: TActivity
  sessionDate: string
  status: "completed" | "ended-early"
  summary: string
  activeEngagementTimeMinutes: number
  totalSessionDurationMinutes: number
  attemptsPerMinute: number
  pauseBreakCount: number
}

function makeLetterTarget(
  patientId: string,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number,
  seed: number
): LetterTargetSession {
  const point = metricPoint(seed, sessionIndex, patientId, sessionCount)
  const contentMode = sessionIndex % 3 === 0 ? "letters" : "words"
  const itemsTotal =
    contentMode === "letters" ? 3 + (sessionIndex % 5) : 2 + (sessionIndex % 4)
  const itemsCompleted = point.accuracy > 82 ? itemsTotal : itemsTotal - 1
  const audioMode =
    sessionIndex % 4 === 0
      ? "silent"
      : sessionIndex % 2 === 0
        ? "music"
        : "metronome"

  return {
    ...baseSession(
      patientId,
      "letter-target",
      sessionIndex,
      activityIndex,
      startOffset
    ),
    contentMode,
    itemsPerSession: itemsTotal,
    wordLength:
      contentMode === "words"
        ? sessionIndex % 2 === 0
          ? "5-10"
          : "0-5"
        : undefined,
    audioMode,
    tempoBpm:
      audioMode === "metronome" ? 50 + (sessionIndex % 5) * 8 : undefined,
    musicPlaybackRate:
      audioMode === "music" ? [0.8, 1, 1.2, 1.4][sessionIndex % 4] : undefined,
    itemsCompleted,
    itemsTotal,
    totalAttempts: itemsCompleted + point.errors,
    correctHits: itemsCompleted,
    accuracyPercent: point.accuracy,
    firstAttemptSuccessRatePercent: point.firstAttempt,
    meanCorrectLatencyMs: point.latency,
    incorrectAttempts: point.errors,
    latencyVariabilityStdDev: 95 + sessionIndex * 8,
    onBeatAccuracyPercent:
      audioMode === "silent" ? undefined : clamp(point.accuracy - 6, 60, 92),
    timingVariabilityStdDev:
      audioMode === "silent" ? undefined : 118 + sessionIndex * 6,
    directionalConsistencyPercent:
      sessionIndex % 2 === 0 ? clamp(point.accuracy + 2, 70, 98) : undefined,
  }
}

function makeLetterFind(
  patientId: string,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number,
  seed: number
): LetterFindSession {
  const point = metricPoint(seed + 2, sessionIndex, patientId, sessionCount)
  const contentMode = sessionIndex % 2 === 0 ? "letters" : "words"
  const itemsTotal =
    contentMode === "letters" ? 4 + (sessionIndex % 5) : 2 + (sessionIndex % 4)
  const itemsCompleted = point.accuracy > 80 ? itemsTotal : itemsTotal - 1
  const audioMode =
    sessionIndex % 3 === 0
      ? "silent"
      : sessionIndex % 2 === 0
        ? "music"
        : "metronome"

  return {
    ...baseSession(
      patientId,
      "letter-find",
      sessionIndex,
      activityIndex,
      startOffset
    ),
    contentMode,
    itemsPerSession: itemsTotal,
    wordLength:
      contentMode === "words"
        ? sessionIndex % 3 === 0
          ? "10+"
          : sessionIndex % 2 === 0
            ? "5-10"
            : "0-5"
        : undefined,
    itemsCompleted,
    itemsTotal,
    totalAttempts: itemsCompleted + point.errors,
    correctHits: itemsCompleted,
    accuracyPercent: clamp(point.accuracy - 2, 64, 94),
    firstAttemptSuccessRatePercent: clamp(point.firstAttempt - 1, 60, 92),
    meanCorrectLatencyMs: point.latency + 110,
    incorrectAttempts: point.errors,
    audioMode,
    tempoBpm:
      audioMode === "metronome" ? 46 + (sessionIndex % 5) * 10 : undefined,
    musicPlaybackRate:
      audioMode === "music"
        ? [0.7, 0.9, 1.1, 1.3][sessionIndex % 4]
        : undefined,
  }
}

function makeEyePong(
  patientId: string,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number,
  seed: number
): EyePongSession {
  const point = metricPoint(seed + 4, sessionIndex, patientId, sessionCount)
  const audioMode =
    sessionIndex % 3 === 0
      ? "silent"
      : sessionIndex % 2 === 0
        ? "music"
        : "metronome"
  const patterns: EyePongSession["pattern"][] = [
    "horizontal",
    "vertical",
    "diagonal",
    "mixed",
  ]

  return {
    ...baseSession(
      patientId,
      "eye-pong",
      sessionIndex,
      activityIndex,
      startOffset
    ),
    mode: sessionIndex % 2 === 0 ? "left-right" : "random",
    pattern: patterns[sessionIndex % patterns.length],
    targetChanges: point.changes,
    completionRatePercent: point.completion,
    audioMode,
    tempoBpm:
      audioMode === "metronome" ? 54 + (sessionIndex % 5) * 7 : undefined,
    musicPlaybackRate:
      audioMode === "music" ? [0.8, 1, 1.2, 1.5][sessionIndex % 4] : undefined,
  }
}

function makeInhibitionChallenge(
  patientId: string,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number,
  seed: number
): InhibitionChallengeSession {
  const point = metricPoint(seed + 5, sessionIndex, patientId, sessionCount)
  const presets: InhibitionChallengeSession["rulePreset"][] = [
    "balanced",
    "go-heavy",
    "stop-heavy",
  ]

  return {
    ...baseSession(
      patientId,
      "inhibition-challenge",
      sessionIndex,
      activityIndex,
      startOffset
    ),
    trialCount: 12 + (sessionIndex % 3) * 4,
    rulePreset: presets[sessionIndex % presets.length],
    goAccuracyPercent: point.go,
    noGoAccuracyPercent: point.noGo,
    missedGoRatePercent: point.missedGo,
    meanGoLatencyMs: point.latency - 120,
    responseWindowMs: 900 + (sessionIndex % 4) * 100,
    cueSpeedBpm: 60 + (sessionIndex % 5) * 6,
  }
}

function makeMotorSequenceBuilder(
  patientId: string,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number,
  seed: number
): MotorSequenceBuilderSession {
  const point = metricPoint(seed + 7, sessionIndex, patientId, sessionCount)
  const types: MotorSequenceBuilderSession["contentType"][] = [
    "letter-sequence",
    "word-sequence",
  ]
  const sequenceLength = 2 + (sessionIndex % 4)
  const audioModes: MotorSequenceBuilderSession["audioMode"][] = [
    "silent",
    "metronome",
    "music",
  ]

  return {
    ...baseSession(
      patientId,
      "motor-sequence-builder",
      sessionIndex,
      activityIndex,
      startOffset
    ),
    contentType: types[sessionIndex % types.length],
    sequenceLength,
    sequenceCount: 4 + (sessionIndex % 3),
    presentationSpeedBpm: 60 + (sessionIndex % 5) * 6,
    audioMode: audioModes[sessionIndex % audioModes.length],
    sequenceCompletionRatePercent: point.sequence,
    firstAttemptSequenceAccuracyPercent: point.sequenceFirst,
    longestCompletedSequence: Math.min(sequenceLength, 2 + (sessionIndex % 5)),
    meanCompletionTimeMs: point.time,
  }
}

function makeSession(
  patientId: string,
  activity: ExerciseType,
  sessionIndex: number,
  sessionCount: number,
  activityIndex: number,
  startOffset: number
): ExerciseSession {
  const seed = patientId.charCodeAt(patientId.length - 1) + activityIndex * 3

  switch (activity) {
    case "letter-target":
      return makeLetterTarget(
        patientId,
        sessionIndex,
        sessionCount,
        activityIndex,
        startOffset,
        seed
      )
    case "letter-find":
      return makeLetterFind(
        patientId,
        sessionIndex,
        sessionCount,
        activityIndex,
        startOffset,
        seed
      )
    case "eye-pong":
      return makeEyePong(
        patientId,
        sessionIndex,
        sessionCount,
        activityIndex,
        startOffset,
        seed
      )
    case "inhibition-challenge":
      return makeInhibitionChallenge(
        patientId,
        sessionIndex,
        sessionCount,
        activityIndex,
        startOffset,
        seed
      )
    case "motor-sequence-builder":
      return makeMotorSequenceBuilder(
        patientId,
        sessionIndex,
        sessionCount,
        activityIndex,
        startOffset,
        seed
      )
  }
}

export const seedSessions: ExerciseSession[] = patientPlans.flatMap((plan) =>
  plan.activities.flatMap((activity, activityIndex) =>
    Array.from(
      { length: plan.counts[activityIndex] ?? 0 },
      (_, sessionIndex) => {
        const sessionCount = plan.counts[activityIndex] ?? 0

        return makeSession(
          plan.patientId,
          activity,
          sessionIndex,
          sessionCount,
          activityIndex,
          plan.startOffset
        )
      }
    )
  )
)
