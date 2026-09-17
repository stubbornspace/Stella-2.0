import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createFeedbackNote, listFeedbackNotes } from "@/api/feedback"
import type { CreateFeedbackNoteInput, FeedbackContext } from "@/types/feedback"

export function useFeedbackNotes(
  context: FeedbackContext | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: ["feedbackNotes", context?.pageKey],
    queryFn: () => listFeedbackNotes(context as FeedbackContext),
    enabled: Boolean(context && enabled),
  })
}

export function useCreateFeedbackNote(context: FeedbackContext | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreateFeedbackNoteInput, keyof FeedbackContext>) =>
      createFeedbackNote({
        ...context,
        ...input,
      } as CreateFeedbackNoteInput),
    onSuccess: () => {
      if (!context) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: ["feedbackNotes", context.pageKey],
      })
    },
  })
}
