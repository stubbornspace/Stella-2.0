"use strict";

const { PutItemCommand, DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

const { seedPatients, seedSessions } = require("./seed-data");

const dynamo = new DynamoDBClient({});

const patientsTableName = process.env.PATIENTS_TABLE_NAME;
const sessionsTableName = process.env.SESSIONS_TABLE_NAME;

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

  for (const patient of seedPatients) {
    await putIfMissing(
      patientsTableName,
      {
        patientId: patient.id,
        ...patient,
      },
      "attribute_not_exists(patientId)"
    );
  }

  for (const session of seedSessions) {
    const item = {
      ...session,
      patientId: session.patientId,
      sessionKey: `SESSION#${session.sessionDate}#${session.sessionId}`,
    };

    if (overwriteEyePongSeedSessions && session.activity === "eye-pong") {
      await putSeedSession(item);
    } else {
      await putIfMissing(
        sessionsTableName,
        item,
        "attribute_not_exists(patientId) AND attribute_not_exists(sessionKey)"
      );
    }
  }

  return {
    PhysicalResourceId: "StellaSeedData",
  };
};
