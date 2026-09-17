import { KeyRound, Mail } from "lucide-react"
import { useState } from "react"

import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"

type LoginView =
  | "sign-in"
  | "forgot-password"
  | "reset-password"
  | "new-password"

function PasswordFields({
  confirmPassword,
  newPassword,
  onConfirmPasswordChange,
  onNewPasswordChange,
}: {
  confirmPassword: string
  newPassword: string
  onConfirmPasswordChange: (value: string) => void
  onNewPasswordChange: (value: string) => void
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        New Password
        <input
          className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => onNewPasswordChange(event.target.value)}
          type="password"
          value={newPassword}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Confirm Password
        <input
          className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          type="password"
          value={confirmPassword}
        />
      </label>
    </>
  )
}

export function LoginPage() {
  const {
    challenge,
    clearChallenge,
    completeNewPassword,
    confirmPasswordReset,
    sendPasswordResetCode,
    signIn,
  } = useAuth()
  const [view, setView] = useState<LoginView>(
    challenge ? "new-password" : "sign-in"
  )
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmationCode, setConfirmationCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const currentView: LoginView = challenge
    ? "new-password"
    : view === "new-password"
      ? "sign-in"
      : view

  function resetMessages() {
    setError("")
    setNotice("")
  }

  function validatePasswords() {
    if (!newPassword || !confirmPassword) {
      setError("Enter and confirm the new password.")
      return false
    }

    if (newPassword !== confirmPassword) {
      setError("The password confirmation does not match.")
      return false
    }

    return true
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetMessages()

    if (!username.trim() || !password) {
      setError("Email and password are required.")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await signIn(username, password)

      if (result.status === "challenge") {
        setUsername(result.challenge.username)
        setPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setNotice(
          "Your temporary password was accepted. Set a permanent password to continue."
        )
        setView("new-password")
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to sign in."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotPassword(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    resetMessages()

    if (!username.trim()) {
      setError("Enter the email for the account you need to reset.")
      return
    }

    setIsSubmitting(true)

    try {
      await sendPasswordResetCode(username)
      setView("reset-password")
      setNotice("A reset code was sent to that email address.")
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to send a reset code."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetPassword(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    resetMessages()

    if (!username.trim() || !confirmationCode.trim()) {
      setError("Email and verification code are required.")
      return
    }

    if (!validatePasswords()) {
      return
    }

    setIsSubmitting(true)

    try {
      await confirmPasswordReset(username, confirmationCode, newPassword)
      setView("sign-in")
      setPassword("")
      setConfirmationCode("")
      setNewPassword("")
      setConfirmPassword("")
      setNotice("Password updated. Sign in with the new password.")
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to reset the password."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleNewPassword(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    resetMessages()

    if (!challenge) {
      setError("The temporary-password session expired. Sign in again.")
      setView("sign-in")
      return
    }

    if (!validatePasswords()) {
      return
    }

    setIsSubmitting(true)

    try {
      await completeNewPassword(newPassword)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update the password."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function returnToSignIn() {
    clearChallenge()
    resetMessages()
    setPassword("")
    setConfirmationCode("")
    setNewPassword("")
    setConfirmPassword("")
    setView("sign-in")
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,#f5edd1_0%,#f8f5ee_38%,#d7e1eb_100%)] px-6 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-[1440px] items-center justify-center">
        <section className="w-full max-w-md">
          <div className="w-full rounded-[28px] border border-[#e5dcc8] bg-card/95 p-8 shadow-[0_24px_80px_rgba(11,27,47,0.18)] backdrop-blur">
            <div className="text-center">
              <img
                alt="Stella logo"
                className="mx-auto h-20 w-20"
                src="/stella-logo.png"
              />
              <h1 className="mt-5 font-heading text-4xl font-bold text-[#11253f]">
                Stella
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Communication Training for Autistic and Non-Speaking
              </p>
            </div>

            <div className="mt-8">
              <h2 className="text-3xl font-semibold text-[#11253f]">
                {currentView === "sign-in" && "Sign in"}
                {currentView === "forgot-password" && "Reset your password"}
                {currentView === "reset-password" && "Enter reset code"}
                {currentView === "new-password" && "Set a new password"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {currentView === "sign-in" &&
                  "Use the Cognito email and password assigned for Stella."}
                {currentView === "forgot-password" &&
                  "Request a verification code to reset an existing password."}
                {currentView === "reset-password" &&
                  "Enter the verification code from email and choose a new password."}
                {currentView === "new-password" &&
                  "Replace the temporary password before continuing."}
              </p>
            </div>

            {notice ? (
              <div className="mt-6 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-[#6e5b1d]">
                {notice}
              </div>
            ) : null}

            {error ? (
              <div className="mt-6 rounded-xl border border-destructive/25 bg-destructive/6 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {currentView === "sign-in" ? (
              <form className="mt-6 flex flex-col gap-4" onSubmit={handleSignIn}>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-11 w-full rounded-md border bg-background pr-3 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onChange={(event) => setUsername(event.target.value)}
                      type="email"
                      value={username}
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Password
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-11 w-full rounded-md border bg-background pr-3 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </div>
                </label>
                <Button disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
                <button
                  className="text-left text-sm font-medium text-primary"
                  onClick={() => {
                    resetMessages()
                    setView("forgot-password")
                  }}
                  type="button"
                >
                  Forgot password?
                </button>
              </form>
            ) : null}

            {currentView === "forgot-password" ? (
              <form
                className="mt-6 flex flex-col gap-4"
                onSubmit={handleForgotPassword}
              >
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    onChange={(event) => setUsername(event.target.value)}
                    type="email"
                    value={username}
                  />
                </label>
                <Button disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? "Sending..." : "Send reset code"}
                </Button>
                <button
                  className="text-left text-sm font-medium text-primary"
                  onClick={returnToSignIn}
                  type="button"
                >
                  Back to sign in
                </button>
              </form>
            ) : null}

            {currentView === "reset-password" ? (
              <form
                className="mt-6 flex flex-col gap-4"
                onSubmit={handleResetPassword}
              >
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    onChange={(event) => setUsername(event.target.value)}
                    type="email"
                    value={username}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Verification Code
                  <input
                    className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    onChange={(event) =>
                      setConfirmationCode(event.target.value)
                    }
                    value={confirmationCode}
                  />
                </label>
                <PasswordFields
                  confirmPassword={confirmPassword}
                  newPassword={newPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                  onNewPasswordChange={setNewPassword}
                />
                <Button disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? "Updating..." : "Reset password"}
                </Button>
                <div className="flex flex-wrap gap-4 text-sm font-medium">
                  <button
                    className="text-primary"
                    onClick={() => setView("forgot-password")}
                    type="button"
                  >
                    Send another code
                  </button>
                  <button
                    className="text-primary"
                    onClick={returnToSignIn}
                    type="button"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : null}

            {currentView === "new-password" ? (
              <form
                className="mt-6 flex flex-col gap-4"
                onSubmit={handleNewPassword}
              >
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    className="h-11 rounded-md border bg-muted px-3 text-sm text-muted-foreground outline-none"
                    readOnly
                    value={challenge?.username ?? username}
                  />
                </label>
                <PasswordFields
                  confirmPassword={confirmPassword}
                  newPassword={newPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                  onNewPasswordChange={setNewPassword}
                />
                <Button disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? "Saving..." : "Save new password"}
                </Button>
                <button
                  className="text-left text-sm font-medium text-primary"
                  onClick={returnToSignIn}
                  type="button"
                >
                  Cancel and return to sign in
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
