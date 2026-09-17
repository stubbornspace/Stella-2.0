import { createContext, useContext } from "react"

import type { AuthUser, NewPasswordChallenge, SignInResult } from "@/lib/auth"

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "forbidden"

export type AuthMode = "local" | "cognito"

export type AuthContextValue = {
  challenge?: NewPasswordChallenge
  clearChallenge: () => void
  completeNewPassword: (newPassword: string) => Promise<void>
  confirmPasswordReset: (
    username: string,
    confirmationCode: string,
    newPassword: string
  ) => Promise<void>
  getIdToken: () => Promise<string | undefined>
  isAuthEnabled: boolean
  mode: AuthMode
  sendPasswordResetCode: (username: string) => Promise<void>
  signIn: (username: string, password: string) => Promise<SignInResult>
  signOut: () => void
  status: AuthStatus
  user?: AuthUser
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
)

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.")
  }

  return value
}
