"use strict";

const {
  PutItemCommand,
  UpdateItemCommand,
  DynamoDBClient,
} = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

const { seedPatients, seedSessions } = require("./seed-data");

const dynamo = new DynamoDBClient({});

const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const sessionsTableName = process.env.SESSIONS_TABLE_NAME;
const clinicsTableName = process.env.CLINICS_TABLE_NAME;
const demoClinicId = "clinic-stella-demo";

async function putIfMissing(tableName, item, keyCondition) {
  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item, {
          removeUndefinedValues: true,
        }),
        ConditionExpression: keyCondition,
      })
    );
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      return;
    }

    throw error;
  }
}

async function putSeedSession(item) {
  await dynamo.send(
    new PutItemCommand({
      TableName: sessionsTableName,
      Item: marshall(item, {
        removeUndefinedValues: true,
      }),
    })
  );
}

exports.handler = async (event) => {
  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: "StellaSeedData",
    };
  }

  const overwriteEyePongSeedSessions =
    event.ResourceProperties?.overwriteEyePongSeedSessions === "true" ||
    event.ResourceProperties?.overwriteEyePongSeedSessions === true;

  await putIfMissing(
    clinicsTableName,
    {
      clinicId: demoClinicId,
      name: "Stella Demo Clinic",
      status: "active",
      createdAt: "2026-09-15T12:00:00.000Z",
      createdBy: "system-seed",
    },
    "attribute_not_exists(clinicId)"
  );

  for (const patient of seedPatients) {
    await putIfMissing(
      patientsTableName,
      {
        patientId: patient.id,
        ...patient,
      },
      "attribute_not_exists(patientId)"
    );
    await dynamo.send(
      new UpdateItemCommand({
        TableName: patientsTableName,
        Key: marshall({ patientId: patient.id }),
        UpdateExpression:
          "SET clinicId = if_not_exists(clinicId, :clinicId), clinicPatientKey = if_not_exists(clinicPatientKey, :clinicPatientKey)",
        ExpressionAttributeValues: marshall({
          ":clinicId": demoClinicId,
          ":clinicPatientKey": `${patient.createdAt}#${patient.id}`,
        }),
      })
    );
  }

  for (const session of seedSessions) {
    const item = {
      ...session,
      patientId: session.patientId,
      sessionKey: `SESSION#${session.sessionDate}#${session.sessionId}`,
    };

    if (overwriteEyePongSeedSessions && session.activity === "eye-pong") {
      await putSeedSession({ ...item, clinicId: demoClinicId });
    } else {
      await putIfMissing(
        sessionsTableName,
        item,
        "attribute_not_exists(patientId) AND attribute_not_exists(sessionKey)"
      );
    }
    await dynamo.send(
      new UpdateItemCommand({
        TableName: sessionsTableName,
        Key: marshall({
          patientId: item.patientId,
          sessionKey: item.sessionKey,
        }),
        UpdateExpression: "SET clinicId = if_not_exists(clinicId, :clinicId)",
        ExpressionAttributeValues: marshall({ ":clinicId": demoClinicId }),
      })
    );
  }

  return {
    PhysicalResourceId: "StellaSeedData",
  };
};
