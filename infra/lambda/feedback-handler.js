"use strict";

const {
  GetItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const {
  errorResponse,
  getActor,
  httpError,
  resolveClinicAccess,
} = require("./clinic-auth");

const dynamo = new DynamoDBClient({});

const tableName = process.env.TABLE_NAME;
const membershipsTableName = process.env.MEMBERSHIPS_TABLE_NAME;
const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const clinicsTableName = process.env.CLINICS_TABLE_NAME;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function getStringValue(attribute) {
  return attribute && "S" in attribute ? attribute.S : undefined;
}

function parseBody(event) {
  try {
    return JSON.parse(event.body ?? "{}");
  } catch {
    throw httpError(400, "Invalid request body.");
  }
}

function decodeNote(item) {
  return {
    authorDisplayName: getStringValue(item.authorDisplayName),
    authorEmail: getStringValue(item.authorEmail),
    authorSub: getStringValue(item.authorSub),
    comment: getStringValue(item.comment),
    createdAt: getStringValue(item.createdAt),
    exerciseType: getStringValue(item.exerciseType),
    noteId: getStringValue(item.noteId),
    pageKey: getStringValue(item.pageKey),
    patientId: getStringValue(item.patientId),
    routePath: getStringValue(item.routePath),
    tab: getStringValue(item.tab),
  };
}

async function listNotes(event, clinicId) {
  const pageKey = event.queryStringParameters?.pageKey;

  if (!pageKey) {
    return response(400, { message: "pageKey is required." });
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: `CLINIC#${clinicId}#PAGE#${pageKey}` },
      },
      Limit: 50,
      ScanIndexForward: false,
    })
  );

  return response(200, {
    notes: (result.Items ?? []).map(decodeNote),
  });
}

async function createNote(event, clinicId) {
  const actor = getActor(event);
  const body = parseBody(event);
  const comment = String(body.comment ?? "").trim();
  const pageKey = String(body.pageKey ?? "").trim();
  const pageLabel = String(body.pageLabel ?? "").trim();
  const routePath = String(body.routePath ?? "").trim();
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const exerciseType =
    typeof body.exerciseType === "string" ? body.exerciseType.trim() : "";
  const tab = typeof body.tab === "string" ? body.tab.trim() : "";

  if (!pageKey || !routePath || !comment) {
    return response(400, {
      message: "pageKey, routePath, and comment are required.",
    });
  }

  if (comment.length > 2000) {
    return response(400, {
      message: "Comment must be 2000 characters or fewer.",
    });
  }

  if (patientId) {
    const patientResult = await dynamo.send(
      new GetItemCommand({
        TableName: patientsTableName,
        Key: marshall({ patientId }),
      })
    );
    const patient = patientResult.Item
      ? unmarshall(patientResult.Item)
      : undefined;
    if (!patient || patient.clinicId !== clinicId) {
      return response(404, { message: "Patient not found." });
    }
  }

  const createdAt = new Date().toISOString();
  const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const item = {
    pk: { S: `CLINIC#${clinicId}#PAGE#${pageKey}` },
    sk: { S: `NOTE#${createdAt}#${noteId}` },
    authorDisplayName: {
      S: actor.displayName,
    },
    authorEmail: actor.email ? { S: actor.email } : undefined,
    authorSub: { S: actor.userSub },
    clinicId: { S: clinicId },
    comment: { S: comment },
    createdAt: { S: createdAt },
    exerciseType: exerciseType ? { S: exerciseType } : undefined,
    noteId: { S: noteId },
    pageKey: { S: pageKey },
    pageLabel: pageLabel ? { S: pageLabel } : undefined,
    patientId: patientId ? { S: patientId } : undefined,
    routePath: { S: routePath },
    tab: tab ? { S: tab } : undefined,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: Object.fromEntries(
        Object.entries(item).filter(([, value]) => Boolean(value))
      ),
    })
  );

  return response(201, decodeNote(item));
}

exports.handler = async (event) => {
  try {
    const isWrite = event.requestContext?.http?.method === "POST";
    const { membership } = await resolveClinicAccess({
      clinicsTableName,
      dynamo,
      event,
      membershipsTableName,
      allowedRoles: isWrite ? ["clinic-admin", "clinician"] : undefined,
    });

    if (event.requestContext?.http?.method === "GET") {
      return await listNotes(event, membership.clinicId);
    }

    if (event.requestContext?.http?.method === "POST") {
      return await createNote(event, membership.clinicId);
    }

    return response(405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Feedback handler failed", error);
    return errorResponse(error, "Unexpected feedback service error.");
  }
};
