import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"

type DialogShellProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  titleId: string
  children: ReactNode
  maxWidthClassName?: string
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  titleId,
  children,
  maxWidthClassName = "max-w-xl",
}: DialogShellProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full rounded-3xl border border-border/70 bg-background shadow-xl ${maxWidthClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div>
            <div id={titleId} className="text-xl font-semibold tracking-tight">
              {title}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {description}
            </div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-4 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
