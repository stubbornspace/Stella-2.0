import {
  activityOrder,
  activitySlugs,
  allExercisesReportSlug,
} from "@/features/stella/mock-data"
import type {
  ActivityType,
  AudioMode,
  EyePongResult,
  ExerciseConfig,
  ExerciseResult,
  ExerciseStateMap,
  ExerciseViewState,
  InhibitionRulePreset,
  InhibitionChallengeResult,
  LetterExerciseResult,
  LatestResultEntry,
  MotorSequenceBuilderResult,
  Patient,
  ReportSlug,
  ResultMetric,
  RunningDetailSection,
  SequenceContentType,
  SessionHistoryEntry,
  SummaryMetricCard,
  TrendChartDefinition,
  TrendChartPoint,
  WordLength,
} from "@/features/stella/types"

type PatientSeedSource = Pick<Patient, "name" | "exerciseTotals">

export function createInitialExerciseStates(): ExerciseStateMap {
  return {
    "Letter Target": createInitialExerciseState("Letter Target"),
    "Letter Find": createInitialExerciseState("Letter Find"),
    "Eye Pong": createInitialExerciseState("Eye Pong"),
    "Inhibition Challenge": createInitialExerciseState("Inhibition Challenge"),
    "Motor Sequence Builder": createInitialExerciseState(
      "Motor Sequence Builder"
    ),
  }
}

export function createInitialExerciseState(
  activity: ActivityType
): ExerciseViewState {
  return {
    config: createInitialExerciseConfig(activity),
    status: "setup",
    progress: 0,
    result: null,
  }
}

export function createInitialExerciseConfig(
  activity: ActivityType
): ExerciseConfig {
  switch (activity) {
    case "Letter Target":
      return {
        activity,
        contentMode: "letters",
        itemsPerSession: 6,
        wordLength: "0-5",
        audioMode: "metronome",
        tempo: 54,
      }
    case "Letter Find":
      return {
        activity,
        contentMode: "words",
        itemsPerSession: 4,
        wordLength: "5-10",
        audioMode: "metronome",
        tempo: 54,
      }
    case "Eye Pong":
      return {
        activity,
        pattern: "left-right",
        targetChanges: 12,
        audioMode: "metronome",
        tempo: 54,
      }
    case "Inhibition Challenge":
      return {
        activity,
        trialCount: 12,
        rulePreset: "balanced",
        responseWindow: 1200,
        cueSpeed: 68,
      }
    case "Motor Sequence Builder":
      return {
        activity,
        contentType: "letter-sequence",
        sequenceLength: 3,
        sequenceCount: 5,
        presentationSpeed: 72,
        audioMode: "metronome",
      }
  }
}

export function getStartingProgress(activity: ActivityType): number {
  switch (activity) {
    case "Letter Target":
      return 52
    case "Letter Find":
      return 44
    case "Eye Pong":
      return 67
    case "Inhibition Challenge":
      return 49
    case "Motor Sequence Builder":
      return 38
  }
}

export function getActivityFromSlug(activitySlug: string): ActivityType | null {
  return (
    activityOrder.find(
      (activity) => activitySlugs[activity] === activitySlug
    ) ?? null
  )
}

export function getReportPath(
  patientId: string,
  activity?: ActivityType
): string {
  const reportSlug: ReportSlug = activity
    ? activitySlugs[activity]
    : allExercisesReportSlug

  return `/patients/${patientId}/reports/${reportSlug}`
}

export function getSessionPath(
  patientId: string,
  activity: ActivityType
): string {
  return `/patients/${patientId}/exercises/session/${activitySlugs[activity]}`
}

export function createHistoryEntry(result: ExerciseResult): SessionHistoryEntry {
  return {
    id: `${activitySlugs[result.activity]}-${result.status}-${Date.now()}`,
    activity: result.activity,
    status: result.status,
    completedAt: "Just now",
    summary: getResultSummary(result),
    result,
  }
}

export function createStaticHistoryEntry(
  patient: Patient,
  activity: ActivityType,
  completedAt: string,
  summary: string
): SessionHistoryEntry {
  const result = buildMockResult(
    patient,
    createInitialExerciseConfig(activity),
    false
  )

  return {
    id: `${patient.id}-${activitySlugs[activity]}-${completedAt.replaceAll(" ", "-")}`,
    activity,
    status: "completed",
    completedAt,
    summary,
    result,
  }
}

export function createLatestResultEntry(
  result: ExerciseResult,
  config: ExerciseConfig,
  completedAt: string
): LatestResultEntry {
  return {
    result,
    config,
    completedAt,
    summary: getResultSummary(result),
  }
}

export function buildMockResult(
  patient: PatientSeedSource,
  config: ExerciseConfig,
  endedEarly: boolean
): ExerciseResult {
  const seed = getSeed(patient, config.activity)
  const status = endedEarly ? "ended-early" : "completed"

  switch (config.activity) {
    case "Letter Target":
    case "Letter Find": {
      const itemsTotal = config.itemsPerSession
      const itemsCompleted = endedEarly
        ? Math.max(1, itemsTotal - 1)
        : itemsTotal
      const firstAttemptAccuracy = clamp(
        74 +
          (seed % 13) +
          (config.activity === "Letter Target" ? 5 : 0) -
          (config.contentMode === "words" ? 4 : 0),
        60,
        98
      )
      const meanCorrectLatencyMs = clamp(
        980 -
          config.tempo * 4 +
          (seed % 90) +
          (config.activity === "Letter Find" ? 80 : 0),
        360,
        1400
      )
      const incorrectAttempts = endedEarly ? 2 + (seed % 2) : seed % 3

      return {
        activity: config.activity,
        status,
        itemsCompleted,
        itemsTotal,
        firstAttemptAccuracy,
        meanCorrectLatencyMs,
        incorrectAttempts,
      }
    }
    case "Eye Pong": {
      const targetChangesCompleted = endedEarly
        ? Math.max(3, config.targetChanges - 2)
        : config.targetChanges

      return {
        activity: config.activity,
        status,
        mode: config.pattern === "left-right" ? "Left / Right" : "Random",
        targetChangesCompleted,
        targetChangesTotal: config.targetChanges,
        tempo: formatTempo(config.audioMode, config.tempo),
      }
    }
    case "Inhibition Challenge": {
      const goTrialAccuracy = clamp(
        78 + (seed % 12) - (config.rulePreset === "stop-heavy" ? 4 : 0),
        60,
        97
      )
      const noGoInhibitionAccuracy = clamp(
        72 + (seed % 15) + (config.rulePreset === "stop-heavy" ? 6 : 0),
        55,
        98
      )
      const missedGoRate = clamp(18 - (seed % 8) + (endedEarly ? 4 : 0), 3, 28)
      const meanGoLatencyMs = clamp(
        860 - config.cueSpeed * 3 + (seed % 70),
        280,
        1100
      )

      return {
        activity: config.activity,
        status,
        goTrialAccuracy,
        noGoInhibitionAccuracy,
        missedGoRate,
        meanGoLatencyMs,
      }
    }
    case "Motor Sequence Builder": {
      const sequenceCompletionRate = clamp(
        70 + (seed % 16) - (config.sequenceLength - 2) * 3,
        48,
        96
      )
      const firstAttemptSequenceAccuracy = clamp(
        66 + (seed % 17) - (config.contentType === "word-sequence" ? 5 : 0),
        44,
        94
      )
      const longestCompletedSequence = endedEarly
        ? Math.max(2, config.sequenceLength - 1)
        : config.sequenceLength
      const meanCompletionTimeMs = clamp(
        2200 + config.sequenceLength * 320 + (seed % 240),
        1600,
        4800
      )

      return {
        activity: config.activity,
        status,
        sequenceCompletionRate,
        firstAttemptSequenceAccuracy,
        longestCompletedSequence,
        meanCompletionTimeMs,
      }
    }
  }
}

export function getRunningSnapshot(
  config: ExerciseConfig,
  progress: number
): { instruction: string; progressLabel: string; metrics: ResultMetric[] } {
  const completedUnits = getCompletedUnits(config, progress)

  switch (config.activity) {
    case "Letter Target":
      return {
        instruction:
          config.contentMode === "letters"
            ? "Hit the green letter. Ready, go."
            : "Press each highlighted letter in order.",
        progressLabel: `${completedUnits} of ${config.itemsPerSession} ${config.contentMode} complete`,
        metrics: [
          { label: "Cue style", value: "Visible green target" },
          {
            label: "Audio",
            value: `${formatAudioMode(config.audioMode)} · ${formatTempo(config.audioMode, config.tempo)}`,
          },
          { label: "Current pace", value: `${config.tempo} BPM` },
        ],
      }
    case "Letter Find":
      return {
        instruction:
          config.contentMode === "letters"
            ? "Listen for the letter name and press it."
            : "Spell the spoken word without a visual cue.",
        progressLabel: `${completedUnits} of ${config.itemsPerSession} ${config.contentMode} complete`,
        metrics: [
          { label: "Cue style", value: "Audio only" },
          {
            label: "Audio",
            value: `${formatAudioMode(config.audioMode)} · ${formatTempo(config.audioMode, config.tempo)}`,
          },
          { label: "Word length", value: formatWordLength(config.wordLength) },
        ],
      }
    case "Eye Pong":
      return {
        instruction: "Follow the lit targets with your eyes. Ready, go.",
        progressLabel: `${completedUnits} of ${config.targetChanges} target changes complete`,
        metrics: [
          {
            label: "Pattern",
            value: config.pattern === "left-right" ? "Left / Right" : "Random",
          },
          { label: "Audio", value: formatAudioMode(config.audioMode) },
          {
            label: "Tempo",
            value: formatTempo(config.audioMode, config.tempo),
          },
        ],
      }
    case "Inhibition Challenge":
      return {
        instruction: "Green means press, red means stop, yellow means wait.",
        progressLabel: `${completedUnits} of ${config.trialCount} trials complete`,
        metrics: [
          { label: "Preset", value: formatRulePreset(config.rulePreset) },
          { label: "Response window", value: `${config.responseWindow} ms` },
          { label: "Cue speed", value: `${config.cueSpeed} BPM` },
        ],
      }
    case "Motor Sequence Builder":
      return {
        instruction: "Watch the sequence, then repeat it in order.",
        progressLabel: `${completedUnits} of ${config.sequenceCount} sequences complete`,
        metrics: [
          {
            label: "Content",
            value: formatSequenceContentType(config.contentType),
          },
          { label: "Audio", value: formatAudioMode(config.audioMode) },
          { label: "Pace", value: `${config.presentationSpeed} BPM` },
        ],
      }
  }
}

export function getRunningDetailSections(
  config: ExerciseConfig,
  progress: number
): RunningDetailSection[] {
  const completedUnits = getCompletedUnits(config, progress)

  switch (config.activity) {
    case "Letter Target":
      return config.contentMode === "letters"
        ? [
            {
              title: "Visible cue history",
              description:
                "Letters already presented in this run with mock attempt counts.",
              items: getRunningPastLetterSequence(
                ["A", "M", "T", "S", "R", "L"],
                completedUnits
              ),
            },
            {
              title: "Live observations",
              items: [
                { label: "Current target", value: "L", tone: "warning" },
                { label: "Current attempts", value: "2 presses so far" },
                {
                  label: "First-attempt hits",
                  value: "4 of 5",
                  tone: "success",
                },
                { label: "Recent response", value: "S in 742 ms" },
                { label: "Try again prompts", value: "1 issued" },
              ],
            },
          ]
        : [
            {
              title: "Words surfaced",
              description: "Mock view of the word prompts completed so far.",
              items: getRunningWordSequence(
                ["MAP", "STAR", "MINT", "LAMP"],
                completedUnits
              ),
            },
            {
              title: "Live observations",
              items: [
                { label: "Current word", value: "LAMP", tone: "warning" },
                { label: "Letters completed", value: "2 of 4" },
                {
                  label: "First-attempt hits",
                  value: "7 of 8",
                  tone: "success",
                },
                { label: "Recent response", value: "A in 688 ms" },
              ],
            },
          ]
    case "Letter Find":
      return config.contentMode === "letters"
        ? [
            {
              title: "Audio prompts heard",
              description:
                "Spoken letters already delivered in this run with attempt counts.",
              items: getRunningPastLetterSequence(
                ["M", "R", "T", "A", "S", "L"],
                completedUnits
              ),
            },
            {
              title: "Live observations",
              items: [
                { label: "Current prompt", value: "L", tone: "warning" },
                { label: "Current attempts", value: "2 presses so far" },
                {
                  label: "First correct response",
                  value: "4 of 5",
                  tone: "success",
                },
                { label: "Most recent press", value: "S in 812 ms" },
                { label: "Try again prompts", value: "1 issued" },
              ],
            },
          ]
        : [
            {
              title: "Spoken word prompts",
              description:
                "Mock log of the words already delivered in the session.",
              items: getRunningWordSequence(
                ["STAR", "MINT", "LAMP", "TRACK"],
                completedUnits
              ),
            },
            {
              title: "Live observations",
              items: [
                { label: "Current word", value: "TRACK", tone: "warning" },
                { label: "Letters entered", value: "3 of 5" },
                { label: "Recent correct key", value: "A in 934 ms" },
                { label: "Retry prompts", value: "2 issued so far" },
              ],
            },
          ]
    case "Eye Pong":
      return [
        {
          title: "Observed target path",
          description: "Mock sequence of illuminated target changes so far.",
          items: getRunningPathSequence(
            ["Left", "Center", "Right", "Left", "Center", "Right"],
            completedUnits
          ),
        },
        {
          title: "Live observations",
          items: [
            { label: "Current zone", value: "Right", tone: "warning" },
            {
              label: "Pattern",
              value:
                config.pattern === "left-right" ? "Left / Right" : "Random",
            },
            {
              label: "Observed fixation",
              value: "Tracking steadily",
              tone: "success",
            },
            {
              label: "Tempo cue",
              value: formatTempo(config.audioMode, config.tempo),
            },
          ],
        },
      ]
    case "Inhibition Challenge":
      return [
        {
          title: "Recent cue stream",
          description: "Mock stream of Go / Stop cues presented in this run.",
          items: getRunningCueSequence(
            [
              "Green Go",
              "Red Stop",
              "Green Go",
              "Yellow Wait",
              "Green Go",
              "Red Stop",
            ],
            completedUnits
          ),
        },
        {
          title: "Live observations",
          items: [
            { label: "Current cue", value: "Green Go", tone: "warning" },
            { label: "Correct Go trials", value: "5 of 6", tone: "success" },
            {
              label: "Successful inhibitions",
              value: "2 of 2",
              tone: "success",
            },
            { label: "Mean response", value: "684 ms" },
          ],
        },
      ]
    case "Motor Sequence Builder":
      return [
        {
          title: "Observed sequence",
          description: "Mock view of the sequence being learned right now.",
          items: getRunningPathSequence(
            ["A", "M", "T", "L", "S"],
            completedUnits
          ),
        },
        {
          title: "Live observations",
          items: [
            { label: "Current repeat", value: "A → M → T", tone: "warning" },
            {
              label: "Steps completed",
              value: `${Math.min(completedUnits, 3)} of ${config.sequenceLength}`,
            },
            { label: "Correct repeats", value: "2 of 3", tone: "success" },
            {
              label: "Presentation speed",
              value: `${config.presentationSpeed} BPM`,
            },
          ],
        },
      ]
  }
}

export function getResultMetrics(result: ExerciseResult): ResultMetric[] {
  switch (result.activity) {
    case "Letter Target":
    case "Letter Find":
      return [
        {
          label: "Items completed",
          value: `${result.itemsCompleted} / ${result.itemsTotal}`,
        },
        {
          label: "First-attempt accuracy",
          value: `${result.firstAttemptAccuracy}%`,
        },
        {
          label: "Mean correct latency",
          value: `${result.meanCorrectLatencyMs} ms`,
        },
        {
          label: "Incorrect attempts",
          value: `${result.incorrectAttempts}`,
        },
      ]
    case "Eye Pong":
      return [
        { label: "Mode", value: result.mode },
        {
          label: "Target changes",
          value: `${result.targetChangesCompleted} / ${result.targetChangesTotal}`,
        },
        { label: "Tempo", value: result.tempo },
        {
          label: "Completion status",
          value: result.status === "completed" ? "Completed" : "Ended early",
        },
      ]
    case "Inhibition Challenge":
      return [
        { label: "Go-trial accuracy", value: `${result.goTrialAccuracy}%` },
        {
          label: "No-Go inhibition accuracy",
          value: `${result.noGoInhibitionAccuracy}%`,
        },
        { label: "Missed-Go rate", value: `${result.missedGoRate}%` },
        {
          label: "Mean Go latency",
          value: `${result.meanGoLatencyMs} ms`,
        },
      ]
    case "Motor Sequence Builder":
      return [
        {
          label: "Sequence completion rate",
          value: `${result.sequenceCompletionRate}%`,
        },
        {
          label: "First-attempt sequence accuracy",
          value: `${result.firstAttemptSequenceAccuracy}%`,
        },
        {
          label: "Longest completed sequence",
          value: `${result.longestCompletedSequence}`,
        },
        {
          label: "Mean completion time",
          value: `${(result.meanCompletionTimeMs / 1000).toFixed(1)} s`,
        },
      ]
  }
}

export function getConfigDetails(config: ExerciseConfig): ResultMetric[] {
  switch (config.activity) {
    case "Letter Target":
    case "Letter Find":
      return [
        {
          label: "Content",
          value: config.contentMode === "letters" ? "Letters" : "Words",
        },
        ...(config.contentMode === "words"
          ? [
              {
                label: "Word length",
                value: formatWordLength(config.wordLength),
              },
            ]
          : []),
        { label: "Items", value: `${config.itemsPerSession}` },
        { label: "Audio", value: formatAudioMode(config.audioMode) },
        { label: "Tempo", value: formatTempo(config.audioMode, config.tempo) },
      ]
    case "Eye Pong":
      return [
        {
          label: "Pattern",
          value: config.pattern === "left-right" ? "Left / Right" : "Random",
        },
        { label: "Target changes", value: `${config.targetChanges}` },
        { label: "Audio", value: formatAudioMode(config.audioMode) },
        { label: "Tempo", value: formatTempo(config.audioMode, config.tempo) },
      ]
    case "Inhibition Challenge":
      return [
        { label: "Trials", value: `${config.trialCount}` },
        { label: "Preset", value: formatRulePreset(config.rulePreset) },
        { label: "Response window", value: `${config.responseWindow} ms` },
        { label: "Cue speed", value: `${config.cueSpeed} BPM` },
      ]
    case "Motor Sequence Builder":
      return [
        {
          label: "Content",
          value: formatSequenceContentType(config.contentType),
        },
        { label: "Sequence length", value: `${config.sequenceLength}` },
        { label: "Number of sequences", value: `${config.sequenceCount}` },
        {
          label: "Presentation speed",
          value: `${config.presentationSpeed} BPM`,
        },
        { label: "Audio", value: formatAudioMode(config.audioMode) },
      ]
  }
}

export function getResultSummary(result: ExerciseResult): string {
  switch (result.activity) {
    case "Letter Target":
    case "Letter Find":
      return `Completed ${result.itemsCompleted} of ${result.itemsTotal} items with ${result.firstAttemptAccuracy}% first-attempt accuracy.`
    case "Eye Pong":
      return `Completed ${result.targetChangesCompleted} of ${result.targetChangesTotal} target changes in ${result.mode} mode.`
    case "Inhibition Challenge":
      return `Recorded ${result.goTrialAccuracy}% Go accuracy and ${result.noGoInhibitionAccuracy}% No-Go inhibition accuracy.`
    case "Motor Sequence Builder":
      return `Reached ${result.longestCompletedSequence} steps with ${result.sequenceCompletionRate}% sequence completion.`
  }
}

export function getAggregateReportMetrics(
  patient: Patient,
  history: SessionHistoryEntry[]
): ResultMetric[] {
  const activeExerciseCount = Object.values(patient.exerciseTotals).filter(
    (count) => count > 0
  ).length
  const topActivity = activityOrder.reduce((best, activity) =>
    patient.exerciseTotals[activity] > patient.exerciseTotals[best]
      ? activity
      : best
  )
  const latestEntry = history[0] ?? null

  return [
    { label: "Total completed", value: `${patient.totalSessions}` },
    { label: "Exercise coverage", value: `${activeExerciseCount} / 5` },
    { label: "Most active", value: topActivity },
    {
      label: "Latest session",
      value: latestEntry
        ? `${latestEntry.activity} · ${latestEntry.completedAt}`
        : "No sessions",
    },
  ]
}

export function getActivityReportMetrics(
  activity: ActivityType,
  patient: Patient,
  history: SessionHistoryEntry[]
): ResultMetric[] {
  const latestEntry =
    history.find((entry) => entry.activity === activity) ?? null

  if (latestEntry) {
    return getResultMetrics(latestEntry.result).slice(0, 4)
  }

  return getEmptyReportMetrics(activity, patient.exerciseTotals[activity])
}

export function getLetterExerciseSummaryMetrics(
  activity: "Letter Target" | "Letter Find",
  patient: Patient,
  history: SessionHistoryEntry[]
): SummaryMetricCard[] {
  const entries = getLetterEntries(history, activity)
  const accuracyValues = entries.map(
    (entry) => entry.result.firstAttemptAccuracy
  )
  const latencyValues = entries.map(
    (entry) => entry.result.meanCorrectLatencyMs
  )
  const incorrectAttemptValues = entries.map(
    (entry) => entry.result.incorrectAttempts
  )

  if (entries.length === 0) {
    return [
      {
        label: "Total completed",
        value: `${patient.exerciseTotals[activity]} sessions`,
      },
      { label: "First-attempt accuracy", value: "--" },
      { label: "Mean correct latency", value: "--" },
      { label: "Incorrect attempts", value: "--" },
    ]
  }

  return [
    {
      label: "Total completed",
      value: `${patient.exerciseTotals[activity]} sessions`,
    },
    {
      label: "First-attempt accuracy",
      breakdown: getSummaryBreakdown(
        accuracyValues,
        (value) => `${Math.round(value)}%`
      ),
    },
    {
      label: "Mean correct latency",
      breakdown: getSummaryBreakdown(
        latencyValues,
        (value) => `${Math.round(value)} ms`
      ),
    },
    {
      label: "Incorrect attempts",
      breakdown: getSummaryBreakdown(incorrectAttemptValues, (value) =>
        formatDecimal(value)
      ),
    },
  ]
}

export function getAggregateTrendCharts(
  _patient: Patient,
  history: SessionHistoryEntry[]
): TrendChartDefinition[] {
  const orderedEntries = [...history].reverse()

  if (orderedEntries.length === 0) {
    const labels = getSessionTrendLabels(1)

    return [
      {
        title: "Completed sessions",
        description: "Cumulative completed sessions across all exercises.",
        color: "var(--chart-1)",
        points: createTrendChartPoints(labels, [0], (value) => `${value}`),
      },
      {
        title: "Exercise coverage",
        description:
          "How many exercise types are active in the patient history.",
        color: "var(--chart-2)",
        points: createTrendChartPoints(labels, [0], (value) => `${value} / 5`),
      },
    ]
  }

  const labels = getSessionTrendLabels(orderedEntries.length)
  const completedValues = orderedEntries.map((_, index) => index + 1)
  const seenActivities = new Set<ActivityType>()
  const coverageValues = orderedEntries.map((entry) => {
    seenActivities.add(entry.activity)
    return seenActivities.size
  })

  return [
    {
      title: "Completed sessions",
      description: "Cumulative completed sessions across all exercises.",
      color: "var(--chart-1)",
      points: createTrendChartPoints(
        labels,
        completedValues,
        (value) => `${value}`
      ),
    },
    {
      title: "Exercise coverage",
      description: "How many exercise types are active in the recent history.",
      color: "var(--chart-2)",
      points: createTrendChartPoints(
        labels,
        coverageValues,
        (value) => `${value} / 5`
      ),
    },
  ]
}

export function getActivityTrendCharts(
  activity: ActivityType,
  _patient: Patient,
  history: SessionHistoryEntry[]
): TrendChartDefinition[] {
  switch (activity) {
    case "Letter Target":
    case "Letter Find": {
      const entries = getLetterEntries(history, activity)
      const labels = getSessionTrendLabels(
        entries.length > 0 ? entries.length : 1
      )

      if (entries.length === 0) {
        return getFallbackTrendCharts(labels, [
          {
            title: "First-attempt accuracy",
            description: "Higher is better across recent sessions.",
            color: "var(--chart-1)",
            points: [0],
            format: (value) => `${value}%`,
          },
          {
            title: "Mean correct latency",
            description: "Lower is better from Go to the correct press.",
            color: "var(--chart-2)",
            points: [0],
            format: (value) => `${value} ms`,
          },
        ])
      }

      return [
        {
          title: "First-attempt accuracy",
          description: "Higher is better across recent sessions.",
          color: "var(--chart-1)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.firstAttemptAccuracy),
            (value) => `${Math.round(value)}%`
          ),
        },
        {
          title: "Mean correct latency",
          description: "Lower is better from Go to the correct press.",
          color: "var(--chart-2)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.meanCorrectLatencyMs),
            (value) => `${Math.round(value)} ms`
          ),
        },
      ]
    }
    case "Eye Pong": {
      const entries = getEyePongEntries(history)
      const labels = getSessionTrendLabels(
        entries.length > 0 ? entries.length : 1
      )

      if (entries.length === 0) {
        return getFallbackTrendCharts(labels, [
          {
            title: "Target changes completed",
            description: "Observed completion volume per recent run.",
            color: "var(--chart-1)",
            points: [0],
            format: () => "0 / 12",
          },
          {
            title: "Session tempo",
            description: "Configured pacing for the recent sessions.",
            color: "var(--chart-4)",
            points: [0],
            format: () => "--",
          },
        ])
      }

      return [
        {
          title: "Target changes completed",
          description: "Observed completion volume per recent run.",
          color: "var(--chart-1)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.targetChangesCompleted),
            (value, index) =>
              `${value} / ${entries[index].result.targetChangesTotal}`
          ),
        },
        {
          title: "Session tempo",
          description: "Configured pacing for the recent sessions.",
          color: "var(--chart-4)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => parseTempo(entry.result.tempo)),
            (value) => `${value} BPM`
          ),
        },
      ]
    }
    case "Inhibition Challenge": {
      const entries = getInhibitionEntries(history)
      const labels = getSessionTrendLabels(
        entries.length > 0 ? entries.length : 1
      )

      if (entries.length === 0) {
        return getFallbackTrendCharts(labels, [
          {
            title: "Go-trial accuracy",
            description: "Higher is better within the response window.",
            color: "var(--chart-1)",
            points: [0],
            format: (value) => `${value}%`,
          },
          {
            title: "Mean Go latency",
            description: "Lower is better for correct Go responses.",
            color: "var(--chart-2)",
            points: [0],
            format: (value) => `${value} ms`,
          },
        ])
      }

      return [
        {
          title: "Go-trial accuracy",
          description: "Higher is better within the response window.",
          color: "var(--chart-1)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.goTrialAccuracy),
            (value) => `${value}%`
          ),
        },
        {
          title: "Mean Go latency",
          description: "Lower is better for correct Go responses.",
          color: "var(--chart-2)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.meanGoLatencyMs),
            (value) => `${value} ms`
          ),
        },
      ]
    }
    case "Motor Sequence Builder": {
      const entries = getMotorSequenceEntries(history)
      const labels = getSessionTrendLabels(
        entries.length > 0 ? entries.length : 1
      )

      if (entries.length === 0) {
        return getFallbackTrendCharts(labels, [
          {
            title: "Sequence completion rate",
            description: "Higher is better across recent attempts.",
            color: "var(--chart-1)",
            points: [0],
            format: (value) => `${value}%`,
          },
          {
            title: "First-attempt sequence accuracy",
            description: "How often the sequence is completed cleanly first time.",
            color: "var(--chart-2)",
            points: [0],
            format: (value) => `${value}%`,
          },
        ])
      }

      return [
        {
          title: "Sequence completion rate",
          description: "Higher is better across recent attempts.",
          color: "var(--chart-1)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.sequenceCompletionRate),
            (value) => `${value}%`
          ),
        },
        {
          title: "First-attempt sequence accuracy",
          description: "How often the sequence is completed cleanly first time.",
          color: "var(--chart-2)",
          points: createTrendChartPoints(
            labels,
            entries.map((entry) => entry.result.firstAttemptSequenceAccuracy),
            (value) => `${value}%`
          ),
        },
      ]
    }
  }
}

export function formatDecimal(value: number): string {
  return value.toFixed(2)
}

export function formatAudioMode(audioMode: AudioMode): string {
  return audioMode === "silent"
    ? "Silent"
    : audioMode === "metronome"
      ? "Metronome"
      : "Music"
}

export function formatTempo(audioMode: AudioMode, tempo: number): string {
  return audioMode === "silent" ? "No tempo" : `${tempo} BPM`
}

export function formatWordLength(wordLength: WordLength): string {
  return wordLength === "0-5"
    ? "0-5 letters"
    : wordLength === "5-10"
      ? "5-10 letters"
      : "10+ letters"
}

export function formatRulePreset(rulePreset: InhibitionRulePreset): string {
  return rulePreset === "balanced"
    ? "Balanced"
    : rulePreset === "go-heavy"
      ? "Go-heavy"
      : "Stop-heavy"
}

export function formatSequenceContentType(
  contentType: SequenceContentType
): string {
  return contentType === "letter-sequence" ? "Letter sequence" : "Word sequence"
}

function getLetterEntries(
  history: SessionHistoryEntry[],
  activity: "Letter Target" | "Letter Find"
) {
  return history
    .filter(
      (
        entry
      ): entry is SessionHistoryEntry & { result: LetterExerciseResult } => {
        return entry.activity === activity
      }
    )
    .reverse()
}

function getEyePongEntries(history: SessionHistoryEntry[]) {
  return history
    .filter(
      (entry): entry is SessionHistoryEntry & { result: EyePongResult } => {
        return entry.activity === "Eye Pong"
      }
    )
    .reverse()
}

function getInhibitionEntries(history: SessionHistoryEntry[]) {
  return history
    .filter(
      (
        entry
      ): entry is SessionHistoryEntry & {
        result: InhibitionChallengeResult
      } => {
        return entry.activity === "Inhibition Challenge"
      }
    )
    .reverse()
}

function getMotorSequenceEntries(history: SessionHistoryEntry[]) {
  return history
    .filter(
      (
        entry
      ): entry is SessionHistoryEntry & {
        result: MotorSequenceBuilderResult
      } => {
        return entry.activity === "Motor Sequence Builder"
      }
    )
    .reverse()
}

function getFallbackTrendCharts(
  labels: string[],
  definitions: {
    title: string
    description: string
    color: string
    points: number[]
    format: (value: number) => string
  }[]
): TrendChartDefinition[] {
  return definitions.map((definition) => ({
    title: definition.title,
    description: definition.description,
    color: definition.color,
    points: createTrendChartPoints(
      labels,
      definition.points,
      definition.format
    ),
  }))
}

function getRunningPastLetterSequence(
  letters: string[],
  completedUnits: number
): RunningDetailSection["items"] {
  const priorLetters = letters.slice(0, Math.max(completedUnits, 1))

  return priorLetters.map((letter, index) => ({
    label: `Letter ${index + 1}`,
    value:
      index === priorLetters.length - 1
        ? `${letter} live now · 2 attempts`
        : `${letter} completed · ${index % 2 === 0 ? "1 attempt" : "2 attempts"}`,
    tone: index === priorLetters.length - 1 ? "warning" : "success",
  }))
}

function getRunningWordSequence(
  words: string[],
  completedUnits: number
): RunningDetailSection["items"] {
  return words.map((word, index) => ({
    label: `Prompt ${index + 1}`,
    value:
      index < completedUnits
        ? `${word} completed`
        : index === completedUnits
          ? `${word} in progress`
          : `${word} upcoming`,
    tone:
      index < completedUnits
        ? "success"
        : index === completedUnits
          ? "warning"
          : "default",
  }))
}

function getRunningPathSequence(
  steps: string[],
  completedUnits: number
): RunningDetailSection["items"] {
  return steps.map((step, index) => ({
    label: `Step ${index + 1}`,
    value:
      index < completedUnits
        ? `${step} completed`
        : index === completedUnits
          ? `${step} active now`
          : `${step} upcoming`,
    tone:
      index < completedUnits
        ? "success"
        : index === completedUnits
          ? "warning"
          : "default",
  }))
}

function getRunningCueSequence(
  cues: string[],
  completedUnits: number
): RunningDetailSection["items"] {
  return cues.map((cue, index) => ({
    label: `Cue ${index + 1}`,
    value:
      index < completedUnits
        ? `${cue} resolved`
        : index === completedUnits
          ? `${cue} live`
          : `${cue} queued`,
    tone:
      index < completedUnits
        ? "success"
        : index === completedUnits
          ? "warning"
          : "default",
  }))
}

function getCompletedUnits(config: ExerciseConfig, progress: number): number {
  const totalUnits = getTotalUnits(config)
  return Math.min(
    totalUnits - 1,
    Math.max(1, Math.round((progress / 100) * totalUnits))
  )
}

function getTotalUnits(config: ExerciseConfig): number {
  switch (config.activity) {
    case "Letter Target":
    case "Letter Find":
      return config.itemsPerSession
    case "Eye Pong":
      return config.targetChanges
    case "Inhibition Challenge":
      return config.trialCount
    case "Motor Sequence Builder":
      return config.sequenceCount
  }
}

function getEmptyReportMetrics(
  activity: ActivityType,
  sessionCount: number
): ResultMetric[] {
  switch (activity) {
    case "Letter Target":
    case "Letter Find":
      return [
        { label: "Items completed", value: "0 / 4" },
        { label: "First-attempt accuracy", value: "--" },
        { label: "Mean correct latency", value: "--" },
        { label: "Incorrect attempts", value: "--" },
      ]
    case "Eye Pong":
      return [
        { label: "Mode", value: "Not started" },
        { label: "Target changes", value: "0 / 12" },
        { label: "Tempo", value: "--" },
        {
          label: "Completion status",
          value: sessionCount > 0 ? "In progress" : "Not started",
        },
      ]
    case "Inhibition Challenge":
      return [
        { label: "Go-trial accuracy", value: "--" },
        { label: "No-Go inhibition accuracy", value: "--" },
        { label: "Missed-Go rate", value: "--" },
        { label: "Mean Go latency", value: "--" },
      ]
    case "Motor Sequence Builder":
      return [
        { label: "Sequence completion rate", value: "--" },
        { label: "First-attempt sequence accuracy", value: "--" },
        { label: "Longest completed sequence", value: "--" },
        { label: "Mean completion time", value: "--" },
      ]
  }
}

function getSeed(patient: PatientSeedSource, activity: ActivityType): number {
  return (
    patient.name.length * 11 +
    patient.exerciseTotals[activity] * 17 +
    (activityOrder.indexOf(activity) + 1) * 23
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSessionTrendLabels(sessionCount: number): string[] {
  const pointCount = Math.max(sessionCount, 1)

  return Array.from({ length: pointCount }, (_, index) =>
    index === pointCount - 1 ? "Latest" : `${index + 1}`
  )
}

function createTrendChartPoints(
  labels: readonly string[],
  values: number[],
  formatter: (value: number, index: number) => string
): TrendChartPoint[] {
  return labels.map((label, index) => ({
    label,
    value: values[index] ?? 0,
    displayValue: formatter(values[index] ?? 0, index),
  }))
}

function getSummaryBreakdown(
  values: number[],
  formatter: (value: number) => string
): SummaryMetricCard["breakdown"] {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const average =
    values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

  return {
    lowest: formatter(low),
    highest: formatter(high),
    average: formatter(average),
  }
}

function parseTempo(tempo: string): number {
  const match = tempo.match(/(\d+)/)
  return match ? Number(match[1]) : 0
}
