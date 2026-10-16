"use strict";

const { randomUUID } = require("crypto");
const {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} = require("@aws-sdk/client-cognito-identity-provider");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const {
  errorResponse,
  getActor,
  listActiveMemberships,
  requirePlatformAdmin,
} = require("./clinic-auth");

const cognito = new CognitoIdentityProviderClient({});
const dynamo = new DynamoDBClient({});

const clinicsTableName = process.env.CLINICS_TABLE_NAME;
const membershipsTableName = process.env.MEMBERSHIPS_TABLE_NAME;
const membershipsByClinicIndex = process.env.MEMBERSHIPS_BY_CLINIC_INDEX;
const userPoolId = process.env.USER_POOL_ID;
const appAccessGroupName = process.env.APP_ACCESS_GROUP_NAME;
const validMemberStatuses = new Set(["active", "inactive"]);

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body ?? "{}");
  } catch {
    const error = new Error("Invalid request body.");
    error.statusCode = 400;
    throw error;
  }
}

async function getClinic(clinicId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: clinicsTableName,
      Key: marshall({ clinicId }),
    }),
  );

  return result.Item ? unmarshall(result.Item) : undefined;
}

async function scanClinics() {
  const clinics = [];
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: clinicsTableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    clinics.push(...(result.Items ?? []).map((item) => unmarshall(item)));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return clinics;
}

async function getMe(event) {
  const actor = getActor(event);
  const platformAdmin = actor.groups.includes("stella-platform-admins");

  if (platformAdmin) {
    const clinics = await scanClinics();
    return response(200, {
      memberships: clinics
        .filter((clinic) => clinic.status === "active")
        .map((clinic) => ({
          clinicId: clinic.clinicId,
          clinicName: clinic.name,
          clinicStatus: clinic.status,
          userSub: actor.userSub,
          email: actor.email,
          role: "clinic-admin",
          status: "active",
          createdAt: clinic.createdAt,
          createdBy: clinic.createdBy,
        }))
        .toSorted((left, right) =>
          left.clinicName.localeCompare(right.clinicName),
        ),
      platformAdmin,
      user: {
        displayName: actor.displayName,
        email: actor.email,
        sub: actor.userSub,
      },
    });
  }

  const memberships = await listActiveMemberships({
    dynamo,
    membershipsTableName,
    userSub: actor.userSub,
  });
  const hydratedMemberships = await Promise.all(
    memberships.map(async (membership) => {
      const clinic = await getClinic(membership.clinicId);
      return {
        ...membership,
        clinicName: clinic?.name ?? "Unknown clinic",
        clinicStatus: clinic?.status ?? "inactive",
      };
    }),
  );

  return response(200, {
    memberships: hydratedMemberships.filter(
      (membership) => membership.clinicStatus === "active",
    ),
    platformAdmin,
    user: {
      displayName: actor.displayName,
      email: actor.email,
      sub: actor.userSub,
    },
  });
}

async function listClinics(event) {
  requirePlatformAdmin(event);
  const clinics = (await scanClinics()).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );

  return response(200, clinics);
}

async function createClinic(event) {
  const actor = requirePlatformAdmin(event);
  const input = parseBody(event);
  const name = String(input.name ?? "").trim();

  if (!name) return response(400, { message: "Clinic name is required." });
  if (name.length > 120) {
    return response(400, {
      message: "Clinic name must be 120 characters or fewer.",
    });
  }

  const clinic = {
    clinicId: `clinic-${randomUUID()}`,
    name,
    status: "active",
    createdAt: new Date().toISOString(),
    createdBy: actor.userSub,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: clinicsTableName,
      Item: marshall(clinic),
      ConditionExpression: "attribute_not_exists(clinicId)",
    }),
  );

  return response(201, clinic);
}

async function resolveOrCreateUser(email) {
  try {
    return await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
  } catch (error) {
    if (error?.name !== "UserNotFoundException") throw error;

    return cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );
  }
}

function userAttribute(user, name) {
  const attributes = user.UserAttributes ?? user.User?.Attributes ?? [];
  return attributes.find((attribute) => attribute.Name === name)?.Value;
}

async function addMember(event, clinicId) {
  const actor = requirePlatformAdmin(event);
  const clinic = await getClinic(clinicId);

  if (!clinic || clinic.status !== "active") {
    return response(404, { message: "Clinic not found." });
  }

  const input = parseBody(event);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return response(400, { message: "A valid email is required." });
  }

  const user = await resolveOrCreateUser(email);
  const userSub = userAttribute(user, "sub");
  const username = user.Username ?? user.User?.Username ?? email;

  if (!userSub) {
    throw new Error("Cognito did not return a stable user identifier.");
  }

  await cognito.send(
    new AdminAddUserToGroupCommand({
      GroupName: appAccessGroupName,
      Username: username,
      UserPoolId: userPoolId,
    }),
  );

  const membership = {
    clinicId,
    userSub,
    email: userAttribute(user, "email") ?? email,
    role: "clinician",
    status: "active",
    clinicName: clinic.name,
    clinicStatus: clinic.status,
    createdAt: new Date().toISOString(),
    createdBy: actor.userSub,
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: membershipsTableName,
      Item: marshall(membership),
    }),
  );

  return response(201, membership);
}

async function updateMember(event, clinicId, userSub) {
  const actor = requirePlatformAdmin(event);
  const input = parseBody(event);
  const status = String(input.status ?? "").trim();

  if (!validMemberStatuses.has(status)) {
    return response(400, {
      message: "Member status must be active or inactive.",
    });
  }

  try {
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: membershipsTableName,
        Key: marshall({ clinicId, userSub }),
        ConditionExpression:
          "attribute_exists(userSub) AND attribute_exists(clinicId)",
        UpdateExpression:
          "SET #status = :status, #role = :role, updatedAt = :updatedAt, updatedBy = :updatedBy",
        ExpressionAttributeNames: {
          "#role": "role",
          "#status": "status",
        },
        ExpressionAttributeValues: marshall({
          ":role": "clinician",
          ":status": status,
          ":updatedAt": new Date().toISOString(),
          ":updatedBy": actor.userSub,
        }),
        ReturnValues: "ALL_NEW",
      }),
    );

    return response(200, unmarshall(result.Attributes));
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      return response(404, { message: "Clinic member not found." });
    }

    throw error;
  }
}

async function listMembers(event, clinicId) {
  requirePlatformAdmin(event);
  const result = await dynamo.send(
    new QueryCommand({
      TableName: membershipsTableName,
      IndexName: membershipsByClinicIndex,
      KeyConditionExpression: "clinicId = :clinicId",
      ExpressionAttributeValues: { ":clinicId": { S: clinicId } },
    }),
  );

  return response(
    200,
    (result.Items ?? [])
      .map((item) => unmarshall(item))
      .toSorted((left, right) =>
        String(left.email).localeCompare(String(right.email)),
      ),
  );
}

exports.handler = async (event) => {
  try {
    const routeKey = event.routeKey;
    const clinicId = String(event.pathParameters?.clinicId ?? "").trim();
    const userSub = String(event.pathParameters?.userSub ?? "").trim();

    if (routeKey === "GET /me") return getMe(event);
    if (routeKey === "GET /admin/clinics") return listClinics(event);
    if (routeKey === "POST /admin/clinics") return createClinic(event);
    if (routeKey === "GET /admin/clinics/{clinicId}/members") {
      return listMembers(event, clinicId);
    }
    if (routeKey === "POST /admin/clinics/{clinicId}/members") {
      return addMember(event, clinicId);
    }
    if (routeKey === "PATCH /admin/clinics/{clinicId}/members/{userSub}") {
      return updateMember(event, clinicId, userSub);
    }

    return response(405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Clinic handler failed", error);
    return errorResponse(error, "Unexpected clinic administration error.");
  }
};
