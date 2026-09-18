import type { ExerciseType, MetricFormat } from "@/types"

export type AnalysisTone = "positive" | "neutral" | "attention"

export interface AnalysisScorecard {
  id: string
  label: string
  value?: number
  format: MetricFormat
  helper: string
  tone: AnalysisTone
}

export interface AnalysisTrendPoint {
  date: string
  label: string
  value: number
}

export interface AnalysisTrendSeries {
  exerciseType: ExerciseType
  format: MetricFormat
  metricKey: string
  metricLabel: string
  points: AnalysisTrendPoint[]
  title: string
}

export interface AnalysisRecommendationScore {
  exerciseType: ExerciseType
  label: string
  score: number
  targetMetric: string
  recentValue?: number
  baselineValue?: number
  format: MetricFormat
  trendDelta: number
}

export interface ExerciseRecommendation
  extends AnalysisRecommendationScore {
  priorityLabel: "High" | "Medium" | "Low"
  reason: string
}

export interface ConfigurationRecommendation {
  exerciseType: ExerciseType
  exerciseLabel: string
  label: string
  reason: string
  targetMetric: string
  value: string
}

export interface AnalysisEvidence {
  detail: string
  label: string
}

export interface PatientAnalysis {
  concerns: string[]
  configurationFocus: ConfigurationRecommendation[]
  disclaimer: string
  evidence: AnalysisEvidence[]
  generatedAt: string
  modelId: string
  patientId: string
  recommendationScores: AnalysisRecommendationScore[]
  recommendedExercises: ExerciseRecommendation[]
  scorecards: AnalysisScorecard[]
  strengths: string[]
  summary: string
  trendSeries: AnalysisTrendSeries[]
}
