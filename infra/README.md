# Stella POC Infra

This CDK app deploys the hosted Stella mockup stack:

- S3 bucket for the built Vite app
- CloudFront distribution with SPA route fallback
- Route 53 alias records for `demo.stellaempowers.com`
- ACM certificate for `demo.stellaempowers.com` in `us-east-1`
- Cognito User Pool for custom in-app login
- Cognito user group `stella-poc-users`
- DynamoDB table for page feedback notes
- DynamoDB tables for patients, sessions, and saved AI analysis
- HTTP API + Lambda handlers for feedback, patient/session data, and analysis
- Bedrock-backed patient analysis generation

## Deploy

Run from `infra/` after building the frontend:

1. `cd ../stella && npm run build`
2. `cd ../infra && npm run build`
3. `npx cdk deploy`

The deploy uploads `../stella/dist` and writes a `runtime-config.json` file into the site bucket with the CloudFront, Cognito, and API settings the SPA needs.

The deploy also seeds the patient and session tables with the current mock dataset so the hosted POC is immediately usable.

After deploy, the app is intended to be reached at `https://demo.stellaempowers.com`.

## User Access

- Self-signup is disabled.
- Create users manually in the Cognito User Pool after deploy.
- Add approved users to the Cognito group `stella-poc-users`.
- Users sign in through the custom login screen in the SPA.
- Admin-created users can complete their first-time password change in the SPA.
- Users can trigger forgot-password reset from the same login screen.
- Only users in that group can use the feedback-enabled POC.

## Useful Commands

- `npm run build` compiles the CDK app.
- `npx cdk synth` validates the CloudFormation template locally.
- `npx cdk diff` compares the deployed stack with local changes.
- `npx cdk deploy` deploys the current stack.
