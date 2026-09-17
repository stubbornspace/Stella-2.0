import { getRuntimeConfig } from "@/lib/runtime-config"

const authStorageKey = "stella-poc-auth-session"

export type AuthSession = {
  accessToken: string
  idToken: string
  refreshToken?: string
  tokenType?: string
}

export type AuthUser = {
  displayName: string
  email?: string
  sub: string
  groups: string[]
}

export type NewPasswordChallenge = {
  session: string
  type: "new-password-required"
  username: string
}

export type SignInResult =
  | {
      session: AuthSession
      status: "authenticated"
    }
  | {
      challenge: NewPasswordChallenge
      status: "challenge"
    }

type TokenPayload = {
  email?: string
  exp?: number
  name?: string
  sub: string
  "cognito:groups"?: string[] | string
}

type RequiredAuthConfig = {
  enabled: true
  region: string
  requiredGroup?: string
  userPoolClientId: string
}

type CognitoErrorResponse = {
  __type?: string
  message?: string
}

type AuthenticationResult = {
  AccessToken?: string
  IdToken?: string
  RefreshToken?: string
  TokenType?: string
}

type InitiateAuthResponse = {
  AuthenticationResult?: AuthenticationResult
  ChallengeName?: string
  Session?: string
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = window.atob(`${normalized}${padding}`)

  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJwtPayload<T>(token: string) {
  const [, payload = ""] = token.split(".")
  const bytes = fromBase64Url(payload)
  const json = new TextDecoder().decode(bytes)

  return JSON.parse(json) as T
}

function readStoredSession() {
  const raw = window.localStorage.getItem(authStorageKey)

  if (!raw) {
    return undefined
  }

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    clearAuthSession()
    return undefined
  }
}

function writeStoredSession(session: AuthSession) {
  window.localStorage.setItem(authStorageKey, JSON.stringify(session))
}

function readTokenPayload(token: string) {
  return decodeJwtPayload<TokenPayload>(token)
}

function tokenIsExpired(token: string, clockSkewSeconds = 60) {
  const payload = readTokenPayload(token)

  if (!payload.exp) {
    return true
  }

  return payload.exp * 1000 <= Date.now() + clockSkewSeconds * 1000
}

function normalizeGroups(groups: TokenPayload["cognito:groups"]) {
  if (Array.isArray(groups)) {
    return groups
  }

  if (!groups) {
    return []
  }

  return groups
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function getRequiredAuthConfig() {
  const config = getRuntimeConfig()

  if (
    !config.auth.enabled ||
    !config.auth.region ||
    !config.auth.userPoolClientId
  ) {
    throw new Error("Cognito runtime config is incomplete.")
  }

  return config.auth as RequiredAuthConfig
}

function getCognitoEndpoint(config: RequiredAuthConfig) {
  return `https://cognito-idp.${config.region}.amazonaws.com/`
}

function normalizeErrorType(value: string | undefined) {
  if (!value) {
    return "UnknownException"
  }

  const rawType = value.split("#").at(-1) ?? value
  return rawType.split(":").at(-1) ?? rawType
}

function mapCognitoErrorMessage(errorType: string, fallback: string) {
  switch (errorType) {
    case "CodeMismatchException":
      return "The verification code is invalid."
    case "ExpiredCodeException":
      return "The verification code has expired. Request a new one."
    case "InvalidPasswordException":
      return fallback
    case "LimitExceededException":
      return "Too many attempts. Wait a moment and try again."
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Invalid email or password."
    case "PasswordResetRequiredException":
      return "Password reset is required for this account."
    case "UserNotConfirmedException":
      return "This account is not confirmed yet."
    default:
      return fallback
  }
}

async function cognitoRequest<TResponse>(
  target: string,
  body: Record<string, unknown>
) {
  const config = getRequiredAuthConfig()
  const response = await fetch(getCognitoEndpoint(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | CognitoErrorResponse
      | undefined
    const errorType = normalizeErrorType(errorBody?.__type)
    throw new Error(
      mapCognitoErrorMessage(
        errorType,
        errorBody?.message || "Cognito request failed."
      )
    )
  }

  return (await response.json()) as TResponse
}

function authResultToSession(
  result: AuthenticationResult,
  existingRefreshToken?: string
) {
  if (!result.AccessToken || !result.IdToken) {
    throw new Error("Cognito did not return valid tokens.")
  }

  const session: AuthSession = {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken ?? existingRefreshToken,
    tokenType: result.TokenType,
  }

  writeStoredSession(session)
  return session
}

export function clearAuthSession() {
  window.localStorage.removeItem(authStorageKey)
}

export function getCurrentUser(session: AuthSession) {
  const payload = readTokenPayload(session.idToken)

  return {
    displayName: payload.name || payload.email || "Clinician User",
    email: payload.email,
    sub: payload.sub,
    groups: normalizeGroups(payload["cognito:groups"]),
  } satisfies AuthUser
}

export async function signInWithPassword(
  username: string,
  password: string
): Promise<SignInResult> {
  const config = getRequiredAuthConfig()
  const normalizedUsername = username.trim()
  const response = await cognitoRequest<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      PASSWORD: password,
      USERNAME: normalizedUsername,
    },
    ClientId: config.userPoolClientId,
  })

  if (
    response.ChallengeName === "NEW_PASSWORD_REQUIRED" &&
    response.Session
  ) {
    return {
      challenge: {
        session: response.Session,
        type: "new-password-required",
        username: normalizedUsername,
      },
      status: "challenge",
    }
  }

  if (!response.AuthenticationResult) {
    throw new Error("Cognito did not complete authentication.")
  }

  return {
    session: authResultToSession(response.AuthenticationResult),
    status: "authenticated",
  }
}

export async function completeNewPasswordChallenge(
  challenge: NewPasswordChallenge,
  newPassword: string
) {
  const config = getRequiredAuthConfig()
  const response = await cognitoRequest<InitiateAuthResponse>(
    "RespondToAuthChallenge",
    {
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ChallengeResponses: {
        NEW_PASSWORD: newPassword,
        USERNAME: challenge.username,
      },
      ClientId: config.userPoolClientId,
      Session: challenge.session,
    }
  )

  if (!response.AuthenticationResult) {
    throw new Error("Cognito did not complete the password update.")
  }

  return authResultToSession(response.AuthenticationResult)
}

export async function sendPasswordResetCode(username: string) {
  const config = getRequiredAuthConfig()

  await cognitoRequest("ForgotPassword", {
    ClientId: config.userPoolClientId,
    Username: username.trim(),
  })
}

export async function confirmPasswordReset(
  username: string,
  confirmationCode: string,
  newPassword: string
) {
  const config = getRequiredAuthConfig()

  await cognitoRequest("ConfirmForgotPassword", {
    ClientId: config.userPoolClientId,
    ConfirmationCode: confirmationCode.trim(),
    Password: newPassword,
    Username: username.trim(),
  })
}

export async function refreshAuthSession(session: AuthSession) {
  const config = getRequiredAuthConfig()

  if (!session.refreshToken) {
    return undefined
  }

  try {
    const response = await cognitoRequest<InitiateAuthResponse>("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: session.refreshToken,
      },
      ClientId: config.userPoolClientId,
    })

    if (!response.AuthenticationResult) {
      clearAuthSession()
      return undefined
    }

    return authResultToSession(
      response.AuthenticationResult,
      session.refreshToken
    )
  } catch {
    clearAuthSession()
    return undefined
  }
}

export async function restoreAuthSession() {
  const session = readStoredSession()

  if (!session) {
    return undefined
  }

  if (!tokenIsExpired(session.idToken)) {
    return session
  }

  return refreshAuthSession(session)
}

export async function getValidIdToken() {
  const session = await restoreAuthSession()
  return session?.idToken
}
