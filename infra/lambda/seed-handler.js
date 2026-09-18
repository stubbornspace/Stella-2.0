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

exports.handler = async (event) => {
  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: "StellaSeedData",
    };
  }

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
    await putIfMissing(
      sessionsTableName,
      {
        ...session,
        patientId: session.patientId,
        sessionKey: `SESSION#${session.sessionDate}#${session.sessionId}`,
      },
      "attribute_not_exists(patientId) AND attribute_not_exists(sessionKey)"
    );
  }

  return {
    PhysicalResourceId: "StellaSeedData",
  };
};
