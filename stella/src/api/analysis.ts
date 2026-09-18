import { getValidIdToken } from "@/lib/auth"
import { getRuntimeConfig } from "@/lib/runtime-config"
import { getPatient, getPatientSessions } from "@/api/stella"
import { exerciseDefinitions } from "@/config/exercises"
import type { ExerciseSession, ExerciseType, MetricFormat } from "@/types"
import type {
  AnalysisRecommendationScore,
  AnalysisScorecard,
  AnalysisTrendSeries,
  ConfigurationRecommendation,
  PatientAnalysis,
} from "@/types/analysis"

const analysisStorageKey = "stella-poc-analysis-results"

type StoredAnalyses = Record<string, PatientAnalysis>

function remoteAnalysisEnabled() {
  const config = getRuntimeConfig()
  return Boolean(config.auth.enabled && config.api.baseUrl)
}

async function remoteRequest<T>(path: string, init?: RequestInit) {
  const config = getRuntimeConfig()
  const idToken = await getValidIdToken()

  if (!config.api.baseUrl || !idToken) {
    throw new Error("Analysis API is not configured for this session.")
  }

  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined
    throw new Error(body?.message || "Analysis request failed.")
  }

  return (await response.json()) as T
}

function readStoredAnalyses(): StoredAnalyses {
  const raw = window.localStorage.getItem(analysisStorageKey)

  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as StoredAnalyses
  } catch {
    return {}
  }
}

function writeStoredAnalyses(analyses: StoredAnalyses) {
  window.localStorage.setItem(analysisStorageKey, JSON.stringify(analyses))
}

function round(value: number, precision = 0) {
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function sessionDateValue(session: ExerciseSession) {
  return new Date(session.sessionDate).getTime()
}

function normalizedSessionScore(session: ExerciseSession) {
  if ("firstAttemptSuccessRatePercent" in session) {
    return session.firstAttemptSuccessRatePercent
  }

  if ("completionRatePercent" in session) {
    return session.completionRatePercent
  }

  if ("sequenceCompletionRatePercent" in session) {
    return session.sequenceCompletionRatePercent
  }

  if ("goAccuracyPercent" in session) {
    return round(
      (session.goAccuracyPercent + session.noGoAccuracyPercent) / 2,
      1
    )
  }

  return undefined
}

function averageMetric(sessions: ExerciseSession[], key: string) {
  const values = sessions
    .map((session) => ((session as unknown as Record<string, unknown>)[key]))
    .filter((value): value is number => typeof value === "number")

  if (values.length === 0) {
    return undefined
  }

  return round(
    values.reduce((total, value) => total + value, 0) / values.length,
    1
  )
}

function metricMetadata(exerciseType: ExerciseType): {
  format: MetricFormat
  key: string
  label: string
} {
  const [primaryMetric] = exerciseDefinitions[exerciseType].patientSummary

  return {
    format: primaryMetric.format ?? "text",
    key: primaryMetric.key,
    label: primaryMetric.label,
  }
}

function buildTrendSeries(
  exerciseType: ExerciseType,
  sessions: ExerciseSession[]
): AnalysisTrendSeries {
  const metadata = metricMetadata(exerciseType)
  const label = exerciseDefinitions[exerciseType].label

  return {
    exerciseType,
    format: metadata.format,
    metricKey: metadata.key,
    metricLabel: metadata.label,
    points: sessions
      .toSorted((left, right) => sessionDateValue(left) - sessionDateValue(right))
      .flatMap((session) => {
        const value = (session as unknown as Record<string, unknown>)[
          metadata.key
        ]

        if (typeof value !== "number") {
          return []
        }

        return [
          {
            date: session.sessionDate,
            label: new Date(session.sessionDate).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
            }),
            value,
          },
        ]
      }),
    title: `${label} ${metadata.label}`,
  }
}

function buildConfigRecommendation(
  exerciseType: ExerciseType,
  session: ExerciseSession | undefined,
  targetMetric: string
): ConfigurationRecommendation {
  const exerciseLabel = exerciseDefinitions[exerciseType].label

  switch (exerciseType) {
    case "letter-target":
    case "letter-find":
      if (session && "contentMode" in session && session.contentMode === "words") {
        return {
          exerciseLabel,
          exerciseType,
          label: "Word Length",
          reason:
            "Shorter words should reduce cognitive load while first-attempt accuracy improves.",
          targetMetric,
          value: "0-5",
        }
      }

      return {
        exerciseLabel,
        exerciseType,
        label: "Audio Mode",
        reason:
          "A metronome cue should make pacing more repeatable during practice.",
        targetMetric,
        value: "metronome",
      }
    case "eye-pong":
      return {
        exerciseLabel,
        exerciseType,
        label: session && "mode" in session && session.mode === "random"
          ? "Mode"
          : "Tempo",
        reason:
          "Lowering visual variability should help make completion more consistent.",
        targetMetric,
        value:
          session && "mode" in session && session.mode === "random"
            ? "left-right"
            : "54 BPM",
      }
    case "inhibition-challenge":
      return {
        exerciseLabel,
        exerciseType,
        label: "Response Window",
        reason:
          "A slightly longer window should help accuracy stabilize before the pace increases.",
        targetMetric,
        value: `${
          session && "responseWindowMs" in session
            ? session.responseWindowMs + 100
            : 1000
        } ms`,
      }
    default:
      return {
        exerciseLabel,
        exerciseType,
        label: "Sequence Length",
        reason:
          "Shorter sequences should improve successful completion while motor planning catches up.",
        targetMetric,
        value: String(
          session && "sequenceLength" in session
            ? Math.max(2, session.sequenceLength - 1)
            : 2
        ),
      }
  }
}

function buildLocalAnalysis(
  patientId: string,
  patientName: string,
  sessions: ExerciseSession[]
): PatientAnalysis {
  const groupedSessions = new Map<ExerciseType, ExerciseSession[]>()

  for (const session of sessions) {
    groupedSessions.set(session.activity, [
      ...(groupedSessions.get(session.activity) ?? []),
      session,
    ])
  }

  const recommendationScores = Array.from(groupedSessions.entries())
    .map(([exerciseType, activitySessions]) => {
      const metadata = metricMetadata(exerciseType)
      const sortedSessions = activitySessions.toSorted(
        (left, right) => sessionDateValue(left) - sessionDateValue(right)
      )
      const recentSessions = sortedSessions.slice(-3)
      const baselineSessions = sortedSessions.slice(0, Math.min(3, sortedSessions.length))
      const recentValue = averageMetric(recentSessions, metadata.key)
      const baselineValue = averageMetric(baselineSessions, metadata.key)
      const trendDelta =
        recentValue !== undefined && baselineValue !== undefined
          ? round(recentValue - baselineValue, 1)
          : 0
      const score = clamp(
        round((100 - (recentValue ?? 72)) + Math.max(0, -trendDelta) * 1.8),
        18,
        98
      )

      return {
        baselineValue,
        exerciseType,
        format: metadata.format,
        label: exerciseDefinitions[exerciseType].label,
        recentValue,
        score,
        targetMetric: metadata.label,
        trendDelta,
      } satisfies AnalysisRecommendationScore
    })
    .toSorted((left, right) => right.score - left.score)

  const recentSessions = sessions.filter(
    (session) =>
      sessionDateValue(session) >=
      sessionDateValue(
        sessions.toSorted(
          (left, right) => sessionDateValue(right) - sessionDateValue(left)
        )[0]
      ) -
        30 * 24 * 60 * 60 * 1000
  )
  const recentScores = recentSessions
    .map(normalizedSessionScore)
    .filter((value): value is number => typeof value === "number")
  const latencyValues = recentSessions
    .flatMap((session) => [
      "meanCorrectLatencyMs" in session ? session.meanCorrectLatencyMs : undefined,
      "meanGoLatencyMs" in session ? session.meanGoLatencyMs : undefined,
      "meanCompletionTimeMs" in session ? session.meanCompletionTimeMs : undefined,
    ])
    .filter((value): value is number => typeof value === "number")
  const recentPerformance =
    recentScores.length > 0
      ? round(
          recentScores.reduce((total, value) => total + value, 0) /
            recentScores.length,
          1
        )
      : undefined
  const responseSpeed =
    latencyValues.length > 0
      ? round(
          latencyValues.reduce((total, value) => total + value, 0) /
            latencyValues.length,
          0
        )
      : undefined

  const scorecards: AnalysisScorecard[] = [
    {
      format: "percent",
      helper: "Average across recent sessions",
      id: "recent-performance",
      label: "Recent Performance",
      tone:
        recentPerformance === undefined
          ? "neutral"
          : recentPerformance >= 82
            ? "positive"
            : recentPerformance >= 72
              ? "neutral"
              : "attention",
      value: recentPerformance,
    },
    {
      format: "milliseconds",
      helper: responseSpeed ? "Lower is generally better" : "No latency metric available",
      id: "response-speed",
      label: "Response Speed",
      tone:
        responseSpeed === undefined
          ? "neutral"
          : responseSpeed <= 850
            ? "positive"
            : responseSpeed <= 980
              ? "neutral"
              : "attention",
      value: responseSpeed,
    },
    {
      format: "count",
      helper: "Sessions in the latest 30-day window",
      id: "recent-sessions",
      label: "Recent Sessions",
      tone:
        recentSessions.length >= 6
          ? "positive"
          : recentSessions.length >= 3
            ? "neutral"
            : "attention",
      value: recentSessions.length,
    },
    {
      format: "count",
      helper: "Distinct exercise types completed",
      id: "exercise-coverage",
      label: "Exercise Coverage",
      tone:
        groupedSessions.size >= 4
          ? "positive"
          : groupedSessions.size >= 2
            ? "neutral"
            : "attention",
      value: groupedSessions.size,
    },
  ]

  const recommendedExercises = recommendationScores.slice(0, 3).map((item) => ({
    ...item,
    priorityLabel:
      item.score >= 75 ? "High" : item.score >= 55 ? "Medium" : "Low",
    reason: `${item.label} should get more practice because recent ${item.targetMetric.toLowerCase()} is ${
      item.recentValue !== undefined ? Math.round(item.recentValue) : "limited"
    } and the recent trend needs reinforcement.`,
  })) as PatientAnalysis["recommendedExercises"]

  const configurationFocus = recommendedExercises.map((item) =>
    buildConfigRecommendation(
      item.exerciseType,
      groupedSessions.get(item.exerciseType)?.toSorted(
        (left, right) => sessionDateValue(right) - sessionDateValue(left)
      )[0],
      item.targetMetric
    )
  )

  const strengths = recommendationScores
    .filter((item) => item.trendDelta >= 0)
    .slice(0, 3)
    .map(
      (item) =>
        `${item.label} is trending upward with recent ${item.targetMetric.toLowerCase()} at ${
          item.recentValue !== undefined ? Math.round(item.recentValue) : "N/A"
        }.`
    )

  const concerns = recommendedExercises.map(
    (item) =>
      `${item.label} remains a focus area because recent ${item.targetMetric.toLowerCase()} is ${
        item.recentValue !== undefined ? Math.round(item.recentValue) : "N/A"
      }.`
  )

  return {
    concerns,
    configurationFocus,
    disclaimer:
      "This Stella analysis is a prototype coaching aid and not a clinical diagnosis.",
    evidence: recommendedExercises.map((item) => ({
      detail:
        item.recentValue !== undefined && item.baselineValue !== undefined
          ? `${item.targetMetric} moved from ${Math.round(item.baselineValue)} to ${Math.round(item.recentValue)} for ${item.label}.`
          : `Completed multiple sessions for ${item.label}.`,
      label: item.label,
    })),
    generatedAt: new Date().toISOString(),
    modelId: "local-heuristic",
    patientId,
    recommendationScores,
    recommendedExercises,
    scorecards,
    strengths:
      strengths.length > 0
        ? strengths
        : ["The patient has enough recent activity to establish a directional trend across sessions."],
    summary: `${patientName} shows the clearest short-term opportunity in ${
      recommendedExercises[0]?.label ?? "recent session work"
    }, while ${
      recommendationScores
        .filter((item) => item.trendDelta >= 0)
        .slice(0, 1)
        .map((item) => item.label)
        .join(" and ") || "several exercises"
    } is showing the strongest recent momentum.`,
    trendSeries: Array.from(groupedSessions.entries())
      .map(([exerciseType, activitySessions]) =>
        buildTrendSeries(exerciseType, activitySessions)
      )
      .filter((series) => series.points.length > 1)
      .slice(0, 3),
  }
}

export async function getPatientAnalysis(patientId: string) {
  if (remoteAnalysisEnabled()) {
    const response = await remoteRequest<{ analysis: PatientAnalysis | null }>(
      `/patients/${patientId}/analysis`,
      {
        method: "GET",
      }
    )

    return response.analysis
  }

  return readStoredAnalyses()[patientId] ?? null
}

export async function generatePatientAnalysis(patientId: string) {
  if (remoteAnalysisEnabled()) {
    return remoteRequest<PatientAnalysis>(`/patients/${patientId}/analysis`, {
      method: "POST",
    })
  }

  const [patient, sessions] = await Promise.all([
    getPatient(patientId),
    getPatientSessions(patientId),
  ])

  if (!patient || sessions.length === 0) {
    throw new Error("This patient does not have session data to analyze yet.")
  }

  const analysis = buildLocalAnalysis(
    patientId,
    `${patient.firstName} ${patient.lastName}`,
    sessions
  )
  const stored = readStoredAnalyses()
  writeStoredAnalyses({
    ...stored,
    [patientId]: analysis,
  })
  return analysis
}
