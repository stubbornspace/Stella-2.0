"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamo = new DynamoDBClient({});

const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const sessionsTableName = process.env.SESSIONS_TABLE_NAME;
const demoToday = new Date("2026-09-15T12:00:00");

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
    throw new Error("Invalid request body.");
  }
}

function scanAll(tableName) {
  return (async () => {
    const items = [];
    let exclusiveStartKey;

    do {
      const result = await dynamo.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      items.push(...(result.Items ?? []).map((item) => unmarshall(item)));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
  })();
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

async function getPatientById(patientId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: patientsTableName,
      Key: marshall({ patientId }),
    })
  );

  return result.Item ? unmarshall(result.Item) : undefined;
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
    demoToday.getTime() - 30 * 24 * 60 * 60 * 1000
  ).getTime();

  return patients.map((patient) => {
    const patientSessions = sessions.filter(
      (session) => session.patientId === patient.id
    );
    const lastSession = patientSessions.toSorted(
      (left, right) => sessionDateValue(right) - sessionDateValue(left)
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

function buildSessionFromRun({
  patientId,
  setup,
  status,
  completedUnits,
  elapsedSeconds,
}) {
  const sessionId = `session-${patientId}-${setup.activity}-${Date.now()}`;
  const sessionDate = new Date().toISOString();
  const durationMinutes = Math.max(1, round(elapsedSeconds / 60, 1));
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
        tempoBpm:
          setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
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
        timingVariabilityStdDev:
          setup.audioMode === "silent" ? undefined : 122,
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
        tempoBpm:
          setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
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
      targetChanges: completedUnits,
      completionRatePercent: clamp((completedUnits / 20) * 100, 0, 100),
      audioMode: setup.audioMode,
      tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
      musicPlaybackRate:
        setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
    };
  } else if (setup.activity === "inhibition-challenge") {
    const completionRate = clamp(
      completedUnits / Math.max(setup.trialCount, 1),
      0,
      1
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
      (completedSequences / Math.max(setup.sequenceCount, 1)) * 100
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
        100
      ),
      longestCompletedSequence:
        completedSequences === 0
          ? 0
          : status === "completed"
            ? setup.sequenceLength
            : Math.max(1, setup.sequenceLength - 1),
      meanCompletionTimeMs: round(
        (60000 / setup.presentationSpeedBpm) * setup.sequenceLength
      ),
      attemptsPerMinute: round(
        (completedSequences * setup.sequenceLength) / durationMinutes,
        1
      ),
    };
  }

  return session;
}

async function listPatients() {
  const [patients, sessions] = await Promise.all([
    scanAll(patientsTableName),
    scanAll(sessionsTableName),
  ]);

  return computePatientStats(patients, sessions);
}

async function getDashboardStats() {
  const [patients, sessions] = await Promise.all([
    scanAll(patientsTableName),
    scanAll(sessionsTableName),
  ]);
  const startOfCurrentMonth = startOfMonthValue(demoToday);
  const activeThreshold = new Date(
    demoToday.getTime() - 30 * 24 * 60 * 60 * 1000
  ).getTime();
  const activePatientIds = new Set(
    sessions
      .filter((session) => sessionDateValue(session) >= activeThreshold)
      .map((session) => session.patientId)
  );

  return {
    totalPatients: patients.length,
    totalSessions: sessions.length,
    sessionsThisMonth: sessions.filter(
      (session) => sessionDateValue(session) >= startOfCurrentMonth
    ).length,
    activePatients: patients.filter((patient) =>
      activePatientIds.has(patient.id)
    ).length,
  };
}

async function createPatient(input) {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const notes = String(input.notes ?? "").trim();

  if (!firstName || !lastName) {
    return response(400, {
      message: "firstName and lastName are required.",
    });
  }

  const patients = await scanAll(patientsTableName);
  const patientCode = getNextPatientCode(patients);
  const patient = {
    patientId: patientCode.toLowerCase(),
    id: patientCode.toLowerCase(),
    patientCode,
    firstName,
    lastName,
    notes: notes || undefined,
    createdAt: new Date().toISOString(),
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: patientsTableName,
      Item: marshall(patient, {
        removeUndefinedValues: true,
      }),
    })
  );

  return response(201, {
    ...patient,
    patientId: undefined,
  });
}

async function saveSession(input) {
  const patientId = String(input.patientId ?? "").trim();

  if (!patientId || !input.setup || !input.status) {
    return response(400, {
      message:
        "patientId, setup, status, completedUnits, and elapsedSeconds are required.",
    });
  }

  const patient = await getPatientById(patientId);

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
          patientId,
        },
        { removeUndefinedValues: true }
      ),
    })
  );

  return response(201, session);
}

async function handler(event) {
  const routeKey = event.routeKey;

  if (routeKey === "GET /dashboard") {
    return response(200, await getDashboardStats());
  }

  if (routeKey === "GET /patients") {
    return response(200, await listPatients());
  }

  if (routeKey === "POST /patients") {
    return createPatient(parseBody(event));
  }

  if (routeKey === "GET /patients/{patientId}") {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();
    const patient = patientId ? await getPatientById(patientId) : undefined;

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

    return response(200, await queryPatientSessions(patientId));
  }

  if (routeKey === "GET /patients/{patientId}/exercises/{exerciseType}/sessions") {
    const patientId = String(event.pathParameters?.patientId ?? "").trim();
    const exerciseType = String(event.pathParameters?.exerciseType ?? "").trim();

    if (!patientId || !exerciseType) {
      return response(400, {
        message: "patientId and exerciseType are required.",
      });
    }

    const sessions = await queryPatientSessions(patientId);
    const filteredSessions = sessions
      .filter((session) => session.activity === exerciseType)
      .toSorted((left, right) => sessionDateValue(left) - sessionDateValue(right));

    return response(200, filteredSessions);
  }

  if (routeKey === "POST /sessions") {
    return saveSession(parseBody(event));
  }

  return response(405, { message: "Method not allowed." });
}

exports.handler = async (event) => {
  try {
    return await handler(event);
  } catch (error) {
    console.error("App handler failed", error);
    return response(500, {
      message:
        error instanceof Error
          ? error.message
          : "Unexpected Stella data service error.",
    });
  }
};
