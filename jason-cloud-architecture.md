# Cloud service — physician login + patient stats (design and as-built notes)

**Status (2026-10-09): built and running on AWS. Start at §0; §1–§9 are the original design and options, §10 the build plan.**

Goal: a hosted service where clinicians log in, manage their patients, have
Stella sessions sync up automatically, and review per-patient history and
trends — plus an owner/admin view across all clinics.

This is a **separate product** from the keyboard firmware and the local
clinician UI. It reuses the data contract we already have: the event log
(`SPEC.md §6.1`) and metrics (`SPEC.md §6.2`) are exactly the sync payload.

It also stores the **lesson configuration** — the exact exercise settings a
session ran with — alongside each session's results, and keeps a **library of
reusable lessons** that can be assigned to patients and repeated from any
device (§2.1). The simulator already does the local half of this: every saved
session carries its `config`, and History has **Repeat**
(`docs/patient-database-design.md`).

---

## 0. As built — read this first (updated 2026-10-09)

A working **dev stack is deployed on AWS** (region `us-east-2`, Terraform-managed, about 80 resources, roughly $22–25 a month). The simulator
signs in to it with a real Cognito account, uploads sessions, and shows cloud history, a lesson library and a lesson plan; a separate **operator
console** lets Stella staff read every clinic's data. The real keyboard does **not** talk to the cloud (by design, §3.1) and the keyboard firmware does not
yet contain the cloud-capable app (§0.10).

Sections 1–9 are the original design and option analysis, kept for the reasoning. **Where they disagree with this section, this section is right.**
Section 10 was the plan for building it locally first; it is done (status table in §10.7).

### 0.1 Architecture as deployed

```
 Clinic browser                                        Operator browser (Stella staff)
 keyboard-served app (sim/, plain HTTP on clinic LAN)  operator console (S3 + CloudFront, HTTPS, cloud/console/)
        │  HTTPS, Cognito CLINIC-pool ID token                │  HTTPS, Cognito OPERATOR-pool ID token
        └──────────────────────────┬──────────────────────────┘
                                   ▼
        API Gateway (HTTP API)   ANY /v1/{proxy+}        → JWT authorizer = clinic pool
                                 ANY /v1/admin/{proxy+}  → JWT authorizer = operator pool
                                 GET /v1/health, OPTIONS /v1/** (no authorizer; CORS preflight)
                                   │  throttled (20 req/s, burst 40), access-logged
                                   ▼
   ┌──────────── VPC, private subnets only: no internet gateway, no NAT, no load balancer ─────────────┐
   │  Lambda "api"  (python3.12, arm64)  FastAPI + Mangum  ──► RDS PostgreSQL 16 (IAM auth, TLS)       │
   │        └─ S3 gateway endpoint ──────────────────────────► S3 events bucket (SSE-KMS, versioned)   │
   │  Lambda "migrate" (same VPC): migrations, create_org, status, import_sessions                      │
   │        └─ Secrets Manager interface endpoint (optional) ► RDS-managed owner secret                 │
   └────────────────────────────────────────────────────────────────────────────────────────────────────┘
   Cognito: clinic user pool (groups clinician / org_admin, custom:org_id)  ·  operator user pool (no org, no groups)
   KMS key · CloudWatch logs + alarms · SNS alerts · AWS Budgets warning
```

**Why no NAT or internet from the Lambda.** A NAT gateway costs about $32 a month and nothing here needs one. The two things that usually need the internet
are avoided: token checking (done by API Gateway, not by the function: §0.3) and database credentials (IAM sign-in tokens are signed locally).

### 0.2 Components and where they live

| Component | Technology | Repo |
|---|---|---|
| Clinician app (also the simulator) | vanilla JS ES modules; `cloud.js` upload queue (IndexedDB), `cloud_ui.js` panels, `auth_mock.js` / `auth_cognito.js` | `sim/` |
| Cloud API | Python 3.12, FastAPI, pydantic, psycopg 3 (+ pool), PyJWT | `cloud/api/` |
| Lambda entry points | Mangum adapter; migration / provisioning function | `cloud/api/lambda_handler.py`, `cloud/lambdas/` |
| Database | PostgreSQL 16, plain numbered SQL migrations (no extensions) | `cloud/db/migrations/` (`0001_init`, `0002_rds_iam`, `0003_org_provisioning`) |
| Sign-in | Amazon Cognito, two user pools; a mock identity service for local runs | `cloud/infra/aws/auth.tf`, `operator.tf`; `cloud/mock/idp/` |
| Operator console | static site (HTML + ES modules, hand-written SVG charts), served by CloudFront | `cloud/console/` (+ shared `sim/auth_cognito.js`, `sim/auth_mock.js`, `sim/qr.js`) |
| Infrastructure | Terraform (AWS provider 5.x), state on the deploying PC for now | `cloud/infra/aws/` |
| Demo data | deterministic generator: 20 invented patients, ~210 sessions, 10 lessons | `cloud/demo/`, `cloud/scripts/load_demo.py` |
| Tests | 206 pytest checks against a real PostgreSQL; browser test pages for the simulator side | `cloud/tests/`, `sim/tests/*.html` |

### 0.3 How a request is authenticated and scoped

1. **Sign-in.** The app calls Cognito directly (`InitiateAuth`, `USER_PASSWORD_AUTH`) from the browser, then `RespondToAuthChallenge` for the first-time password
   change or an authenticator code. It uses `USER_PASSWORD_AUTH` rather than SRP because the keyboard serves the app over plain HTTP, where browsers have no
   `crypto.subtle`; the password still travels only over HTTPS, straight to Cognito. Tokens: **ID token** (1 hour) and refresh token (clinic 30 days,
   operator 12 hours). The app sends the **ID token** as `Authorization: Bearer …` because it carries the organisation and groups.
2. **API Gateway** checks the token's signature, issuer, audience and expiry (JWT authorizer) *before* any code runs. The admin paths use a different
   authorizer, bound to the operator pool.
3. **The Lambda** does no cryptography. With `AUTH_MODE=apigw` it reads the verified claims from `requestContext.authorizer.jwt.claims`, ignores the
   `Authorization` header, and **re-checks the issuer** itself (`ISSUER` for clinic routes, `OPERATOR_ISSUER` for admin routes), so a token from the wrong pool
   is refused even if the gateway were misconfigured.
4. **Claims → principal** (`api/auth.py: claims_to_principal`): `custom:org_id` and the highest of `clinician` / `org_admin` from `cognito:groups`. A `superadmin`
   group on a clinic account is **ignored**: that role reads every organisation, and clinic accounts must never get it.
5. **Database scoping.** Each request runs in one transaction that sets `app.org_id`, `app.role`, `app.user_id` with `set_config(..., true)`; PostgreSQL
   **row-level security** (forced on every table, including for the owner) does the rest. The API connects as `stella_app` (cannot bypass RLS) using an
   **IAM database token** signed locally and valid 15 minutes: there is no database password in the function, in Terraform or in a secret it reads.
6. **Operators.** `/v1/admin/*` uses `current_operator` → `Database.tx_operator`, which sets `app.role = 'superadmin'` (RLS then allows reading all
   organisations). Everything an operator opens inside a clinic is written to **that clinic's** `audit_log` (`user_id` NULL, `detail.by` = the operator's email), so the
   clinic's own admins can see it via `GET /v1/audit`. The institutions list is aggregate counts only and is not logged.

**CORS gotcha (cost us a debugging round).** A browser sends an unauthenticated `OPTIONS` preflight before any call that carries `Authorization`. The catch-all
authenticated routes also match `OPTIONS`, so without explicit `OPTIONS /v1/{proxy+}` and `OPTIONS /v1/admin/{proxy+}` routes (authorization `NONE`) the gateway answers
the preflight with 401 and every browser call fails. API Gateway answers the preflight itself from its `cors_configuration`.

### 0.4 API surface (`/v1`, JSON; errors are `{"detail": {"code", "message", …}}`)

**Clinic routes** (any signed-in clinic account; every row is scoped to its organisation):

| Method + path | Role | Purpose |
|---|---|---|
| `GET /health` (`?deep=1` also checks the database) | none | liveness; no authorizer |
| `GET /me` | any | caller, role, organisation |
| `GET /patients`, `PUT /patients/{code}` | any | list; create (idempotent). Codes only: `^[A-Z0-9][A-Z0-9-]{0,31}$`. Names are refused. |
| `POST /devices/claim`, `GET /devices` | org_admin / any | register a keyboard serial to the organisation (409 if another clinic owns it) |
| **`POST /ingest`** | any | store one finished session: `{client_record_id, patient_code, device_serial, config, config_schema, lesson?, content_pack?, summary, events[], started_at, ended_at, end_reason, firmware_version, app_version}`. 201 created, 200 duplicate (same `client_record_id`), 403 unregistered keyboard, 409 same id with different settings, 413 too many events, 422 invalid settings or patient code. |
| `GET /patients/{code}/sessions` (`config_hash`, `lesson_id`, `before`, `limit`) | any | history, compact; filter to like-for-like |
| `GET /sessions/{id}`, `/sessions/{id}/config`, `/sessions/{id}/events` | any | full summary; the exact settings (for **Repeat**); raw events (NDJSON) |
| `POST /lessons`, `GET /lessons`, `GET /lessons/{id}`, `PATCH /lessons/{id}` | any (edit: author or org_admin) | lesson library; `visibility` `org` or `private` (author only) |
| `POST /lessons/{id}/versions`, `GET /lessons/{id}/versions[/{n}]` | any / author | editing creates the next immutable version (an unchanged save creates none) |
| `PUT / DELETE /patients/{code}/lessons/{lessonId}`, `GET /patients/{code}/lessons` | any | a patient's lesson plan (`lesson_version` null = always the latest) |
| `GET /audit` | org_admin | the organisation's audit log |

**Operator routes** (operator pool only; **read-only**; an organisation is always addressed by id, because a patient code is unique only within one):

| Method + path | Purpose |
|---|---|
| `GET /admin/organizations` | every institution with counts (people, patients, keyboards, lessons, sessions, last upload); not logged |
| `GET /admin/organizations/{org}` | people, keyboards, patient codes, lessons (with version, assignment and usage counts); logged |
| `GET /admin/organizations/{org}/sessions` (`patient`, `activity`, `before`, `limit`) | sessions with settings and headline metrics; logged |
| `GET /admin/organizations/{org}/progress` (`patient`, `limit`) | flat metric rows, oldest first, for charts; with `patient`, includes per-key results; logged |
| `GET /admin/organizations/{org}/lessons/{lesson}` | all versions, assignments, usage by version; logged |
| `GET /admin/sessions/{id}`, `/admin/sessions/{id}/events` | one session in full; its raw events; logged |

Validation of `config` mirrors the engine (`sim/engine.js` `configure()`), but **rejects** out-of-range values instead of clamping, and reports every problem. Unknown settings
from a newer app are kept, reported as warnings, and are part of the hash. `config_hash` = SHA-256 of the canonical JSON of the config without `participant`.

### 0.5 Configuration (environment variables; the Lambda gets these from Terraform)

| Variable | Meaning | AWS value |
|---|---|---|
| `AUTH_MODE` | `bearer` (verify tokens here; local) or `apigw` (trust the gateway's verified claims) | `apigw` |
| `ISSUER`, `OPERATOR_ISSUER` | the clinic / operator pool issuer, re-checked in the API | set by Terraform |
| `AUDIENCE`, `AUDIENCE_CLAIM`, `JWKS_URL`, `JWKS_FILE` | token checks for `bearer` mode only | unused |
| `DATABASE_AUTH` | `password` (`DATABASE_URL`) or `iam` | `iam` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | IAM mode connection | RDS address, 5432, `stella`, `stella_app` |
| `BLOB_BACKEND`, `BLOB_BUCKET`, `BLOB_PREFIX`, `BLOB_KMS_KEY`, `BLOB_DIR` | raw event files: `local` folder or `s3` | `s3`, bucket, `events/`, KMS key |
| `CORS_ORIGINS`, `MAX_EVENTS` | allowed origins (API Gateway enforces CORS on AWS); events per session (default 20,000) | origins from a variable (default `*`) |
| `MASTER_SECRET_ARN`, `DB_SSLMODE` | the migrate function only | RDS-managed secret |

### 0.6 Data model as built (`cloud/db/migrations/`)

`organizations`, `users` (`auth_subject` unique across all organisations), `patients` (code), `devices` (`serial` unique across all organisations), `lessons`,
`lesson_versions` (immutable), `patient_lessons`, `sessions` (full `config`, `config_hash`, `summary`, `events_key` → S3, optional lesson reference and `lesson_modified`),
`audit_log` (immutable). Properties that matter:

- **Row-level security is `ENABLE`d and `FORCE`d on every table.** Each table has a scoping policy, `org_id = app_org() OR app_role() = 'superadmin'`. `organizations` is read-only for the API
  role; operators create organisations through the migrate function (migration `0003` adds the policy that function needs, because on RDS the owner is not a PostgreSQL superuser).
- **Composite foreign keys** `(org_id, id)` make a cross-organisation reference impossible even by mistake.
- **Append-only history:** `stella_app` has no `UPDATE`/`DELETE` on `sessions`; triggers forbid changing `lesson_versions` and `audit_log` even for the owner.
- **Raw events** are one NDJSON file per session in S3 (`events/<org>/<session>.jsonl`), written by the API; the row stores only the key and a count.
- The migration runner records each file's checksum and refuses a file edited after it was applied.

### 0.7 Infrastructure (`cloud/infra/aws/`)

| File | What it makes |
|---|---|
| `network.tf` | VPC with private subnets in two zones and **no internet route**; S3 gateway endpoint; optional Secrets Manager interface endpoint (about $7 a month; switch off between migrations); security groups |
| `database.tf` | KMS key; RDS PostgreSQL 16 (`db.t4g.micro`, encrypted, TLS forced, IAM auth, owner password managed and rotated by RDS, 7-day backups) |
| `storage.tf` | private events bucket: SSE-KMS, versioned, TLS-only, lifecycle rules |
| `auth.tf` | clinic user pool (admin-created accounts only, 12-character passwords, optional MFA, groups `clinician`/`org_admin`, custom attribute `org_id` writable only by administrators) and app client |
| `operator.tf` | operator user pool (14-character passwords, optional MFA, 12-hour sessions), app client, the second authorizer and the admin routes |
| `api.tf` | the two Lambda functions and their least-privilege roles, API Gateway (routes, authorizers, throttling, access logs, CORS) |
| `console.tf` | private S3 bucket + CloudFront (origin access control, response-headers policy: CSP `script-src 'self'`, HSTS, frame-deny, no-store) and the uploaded site files |
| `observability.tf` | alarms (function errors, 5xx, database CPU and free storage), SNS topic, optional monthly budget warning |

`terraform apply` is also the **deploy of the operator console** (it uploads the site files). Two variables set two-step sign-in per pool: `clinic_mfa`, `operator_mfa`
(`ON` / `OPTIONAL` / `OFF`; **OPTIONAL** today: people turn it on under Security, with a QR code). `protect_data` is `false` in dev so the stack can be destroyed;
**set it to `true` for any real patient data** (deletion protection, final snapshot, no forced bucket deletion).

### 0.8 Running and deploying

```bash
# local: PostgreSQL + mock sign-in + API, then the simulator
python -m cloud.scripts.run_local            # API :8100, mock IdP :9000      (cloud/README.md)
cd sim && python sim_server.py               # open http://localhost:8000/?cloud=local
python -m cloud.scripts.load_demo --local    # optional: fill the Demo Clinic

# tests
cd cloud && python -m pytest -q              # 206 checks, starts its own PostgreSQL

# deploy to AWS (needs the AWS CLI signed in: aws sso login)
python -m cloud.scripts.build_lambda         # build/stella-api.zip (linux arm64, reproducible)
cd cloud/infra/aws && terraform plan -var-file=envs/dev.tfvars -out=plan && terraform apply plan
python -m cloud.scripts.export_aws_config    # writes sim/cloud_aws.json  → open http://localhost:8000/?cloud=aws
```

Adding clinics, clinic users and operators is done with the AWS CLI today: **`docs/users-and-clinics.md`**. Migrations are applied by invoking the migrate function
(`{"action":"migrate"}`), never from a laptop, because the database has no public address.

### 0.9 Where the build differs from the design below

| Design (§1–§10) | As built | Why |
|---|---|---|
| The API verifies the JWT itself (`JWKS_URL`) | API Gateway's JWT authorizer verifies; the API reads the claims and re-checks the issuer | the Lambda has no internet route to fetch Cognito's keys, and a NAT costs ~$32/mo |
| Database password in Secrets Manager | IAM database authentication; only the migrate function reads the owner secret | nothing to store, rotate or leak in the API |
| `superadmin` as a role in the clinic pool | operators are a **separate user pool**; clinic accounts can never be superadmin | a clinic sign-in must never be able to read other clinics (found and closed 2026-10-09) |
| MFA required | optional per pool; self-service Security page with a QR code | clinic usability; the setting is one line per pool |
| Access token + SRP | ID token + `USER_PASSWORD_AUTH` | org/role claims are in the ID token; SRP needs `crypto.subtle`, absent on plain HTTP |
| Cloud-hosted dashboards for clinicians | clinician features (history, Repeat, lessons, lesson plan) are in the keyboard-served app (`sim/`); only the **operator console** is a cloud-hosted site; a clinician-facing cloud dashboard is not built | the app already holds the patient list and history UI; the cloud was built to back it |
| Route 53 / ACM / custom domain, SES, WAF, CloudTrail | **not built**; CloudFront default domain, Cognito's default email sender (about 50 a day) | pilot scope |
| Lesson visibility open question | both: `org` (default) and `private` (author only) | resolved while building |

### 0.10 Known gaps and open items

1. **The keyboard does not run the cloud-capable app yet.** `firmware/tools/embed_web.py` embeds `sim/` into the image, so the app *can* be served by the keyboard, but the firmware
   core lacks most of what the app uses (`docs/api-reference.md` status, `docs/porting.md`), and `/api/state` does not report the **keyboard serial and firmware version** that `POST /ingest`
   needs (`device_serial`). Add `device: {serial, firmware_version}` to `/api/state`.
2. **No self-service administration.** Clinics, users and operators are created with the AWS CLI (`docs/users-and-clinics.md`). Missing: a console screen for it, a list of clinic ids, renaming or
   deleting a clinic, and "forgot password" on the sign-in screens.
3. **Rhythm metric.** The engine measures on-beat timing from the *most recent* beat tick; the product owner's spec says *nearest* (`docs/open-questions.md` item 31).
4. **Email** (invites, resets) uses Cognito's default sender; the SES adapter in §10.3 is not built.
5. **Production hardening not done:** custom domain and TLS certificate, WAF, CloudTrail/GuardDuty, Multi-AZ database, restricting `cors_origins` to the app's real origin, an IP allow-list or WAF in front of
   the operator console, separate prod environment, remote Terraform state (state is a local file today: back it up), the AWS BAA and compliance work in §4.
6. **Session tokens last up to an hour.** Disabling a user or changing a group takes full effect when their ID token expires or they sign in again (API Gateway does not check revocation).
7. **Limits:** the progress endpoint returns at most 3,000 sessions per request (default 1,000); `POST /ingest` accepts up to 20,000 events and must stay under Lambda's ~6 MB payload.
8. **Tested vs not.** Verified: 206 backend checks (including row-level security, isolation between clinics, an owner without superuser rights as on RDS); a real Cognito sign-in with first-time password and authenticator;
   uploads and cloud history from the simulator against AWS; the operator console against AWS data; the QR code against a reference implementation (and scanned by a phone). Not verified: load or cold-start
   latency, browsers other than Chromium-based ones, a real keyboard, the dark theme and phone layout of the console.

---

## 1. Shape of the system (original design)

```
 Stella keyboard (clinic Wi-Fi)
      │  local /api + SSE  — runs the session, unchanged
      ▼
 Clinician web app / PWA
      │  after each session: HTTPS POST {summary, events, config}  (bearer token)
      │  lesson library: GET / POST lessons  (pulled to the app, pushed to the keyboard locally)
      ▼
 Cloud API  ──►  Managed Postgres      users, patients, sessions + configs, lesson library
      │      ──►  Object storage        raw event JSONL per session (immutable)
      │      ──►  Managed auth          login, MFA, roles
      │      ──►  Email                 invites, password reset
      ▼
 Web dashboards
      ├─ clinician: patient roster, session timeline, trend charts, lessons, repeat
      └─ owner/admin (you): cross-clinic usage + aggregate stats
```

The deployed version of this diagram is in §0.1.

### How sessions reach the cloud — two options

1. **Clinician app relays it (recommended).** The app already holds the finished
   session (`GET /api/export.jsonl` on the device). After a session it uploads
   `{summary, events}` with the logged-in clinician's token. No secrets on the
   keyboard; works even if the keyboard has no internet.
2. **Device posts directly.** Pico W does TLS (mbedTLS via lwIP `altcp_tls`)
   with a per-device API key. Heavier on the Pico and needs device
   provisioning / key rotation. Use only if there is no clinician app in the
   loop.

---

## 2. Data model (Postgres)

| Table | Key columns |
|---|---|
| `organizations` | id, name, plan |
| `users` | id, org_id, **auth_subject** (the sign-in provider's user id, unique), email, role (`clinician` \| `org_admin`; the schema also allows `superadmin`, but a clinic account is never given it and operators are not rows here), created_at, last_seen_at |
| `patients` | id, org_id, **code** (clinic-assigned, e.g. `PT-042`), optional display_name, created_by |
| `devices` | id, org_id, serial (unique across all clinics), firmware_version, claimed_by, claimed_at, last_seen_at |
| `sessions` | id, org_id, patient_id, clinician_id, device_id, activity, **config (jsonb)** = the exact settings it ran with, config_hash, lesson_id / lesson_version (optional), started_at, ended_at, end_reason, **summary (jsonb)** = the `SPEC §6.2` metrics — full columns in §2.1 |
| `lessons` | id, org_id, name, description, activity, current_version, created_by, archived_at — the **lesson library** (§2.1) |
| `lesson_versions` | lesson_id, version, **config (jsonb)**, content (jsonb: words / sequences), created_by, created_at — **immutable** |
| `patient_lessons` | patient_id, lesson_id, lesson_version, assigned_by, assigned_at, note, active — a patient's lesson plan |
| `session_raw` | *(as built: no separate table; `sessions.events_key` and `events_count` point at the NDJSON file in object storage)* |
| `audit_log` | id, org_id, user_id (null for operators), action, subject, detail (jsonb), at — **immutable**; includes every operator view of the clinic's data |
| `patient_metric_daily` *(optional rollup)* | patient_id, date, activity, mean_correct_latency, first_attempt_accuracy, … — for fast trend charts |

Notes:
- Keep raw events in **object storage** (cheap, immutable) and only the
  **summary** in Postgres. Matches the PDF's "capture raw events, recompute
  later" principle and keeps the DB small. Add a `session_events` child table
  later only if you need SQL over individual trials.
- **Row-level security**: every query scoped by `org_id`; clinicians see their
  organisation; Stella staff (operators) read across organisations through a separate sign-in and a read-only API (§0.3), and a clinic account can never hold that power.
- **`patients.code` is the `participant` field from the device.** Keep it a
  code, never a name/DOB/MRN — see §4.

### 2.1 Lesson configurations: stored with the results, and as reusable lessons

A **lesson configuration** is the activity plus every setting that shapes it:
the fields in `docs/api-reference.md` §1 (`activity`, `layout`, `side`,
`key_label`, `content`, `word_length`, `items`, `beat`, `tempo_bpm`,
timeouts, and the Inhibition Challenge / Motor Sequence Builder parameters),
and, for word exercises, the content in use (a word list or prescribed
sequences — the "exercise definition" of `docs/content-pack-design.md`). It is
used in three ways:

1. **Stored with every session** — what was actually run.
2. **Saved as a named lesson** in a shared library, so it can be run again.
3. **Assigned to a patient** as part of a lesson plan.

**Rules that keep this trustworthy**

- **Always snapshot.** Every session stores its full `config`, even when it
  came from a lesson. A lesson can be edited or archived later; the record of
  what happened must not change. `lesson_id` / `lesson_version` are provenance
  only.
- **Lesson versions are immutable.** Editing a lesson creates version *n*+1.
  Old sessions keep pointing at the version they used, so history stays
  reproducible.
- **`lesson_modified`** (computed): true when the clinician changed any setting
  after loading a lesson, so a "Lesson 12" session that was really different is
  not counted as the same.
- **`config_hash`** = SHA-256 of the canonical (sorted-key) JSON of `config`
  **without `participant`**. Sessions with the same hash used identical
  settings, which is what makes **trend charts compare like with like** and
  lets the dashboard mark "settings changed here".
- **No identity in the library.** `participant` is dropped from lesson rows and
  from the hash. In a session's `config`, `participant` is the patient code, as
  it is today. Word lists and settings are not patient data.
- **Versioned format.** `config_schema` (starts at 1) travels with every config,
  so old records stay readable when settings are added (as `side` was).
  Settings missing from an old config mean "default" (`side` missing = `full`).
- **Validate on the server** with the same clamps as `StellaEngine.configure()`
  (`docs/api-reference.md` §1, the paragraph after the defaults); do not trust the client.

**Columns added to `sessions`** (in addition to §2): `config` (jsonb, not null),
`config_schema` (int), `config_hash` (text), `lesson_id` and `lesson_version`
(nullable), `lesson_modified` (bool), `content_pack_id` / `content_pack_version`
(the word list in use, nullable), `firmware_version`, `app_version`,
`client_record_id` (a UUID made by the app, unique per org — the idempotency key;
the engine's own session ids restart on every page load, so they are not unique).
Suggested indexes: `(patient_id, started_at desc)`, `(patient_id, config_hash)`,
and a GIN index on `config` only if you start querying inside it.

**Flows**

1. **After a session** the app uploads `{summary, events, config, lesson ref}`.
   `config` is `summary.settings`, which the simulator's local History already
   stores as `config`. A retry with the same `client_record_id` creates no second row.
2. **Repeat from the cloud.** The patient's history lists sessions with a
   one-line settings summary (as the local History does). *Repeat* fetches
   `GET /v1/sessions/{id}/config` and loads it into the settings page
   (`StellaEngine.loadConfig`), on any device. Settings only: words are still
   chosen at random each run unless the lesson fixes them.
3. **Lesson library.** *Save as lesson* turns the current settings into a
   lesson; the org's clinicians can see and use it. Choosing a lesson loads it
   into the app and the app pushes it to the keyboard over the local network —
   the keyboard still never talks to the cloud.
4. **Lesson plan.** A clinician assigns lessons to a patient (`patient_lessons`);
   the patient's page lists them with a *Start* button and the latest result for each.
5. **Compare.** The timeline and trend charts can filter to "same lesson" or
   "same `config_hash`"; a change of settings is drawn as a marker.
6. **Offline.** The app caches the library and queues uploads; because lesson
   versions never change, there is nothing to merge. Only lesson names and
   descriptions can conflict (last write wins).

**API additions** (all under `/v1`, all scoped by `org_id`):

| Call | Purpose |
|---|---|
| `POST /ingest` | now carries `config`, `config_schema`, lesson reference, `client_record_id` |
| `GET /patients/{code}/sessions?config_hash=&lesson_id=` | history, filterable to like-for-like |
| `GET /sessions/{id}/config` | the exact settings, for Repeat |
| `GET /lessons`, `POST /lessons` | list / create |
| `POST /lessons/{id}/versions` | edit (creates the next version) |
| `GET /lessons/{id}/versions/{n}` | read one version |
| `PUT /patients/{code}/lessons/{lessonId}`, `DELETE …` | assign / unassign |

**Size and cost.** A config is about 0.5–1 KB, so storing one per session is
negligible (a thousand sessions is about 1 MB). Keep it in Postgres `jsonb`, not
object storage, so it can be queried and grouped.

**Privacy.** A config can hint at clinical context (for example, a side-limited
exercise). The de-identified approach of §4 still holds because only the patient
code is stored; if the service is treated as handling PHI, configs are covered by
the same controls as the results.

**Shared with the local app.** The lesson JSON is the same object as the
`exercise` definition in `docs/content-pack-design.md` and the `config` in the
simulator's History records (`docs/patient-database-design.md`), so the keyboard,
the app and the cloud all use one format.

**Open questions:** are lessons private to a clinician or shared across the
organisation (or both)? Does assigning a lesson need a due date or a reminder?
Should a lesson be allowed to fix the exact word order, not just the settings?

---

## 3. Auth — use a managed provider, don't build it

Handles login, password reset, MFA, sessions, SSO. Your DB stores roles keyed
to the provider's user id.

| Provider | Free tier | Then | HIPAA |
|---|---|---|---|
| **Auth0** | ≤ 7.5k MAU | ~$35+/mo | BAA on paid plans |
| **AWS Cognito** | 50k MAU (non-HIPAA) | ~$0.0055/MAU | via AWS BAA |
| **Clerk** | ≤ 10k MAU | usage-based | Enterprise |
| **Supabase Auth** | included | included | paid HIPAA add-on |

**Chosen and built: Amazon Cognito**, as two user pools (clinics, operators). Free tier figures above are the old model; Cognito now has Essentials/Plus tiers, with the first 10,000 monthly users free on Essentials.

### 3.1 How auth works end to end (and what the keyboard does *not* do)

**The keyboard never logs into the cloud.** Only the clinician logs in. The clinician's app is the courier that
carries data from the keyboard to the cloud (§1, option 1). The keyboard holds no cloud credentials and does not need
internet.

```
 Keyboard ──local Wi-Fi──► Clinician app ──HTTPS + login token──► Cloud API ──► Postgres / object storage
 (no cloud login)           (clinician signed in)                  (checks the token on every call)
```

| Link | How it is secured | How often |
|---|---|---|
| **Clinician → cloud** | Sign-in with the managed provider (Cognito on AWS): email + password, plus an authenticator-app code for anyone who has turned two-step sign-in on (**optional**, 2026-10-09: each person turns it on or off under Security in the app or console; `clinic_mfa` / `operator_mfa` in `infra/aws/variables.tf` can set it to required or off). The app receives a short-lived **ID token** (a signed JWT, about an hour; it carries the organisation and role, and API Gateway checks it before any code runs) and a longer **refresh token** (days to weeks). Every API call sends `Authorization: Bearer <ID token>`. | **Once per sign-in.** The app renews the token by itself until the refresh token expires, then asks the clinician to sign in again. |
| **Cloud API → data** | The API verifies the token's signature against the provider's public keys, reads `org_id` and the role from its claims, and scopes every query to that organisation (row-level security). A clinician can only touch their own organisation's patients, sessions and lessons. | On **every** request. |
| **Clinician app → keyboard** | **Today: none.** The portal is plain HTTP; the only barrier is the kit router's Wi-Fi password (`docs/clinic-deployment.md` §6). **Planned:** a PIN shown on the keyboard's display and typed into the app once, which gives that browser a token for local calls. | Once per app / keyboard pairing (not built yet). |
| **Keyboard → cloud** | **None.** | Never. |

**What happens at each session**

1. The keyboard runs the exercise and keeps the results locally.
2. When it ends, the app already has them (it is connected to the keyboard, and the simulator's History already stores
   `summary`, `events` and `config`).
3. The app uploads `{summary, events, config, lesson reference, keyboard serial, client_record_id}` with the access
   token. If there is no internet it **queues** the upload and retries later; the `client_record_id` makes a retry safe.
4. The API checks: the token is valid and unexpired; the patient code belongs to the caller's organisation; the keyboard
   serial is registered to that organisation; the config passes the same validation as the engine (§2.1). Then it
   stores the session. The app shows the upload as done, queued or failed.

So: **sign-in is once; uploading happens at every session, automatically.**

**What happens once per keyboard: registration.** A keyboard is registered to a clinic once. An org admin adds its serial
number (`POST /v1/devices/claim`), and the cloud records it in `devices` (serial, firmware version, last seen). The
keyboard does nothing during this step. After that, uploads from any signed-in clinician of that organisation may cite
that serial.

**Detail that affects the design: login has to be a form in the app.** The clinician app is served *from the keyboard over
plain HTTP* (`docs/api-reference.md`, "Hosting / transport"). The provider's hosted login page works by redirecting back
to the app, and Cognito requires **HTTPS** redirect addresses (except `localhost`) — to be confirmed when we build it. So
the app signs in with its own form and the provider's API (`InitiateAuth` and `RespondToAuthChallenge`, which also handle the
first-time password and the optional authenticator step) instead of the redirect flow. **As built it uses `USER_PASSWORD_AUTH`, not SRP** (§0.3). Calling an **HTTPS** cloud API from an **HTTP** page is allowed
(only the reverse is blocked). The cloud-hosted dashboard (trends, lessons, admin) is a normal HTTPS site and can use the
hosted login. Tokens are kept in the browser's storage for the app's origin, so a keyboard whose address changes means a
new sign-in; use a reserved address (`docs/clinic-deployment.md` §4).

**The trade-off.** The cloud trusts the **logged-in clinician**, not the keyboard. A signed-in clinician could upload data
that did not come from a real keyboard. For a pilot that is acceptable. If we later need proof that a record came from a
particular keyboard, each keyboard can **sign its results** with its own key (the RP2350 has the hardware for it) and the
cloud can verify the signature; that needs per-keyboard key provisioning, so it is not in the first version.

**The alternative (option 2 in §1): the keyboard posts to the cloud itself.** It needs a TLS stack on the Pico, a unique
credential for every keyboard, a way to rotate those credentials, and internet at the keyboard. Heavier and riskier, so we
do not recommend it unless there is no clinician app in the loop.

**Roles.** `clinician` (own organisation's patients and lessons) and `org_admin` (also registers keyboards, edits anyone's lessons, reads the organisation's audit log). On AWS these are
Cognito groups (`cognito:groups`) in the **clinic** pool; the organisation is the custom attribute `custom:org_id`, copied into the ID token and settable only by an administrator.
Stella staff are **operators**: accounts in a separate pool with no organisation and no groups, who read every organisation through `/v1/admin/*` only (§0.3). Adding users and
clinics: `docs/users-and-clinics.md`.

---

## 4. The compliance fork — read this before choosing anything

If the service stores **patient-identifiable, health-related data** and US
healthcare providers use it, you are likely a **HIPAA Business Associate**.
That pulls in: a **BAA** with *every* vendor that touches the data
(hosting, DB, storage, auth, email, logging, backups), encryption at rest and
in transit, access controls, audit logging, automatic logoff, backup + DR, a
breach-notification process, workforce training, a written risk assessment and
policies. Budget impact in §6.

### Shrink the scope: keep the cloud de-identified

- Store only the clinic's **patient code** (`PT-042`), never name / DOB / MRN.
- The code ↔ identity map stays with the clinic (their local app or their own
  records), **not in your cloud**.
- The stored data is exercise response times and accuracy, framed per
  `SPEC.md §6.3` / PDF §6.3 as **performance metrics, not clinical outcomes**.
- With no identifiers and no clinical claims, this is often treated as ordinary
  SaaS analytics rather than PHI.

> Confirm this with a **healthcare attorney** for your jurisdiction and customer
> base before relying on it. Also: if the product ever makes diagnostic or
> therapeutic claims it can become "Software as a Medical Device" (FDA) — out of
> scope today per the requirements doc, but a line not to cross accidentally.

---

## 5. Hosting — pick one path

| Path | You sign up for | Effort | ~$/mo start | HIPAA route |
|---|---|---|---:|---|
| **Supabase + Vercel** — Postgres, Auth, storage, row-level security, auto APIs in one; Vercel hosts the web app | 2 accounts + domain | Lowest | $25–60 | Supabase HIPAA tier (~$599/mo) + BAA |
| **PaaS** — Render / Railway / Fly.io (API + managed PG) + Vercel + Auth0 | 3–4 accounts | Low | $50–150 | Render / Fly BAAs on higher tiers |
| **AWS** — Lambda + API Gateway + RDS Postgres + S3 + Cognito (lean), or App Runner / ECS Fargate in place of Lambda | 1 AWS account | Medium | **lean $20–35**; containers $70–130; hardened $90–160 (itemised in §6) | AWS BAA (free); you configure services correctly |
| **HIPAA-in-a-box** — Aptible / Datica | 1 account | Low–medium | $500+ | included |

**Recommendation for an MVP you can demo and iterate:** *Supabase + Vercel + a
thin API*, **de-identified**. Move to AWS or Aptible only when a customer
contract forces HIPAA + SOC 2.

### 5.1 If we go the AWS route

*(The version actually built is in §0.1 and §0.7; this was the starting sketch.)*

```
 clinician app (static files)  ──►  CloudFront + S3      the web app / PWA
        │  HTTPS, Cognito token
        ▼
 API Gateway (HTTP API)  ──►  Lambda                    ingest, patients, lessons, queries
        │                          │
        │                          ├──►  RDS for PostgreSQL (private subnet)   patients, sessions + configs, lessons
        │                          └──►  S3 (private, encrypted)               raw event JSONL, exports
        ▼
 Cognito user pool   login, MFA, roles        SES   invites, password reset
 CloudWatch          logs + alarms            KMS + Secrets Manager   keys, DB credential
 Route 53 + ACM      domain + TLS certificate
```

- **No IoT Core / MQTT.** The keyboard does not talk to the cloud (§1, option 1).
  A different design that has the Pico connect to AWS IoT Core and starts
  exercises from the cloud would also need per-device certificates, a Pico TLS
  stack and IoT message charges; it also assumes a Linux device, not the Pico 2 W.
  Our design keeps that out.
- **Why Lambda for the API.** At pilot volume it costs close to nothing and
  there is no server to patch. App Runner or Fargate are fine if the team prefers
  containers, but they add a minimum monthly charge, and Fargate needs a load
  balancer.
- **Postgres, not DynamoDB.** The trend queries and the "same configuration"
  grouping (§2.1) are far simpler in SQL.
- **Infrastructure as code** (CDK or Terraform, both free) from the start.

---

## 6. Shopping list

### De-identified MVP
| Item | ~Cost |
|---|---|
| Domain name | $12/yr |
| Supabase Pro (DB + Auth + storage) | $25/mo |
| Vercel / Netlify / Cloudflare Pages (web app) | $0–20/mo |
| Transactional email (Postmark or AWS SES) | $0–15/mo |
| Error monitoring (Sentry free tier) | $0 |
| BI for your admin view (Metabase — self-host free, or cloud) | $0 / ~$85/mo |
| **Subtotal** | **~$40–150/mo** + build time |

### Add for HIPAA
| Item | ~Cost |
|---|---|
| HIPAA-tier hosting + BAAs | +$300–700/mo |
| Compliance automation (Vanta / Drata) — if customers want SOC 2 | $8–25k/yr |
| Security assessment / penetration test | $3–15k one-time |
| Healthcare attorney (BAAs, privacy policy, DPAs) | $2–8k one-time |

The recurring cloud bill at this scale is small; **developer time and (if
HIPAA) compliance are the real costs.**

### AWS route — exactly what you would buy

AWS is pay-as-you-go: there is nothing to purchase up front except a domain.
Figures are us-east-1, checked 2026-10-07 from third-party price trackers and
AWS's own Cognito page — **confirm on aws.amazon.com/pricing or the AWS Pricing
Calculator before budgeting**; they change.

**1. Accounts and agreements**

| Item | Cost |
|---|---|
| AWS account (credit card; turn on MFA for the root user; set a billing alarm) | free; new accounts get promotional credits instead of the old 12-month free tier — check current terms |
| **AWS Business Associate Addendum** (accept in AWS Artifact) — only if the service will hold PHI; then use only HIPAA-eligible services | free |
| Domain name (Route 53 registration or any registrar) | about $12–15/yr |

**2. Metered services — lean build** (Lambda API, single-AZ database, under 10,000 users)

| AWS service | What it does | Price basis | Est. / month |
|---|---|---|---:|
| **RDS for PostgreSQL**, `db.t4g.micro`, Single-AZ, 20 GB gp3 | patients, sessions + configs, lesson library | about $0.016/h (≈ $11.70) + $0.115 per GB (≈ $2.30) | **~$14** |
| **Lambda** | the API code | first 1 M requests and 400,000 GB-s free each month | $0–1 |
| **API Gateway** (HTTP API) | the public HTTPS endpoint | $1 per million requests | $0–1 |
| **Cognito** user pool, Essentials tier | clinician login, MFA, roles | 10,000 users free, then $0.015 per user | $0 |
| **S3** | raw event files, app files, backups | about $0.023 per GB | under $1 |
| **CloudFront** | HTTPS for the web app | free allowance covers a pilot | $0–1 |
| **Route 53** + **ACM** | DNS and TLS certificate | $0.50 per hosted zone; certificates free | ~$0.50 (+ domain) |
| **SES** | invite and password-reset email | $0.10 per 1,000 emails | under $1 |
| **CloudWatch** Logs and alarms | logs, error alarms | about $0.50 per GB ingested | $1–3 |
| **KMS** + **Secrets Manager** | encryption key, database credential | about $1 per key, $0.40 per secret | ~$2 |
| **Total** | | | **about $20–25; budget $25–35** |

**3. If it must be hardened (HIPAA or a real customer):** add roughly

| Addition | Why | Est. / month |
|---|---|---:|
| Multi-AZ database (doubles the database line; a `db.t4g.small` Multi-AZ is nearer $50) | failover | +$15–40 |
| **AWS WAF** on the API | blocks common attacks | +$8–10 |
| **CloudTrail** (first trail free), **GuardDuty**, AWS Backup storage | audit trail, threat detection, backups | +$5–15 |
| One VPC interface endpoint (about $7 each) *or* a NAT gateway (about **$32** + data) | only if the Lambda runs in the VPC **and** must call another AWS API | $7–35 |
| **Total** | | **about $90–160** |

**4. Optional**

| Item | Cost |
|---|---|
| Admin dashboards: Metabase on a small EC2 `t4g.micro` (about $6) — or export CSV and use a spreadsheet | $0–8 |
| A paid AWS support plan (AWS has changed these recently; check) | roughly $30–100 |
| Compliance and legal (BAAs, penetration test, attorney, Vanta/Drata): see "Add for HIPAA" above | one-time / annual |

**What you do not need to buy:** an **Application Load Balancer** (about $16+/month; only needed for the Fargate variant), a **NAT gateway** (the cost trap above — keep the Lambda out of any design that needs one), **Aurora Serverless** (its minimum is far above a micro RDS), **RDS Proxy**, a second full environment (develop locally against a Docker Postgres), or **IoT Core**.

**Container variant** (App Runner or Fargate instead of Lambda): about **$70–130/month** baseline once the load balancer and database are counted, and more if a NAT gateway sneaks in.

**Measured so far (dev stack, light use):** about **$22–25/month** (database ~$14, Secrets Manager endpoint + owner secret ~$8 while it is switched on, KMS ~$1, everything else a few dollars; about $15 with the endpoint off). `cloud/infra/aws/README.md` has the table.

**Real cost:** about **$25–35/month** for the pilot, and the developer's time to build and run it (§7).

---

## 7. Build scope (rough, one experienced full-stack dev)

| Piece | Estimate |
|---|---|
| Backend API — auth wiring, patients CRUD, session ingest, query/aggregate, CSV export | 2–4 weeks |
| Clinician web app — roster, patient timeline, trend charts (reuse the metrics we already compute) | 3–5 weeks |
| Lesson configurations (§2.1) — store config with each session, lesson library + versions, assign to patients, repeat from the cloud, filter trends by configuration | 1–2 weeks (a good part reuses the local History / Repeat code) |
| Owner/admin + BI view | ~1 week custom, or days with Metabase on a read replica |
| Device / app sync + token handling | ~1 week |
| Infra setup, CI, testing | ~1 week |
| HIPAA compliance (if in scope) | months, mostly process not code |

---

## 8. How it plugs into what's already built

- **Ingest payload = the export we already produce.** The clinician app POSTs
  the same JSON as `GET /api/export.jsonl` + the summary from
  `stella_engine_summary_json()` / `sim` `_computeSummary()`.
- **`participant` → `patients.code`.** Already a free-text field; keep it a code.
- **Lesson configuration = `summary.settings`.** Every summary already carries the
  full settings object, and the simulator's local History stores it as `config`
  (`docs/patient-database-design.md`). The ingest payload just sends it as its own
  field, plus `config_hash` and the lesson reference (§2.1). `StellaEngine.loadConfig()`
  is what *Repeat* uses, from the local History or from the cloud.
- **Trend charts = the same numbers, aggregated.** `by_key`, `by_word`, latency
  mean/median/SD across sessions instead of one — the `patient_metric_daily`
  rollup feeds them.
- **`session_raw` blob** is the JSONL, stored verbatim so metrics can be
  recomputed if definitions change.

---

## 9. Suggested first step (historical: this is how the build started)

Stand up the de-identified MVP: Supabase project (schema in §2, including the
`config` columns of §2.1, + row-level security), a `/ingest` endpoint that accepts
`{summary, events, config}` and writes Postgres + storage, and a one-page clinician
view (patient list → session list with each session's settings and a Repeat button →
one trend chart). Wire the existing `sim/` (or the firmware) to POST on session
end. That's a working end-to-end slice in ~1–2 weeks and everything else builds
on it. Build and test it locally first, in a shape that moves to AWS by changing configuration (§10).
Ping me to scaffold the schema + ingest endpoint.

---

## 10. Mocking the cloud locally, so moving to AWS is a swap

*(Done: the local mock and the AWS stack both exist and run the same code; status table in §10.7. The text below is the plan it followed.)*

**Goal.** Run the whole loop on one PC — the simulator playing the keyboard and the clinician app, a local database, a local
API and a fake sign-in service — with the **same API, the same SQL and the same token format** as production. Then moving to
AWS means changing configuration and deploying, not rewriting. (The same shape moves to Supabase just as well: it is plain
Postgres, JWTs and object storage.)

### 10.1 What runs where

| Part | Locally | On AWS |
|---|---|---|
| **Keyboard** | the simulator's engine in the browser (`sim/`) | the real Pico 2 W |
| **Clinician app** | `sim/` served by `sim_server.py` (HTTP, like the keyboard serves it) | served by the keyboard; plus a cloud-hosted dashboard on S3 + CloudFront (HTTPS) |
| **API** | a Python web app (FastAPI) run with `uvicorn` on `localhost:8100`, routes under `/v1` | **the same code** in Lambda behind API Gateway (HTTP API), through a small adapter (Mangum) |
| **Database** | a local **PostgreSQL** (a portable binary; Docker if available) with the **same SQL migration files** | **RDS for PostgreSQL**; the migrations are applied by a one-off command |
| **Sign-in** | a **mock identity provider**: signs JWTs with a local key and publishes `/.well-known/jwks.json`; test users from a seed file | **Cognito**; the API checks tokens against its published keys |
| **Raw event files** | a local folder (`cloud-data/events/`) | **S3** (private, encrypted) |
| **Email** (invites, resets) | written to a log / outbox file | **SES** |
| **Settings and secrets** | a `.env.local` file | Lambda environment variables + Secrets Manager |
| **Logs** | the console | CloudWatch |

### 10.2 Where it lives in the repo

```
cloud/
  api/                 the API (FastAPI): routes.py (/v1), admin_routes.py (/v1/admin), auth.py (claims -> principal), db.py (RLS transactions, IAM login),
                       config_model.py (settings validation + config_hash), schemas.py, settings.py, lambda_handler.py (Mangum)
    adapters/blob.py   raw event files: local folder or S3 (the only adapter that exists; email is not built)
  lambdas/             migrate_handler.py (migrate / create_org / status / import_sessions), import_sessions.py
  db/migrations/       0001_init.sql, 0002_rds_iam.sql, 0003_org_provisioning.sql; db/migrate.py applies them
  mock/idp/            the fake sign-in service (development only)
  console/             the operator console (index.html, console.js, views.js, charts.js)
  demo/                the Demo Clinic generator (sim_session.py, roster.py, lessons.py)
  infra/aws/           Terraform for the real stack
  scripts/             run_local, seed, export_openapi, build_lambda, export_aws_config, load_demo, aws_signin
  tests/               pytest (206 checks) against a real PostgreSQL
sim/
  cloud.js             CloudClient: the upload queue (IndexedDB), sign-in state, lesson sync
  cloud_ui.js          Cloud sync panel, lesson bar, Lessons view, cloud history, two-step sign-in controls
  auth_mock.js / auth_cognito.js   two implementations of one auth interface (+ qr.js for the authenticator QR code)
  cloud_aws.json       public addresses of the deployed stack (written by export_aws_config)
```

### 10.3 The four seams (the only places local and AWS differ)

| Seam | Interface | Local | AWS |
|---|---|---|---|
| **Sign-in** | API: verify a JWT given `ISSUER`, `JWKS_URL`, `AUDIENCE`. App: `AuthProvider { signIn(), getToken(), signOut() }` | mock IdP / `MockAuth` | Cognito / `CognitoAuth` |
| **Blob storage** | `put(key, bytes)`, `get(key)` | folder | S3 (`boto3`) |
| **Email** | `send(to, subject, body)` | outbox file | SES — **not built** (Cognito sends invitations itself) |
| **Secrets / settings** | read environment variables | `.env.local` | Lambda environment + Secrets Manager |

Everything else — routes, SQL, validation, the config hash, lesson versions — is identical.

### 10.4 Rules that keep it portable

1. **Plain Postgres only.** No vendor extensions, no Supabase- or AWS-specific SQL. Migrations are numbered `.sql` files.
2. **12-factor settings.** Everything environment-specific comes from environment variables: `DATABASE_URL`, `ISSUER`,
   `JWKS_URL`, `AUDIENCE`, `BLOB_BACKEND`, `BLOB_BUCKET`, `MAIL_BACKEND`, `CORS_ORIGINS`.
3. **A stateless API.** No local files or in-memory sessions; it can run as one process or many Lambda invocations.
4. **One function maps token claims to `(user, org_id, role)`.** The mock IdP and Cognito name their claims differently
   (Cognito: `custom:org_id`, `cognito:groups`, usually added to the token by a small pre-token Lambda). Keep that mapping in
   one place and test it against both.
5. **The client generates IDs** (`client_record_id`) so uploads are idempotent and retries are safe; the app queues
   uploads and survives a dead network.
6. **Cloud is optional in the app.** With no `CLOUD_URL` set, the simulator behaves exactly as today (local History,
   Demo mode). Cloud sync is a feature flag, not a dependency.
7. **CORS for tokens, not cookies.** The keyboard-served app is on `http://<keyboard address>`, so the API allows a
   configured list of origins and uses bearer tokens (no cookies).
8. **Size limits designed in.** Lambda accepts about 6 MB per request; one session's events are far smaller. If a later
   payload could exceed that, switch to an S3 upload link (the interface already has `put`).
9. **Only test credentials locally.** The seed file holds invented users (for example `clinician@example.test`); real
   passwords never go into the mock.

### 10.5 The local run, step by step

1. Start Postgres and apply the migrations (`scripts/run_local`).
2. Start the mock IdP (port 9000), then the API (port 8100).
3. Seed: one organisation, an admin, a clinician, one registered keyboard serial, a few patient codes.
4. Start the simulator (`python sim_server.py`), open it with **`?cloud=local`**, and **sign in** as a seeded clinician (the
   **Cloud sync** panel on the start page).
5. Run a session on a patient. The upload appears in the History row (*uploaded*), and a row appears in `sessions`
   with its `config`, `config_hash` and a raw-events file.
6. **Repeat from the cloud:** on a second browser profile, sign in, open the patient's cloud history, click *Repeat*; the
   settings load exactly as run (§2.1).
7. **Lessons:** save a lesson, edit it (version 2), assign it to a patient, run it; the session records
   `lesson_id` / `lesson_version` and `lesson_modified`.
8. **Failure cases:** stop the API mid-session (the upload queues, then drains when it returns); upload the same
   `client_record_id` twice (one row); sign in as a clinician of another organisation (sees nothing); let the token expire
   (the app refreshes it, then asks to sign in again); post an out-of-range setting (rejected).

### 10.6 Moving to AWS

| Step | Change |
|---|---|
| 1 | Create the dev stack from `infra/aws/` (Terraform): VPC, RDS, S3, Cognito, API Gateway + Lambda, Secrets Manager |
| 2 | Apply the same migrations to RDS |
| 3 | Set `DATABASE_URL` (RDS), `ISSUER` / `JWKS_URL` / `AUDIENCE` (Cognito), `BLOB_BACKEND=s3`, `MAIL_BACKEND=ses`, `CORS_ORIGINS` |
| 4 | In the app, select `CognitoAuth` (a build setting) |
| 5 | Run the §10.5 checks against the dev stack, with a real Cognito test user |

**What the local mock cannot prove** — these are checked only in the AWS dev stack: IAM permissions, VPC networking
between Lambda and RDS (and the NAT cost trap in §6), API Gateway and Lambda limits and cold starts, the real Cognito
flows (SRP, MFA, token refresh, the pre-token claims), SES (it starts in a sandbox; leaving it needs a request to AWS and a
verified domain), TLS and CORS in real browsers, and cost. The mock identity service is simpler than Cognito, so a final
contract test with a real Cognito test user is part of step 5.

### 10.7 Build order

| Slice | Contents | AWS needed? |
|---|---|---|
| 1 | Migrations; API (ingest, history, `GET /sessions/{id}/config`, lessons, assignments); mock IdP; pytest | no — **built 2026-10-08**, 146 checks pass against a real PostgreSQL; see `cloud/README.md` |
| 2 | Simulator: `cloud.js`, the sign-in panel, upload queue and status, cloud history with Repeat, lesson library | no — **built 2026-10-08**; open the simulator with `?cloud=local` (`cloud/README.md`) |
| 3 | `infra/aws/` Terraform, the Lambda entry point and package builder, the in-network migration function, S3 and IAM-database-login adapters | no — **built 2026-10-08**; applied to AWS the same day; see `cloud/infra/aws/README.md` |
| 4 | Dev-stack deploy, Cognito adapter, sign-in, uploads and history checked on AWS | **yes** — **done 2026-10-08/09**: stack deployed, simulator signs in with a real Cognito account (`?cloud=aws`, `USER_PASSWORD_AUTH`), uploads and cloud history verified |
| 5 | Operator console: separate operator pool, read-only `/v1/admin/*`, S3 + CloudFront site, audit of every operator view | **done 2026-10-09** |
| 6 | Demo Clinic data (20 patients, ~210 sessions, 10 lessons), progress charts and lesson views in the console | **done 2026-10-09** (`cloud/demo/`, `cloud/scripts/load_demo.py`) |
| 7 | Optional two-step sign-in with a QR code (both apps); clinic accounts cannot be superadmin | **done 2026-10-09** |
| 8 | Not yet: the §10.5 failure-case checks run against AWS as a script, clinic/user self-service in the console, SES, custom domain, WAF/CloudTrail, firmware support (§0.10) | open |
