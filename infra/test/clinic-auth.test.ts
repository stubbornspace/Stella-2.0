const {
  getActor,
  requirePlatformAdmin,
  resolveClinicAccess,
} = require("../lambda/clinic-auth")

function eventFor(options?: {
  clinicId?: string
  groups?: string
  sub?: string
}) {
  return {
    headers: options?.clinicId
      ? { "x-stella-clinic-id": options.clinicId }
      : {},
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "cognito:groups": options?.groups,
            email: "clinician@example.com",
            sub: options?.sub ?? "user-123",
          },
        },
      },
    },
  }
}

function dynamoWithMemberships(
  memberships: Array<{
    clinicId: string
    role: string
    status: string
    userSub: string
  }>
) {
  return {
    send: jest.fn().mockResolvedValue({
      Items: memberships.map((membership) => ({
        clinicId: { S: membership.clinicId },
        role: { S: membership.role },
        status: { S: membership.status },
        userSub: { S: membership.userSub },
      })),
    }),
  }
}

function dynamoWithClinic(clinic: {
  clinicId: string
  name: string
  status: string
}) {
  return {
    send: jest.fn().mockResolvedValue({
      Item: {
        clinicId: { S: clinic.clinicId },
        name: { S: clinic.name },
        status: { S: clinic.status },
      },
    }),
  }
}

test("uses the Cognito sub as the authenticated user identity", () => {
  expect(getActor(eventFor()).userSub).toBe("user-123")
})

test("recognizes API Gateway bracketed Cognito group claims", () => {
  expect(
    getActor(
      eventFor({
        groups: "[stella-poc-users stella-platform-admins]",
      })
    ).groups
  ).toEqual(["stella-poc-users", "stella-platform-admins"])
})

test("rejects a clinic that is not in the user's active memberships", async () => {
  const dynamo = dynamoWithMemberships([
    {
      clinicId: "clinic-a",
      role: "clinician",
      status: "active",
      userSub: "user-123",
    },
  ])

  await expect(
    resolveClinicAccess({
      dynamo,
      event: eventFor({ clinicId: "clinic-b" }),
      membershipsTableName: "memberships",
    })
  ).rejects.toMatchObject({ statusCode: 403 })
})

test("rejects write access for a viewer", async () => {
  const dynamo = dynamoWithMemberships([
    {
      clinicId: "clinic-a",
      role: "viewer",
      status: "active",
      userSub: "user-123",
    },
  ])

  await expect(
    resolveClinicAccess({
      allowedRoles: ["clinic-admin", "clinician"],
      dynamo,
      event: eventFor({ clinicId: "clinic-a" }),
      membershipsTableName: "memberships",
    })
  ).rejects.toMatchObject({ statusCode: 403 })
})

test("accepts the selected active clinic and role", async () => {
  const dynamo = dynamoWithMemberships([
    {
      clinicId: "clinic-a",
      role: "clinician",
      status: "active",
      userSub: "user-123",
    },
  ])

  await expect(
    resolveClinicAccess({
      allowedRoles: ["clinic-admin", "clinician"],
      dynamo,
      event: eventFor({ clinicId: "clinic-a" }),
      membershipsTableName: "memberships",
    })
  ).resolves.toMatchObject({
    membership: { clinicId: "clinic-a", role: "clinician" },
  })
})

test("allows a platform admin to access any active clinic", async () => {
  const dynamo = dynamoWithClinic({
    clinicId: "clinic-b",
    name: "Clinic B",
    status: "active",
  })

  await expect(
    resolveClinicAccess({
      allowedRoles: ["clinic-admin", "clinician"],
      clinicsTableName: "clinics",
      dynamo,
      event: eventFor({
        clinicId: "clinic-b",
        groups: "stella-poc-users,stella-platform-admins",
      }),
      membershipsTableName: "memberships",
    })
  ).resolves.toMatchObject({
    membership: { clinicId: "clinic-b", role: "clinic-admin" },
  })
})

test("rejects a platform admin request for an inactive clinic", async () => {
  const dynamo = dynamoWithClinic({
    clinicId: "clinic-b",
    name: "Clinic B",
    status: "inactive",
  })

  await expect(
    resolveClinicAccess({
      clinicsTableName: "clinics",
      dynamo,
      event: eventFor({
        clinicId: "clinic-b",
        groups: "stella-poc-users,stella-platform-admins",
      }),
      membershipsTableName: "memberships",
    })
  ).rejects.toMatchObject({ statusCode: 404 })
})

test("requires the platform admin Cognito group", () => {
  expect(() => requirePlatformAdmin(eventFor())).toThrow(
    "Platform administrator access is required."
  )
  expect(
    requirePlatformAdmin(
      eventFor({ groups: "stella-poc-users,stella-platform-admins" })
    ).userSub
  ).toBe("user-123")
})
