import { format, parseISO } from "date-fns"
import { MessageSquareMore } from "lucide-react"
import { useMemo, useState } from "react"

import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"
import { useFeedbackContext } from "@/hooks/use-feedback-context"
import {
  useCreateFeedbackNote,
  useFeedbackNotes,
} from "@/hooks/use-feedback"

const localAuthorStorageKey = "stella-poc-feedback-author"

function formatNoteTimestamp(value: string) {
  return format(parseISO(value), "MMM d, yyyy h:mm a")
}

function readLocalAuthorName() {
  return window.localStorage.getItem(localAuthorStorageKey) ?? ""
}

function writeLocalAuthorName(value: string) {
  window.localStorage.setItem(localAuthorStorageKey, value)
}

export function FeedbackWidget({
  onToast,
  triggerClassName,
}: {
  onToast: (message: string) => void
  triggerClassName?: string
}) {
  const context = useFeedbackContext()
  const { isAuthEnabled, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [authorName, setAuthorName] = useState(readLocalAuthorName)
  const [formError, setFormError] = useState("")
  const notesQuery = useFeedbackNotes(context, open)
  const createNote = useCreateFeedbackNote(context)
  const helperText = useMemo(
    () =>
      isAuthEnabled
        ? `Signed in as ${user?.displayName ?? "Clinician User"}`
        : "Local mode stores feedback in your browser only.",
    [isAuthEnabled, user?.displayName]
  )

  if (!context) {
    return null
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedComment = comment.trim()
    const trimmedAuthor = authorName.trim()

    if (!trimmedComment) {
      setFormError("Comment is required.")
      return
    }

    if (!isAuthEnabled && !trimmedAuthor) {
      setFormError("Name is required in local mode.")
      return
    }

    await createNote.mutateAsync({
      authorDisplayName: isAuthEnabled ? undefined : trimmedAuthor,
      comment: trimmedComment,
    })

    if (!isAuthEnabled) {
      writeLocalAuthorName(trimmedAuthor)
    }

    setComment("")
    setFormError("")
    onToast("Feedback saved.")
  }

  return (
    <>
      <Button
        className={triggerClassName}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <MessageSquareMore />
        Feedback
      </Button>

      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-6 text-foreground backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card text-foreground shadow-sm">
            <div className="border-b px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Page Feedback</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {context.pageLabel}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {helperText}
                  </p>
                </div>
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-5 p-6">
              <section>
                <div className="mb-2 text-sm font-medium">Notes</div>
                <div className="max-h-[38vh] overflow-y-auto rounded-md border bg-background p-4 text-sm leading-6 whitespace-pre-wrap">
                  {notesQuery.isLoading ? (
                    <div className="text-muted-foreground">Loading feedback...</div>
                  ) : notesQuery.isError ? (
                    <div className="text-destructive">
                      {notesQuery.error instanceof Error
                        ? notesQuery.error.message
                        : "Unable to load feedback."}
                    </div>
                  ) : notesQuery.data && notesQuery.data.length > 0 ? (
                    notesQuery.data.map((note, index) => (
                      <div key={note.noteId}>
                        <div className="font-medium">
                          {note.authorDisplayName} · {formatNoteTimestamp(note.createdAt)}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{note.comment}</div>
                        {index < notesQuery.data.length - 1 ? (
                          <div className="my-3 border-t" />
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">
                      No feedback has been recorded for this page yet.
                    </div>
                  )}
                </div>
              </section>

              <form className="flex flex-col gap-4" onSubmit={submit}>
                {!isAuthEnabled ? (
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Name
                    <input
                      className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onChange={(event) => {
                        setAuthorName(event.target.value)
                        setFormError("")
                      }}
                      value={authorName}
                    />
                  </label>
                ) : null}

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Comment
                  <textarea
                    className="min-h-40 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    onChange={(event) => {
                      setComment(event.target.value)
                      setFormError("")
                    }}
                    placeholder="Add feedback for this page."
                    value={comment}
                  />
                </label>

                {formError ? (
                  <div className="text-sm text-destructive">{formError}</div>
                ) : null}

                {createNote.isError ? (
                  <div className="text-sm text-destructive">
                    {createNote.error instanceof Error
                      ? createNote.error.message
                      : "Unable to save feedback."}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setOpen(false)}
                    type="button"
                    variant="outline"
                  >
                    Close
                  </Button>
                  <Button disabled={createNote.isPending} type="submit">
                    {createNote.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
