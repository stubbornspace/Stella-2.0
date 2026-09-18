"use strict";

const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamo = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});

const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const sessionsTableName = process.env.SESSIONS_TABLE_NAME;
const analysisTableName = process.env.ANALYSIS_TABLE_NAME;
const modelId = process.env.BEDROCK_MODEL_ID || "us.amazon.nova-lite-v1:0";

const exerciseMetadata = {
  "letter-target": {
    label: "Letter Target",
    metricFormat: "percent",
    metricKey: "firstAttemptSuccessRatePercent",
    metricLabel: "First-attempt accuracy",
  },
  "letter-find": {
    label: "Letter Find",
    metricFormat: "percent",
    metricKey: "firstAttemptSuccessRatePercent",
    metricLabel: "First-attempt accuracy",
  },
  "eye-pong": {
    label: "Eye Pong",
    metricFormat: "percent",
    metricKey: "completionRatePercent",
    metricLabel: "Completion rate",
  },
  "inhibition-challenge": {
    label: "Inhibition Challenge",
    metricFormat: "percent",
    metricKey: "noGoAccuracyPercent",
    metricLabel: "No-go accuracy",
  },
  "motor-sequence-builder": {
    label: "Motor Sequence Builder",
    metricFormat: "percent",
    metricKey: "sequenceCompletionRatePercent",
    metricLabel: "Sequence completion",
  },
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function round(value, precision = 0) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function formatMetricValue(value, format) {
  if (value === undefined || value === null || value === "") {
    return "N/A";
  }

  if (format === "percent") {
    return `${Math.round(value)}%`;
  }

  if (format === "milliseconds") {
    return `${Math.round(value)} ms`;
  }

  if (format === "duration") {
    return `${Math.round(value)} min`;
  }

  if (format === "decimal") {
    return Number(value).toFixed(1);
  }

  return String(value);
}

function sessionDateValue(session) {
  return new Date(session.sessionDate).getTime();
}

async function getPatientById(patientId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: patientsTableName,
      Key: marshall({ patientId }),
    })
  );

  return result.Item ? unmarshall(result.Item) : undefined;
}

async function queryPatientSessions(patientId) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: sessionsTableName,
        KeyConditionExpression: "patientId = :patientId",
        ExpressionAttributeValues: marshall({
          ":patientId": patientId,
        }),
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      })
    );

    items.push(...(result.Items ?? []).map((item) => unmarshall(item)));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

function averageMetric(sessions, key) {
  const values = sessions
    .map((session) => session[key])
    .filter((value) => typeof value === "number");

  if (values.length === 0) {
    return undefined;
  }

  return round(
    values.reduce((total, value) => total + value, 0) / values.length,
    1
  );
}

function normalizedSessionScore(session) {
  if (typeof session.firstAttemptSuccessRatePercent === "number") {
    return session.firstAttemptSuccessRatePercent;
  }
  if (typeof session.completionRatePercent === "number") {
    return session.completionRatePercent;
  }
  if (typeof session.sequenceCompletionRatePercent === "number") {
    return session.sequenceCompletionRatePercent;
  }
  if (
    typeof session.goAccuracyPercent === "number" &&
    typeof session.noGoAccuracyPercent === "number"
  ) {
    return round(
      (session.goAccuracyPercent + session.noGoAccuracyPercent) / 2,
      1
    );
  }

  return undefined;
}

function getLatestReferenceDate(sessions) {
  const latestSession = sessions.toSorted(
    (left, right) => sessionDateValue(right) - sessionDateValue(left)
  )[0];

  return latestSession ? new Date(latestSession.sessionDate) : new Date();
}

function recentWindowStart(sessions) {
  const latestReference = getLatestReferenceDate(sessions);
  return latestReference.getTime() - 30 * 24 * 60 * 60 * 1000;
}

function buildActivityInsight(exerciseType, sessions) {
  const metadata = exerciseMetadata[exerciseType];
  const sortedSessions = sessions.toSorted(
    (left, right) => sessionDateValue(left) - sessionDateValue(right)
  );
  const recentSessions = sortedSessions.slice(-3);
  const baselineSessions = sortedSessions.slice(0, Math.min(3, sortedSessions.length));
  const recentAverage = averageMetric(recentSessions, metadata.metricKey);
  const baselineAverage = averageMetric(baselineSessions, metadata.metricKey);
  const delta =
    recentAverage !== undefined && baselineAverage !== undefined
      ? round(recentAverage - baselineAverage, 1)
      : 0;
  const latestSession = sortedSessions[sortedSessions.length - 1];
  const latencyAverage = averageMetric(recentSessions, "meanCorrectLatencyMs");
  const noGoLatencyAverage = averageMetric(recentSessions, "meanGoLatencyMs");
  const effectiveLatency = latencyAverage ?? noGoLatencyAverage;
  const concernPenalty =
    effectiveLatency && effectiveLatency > 950
      ? round((effectiveLatency - 950) / 12, 1)
      : 0;
  const priorityScore = clamp(
    round((100 - (recentAverage ?? 72)) + Math.max(0, -delta) * 1.8 + concernPenalty),
    18,
    98
  );

  return {
    baselineAverage,
    delta,
    exerciseType,
    label: metadata.label,
    latestSession,
    metricFormat: metadata.metricFormat,
    metricKey: metadata.metricKey,
    metricLabel: metadata.metricLabel,
    priorityScore,
    recentAverage,
    sessionCount: sortedSessions.length,
    trendDirection: delta >= 0 ? "up" : "down",
    trendSeries: {
      exerciseType,
      format: metadata.metricFormat,
      metricKey: metadata.metricKey,
      metricLabel: metadata.metricLabel,
      title: `${metadata.label} ${metadata.metricLabel}`,
      points: sortedSessions
        .filter((session) => typeof session[metadata.metricKey] === "number")
        .map((session) => ({
          date: session.sessionDate,
          label: new Date(session.sessionDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: session[metadata.metricKey],
        })),
    },
  };
}

function buildScorecards(sessions, insights) {
  const recentStart = recentWindowStart(sessions);
  const recentSessions = sessions.filter(
    (session) => sessionDateValue(session) >= recentStart
  );
  const recentScores = recentSessions
    .map(normalizedSessionScore)
    .filter((value) => typeof value === "number");
  const recentPerformance =
    recentScores.length > 0
      ? round(
          recentScores.reduce((total, value) => total + value, 0) /
            recentScores.length,
          1
        )
      : undefined;
  const latencyValues = recentSessions
    .flatMap((session) => [
      typeof session.meanCorrectLatencyMs === "number"
        ? session.meanCorrectLatencyMs
        : undefined,
      typeof session.meanGoLatencyMs === "number"
        ? session.meanGoLatencyMs
        : undefined,
      typeof session.meanCompletionTimeMs === "number"
        ? session.meanCompletionTimeMs
        : undefined,
    ])
    .filter((value) => typeof value === "number");
  const responseSpeed =
    latencyValues.length > 0
      ? round(
          latencyValues.reduce((total, value) => total + value, 0) /
            latencyValues.length,
          0
        )
      : undefined;

  return [
    {
      id: "recent-performance",
      label: "Recent Performance",
      value: recentPerformance,
      format: "percent",
      helper: recentScores.length > 0 ? "Average across recent sessions" : "Awaiting more sessions",
      tone:
        recentPerformance === undefined
          ? "neutral"
          : recentPerformance >= 82
            ? "positive"
            : recentPerformance >= 72
              ? "neutral"
              : "attention",
    },
    {
      id: "response-speed",
      label: "Response Speed",
      value: responseSpeed,
      format: "milliseconds",
      helper: responseSpeed ? "Lower is generally better" : "No latency metric available",
      tone:
        responseSpeed === undefined
          ? "neutral"
          : responseSpeed <= 850
            ? "positive"
            : responseSpeed <= 980
              ? "neutral"
              : "attention",
    },
    {
      id: "session-volume",
      label: "Recent Sessions",
      value: recentSessions.length,
      format: "count",
      helper: "Sessions in the latest 30-day window",
      tone: recentSessions.length >= 6 ? "positive" : recentSessions.length >= 3 ? "neutral" : "attention",
    },
    {
      id: "exercise-coverage",
      label: "Exercise Coverage",
      value: insights.length,
      format: "count",
      helper: "Distinct exercise types completed",
      tone: insights.length >= 4 ? "positive" : insights.length >= 2 ? "neutral" : "attention",
    },
  ];
}

function buildConfigRecommendation(insight) {
  const session = insight.latestSession ?? {};

  switch (insight.exerciseType) {
    case "letter-target":
    case "letter-find":
      if (session.contentMode === "words") {
        return {
          exerciseType: insight.exerciseType,
          exerciseLabel: insight.label,
          label: "Word Length",
          value: "0-5",
          targetMetric: insight.metricLabel,
          reason:
            "Shorter words should lower cognitive load while first-attempt accuracy improves.",
        };
      }

      return {
        exerciseType: insight.exerciseType,
        exerciseLabel: insight.label,
        label: "Audio Mode",
        value: "metronome",
        targetMetric: insight.metricLabel,
        reason:
          "A steady cue can make pacing more consistent when first-attempt accuracy is lagging.",
      };
    case "eye-pong":
      return {
        exerciseType: insight.exerciseType,
        exerciseLabel: insight.label,
        label: session.mode === "random" ? "Mode" : "Tempo",
        value: session.mode === "random" ? "left-right" : "54 BPM",
        targetMetric: insight.metricLabel,
        reason:
          "Reducing visual variability should make completion more repeatable before ramping complexity back up.",
      };
    case "inhibition-challenge":
      return {
        exerciseType: insight.exerciseType,
        exerciseLabel: insight.label,
        label: "Response Window",
        value: `${Number(session.responseWindowMs ?? 900) + 100} ms`,
        targetMetric: insight.metricLabel,
        reason:
          "A slightly longer response window should support cleaner inhibition decisions before cue speed is increased.",
      };
    default:
      return {
        exerciseType: insight.exerciseType,
        exerciseLabel: insight.label,
        label: "Sequence Length",
        value: String(Math.max(2, Number(session.sequenceLength ?? 3) - 1)),
        targetMetric: insight.metricLabel,
        reason:
          "Shorter sequences should improve successful completion while motor planning catches up.",
      };
  }
}

function buildEvidence(insights) {
  return insights.slice(0, 3).map((insight) => ({
    label: insight.label,
    detail:
      insight.recentAverage !== undefined && insight.baselineAverage !== undefined
        ? `${insight.metricLabel} moved from ${formatMetricValue(
            insight.baselineAverage,
            insight.metricFormat
          )} to ${formatMetricValue(
            insight.recentAverage,
            insight.metricFormat
          )} across ${insight.sessionCount} sessions.`
        : `Completed ${insight.sessionCount} sessions for ${insight.label}.`,
  }));
}

function defaultStrengths(insights) {
  return insights
    .filter((insight) => insight.delta >= 0)
    .slice(0, 3)
    .map(
      (insight) =>
        `${insight.label} is trending upward with recent ${insight.metricLabel.toLowerCase()} at ${formatMetricValue(
          insight.recentAverage,
          insight.metricFormat
        )}.`
    );
}

function defaultConcerns(insights) {
  return insights
    .slice(0, 3)
    .map(
      (insight) =>
        `${insight.label} remains a focus area because recent ${insight.metricLabel.toLowerCase()} is ${formatMetricValue(
          insight.recentAverage,
          insight.metricFormat
        )}.`
    );
}

function buildPrompt(patient, sessions, insights, recommendationScores, configurationFocus) {
  const promptPayload = {
    patient: {
      fullName: `${patient.firstName} ${patient.lastName}`,
      patientCode: patient.patientCode,
      totalSessions: sessions.length,
    },
    evidence: buildEvidence(insights),
    activityInsights: insights.map((insight) => ({
      exerciseType: insight.exerciseType,
      label: insight.label,
      metricLabel: insight.metricLabel,
      recentAverage: insight.recentAverage,
      baselineAverage: insight.baselineAverage,
      delta: insight.delta,
      sessionCount: insight.sessionCount,
    })),
    recommendationScores,
    configurationFocus,
  };

  return `
You are generating clinician-facing coaching insights for a Stella prototype.
Do not diagnose. Do not mention medical certainty. Keep the tone practical and specific.
Ground every claim in the data provided.

Return valid JSON only with this exact shape:
{
  "summary": "string",
  "strengths": ["string"],
  "concerns": ["string"],
  "exerciseHighlights": [
    { "exerciseType": "string", "reason": "string" }
  ],
  "configurationHighlights": [
    { "exerciseType": "string", "label": "string", "value": "string", "reason": "string" }
  ]
}

Use only the exercise types and configuration items provided below. Keep arrays to at most 3 items each.

${JSON.stringify(promptPayload, null, 2)}
`.trim();
}

function extractJson(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]+?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Bedrock did not return JSON.");
}

async function generateNarrative(patient, sessions, insights, recommendationScores, configurationFocus) {
  const prompt = buildPrompt(
    patient,
    sessions,
    insights,
    recommendationScores,
    configurationFocus
  );
  const result = await bedrock.send(
    new ConverseCommand({
      modelId,
      system: [
        {
          text: "You are a careful therapy-coaching analyst for a Stella prototype. Return JSON only.",
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              text: prompt,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 1200,
        temperature: 0.2,
        topP: 0.9,
      },
    })
  );
  const text = (result.output?.message?.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Bedrock returned an empty response.");
  }

  return JSON.parse(extractJson(text));
}

function mergeNarrative({
  configurationFocus,
  defaultSummary,
  insights,
  narrative,
  recommendationScores,
  scorecards,
}) {
  const exerciseHighlightMap = new Map(
    (Array.isArray(narrative.exerciseHighlights) ? narrative.exerciseHighlights : [])
      .filter((item) => item?.exerciseType && item?.reason)
      .map((item) => [item.exerciseType, item.reason])
  );
  const configurationHighlightMap = new Map(
    (Array.isArray(narrative.configurationHighlights)
      ? narrative.configurationHighlights
      : []
    )
      .filter((item) => item?.exerciseType && item?.label && item?.reason)
      .map((item) => [
        `${item.exerciseType}:${item.label}:${item.value}`,
        item.reason,
      ])
  );

  const recommendedExercises = recommendationScores.slice(0, 3).map((item) => ({
    ...item,
    priorityLabel:
      item.score >= 75 ? "High" : item.score >= 55 ? "Medium" : "Low",
    reason:
      exerciseHighlightMap.get(item.exerciseType) ??
      `${item.label} should get more repetition because recent ${item.targetMetric.toLowerCase()} is ${formatMetricValue(
        item.recentValue,
        item.format
      )}.`,
  }));

  const mergedConfigurationFocus = configurationFocus.map((item) => ({
    ...item,
    reason:
      configurationHighlightMap.get(
        `${item.exerciseType}:${item.label}:${item.value}`
      ) ?? item.reason,
  }));

  return {
    concerns:
      Array.isArray(narrative.concerns) && narrative.concerns.length > 0
        ? narrative.concerns.slice(0, 3)
        : defaultConcerns(insights),
    configurationFocus: mergedConfigurationFocus,
    disclaimer:
      "This Stella analysis is a prototype coaching aid and not a clinical diagnosis.",
    evidence: buildEvidence(insights),
    generatedAt: new Date().toISOString(),
    modelId,
    recommendationScores,
    recommendedExercises,
    scorecards,
    strengths:
      Array.isArray(narrative.strengths) && narrative.strengths.length > 0
        ? narrative.strengths.slice(0, 3)
        : defaultStrengths(insights),
    summary:
      typeof narrative.summary === "string" && narrative.summary.trim()
        ? narrative.summary.trim()
        : defaultSummary,
    trendSeries: insights
      .filter((insight) => insight.trendSeries.points.length > 1)
      .slice(0, 3)
      .map((insight) => insight.trendSeries),
  };
}

async function buildAnalysis(patientId) {
  const patient = await getPatientById(patientId);

  if (!patient) {
    return {
      error: response(404, {
        message: "Patient not found.",
      }),
    };
  }

  const sessions = await queryPatientSessions(patientId);

  if (sessions.length === 0) {
    return {
      error: response(400, {
        message: "This patient does not have session data to analyze yet.",
      }),
    };
  }

  const groupedSessions = sessions.reduce((groups, session) => {
    const key = session.activity;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(session);
    return groups;
  }, {});
  const insights = Object.entries(groupedSessions)
    .map(([exerciseType, activitySessions]) =>
      buildActivityInsight(exerciseType, activitySessions)
    )
    .toSorted((left, right) => right.priorityScore - left.priorityScore);
  const scorecards = buildScorecards(sessions, insights);
  const recommendationScores = insights.map((insight) => ({
    exerciseType: insight.exerciseType,
    label: insight.label,
    score: insight.priorityScore,
    targetMetric: insight.metricLabel,
    recentValue: insight.recentAverage,
    baselineValue: insight.baselineAverage,
    format: insight.metricFormat,
    trendDelta: insight.delta,
  }));
  const configurationFocus = insights
    .slice(0, 3)
    .map((insight) => buildConfigRecommendation(insight));
  const defaultSummary = `${patient.firstName} ${patient.lastName} shows the clearest short-term opportunity in ${insights[0]?.label ?? "recent session work"}, while ${insights
    .filter((insight) => insight.delta >= 0)
    .slice(0, 1)
    .map((insight) => insight.label)
    .join(" and ") || "several exercises"} is showing the strongest recent momentum.`;
  const narrative = await generateNarrative(
    patient,
    sessions,
    insights,
    recommendationScores,
    configurationFocus
  );
  const merged = mergeNarrative({
    configurationFocus,
    defaultSummary,
    insights,
    narrative,
    recommendationScores,
    scorecards,
  });

  return {
    analysis: {
      patientId,
      ...merged,
    },
  };
}

async function getSavedAnalysis(patientId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: analysisTableName,
      Key: marshall({ patientId }),
    })
  );

  return result.Item ? unmarshall(result.Item) : null;
}

exports.handler = async (event) => {
  try {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();

    if (!patientId) {
      return response(400, { message: "patientId is required." });
    }

    if (event.routeKey === "GET /patients/{patientId}/analysis") {
      return response(200, {
        analysis: await getSavedAnalysis(patientId),
      });
    }

    if (event.routeKey === "POST /patients/{patientId}/analysis") {
      const result = await buildAnalysis(patientId);

      if (result.error) {
        return result.error;
      }

      await dynamo.send(
        new PutItemCommand({
          TableName: analysisTableName,
          Item: marshall(result.analysis, {
            removeUndefinedValues: true,
          }),
        })
      );

      return response(200, result.analysis);
    }

    return response(405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Analysis handler failed", error);
    return response(500, {
      message:
        error instanceof Error
          ? error.message
          : "Unexpected Stella analysis service error.",
    });
  }
};
