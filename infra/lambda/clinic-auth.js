"use strict";

const { GetItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const platformAdminGroup = "stella-platform-admins";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims ?? {};
}

function parseGroups(rawGroups) {
  if (Array.isArray(rawGroups)) return rawGroups;
  if (typeof rawGroups !== "string" || rawGroups.length === 0) return [];

  if (rawGroups.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawGroups);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // API Gateway can serialize array claims as an unquoted bracketed list.
    }
  }

  return rawGroups
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((group) => group.replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

function getActor(event) {
  const claims = getClaims(event);
  const userSub = String(claims.sub ?? "").trim();

  if (!userSub) {
    throw httpError(401, "Authenticated user identity is missing.");
  }

  return {
    displayName: claims.name || claims.email || userSub,
    email: claims.email,
    groups: parseGroups(claims["cognito:groups"]),
    userSub,
  };
}

function requirePlatformAdmin(event) {
  const actor = getActor(event);

  if (!actor.groups.includes(platformAdminGroup)) {
    throw httpError(403, "Platform administrator access is required.");
  }

  return actor;
}

async function listActiveMemberships({ dynamo, membershipsTableName, userSub }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: membershipsTableName,
      KeyConditionExpression: "userSub = :userSub",
      ExpressionAttributeValues: {
        ":userSub": { S: userSub },
      },
    })
  );

  return (result.Items ?? [])
    .map((item) => unmarshall(item))
    .filter((membership) => membership.status === "active");
}

async function resolveClinicAccess({
  clinicsTableName,
  dynamo,
  event,
  membershipsTableName,
  allowedRoles,
}) {
  const actor = getActor(event);
  const requestedClinicId = String(
    event.headers?.["x-stella-clinic-id"] ??
      event.headers?.["X-Stella-Clinic-Id"] ??
      ""
  ).trim();

  if (actor.groups.includes(platformAdminGroup)) {
    if (!requestedClinicId) {
      throw httpError(409, "Select a clinic before continuing.");
    }

    const result = await dynamo.send(
      new GetItemCommand({
        TableName: clinicsTableName,
        Key: marshall({ clinicId: requestedClinicId }),
      })
    );
    const clinic = result.Item ? unmarshall(result.Item) : undefined;

    if (!clinic || clinic.status !== "active") {
      throw httpError(404, "Clinic not found.");
    }

    return {
      actor,
      membership: {
        clinicId: requestedClinicId,
        role: "clinic-admin",
        status: "active",
      },
    };
  }

  const memberships = await listActiveMemberships({
    dynamo,
    membershipsTableName,
    userSub: actor.userSub,
  });
  const membership = requestedClinicId
    ? memberships.find((item) => item.clinicId === requestedClinicId)
    : memberships.length === 1
      ? memberships[0]
      : undefined;

  if (!membership) {
    if (memberships.length > 1 && !requestedClinicId) {
      throw httpError(409, "Select a clinic before continuing.");
    }

    throw httpError(403, "This account is not assigned to the requested clinic.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw httpError(403, "Your clinic role does not allow this action.");
  }

  return { actor, membership };
}

function errorResponse(error, fallbackMessage) {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : 500;

  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message:
        statusCode < 500 && error instanceof Error
          ? error.message
          : fallbackMessage,
    }),
  };
}

module.exports = {
  errorResponse,
  getActor,
  httpError,
  listActiveMemberships,
  platformAdminGroup,
  requirePlatformAdmin,
  resolveClinicAccess,
};
