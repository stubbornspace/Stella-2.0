"use strict";

const { randomUUID } = require("crypto");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const {
  errorResponse,
  httpError,
  resolveClinicAccess,
} = require("./clinic-auth");

const dynamo = new DynamoDBClient({});

const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const sessionsTableName = process.env.SESSIONS_TABLE_NAME;
const clinicsTableName = process.env.CLINICS_TABLE_NAME;
const membershipsTableName = process.env.MEMBERSHIPS_TABLE_NAME;
const patientsByClinicIndex = process.env.PATIENTS_BY_CLINIC_INDEX;
const sessionsByClinicIndex = process.env.SESSIONS_BY_CLINIC_INDEX;
const demoToday = new Date("2026-09-15T12:00:00");
const activeExerciseTypes = new Set([
  "letter-target",
  "letter-find",
  "eye-pong",
  "inhibition-challenge",
]);

function isActiveSession(session) {
  return activeExerciseTypes.has(session.activity);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body ?? "{}");
  } catch {
    throw httpError(400, "Invalid request body.");
  }
}

function queryByClinic(
  tableName,
  indexName,
  clinicId,
  scanIndexForward = true,
) {
  return (async () => {
    const items = [];
    let exclusiveStartKey;

    do {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "clinicId = :clinicId",
          ExpressionAttributeValues: { ":clinicId": { S: clinicId } },
          ExclusiveStartKey: exclusiveStartKey,
          ScanIndexForward: scanIndexForward,
        }),
      );

      items.push(...(result.Items ?? []).map((item) => unmarshall(item)));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
  })();
}

function queryClinicPatients(clinicId) {
  return queryByClinic(
    patientsTableName,
    patientsByClinicIndex,
    clinicId,
    false,
  );
}

function queryClinicSessions(clinicId) {
  return queryByClinic(
    sessionsTableName,
    sessionsByClinicIndex,
    clinicId,
    false,
  ).then((sessions) => sessions.filter(isActiveSession));
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
      }),
    );

    items.push(...(result.Items ?? []).map((item) => unmarshall(item)));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items.filter(isActiveSession);
}

async function getPatientById(patientId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: patientsTableName,
      Key: marshall({ patientId }),
    }),
  );

  return result.Item ? unmarshall(result.Item) : undefined;
}

async function getClinicPatient(patientId, clinicId) {
  const patient = await getPatientById(patientId);
  return patient?.clinicId === clinicId ? patient : undefined;
}

function sessionDateValue(session) {
  return new Date(session.sessionDate).getTime();
}

function fullName(patient) {
  return `${patient.firstName} ${patient.lastName}`;
}

function getNextPatientCode(patients) {
  const maxPatientNumber = patients.reduce((currentMax, patient) => {
    const match = /^P-(\d+)$/i.exec(String(patient.patientCode ?? "").trim());

    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 1020);

  return `P-${String(maxPatientNumber + 1).padStart(4, "0")}`;
}

function computePatientStats(patients, sessions) {
  const activeThreshold = new Date(
    demoToday.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).getTime();

  return patients.map((patient) => {
    const patientSessions = sessions.filter(
      (session) => session.patientId === patient.id,
    );
    const lastSession = patientSessions.toSorted(
      (left, right) => sessionDateValue(right) - sessionDateValue(left),
    )[0];

    return {
      ...patient,
      fullName: fullName(patient),
      totalSessions: patientSessions.length,
      exerciseCount: new Set(patientSessions.map((session) => session.activity))
        .size,
      lastSessionDate: lastSession?.sessionDate,
      isActive: lastSession
        ? sessionDateValue(lastSession) >= activeThreshold
        : false,
    };
  });
}

function startOfMonthValue(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function round(value, precision = 0) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

const keyboardLayouts = {
  qwerty: [
    "Q",
    "W",
    "E",
    "R",
    "T",
    "Y",
    "U",
    "I",
    "O",
    "P",
    "A",
    "S",
    "D",
    "F",
    "G",
    "H",
    "J",
    "K",
    "L",
    "",
    "",
    "Z",
    "X",
    "C",
    "V",
    "B",
    "N",
    "M",
    "",
    "",
  ],
  alphabetical: [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "",
    "",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "",
    "",
  ],
};

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function timestampDifference(start, end) {
  if (!start || !end) return undefined;
  const difference = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(difference) ? Math.max(0, difference) : undefined;
}

function letterToKeyMap(layout) {
  return Object.fromEntries(
    (keyboardLayouts[layout] ?? keyboardLayouts.qwerty)
      .map((letter, index) => [letter, index + 1])
      .filter(([letter]) => Boolean(letter)),
  );
}

function keyMissMetrics(targetKeyId, pressedKeyId) {
  const targetColumn = (targetKeyId - 1) % 10;
  const targetRow = Math.floor((targetKeyId - 1) / 10);
  const pressedColumn = (pressedKeyId - 1) % 10;
  const pressedRow = Math.floor((pressedKeyId - 1) / 10);
  const columnDelta = pressedColumn - targetColumn;
  const rowDelta = pressedRow - targetRow;
  return {
    direction:
      Math.abs(columnDelta) >= Math.abs(rowDelta)
        ? columnDelta < 0
          ? "left"
          : "right"
        : rowDelta < 0
          ? "above"
          : "below",
    distance: Math.sqrt(columnDelta ** 2 + rowDelta ** 2),
  };
}

function computeLetterMetrics(
  stats,
  keyboardLayout,
  audioMode,
  selectedWords = [],
) {
  const totalAttempts = stats.reduce((sum, stat) => sum + stat.attempts, 0);
  const incorrectAttempts = stats.reduce(
    (sum, stat) => sum + Math.max(0, stat.attempts - 1),
    0,
  );
  const correctHits = stats.length;
  const firstAttemptSuccessRatePercent =
    correctHits > 0
      ? round(
          (stats.filter((stat) => stat.attempts === 1).length / correctHits) *
            100,
        )
      : 0;
  const correctLatencies = stats.map((stat) => stat.timeMs);
  const letterToKey = letterToKeyMap(keyboardLayout);
  const attemptLatencies = [];
  const firstResponseLatencies = [];
  const missDistances = [];
  const errorDirectionCounts = {};

  for (const stat of stats) {
    const attempts = stat.attemptEvents ?? [];
    const firstLatency = timestampDifference(
      stat.targetStartedAt,
      attempts[0]?.timestamp,
    );
    if (firstLatency != null) firstResponseLatencies.push(firstLatency);
    for (const attempt of attempts) {
      const latency = timestampDifference(
        stat.targetStartedAt,
        attempt.timestamp,
      );
      if (latency != null) attemptLatencies.push(latency);
      if (attempt.correct) continue;
      const targetKeyId = letterToKey[stat.letter];
      const pressedKeyId = attempt.keyId ?? letterToKey[attempt.pressedLetter];
      if (targetKeyId == null || pressedKeyId == null) continue;
      const miss = keyMissMetrics(targetKeyId, pressedKeyId);
      missDistances.push(miss.distance);
      errorDirectionCounts[miss.direction] =
        (errorDirectionCounts[miss.direction] ?? 0) + 1;
    }
  }

  const byKey = [...new Set(stats.map((stat) => stat.letter))]
    .sort()
    .map((letter) => {
      const letterStats = stats.filter((stat) => stat.letter === letter);
      return {
        beat: audioMode,
        firstAttemptAccuracyPercent: round(
          (letterStats.filter((stat) => stat.attempts === 1).length /
            letterStats.length) *
            100,
        ),
        incorrectAttempts: letterStats.reduce(
          (sum, stat) => sum + Math.max(0, stat.attempts - 1),
          0,
        ),
        keyId: letterToKey[letter],
        letter,
        meanCorrectLatencyMs: round(
          mean(letterStats.map((stat) => stat.timeMs)),
        ),
        trials: letterStats.length,
      };
    });

  let statOffset = 0;
  const byWord = selectedWords.flatMap((word) => {
    const wordStats = stats.slice(statOffset, statOffset + word.length);
    statOffset += word.length;
    if (wordStats.length !== word.length) return [];
    const completedTimes = wordStats
      .map((stat) => stat.completedAt && new Date(stat.completedAt).getTime())
      .filter((value) => typeof value === "number");
    const intervals = completedTimes
      .slice(1)
      .map((value, index) => value - completedTimes[index]);
    return [
      {
        beat: audioMode,
        completionTimeMs: timestampDifference(
          wordStats[0]?.targetStartedAt,
          wordStats[wordStats.length - 1]?.completedAt,
        ),
        firstAttemptAccuracyPercent: round(
          (wordStats.filter((stat) => stat.attempts === 1).length /
            wordStats.length) *
            100,
        ),
        interKeyIntervalMs: intervals.length
          ? round(mean(intervals))
          : undefined,
        length: word.length,
        trials: wordStats.length,
        word,
      },
    ];
  });

  let sequenceOffset = 0;
  const breakdownPointCounts = {};
  const sequencePerformance = selectedWords.map((word, index) => {
    const wordStats = stats.slice(sequenceOffset, sequenceOffset + word.length);
    sequenceOffset += word.length;
    const firstErrorPosition = wordStats.findIndex((stat) => stat.attempts > 1);
    if (firstErrorPosition >= 0) {
      const position = firstErrorPosition + 1;
      breakdownPointCounts[position] =
        (breakdownPointCounts[position] ?? 0) + 1;
    }
    return {
      item: index + 1,
      lettersCompleted: wordStats.length,
      lettersInItem: word.length,
    };
  });
  const dominantDirection = Object.entries(errorDirectionCounts).sort(
    (left, right) => right[1] - left[1],
  )[0];
  const dominantBreakdown = Object.entries(breakdownPointCounts).sort(
    (left, right) => right[1] - left[1],
  )[0];

  return {
    byKey,
    byWord,
    correctHits,
    directionalConsistencyPercent: dominantDirection
      ? round((dominantDirection[1] / incorrectAttempts) * 100)
      : undefined,
    dominantErrorDirection: dominantDirection?.[0],
    errorDirectionCounts,
    firstAttemptSuccessRatePercent,
    incorrectAttempts,
    latencyIqrMs:
      correctLatencies.length > 3
        ? round(
            percentile(correctLatencies, 0.75) -
              percentile(correctLatencies, 0.25),
          )
        : undefined,
    latencyVariabilityStdDev: round(standardDeviation(correctLatencies)),
    meanCorrectLatencyMs: round(mean(correctLatencies)),
    meanFirstResponseLatencyMs: round(mean(firstResponseLatencies)),
    meanIncorrectAttemptsPerTrial: correctHits
      ? round(incorrectAttempts / correctHits, 2)
      : 0,
    meanMissDistance: missDistances.length
      ? round(mean(missDistances), 2)
      : undefined,
    meanResponseLatencyMs: round(mean(attemptLatencies)),
    medianCorrectLatencyMs: round(median(correctLatencies)),
    mostCommonBreakdownPosition: dominantBreakdown
      ? Number(dominantBreakdown[0])
      : undefined,
    responseLatencyStdDev: round(standardDeviation(attemptLatencies)),
    sequenceCompletionRatePercent: sequencePerformance.length
      ? round(
          (sequencePerformance.filter(
            (item) => item.lettersCompleted === item.lettersInItem,
          ).length /
            sequencePerformance.length) *
            100,
        )
      : undefined,
    sequencePerformance,
    totalAttempts,
  };
}

function computeBeatMetrics(stats, actualBpm) {
  const attempts = stats.flatMap((stat) => stat.attemptEvents ?? []);
  const timedStats = (attempts.length ? attempts : stats).filter(
    (stat) => typeof stat.beatOffsetMs === "number",
  );
  const offsets = timedStats.map((stat) => stat.beatOffsetMs);

  if (offsets.length === 0) {
    return {
      onBeatAccuracyPercent: undefined,
      timingVariabilityStdDev: undefined,
    };
  }

  const usesExactBeatMap = timedStats.every(
    (stat) => stat.beatOffsetBasis === "nearest-beat",
  );

  if (!usesExactBeatMap && !actualBpm) {
    return {
      onBeatAccuracyPercent: undefined,
      timingVariabilityStdDev: undefined,
    };
  }

  const signedOffsets = usesExactBeatMap
    ? offsets
    : offsets.map((offset) => {
        const beatIntervalMs = (60 / actualBpm) * 1000;
        const normalizedOffset =
          ((offset % beatIntervalMs) + beatIntervalMs) % beatIntervalMs;
        return normalizedOffset > beatIntervalMs / 2
          ? normalizedOffset - beatIntervalMs
          : normalizedOffset;
      });
  const toleranceMs = usesExactBeatMap
    ? 150
    : Math.min(150, (60 / actualBpm) * 500);
  const onBeatHits = signedOffsets.filter(
    (offset) => Math.abs(offset) <= toleranceMs,
  ).length;
  const meanOffset =
    signedOffsets.reduce((sum, value) => sum + value, 0) / signedOffsets.length;
  const timingVariabilityStdDev = round(
    Math.sqrt(
      signedOffsets.reduce((sum, value) => sum + (value - meanOffset) ** 2, 0) /
        signedOffsets.length,
    ),
  );

  return {
    onBeatAccuracyPercent: round((onBeatHits / signedOffsets.length) * 100),
    timingVariabilityStdDev,
  };
}

function buildSessionFromResult({
  completedUnits,
  durationMinutes,
  elapsedSeconds,
  patientId,
  result,
  runId,
  sessionDate,
  setup,
  status,
}) {
  const sessionId = runId
    ? `runtime-${patientId}-${setup.activity}-${runId}`
    : `session-${patientId}-${setup.activity}-${Date.now()}`;
  const baseSession = {
    sessionId,
    patientId,
    activity: result.activity,
    sessionDate,
    sessionKey: `SESSION#${sessionDate}#${sessionId}`,
    status,
    summary: "Captured keyboard exercise session.",
    activeEngagementTimeMinutes: durationMinutes,
    totalSessionDurationMinutes: durationMinutes,
    pauseBreakCount: 0,
    rawEventPayload: result,
    keyboardLayout: result.keyboardLayout ?? setup.keyboardLayout ?? "qwerty",
    keyboardSide:
      result.activity === "eye-pong" && result.mode === "left-right"
        ? "full"
        : (result.keyboardSide ?? setup.keyboardSide ?? "full"),
    keyLabels:
      result.activity === "letter-find"
        ? "letters"
        : (result.keyLabels ?? setup.keyLabels ?? "letters"),
  };

  if (result.activity === "eye-pong" && setup.activity === "eye-pong") {
    return {
      ...baseSession,
      activity: "eye-pong",
      audioMode: result.audioMode,
      completionRatePercent: result.completionRatePercent,
      mode: result.mode,
      musicPlaybackRate:
        result.audioMode === "music" ? setup.musicPlaybackRate : undefined,
      pattern: result.mode === "left-right" ? "horizontal" : "mixed",
      targetCount: result.targetCount ?? setup.targetCount ?? 20,
      targetChanges: result.targetChanges,
      tempoBpm: result.audioMode === "metronome" ? setup.tempoBpm : undefined,
    };
  }

  if (
    result.activity === "inhibition-challenge" &&
    setup.activity === "inhibition-challenge"
  ) {
    const closedTrials = result.trials.filter((trial) => trial.windowClosed);
    const goTrials = closedTrials.filter((trial) => trial.cue === "go");
    const noGoTrials = closedTrials.filter((trial) => trial.cue === "no-go");
    const correctGoTrials = goTrials.filter(
      (trial) => trial.outcome === "correct",
    );
    const correctNoGoTrials = noGoTrials.filter(
      (trial) => trial.outcome === "correct",
    );
    const goLatencies = correctGoTrials.flatMap((trial) => {
      const correctPress = trial.presses.find((press) => press.correct);
      return correctPress ? [correctPress.offsetMs - trial.cueOffsetMs] : [];
    });
    const goAccuracyPercent =
      goTrials.length > 0
        ? round((correctGoTrials.length / goTrials.length) * 100)
        : 0;

    return {
      ...baseSession,
      activity: "inhibition-challenge",
      attemptsPerMinute:
        durationMinutes > 0
          ? round(closedTrials.length / durationMinutes, 1)
          : 0,
      cueSpeedBpm: result.cueSpeedBpm,
      goAccuracyPercent,
      meanGoLatencyMs:
        goLatencies.length > 0
          ? round(
              goLatencies.reduce((sum, latency) => sum + latency, 0) /
                goLatencies.length,
            )
          : 0,
      missedGoRatePercent:
        goTrials.length > 0
          ? round(
              (goTrials.filter((trial) => trial.outcome === "missed").length /
                goTrials.length) *
                100,
            )
          : 0,
      noGoAccuracyPercent:
        noGoTrials.length > 0
          ? round((correctNoGoTrials.length / noGoTrials.length) * 100)
          : 0,
      responseWindowMs: result.responseWindowMs,
      rulePreset: result.rulePreset,
      summary: `${goAccuracyPercent}% Go accuracy across ${closedTrials.length} completed trials.`,
      trialCount: result.trialCount,
    };
  }

  if (
    result.activity === "motor-sequence-builder" &&
    setup.activity === "motor-sequence-builder"
  ) {
    const startedSequences = result.sequences;
    const completedSequences = startedSequences.filter(
      (sequence) => sequence.completedOffsetMs != null,
    );
    const firstAttemptSequences = completedSequences.filter((sequence) =>
      sequence.presses.every((press) => press.correct),
    );
    const completionTimes = completedSequences.flatMap((sequence) =>
      sequence.completedOffsetMs != null &&
      sequence.reproductionStartedOffsetMs != null
        ? [sequence.completedOffsetMs - sequence.reproductionStartedOffsetMs]
        : [],
    );
    const sequenceCompletionRatePercent =
      startedSequences.length > 0
        ? round((completedSequences.length / startedSequences.length) * 100)
        : 0;

    return {
      ...baseSession,
      activity: "motor-sequence-builder",
      attemptsPerMinute:
        durationMinutes > 0
          ? round(
              startedSequences.reduce(
                (sum, sequence) => sum + sequence.presses.length,
                0,
              ) / durationMinutes,
              1,
            )
          : 0,
      audioMode: result.audioMode,
      contentType: result.contentType,
      firstAttemptSequenceAccuracyPercent:
        startedSequences.length > 0
          ? round(
              (firstAttemptSequences.length / startedSequences.length) * 100,
            )
          : 0,
      longestCompletedSequence:
        completedSequences.length > 0
          ? Math.max(
              ...completedSequences.map((sequence) => sequence.keyIds.length),
            )
          : 0,
      meanCompletionTimeMs:
        completionTimes.length > 0
          ? round(
              completionTimes.reduce((sum, duration) => sum + duration, 0) /
                completionTimes.length,
            )
          : 0,
      presentationSpeedBpm: result.presentationSpeedBpm,
      sequenceCompletionRatePercent,
      sequenceCount: result.sequenceCount,
      sequenceLength: result.sequenceLength,
      summary: `${completedSequences.length} of ${startedSequences.length} started sequences completed.`,
    };
  }

  const itemsTotal =
    setup.contentMode === "letters"
      ? setup.numberOfLetters
      : setup.numberOfWords;
  const itemsCompleted = Math.min(completedUnits, itemsTotal);
  const metrics = computeLetterMetrics(
    result.stats ?? [],
    result.keyboardLayout ?? setup.keyboardLayout ?? "qwerty",
    result.audioMode,
    result.selectedWords ?? [],
  );
  const accuracyPercent =
    metrics.totalAttempts === 0
      ? 0
      : round((metrics.correctHits / metrics.totalAttempts) * 100);
  const attemptsPerMinute =
    durationMinutes > 0 ? round(metrics.totalAttempts / durationMinutes, 1) : 0;
  const beatMetrics = computeBeatMetrics(result.stats ?? [], result.actualBpm);
  const simulatorMetrics = {
    ...metrics,
    eventualAccuracyPercent: metrics.correctHits > 0 ? 100 : 0,
    itemCompletionRatePercent:
      itemsTotal > 0 ? round((itemsCompleted / itemsTotal) * 100) : 0,
  };

  if (
    result.activity === "letter-target" &&
    setup.activity === "letter-target"
  ) {
    return {
      ...baseSession,
      activity: "letter-target",
      accuracyPercent,
      attemptsPerMinute,
      audioMode: result.audioMode,
      ...simulatorMetrics,
      contentMode: result.contentMode,
      itemsCompleted,
      itemsPerSession: itemsTotal,
      itemsTotal,
      musicPlaybackRate:
        result.audioMode === "music" ? setup.musicPlaybackRate : undefined,
      onBeatAccuracyPercent: beatMetrics.onBeatAccuracyPercent,
      tempoBpm: result.audioMode === "metronome" ? setup.tempoBpm : undefined,
      timingVariabilityStdDev: beatMetrics.timingVariabilityStdDev,
      wordLength:
        result.contentMode === "words" ? result.wordLength : undefined,
    };
  }

  if (result.activity === "letter-find" && setup.activity === "letter-find") {
    return {
      ...baseSession,
      activity: "letter-find",
      accuracyPercent,
      attemptsPerMinute,
      audioMode: result.audioMode,
      ...simulatorMetrics,
      contentMode: result.contentMode,
      itemsCompleted,
      itemsPerSession: itemsTotal,
      itemsTotal,
      musicPlaybackRate:
        result.audioMode === "music" ? setup.musicPlaybackRate : undefined,
      tempoBpm: result.audioMode === "metronome" ? setup.tempoBpm : undefined,
      wordLength:
        result.contentMode === "words" ? result.wordLength : undefined,
    };
  }

  return baseSession;
}

function buildSessionFromRun({
  patientId,
  setup,
  status,
  completedUnits,
  elapsedSeconds,
  runId,
  result,
}) {
  const sessionDate = new Date().toISOString();
  const durationMinutes = Math.max(1, round(elapsedSeconds / 60, 1));

  if (result) {
    return buildSessionFromResult({
      completedUnits,
      durationMinutes,
      elapsedSeconds,
      patientId,
      result,
      runId,
      sessionDate,
      setup,
      status,
    });
  }

  const sessionId = `session-${patientId}-${setup.activity}-${Date.now()}`;
  const baseSession = {
    sessionId,
    patientId,
    activity: setup.activity,
    sessionDate,
    sessionKey: `SESSION#${sessionDate}#${sessionId}`,
    status,
    summary:
      "Simulated exercise-control session created in the Stella prototype.",
    activeEngagementTimeMinutes: durationMinutes,
    totalSessionDurationMinutes: durationMinutes,
    pauseBreakCount: 0,
    rawEventPayload: null,
    keyboardLayout: setup.keyboardLayout ?? "qwerty",
    keyboardSide:
      setup.activity === "eye-pong" && setup.mode === "left-right"
        ? "full"
        : (setup.keyboardSide ?? "full"),
    keyLabels:
      setup.activity === "letter-find"
        ? "letters"
        : (setup.keyLabels ?? "letters"),
  };

  let session;

  if (setup.activity === "letter-target" || setup.activity === "letter-find") {
    const itemsPerSession =
      setup.contentMode === "letters"
        ? setup.numberOfLetters
        : setup.numberOfWords;
    const completed = Math.min(completedUnits, itemsPerSession);
    const incorrectAttempts = status === "completed" ? 1 : 2;
    const totalAttempts = completed + incorrectAttempts;
    const accuracyPercent =
      totalAttempts === 0 ? 0 : round((completed / totalAttempts) * 100);
    const firstAttemptSuccessRatePercent = clamp(accuracyPercent - 4, 0, 100);
    const attemptsPerMinute = round(totalAttempts / durationMinutes, 1);

    if (setup.activity === "letter-target") {
      session = {
        ...baseSession,
        activity: "letter-target",
        contentMode: setup.contentMode,
        itemsPerSession,
        wordLength:
          setup.contentMode === "words" ? setup.wordLength : undefined,
        audioMode: setup.audioMode,
        tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
        musicPlaybackRate:
          setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
        itemsCompleted: completed,
        itemsTotal: itemsPerSession,
        totalAttempts,
        correctHits: completed,
        accuracyPercent,
        firstAttemptSuccessRatePercent,
        meanCorrectLatencyMs: 860,
        incorrectAttempts,
        latencyVariabilityStdDev: 108,
        onBeatAccuracyPercent:
          setup.audioMode === "silent"
            ? undefined
            : clamp(accuracyPercent - 6, 0, 100),
        timingVariabilityStdDev: setup.audioMode === "silent" ? undefined : 122,
        directionalConsistencyPercent: 88,
        attemptsPerMinute,
      };
    } else {
      session = {
        ...baseSession,
        activity: "letter-find",
        contentMode: setup.contentMode,
        itemsPerSession,
        wordLength:
          setup.contentMode === "words" ? setup.wordLength : undefined,
        itemsCompleted: completed,
        itemsTotal: itemsPerSession,
        totalAttempts,
        correctHits: completed,
        accuracyPercent,
        firstAttemptSuccessRatePercent,
        meanCorrectLatencyMs: 1010,
        incorrectAttempts,
        audioMode: setup.audioMode,
        tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
        musicPlaybackRate:
          setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
        attemptsPerMinute,
      };
    }
  } else if (setup.activity === "eye-pong") {
    session = {
      ...baseSession,
      activity: "eye-pong",
      mode: setup.mode,
      pattern: setup.mode === "left-right" ? "horizontal" : "mixed",
      targetCount: setup.targetCount ?? 20,
      targetChanges: completedUnits,
      completionRatePercent: clamp(
        (completedUnits / (setup.targetCount ?? 20)) * 100,
        0,
        100,
      ),
      audioMode: setup.audioMode,
      tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
      musicPlaybackRate:
        setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
    };
  } else if (setup.activity === "inhibition-challenge") {
    const completionRate = clamp(
      completedUnits / Math.max(setup.trialCount, 1),
      0,
      1,
    );
    const goAccuracyPercent = round(76 + completionRate * 16);
    const noGoAccuracyPercent = round(74 + completionRate * 14);

    session = {
      ...baseSession,
      activity: "inhibition-challenge",
      trialCount: setup.trialCount,
      rulePreset: setup.rulePreset,
      responseWindowMs: setup.responseWindowMs,
      cueSpeedBpm: setup.cueSpeedBpm,
      goAccuracyPercent,
      noGoAccuracyPercent,
      missedGoRatePercent: clamp(100 - goAccuracyPercent, 0, 100),
      meanGoLatencyMs: round(setup.responseWindowMs * 0.58),
      attemptsPerMinute: round(completedUnits / durationMinutes, 1),
    };
  } else {
    const completedSequences = Math.min(completedUnits, setup.sequenceCount);
    const completionRatePercent = round(
      (completedSequences / Math.max(setup.sequenceCount, 1)) * 100,
    );

    session = {
      ...baseSession,
      activity: "motor-sequence-builder",
      contentType: setup.contentType,
      sequenceLength: setup.sequenceLength,
      sequenceCount: setup.sequenceCount,
      presentationSpeedBpm: setup.presentationSpeedBpm,
      audioMode: setup.audioMode,
      sequenceCompletionRatePercent: completionRatePercent,
      firstAttemptSequenceAccuracyPercent: clamp(
        completionRatePercent - 8,
        0,
        100,
      ),
      longestCompletedSequence:
        completedSequences === 0
          ? 0
          : status === "completed"
            ? setup.sequenceLength
            : Math.max(1, setup.sequenceLength - 1),
      meanCompletionTimeMs: round(
        (60000 / setup.presentationSpeedBpm) * setup.sequenceLength,
      ),
      attemptsPerMinute: round(
        (completedSequences * setup.sequenceLength) / durationMinutes,
        1,
      ),
    };
  }

  return session;
}

async function listPatients(clinicId) {
  const [patients, sessions] = await Promise.all([
    queryClinicPatients(clinicId),
    queryClinicSessions(clinicId),
  ]);

  return computePatientStats(patients, sessions);
}

async function getDashboardStats(clinicId) {
  const [patients, sessions] = await Promise.all([
    queryClinicPatients(clinicId),
    queryClinicSessions(clinicId),
  ]);
  const startOfCurrentMonth = startOfMonthValue(demoToday);
  const activeThreshold = new Date(
    demoToday.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).getTime();
  const activePatientIds = new Set(
    sessions
      .filter((session) => sessionDateValue(session) >= activeThreshold)
      .map((session) => session.patientId),
  );

  return {
    totalPatients: patients.length,
    totalSessions: sessions.length,
    sessionsThisMonth: sessions.filter(
      (session) => sessionDateValue(session) >= startOfCurrentMonth,
    ).length,
    activePatients: patients.filter((patient) =>
      activePatientIds.has(patient.id),
    ).length,
  };
}

async function createPatient(input, clinicId) {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const requestedPatientCode = String(input.patientCode ?? "").trim();

  if (!firstName || !lastName) {
    return response(400, {
      message: "firstName and lastName are required.",
    });
  }

  if (requestedPatientCode.length > 64) {
    return response(400, {
      message: "patientCode must be 64 characters or fewer.",
    });
  }

  const patients = await queryClinicPatients(clinicId);
  const patientCode = requestedPatientCode || getNextPatientCode(patients);
  const duplicatePatientCode = patients.some(
    (patient) =>
      String(patient.patientCode ?? "")
        .trim()
        .toLowerCase() === patientCode.toLowerCase(),
  );
  if (duplicatePatientCode) {
    return response(409, {
      message: `Patient ID ${patientCode} is already in use.`,
    });
  }
  const createdAt = new Date().toISOString();
  const patientId = `patient-${randomUUID()}`;
  const patient = {
    patientId,
    id: patientId,
    clinicId,
    clinicPatientKey: `${createdAt}#${patientId}`,
    patientCode,
    firstName,
    lastName,
    createdAt,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: patientsTableName,
      Item: marshall(patient, {
        removeUndefinedValues: true,
      }),
    }),
  );

  return response(201, {
    ...patient,
    patientId: undefined,
  });
}

async function updateSessionNotes(input, patientId, sessionId, clinicId) {
  if (!patientId || !sessionId) {
    return response(400, {
      message: "patientId and sessionId are required.",
    });
  }

  if (typeof input.sessionNotes !== "string") {
    return response(400, { message: "sessionNotes must be a string." });
  }

  const sessionNotes = input.sessionNotes.trim();
  if (sessionNotes.length > 2000) {
    return response(400, {
      message: "sessionNotes must be 2,000 characters or fewer.",
    });
  }

  if (!(await getClinicPatient(patientId, clinicId))) {
    return response(404, { message: "Patient not found." });
  }

  const sessions = await queryPatientSessions(patientId);
  const session = sessions.find(
    (item) => item.sessionId === sessionId && item.clinicId === clinicId,
  );
  if (!session) {
    return response(404, { message: "Session not found." });
  }

  const updatedSession = {
    ...session,
    sessionNotes: sessionNotes || undefined,
  };
  await dynamo.send(
    new PutItemCommand({
      TableName: sessionsTableName,
      Item: marshall(updatedSession, { removeUndefinedValues: true }),
    }),
  );

  return response(200, updatedSession);
}

async function saveSession(input, clinicId) {
  const patientId = String(input.patientId ?? "").trim();

  if (!patientId || !input.setup || !input.status) {
    return response(400, {
      message:
        "patientId, setup, status, completedUnits, and elapsedSeconds are required.",
    });
  }

  if (!activeExerciseTypes.has(input.setup.activity)) {
    return response(400, { message: "Unsupported exercise activity." });
  }

  const patient = await getClinicPatient(patientId, clinicId);

  if (!patient) {
    return response(404, { message: "Patient not found." });
  }

  const session = buildSessionFromRun(input);

  await dynamo.send(
    new PutItemCommand({
      TableName: sessionsTableName,
      Item: marshall(
        {
          ...session,
          clinicId,
          patientId,
        },
        { removeUndefinedValues: true },
      ),
    }),
  );

  return response(201, session);
}

async function handler(event) {
  const routeKey = event.routeKey;
  const writeRoute =
    routeKey === "POST /patients" ||
    routeKey === "POST /sessions" ||
    routeKey === "PATCH /patients/{patientId}/sessions/{sessionId}";
  const { membership } = await resolveClinicAccess({
    clinicsTableName,
    dynamo,
    event,
    membershipsTableName,
    allowedRoles: writeRoute ? ["clinic-admin", "clinician"] : undefined,
  });
  const clinicId = membership.clinicId;

  if (routeKey === "GET /dashboard") {
    return response(200, await getDashboardStats(clinicId));
  }

  if (routeKey === "GET /patients") {
    return response(200, await listPatients(clinicId));
  }

  if (routeKey === "POST /patients") {
    return createPatient(parseBody(event), clinicId);
  }

  if (routeKey === "GET /patients/{patientId}") {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();
    const patient = patientId
      ? await getClinicPatient(patientId, clinicId)
      : undefined;

    if (!patient) {
      return response(404, { message: "Patient not found." });
    }

    return response(200, patient);
  }

  if (routeKey === "GET /patients/{patientId}/sessions") {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();

    if (!patientId) {
      return response(400, { message: "patientId is required." });
    }

    if (!(await getClinicPatient(patientId, clinicId))) {
      return response(404, { message: "Patient not found." });
    }

    return response(200, await queryPatientSessions(patientId));
  }

  if (
    routeKey === "GET /patients/{patientId}/exercises/{exerciseType}/sessions"
  ) {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();
    const exerciseType = String(
      event.pathParameters?.exerciseType ?? "",
    ).trim();

    if (!patientId || !exerciseType) {
      return response(400, {
        message: "patientId and exerciseType are required.",
      });
    }

    if (!(await getClinicPatient(patientId, clinicId))) {
      return response(404, { message: "Patient not found." });
    }

    const sessions = await queryPatientSessions(patientId);
    const filteredSessions = sessions
      .filter((session) => session.activity === exerciseType)
      .toSorted(
        (left, right) => sessionDateValue(left) - sessionDateValue(right),
      );

    return response(200, filteredSessions);
  }

  if (routeKey === "PATCH /patients/{patientId}/sessions/{sessionId}") {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();
    const sessionId = String(event.pathParameters?.sessionId ?? "").trim();
    return updateSessionNotes(parseBody(event), patientId, sessionId, clinicId);
  }

  if (routeKey === "POST /sessions") {
    return saveSession(parseBody(event), clinicId);
  }

  return response(405, { message: "Method not allowed." });
}

exports.handler = async (event) => {
  try {
    return await handler(event);
  } catch (error) {
    console.error("App handler failed", error);
    return errorResponse(error, "Unexpected Stella data service error.");
  }
};
