import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMetricValue } from "@/api/stella"
import { Button } from "@/components/ui/button"
import { useGeneratePatientAnalysis, usePatientAnalysis } from "@/hooks/use-analysis"
import { cn } from "@/lib/utils"
import type {
  AnalysisScorecard,
  AnalysisTrendSeries,
} from "@/types/analysis"

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function Scorecard({ card }: { card: AnalysisScorecard }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        card.tone === "positive"
          ? "border-emerald-200/70 bg-emerald-50/40"
          : card.tone === "attention"
            ? "border-amber-200/70 bg-amber-50/50"
            : ""
      )}
    >
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {card.label}
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums">
        {formatMetricValue(card.value, card.format)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{card.helper}</div>
    </div>
  )
}

function TrendChart({ series }: { series: AnalysisTrendSeries }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-medium">{series.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Longitudinal trend from stored session history.
        </p>
      </div>
      <div className="mt-4 h-72">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={series.points}
            margin={{ left: 0, right: 18, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} />
            <YAxis tickLine={false} width={42} />
            <Tooltip
              formatter={(value) => [
                formatMetricValue(value, series.format),
                series.metricLabel,
              ]}
              labelFormatter={(_, payload) =>
                payload[0]?.payload?.date
                  ? formatTimestamp(payload[0].payload.date)
                  : ""
              }
            />
            <Line
              activeDot={{ r: 5 }}
              dataKey="value"
              dot={{ r: 3 }}
              stroke="var(--primary)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function PatientAnalysisPanel({
  patientId,
  patientName,
}: {
  patientId: string
  patientName: string
}) {
  const analysisQuery = usePatientAnalysis(patientId)
  const generateAnalysis = useGeneratePatientAnalysis()
  const analysis = analysisQuery.data

  async function handleGenerate() {
    await generateAnalysis.mutateAsync(patientId)
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold">AI Analysis</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Generate a clinician-facing summary for {patientName} using the
              full stored patient record, longitudinal exercise trends, and a
              Bedrock-hosted analysis agent.
            </p>
            {analysis ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Last generated {formatTimestamp(analysis.generatedAt)} using{" "}
                {analysis.modelId}
              </p>
            ) : null}
          </div>
          <Button
            disabled={generateAnalysis.isPending}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {generateAnalysis.isPending
              ? "Generating..."
              : analysis
                ? "Regenerate Analysis"
                : "Generate Analysis"}
          </Button>
        </div>
      </div>

      {analysisQuery.isLoading ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-sm text-muted-foreground">
          Loading saved analysis...
        </div>
      ) : null}

      {analysisQuery.isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/6 px-4 py-4 text-sm text-destructive">
          {analysisQuery.error instanceof Error
            ? analysisQuery.error.message
            : "Unable to load the saved analysis."}
        </div>
      ) : null}

      {generateAnalysis.isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/6 px-4 py-4 text-sm text-destructive">
          {generateAnalysis.error instanceof Error
            ? generateAnalysis.error.message
            : "Unable to generate the analysis."}
        </div>
      ) : null}

      {!analysisQuery.isLoading && !analysis ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Generate the first analysis to see narrative coaching guidance,
          ranked exercise priorities, configuration focus areas, and trend
          visuals for this patient.
        </div>
      ) : null}

      {analysis ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {analysis.scorecards.map((card) => (
              <Scorecard card={card} key={card.id} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border bg-card p-6">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Overall Assessment
              </div>
              <p className="mt-4 text-base leading-7">{analysis.summary}</p>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {analysis.disclaimer}
              </p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-xl border bg-card p-5">
                <h3 className="text-sm font-semibold">What Is Improving</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {analysis.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <h3 className="text-sm font-semibold">What Needs Attention</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {analysis.concerns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold">Exercise Priorities</h3>
                <span className="text-xs text-muted-foreground">
                  Higher score means more focus recommended
                </span>
              </div>
              <div className="mt-5 space-y-5">
                {analysis.recommendedExercises.map((item) => (
                  <div key={item.exerciseType}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{item.label}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {item.reason}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {item.score}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.priorityLabel}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.max(12, item.score)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {item.targetMetric}:{" "}
                      {formatMetricValue(item.recentValue, item.format)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-lg font-semibold">Configuration Focus</h3>
              <div className="mt-5 grid gap-4">
                {analysis.configurationFocus.map((item) => (
                  <div
                    className="rounded-lg border bg-background p-4"
                    key={`${item.exerciseType}-${item.label}-${item.value}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.exerciseLabel}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {item.label}
                        </div>
                      </div>
                      <div className="rounded-full border bg-muted px-3 py-1 text-sm font-medium">
                        {item.value}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.reason}
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Target metric: {item.targetMetric}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold">Visual Insights</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Trend views are rendered from stored patient metrics rather than
                inferred prose.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {analysis.trendSeries.map((series) => (
                <TrendChart key={series.exerciseType} series={series} />
              ))}
            </div>
          </section>

          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold">Evidence</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {analysis.evidence.map((item) => (
                <div className="rounded-lg border bg-background p-4" key={item.label}>
                  <div className="text-sm font-medium">{item.label}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
