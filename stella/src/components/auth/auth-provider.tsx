import { useEffect, useState, type ReactNode } from "react"

import {
  AuthContext,
  type AuthContextValue,
} from "@/components/auth/auth-context"
import {
  clearAuthSession,
  completeNewPasswordChallenge,
  confirmPasswordReset,
  getCurrentUser,
  getValidIdToken,
  restoreAuthSession,
  sendPasswordResetCode,
  signInWithPassword,
  type AuthSession,
  type AuthUser,
  type NewPasswordChallenge,
} from "@/lib/auth"
import { getRuntimeConfig } from "@/lib/runtime-config"

const localUser: AuthUser = {
  displayName: "Local POC User",
  groups: [],
  sub: "local-poc-user",
}

function buildSessionState(
  session: AuthSession,
  requiredGroup: string | undefined
) {
  const nextUser = getCurrentUser(session)

  return {
    status:
      requiredGroup && !nextUser.groups.includes(requiredGroup)
        ? "forbidden"
        : "authenticated",
    user: nextUser,
  } as const
}

function createLocalAuthValue(): AuthContextValue {
  return {
    challenge: undefined,
    clearChallenge: () => undefined,
    completeNewPassword: async () => undefined,
    confirmPasswordReset: async () => undefined,
    getIdToken: async () => undefined,
    isAuthEnabled: false,
    mode: "local",
    sendPasswordResetCode: async () => undefined,
    signIn: async () => ({
      session: {
        accessToken: "",
        idToken: "",
      },
      status: "authenticated",
    }),
    signOut: () => {
      clearAuthSession()
    },
    status: "authenticated",
    user: localUser,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = getRuntimeConfig()
  const isAuthEnabled = config.auth.enabled
  const requiredGroup = config.auth.requiredGroup?.trim()
  const [status, setStatus] = useState<AuthContextValue["status"]>(
    isAuthEnabled ? "loading" : "authenticated"
  )
  const [user, setUser] = useState<AuthUser | undefined>(
    isAuthEnabled ? undefined : localUser
  )
  const [challenge, setChallenge] = useState<NewPasswordChallenge | undefined>()

  function applyAuthenticatedSession(session: AuthSession) {
    const nextState = buildSessionState(session, requiredGroup)
    setChallenge(undefined)
    setStatus(nextState.status)
    setUser(nextState.user)
  }

  function resetToSignedOut() {
    clearAuthSession()
    setChallenge(undefined)
    setStatus("unauthenticated")
    setUser(undefined)
  }

  useEffect(() => {
    if (!isAuthEnabled) {
      return
    }

    let active = true

    async function initialize() {
      const session = await restoreAuthSession()

      if (!active) {
        return
      }

      if (!session) {
        setStatus("unauthenticated")
        setUser(undefined)
        return
      }

      const nextState = buildSessionState(session, requiredGroup)
      setChallenge(undefined)
      setStatus(nextState.status)
      setUser(nextState.user)
    }

    void initialize()

    return () => {
      active = false
    }
  }, [isAuthEnabled, requiredGroup])

  if (!isAuthEnabled) {
    return (
      <AuthContext.Provider value={createLocalAuthValue()}>
        {children}
      </AuthContext.Provider>
    )
  }

  const value: AuthContextValue = {
    challenge,
    clearChallenge: () => setChallenge(undefined),
    completeNewPassword: async (newPassword: string) => {
      if (!challenge) {
        throw new Error("No password update challenge is active.")
      }

      const session = await completeNewPasswordChallenge(challenge, newPassword)
      applyAuthenticatedSession(session)
    },
    confirmPasswordReset,
    getIdToken: getValidIdToken,
    isAuthEnabled: true,
    mode: "cognito",
    sendPasswordResetCode,
    signIn: async (username: string, password: string) => {
      const result = await signInWithPassword(username, password)

      if (result.status === "challenge") {
        setChallenge(result.challenge)
        setStatus("unauthenticated")
        setUser(undefined)
        return result
      }

      applyAuthenticatedSession(result.session)
      return result
    },
    signOut: () => {
      resetToSignedOut()
    },
    status,
    user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
