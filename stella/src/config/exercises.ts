import type { ExerciseDefinition, ExerciseType } from "@/types"

export const exerciseDefinitions: Record<ExerciseType, ExerciseDefinition> = {
  "letter-target": {
    id: "letter-target",
    label: "Letter Target",
    description: "Visual-guided intentional target selection.",
    patientSummary: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First-Attempt Accuracy",
        shortLabel: "First Attempt",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Mean Correct Latency",
        shortLabel: "Response",
        format: "milliseconds",
      },
    ],
    summaryCards: [
      { key: "sessionCount", label: "Sessions", format: "count" },
      {
        key: "firstAttemptSuccessRatePercent",
        label: "Avg First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Avg Correct Response",
        format: "milliseconds",
      },
      {
        key: "incorrectAttempts",
        label: "Avg Incorrect Attempts",
        format: "decimal",
      },
    ],
    charts: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Correct Response Latency",
        format: "milliseconds",
      },
    ],
    tableColumns: [
      { key: "contentMode", label: "Mode", format: "text" },
      { key: "audioMode", label: "Audio", format: "text" },
      { key: "itemsPerSession", label: "Items", format: "count" },
      { key: "completed", label: "Completed", format: "text" },
      { key: "accuracyPercent", label: "Accuracy", format: "percent" },
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First Attempt",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Avg Latency",
        format: "milliseconds",
      },
      { key: "incorrectAttempts", label: "Errors", format: "count" },
    ],
    configurationFilters: [
      { key: "contentMode", label: "Mode" },
      { key: "wordLength", label: "Word Length" },
      { key: "audioMode", label: "Beat" },
    ],
  },
  "letter-find": {
    id: "letter-find",
    label: "Letter Find",
    description: "Audio-guided search and selection.",
    patientSummary: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First-Attempt Accuracy",
        shortLabel: "First Attempt",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Mean Correct Latency",
        shortLabel: "Response",
        format: "milliseconds",
      },
    ],
    summaryCards: [
      { key: "sessionCount", label: "Sessions", format: "count" },
      {
        key: "firstAttemptSuccessRatePercent",
        label: "Avg First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Avg Correct Response",
        format: "milliseconds",
      },
      {
        key: "incorrectAttempts",
        label: "Avg Incorrect Attempts",
        format: "decimal",
      },
    ],
    charts: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Mean Correct Latency",
        format: "milliseconds",
      },
    ],
    tableColumns: [
      { key: "contentMode", label: "Mode", format: "text" },
      { key: "audioMode", label: "Audio", format: "text" },
      { key: "itemsPerSession", label: "Items", format: "count" },
      { key: "completed", label: "Completed", format: "text" },
      { key: "accuracyPercent", label: "Accuracy", format: "percent" },
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First Attempt",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Mean Correct Latency",
        format: "milliseconds",
      },
      {
        key: "incorrectAttempts",
        label: "Incorrect Attempts",
        format: "count",
      },
    ],
    configurationFilters: [
      { key: "contentMode", label: "Mode" },
      { key: "wordLength", label: "Word Length" },
      { key: "audioMode", label: "Beat" },
    ],
  },
  "eye-pong": {
    id: "eye-pong",
    label: "Eye Pong",
    description: "Target tracking without eye-tracking claims.",
    patientSummary: [
      {
        key: "completionRatePercent",
        label: "Completion Rate",
        shortLabel: "Completion",
        format: "percent",
      },
      {
        key: "targetChanges",
        label: "Target Changes",
        shortLabel: "Changes",
        format: "count",
      },
    ],
    summaryCards: [
      { key: "sessionCount", label: "Sessions", format: "count" },
      {
        key: "completionRatePercent",
        label: "Average Completion Rate",
        format: "percent",
      },
      {
        key: "targetChanges",
        label: "Average Target Changes",
        format: "count",
      },
      {
        key: "totalSessionDurationMinutes",
        label: "Average Session Duration",
        format: "duration",
      },
    ],
    charts: [
      {
        key: "completionRatePercent",
        label: "Completion Rate",
        format: "percent",
      },
      { key: "targetChanges", label: "Target Changes", format: "count" },
    ],
    tableColumns: [
      { key: "mode", label: "Order", format: "text" },
      { key: "pattern", label: "Pattern", format: "text" },
      { key: "targetChanges", label: "Target Changes", format: "count" },
      {
        key: "completionRatePercent",
        label: "Completion Rate",
        format: "percent",
      },
      { key: "audioMode", label: "Audio", format: "text" },
      { key: "tempoBpm", label: "Tempo", format: "count" },
      {
        key: "totalSessionDurationMinutes",
        label: "Duration",
        format: "duration",
      },
    ],
    configurationFilters: [
      { key: "mode", label: "Mode" },
      { key: "audioMode", label: "Beat" },
      { key: "tempo", label: "Tempo" },
    ],
  },
  "inhibition-challenge": {
    id: "inhibition-challenge",
    label: "Inhibition Challenge",
    description: "Go and No-Go keyboard response control.",
    patientSummary: [
      {
        key: "goAccuracyPercent",
        label: "Go Accuracy",
        shortLabel: "Go Accuracy",
        format: "percent",
      },
      {
        key: "noGoAccuracyPercent",
        label: "No-Go Inhibition Accuracy",
        shortLabel: "No-Go",
        format: "percent",
      },
    ],
    summaryCards: [
      { key: "sessionCount", label: "Sessions", format: "count" },
      {
        key: "goAccuracyPercent",
        label: "Average Go Accuracy",
        format: "percent",
      },
      {
        key: "noGoAccuracyPercent",
        label: "Average No-Go Accuracy",
        format: "percent",
      },
      {
        key: "meanGoLatencyMs",
        label: "Mean Go Latency",
        format: "milliseconds",
      },
    ],
    charts: [
      { key: "goAccuracyPercent", label: "Go Accuracy", format: "percent" },
      {
        key: "noGoAccuracyPercent",
        label: "No-Go Accuracy",
        format: "percent",
      },
      {
        key: "meanGoLatencyMs",
        label: "Mean Go Latency",
        format: "milliseconds",
      },
    ],
    tableColumns: [
      { key: "rulePreset", label: "Trial Mix", format: "text" },
      { key: "trialCount", label: "Trials", format: "count" },
      {
        key: "responseWindowMs",
        label: "Response Window",
        format: "milliseconds",
      },
      { key: "cueSpeedBpm", label: "Cue Speed", format: "count" },
      { key: "goAccuracyPercent", label: "Go Accuracy", format: "percent" },
      {
        key: "noGoAccuracyPercent",
        label: "No-Go Accuracy",
        format: "percent",
      },
      {
        key: "missedGoRatePercent",
        label: "Missed Go Rate",
        format: "percent",
      },
      {
        key: "meanGoLatencyMs",
        label: "Mean Go Latency",
        format: "milliseconds",
      },
    ],
    configurationFilters: [
      { key: "rulePreset", label: "Trial Mix" },
      { key: "trialCount", label: "Trial Count" },
      { key: "responseWindowMs", label: "Response Window (ms)" },
      { key: "cueSpeedBpm", label: "Cue Speed (BPM)" },
    ],
  },
  "motor-sequence-builder": {
    id: "motor-sequence-builder",
    label: "Motor Sequence Builder",
    description: "Keyboard sequence construction and completion.",
    patientSummary: [
      {
        key: "sequenceCompletionRatePercent",
        label: "Sequence Completion Rate",
        shortLabel: "Completion",
        format: "percent",
      },
      {
        key: "longestCompletedSequence",
        label: "Longest Completed Sequence",
        shortLabel: "Longest",
        format: "count",
      },
    ],
    summaryCards: [
      { key: "sessionCount", label: "Sessions", format: "count" },
      {
        key: "sequenceCompletionRatePercent",
        label: "Sequence Completion",
        format: "percent",
      },
      {
        key: "firstAttemptSequenceAccuracyPercent",
        label: "First-Attempt Sequence Accuracy",
        format: "percent",
      },
      {
        key: "longestCompletedSequence",
        label: "Longest Completed Sequence",
        format: "count",
      },
    ],
    charts: [
      {
        key: "sequenceCompletionRatePercent",
        label: "Sequence Completion Rate",
        format: "percent",
      },
      {
        key: "meanCompletionTimeMs",
        label: "Mean Completion Time",
        format: "milliseconds",
      },
    ],
    tableColumns: [
      { key: "contentType", label: "Content Type", format: "text" },
      { key: "sequenceLength", label: "Sequence Length", format: "count" },
      { key: "sequenceCount", label: "Sequences", format: "count" },
      {
        key: "sequenceCompletionRatePercent",
        label: "Completion Rate",
        format: "percent",
      },
      {
        key: "firstAttemptSequenceAccuracyPercent",
        label: "First Attempt",
        format: "percent",
      },
      {
        key: "longestCompletedSequence",
        label: "Longest Sequence",
        format: "count",
      },
      {
        key: "meanCompletionTimeMs",
        label: "Mean Completion Time",
        format: "milliseconds",
      },
    ],
    configurationFilters: [
      { key: "contentType", label: "Content Type" },
      { key: "sequenceLength", label: "Sequence Length" },
      { key: "sequenceCount", label: "Sequence Count" },
      { key: "presentationSpeedBpm", label: "Presentation Speed (BPM)" },
      { key: "audioMode", label: "Beat" },
    ],
  },
}

export const exerciseTypes = Object.keys(exerciseDefinitions) as ExerciseType[]
