# Clinic tenancy

Stella uses clinics as its tenant boundary. A Cognito user can belong to more
than one clinic, with one role per clinic:

- `clinic-admin` and `clinician` can read and write clinic data;
- `viewer` can read clinic data;
- members of the `stella-platform-admins` Cognito group can access every active
  clinic, create clinics, and manage clinic memberships without separate
  per-clinic membership records.

The backend, rather than only the browser, verifies the selected clinic for
every patient, session, analysis, and feedback request. The browser sends the
selection in `X-Stella-Clinic-Id`.

## Infrastructure

The CDK stack creates:

- a Clinics DynamoDB table;
- a Memberships DynamoDB table keyed by Cognito `sub` and clinic ID;
- clinic indexes on the existing Patients and Sessions tables;
- the `stella-platform-admins` Cognito group;
- `/me` and `/admin/clinics` API routes;
- a clinic administration Lambda with narrowly scoped DynamoDB and Cognito
  permissions.

Clinic and membership tables use on-demand billing, point-in-time recovery,
and a retain removal policy. Existing patient and session primary keys remain
unchanged, avoiding table replacement. The seed custom resource creates the
Stella Demo Clinic and adds its clinic ID to seeded patients and sessions.

## Deploy and bootstrap

Deploy the stack from `infra/`:

```sh
npm run build
npm run cdk -- deploy
```

The first administrator must already exist in the Cognito user pool. Add that
account to both groups using the `UserPoolId` stack output:

```sh
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <administrator-email-or-username> \
  --group-name stella-poc-users

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <administrator-email-or-username> \
  --group-name stella-platform-admins
```

After signing in, the administrator can open **Manage clinics**, create a
clinic, and add users by email. Adding a member creates a Cognito user when
needed, sends the Cognito invitation, adds the user to `stella-poc-users`, and
stores the clinic membership using the user's immutable Cognito `sub`.

Platform administrators automatically receive access to every active clinic,
including **Stella Demo Clinic**. They do not need clinic membership records.

## Current boundary

Isolation is at the clinic level. Stella does not yet restrict individual
clinicians to assigned patients within the same clinic. Before production use,
decide whether clinic-wide access matches the clinical workflow, then add audit
events, periodic membership reviews, deprovisioning, and deployed cross-clinic
authorization tests.
