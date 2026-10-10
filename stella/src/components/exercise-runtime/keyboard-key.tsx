import { cn } from "@/lib/utils"
import type { KeyState } from "@/lib/audio/constants"

interface KeyboardKeyProps {
  id: number
  letter?: string
  className?: string
  state?: KeyState
  onClick?: (id: number) => void
  disabled?: boolean
  beatFlashIntervalMs?: number
}

export function KeyboardKey({
  id,
  letter,
  className,
  state = "idle",
  onClick,
  disabled = false,
  beatFlashIntervalMs,
}: KeyboardKeyProps) {
  const isBlank = letter === ""

  const handleClick = () => {
    if (!disabled && !isBlank && onClick) {
      onClick(id)
    }
  }

  const getInnerCircleClasses = () => {
    if (isBlank) {
      return "bg-[#2a2a3a]"
    }

    switch (state) {
      case "beat":
        return "bg-[#00ff00]"
      case "waiting":
        return beatFlashIntervalMs ? "bg-[#1b4ee6]" : "bg-[#00ff00]"
      case "correct":
        return "bg-[#00ff00] animate-[flash_0.5s_ease-in-out]"
      case "incorrect":
        return "bg-[#ff4444] animate-[flash_0.5s_ease-in-out]"
      default:
        return "bg-[#1b4ee6]"
    }
  }

  const content = (
    <div
      className={cn(
        "flex h-[60%] w-[60%] items-center justify-center rounded-full",
        getInnerCircleClasses()
      )}
      style={
        state === "waiting" && beatFlashIntervalMs
          ? {
              animation: `beat-flash-green ${beatFlashIntervalMs}ms steps(1, end) infinite`,
            }
          : undefined
      }
    >
      {letter ? (
        <span className="text-[clamp(1rem,2.3vw,2rem)] font-bold text-white uppercase">
          {letter}
        </span>
      ) : null}
    </div>
  )

  if (isBlank) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "relative flex aspect-square w-full items-center justify-center rounded-full bg-[#091a2c] shadow-lg",
          className
        )}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      aria-label={`${letter} key${state === "correct" ? ", correct" : state === "incorrect" ? ", incorrect" : ""}`}
      className={cn(
        "relative flex aspect-square w-full items-center justify-center rounded-full bg-[#091a2c] shadow-lg transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-ring/70",
        !disabled && "cursor-pointer hover:shadow-xl active:scale-95",
        disabled && "cursor-default",
        className
      )}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      {content}
    </button>
  )
}
