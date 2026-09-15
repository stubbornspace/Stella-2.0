import { cn } from "@/lib/utils"

type ProgressProps = {
  className?: string
  value: number
}

function Progress({ className, value }: ProgressProps) {
  return (
    <div
      data-slot="progress"
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export { Progress }
