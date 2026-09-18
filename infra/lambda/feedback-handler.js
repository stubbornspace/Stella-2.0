"use strict";

const {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");

const dynamo = new DynamoDBClient({});

const tableName = process.env.TABLE_NAME;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseGroups(rawGroups) {
  if (Array.isArray(rawGroups)) {
    return rawGroups;
  }

  if (typeof rawGroups !== "string" || rawGroups.length === 0) {
    return [];
  }

  if (rawGroups.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawGroups);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return rawGroups
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
}

function getClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims ?? {};
}

function assertAuthorized(event) {
  return getClaims(event);
}

function getStringValue(attribute) {
  return attribute && "S" in attribute ? attribute.S : undefined;
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

async function listNotes(event) {
  const pageKey = event.queryStringParameters?.pageKey;

  if (!pageKey) {
    return response(400, { message: "pageKey is required." });
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: `PAGE#${pageKey}` },
      },
      Limit: 50,
      ScanIndexForward: false,
    })
  );

  return response(200, {
    notes: (result.Items ?? []).map(decodeNote),
  });
}

async function createNote(event) {
  const claims = assertAuthorized(event);
  const body = JSON.parse(event.body ?? "{}");
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

  const createdAt = new Date().toISOString();
  const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const item = {
    pk: { S: `PAGE#${pageKey}` },
    sk: { S: `NOTE#${createdAt}#${noteId}` },
    authorDisplayName: {
      S: claims.name || claims.email || claims.sub || "Clinician User",
    },
    authorEmail: claims.email ? { S: claims.email } : undefined,
    authorSub: { S: claims.sub || "unknown-user" },
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
    if (event.requestContext?.http?.method === "GET") {
      return await listNotes(event);
    }

    if (event.requestContext?.http?.method === "POST") {
      return await createNote(event);
    }

    return response(405, { message: "Method not allowed." });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      return response(error.statusCode, { message: error.message });
    }

    console.error("Feedback handler failed", error);
    return response(500, { message: "Unexpected feedback service error." });
  }
};
