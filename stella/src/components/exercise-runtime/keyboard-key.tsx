import { cn } from "@/lib/utils"
import type { KeyState } from "@/lib/audio/constants"

interface KeyboardKeyProps {
  id: number
  letter?: string
  className?: string
  state?: KeyState
  onClick?: (id: number) => void
  disabled?: boolean
}

export function KeyboardKey({
  id,
  letter,
  className,
  state = "idle",
  onClick,
  disabled = false,
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
        return "animate-[beat-flash_0.3s_ease-out]"
      case "waiting":
        return "bg-[#00ff00]"
      case "correct":
        return "bg-[#00ff00] animate-[flash_0.5s_ease-in-out]"
      case "incorrect":
        return "bg-[#ff4444] animate-[flash_0.5s_ease-in-out]"
      default:
        return "bg-[#1b4ee6]"
    }
  }

  return (
    <div
      className={cn(
        "relative flex aspect-square w-full items-center justify-center rounded-full bg-[#091a2c] shadow-lg transition-all duration-200",
        !disabled && !isBlank && "cursor-pointer hover:shadow-xl active:scale-95",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "flex h-[60%] w-[60%] items-center justify-center rounded-full",
          getInnerCircleClasses()
        )}
      >
        {letter ? (
          <span className="text-[clamp(1rem,2.3vw,2rem)] font-bold text-white uppercase">
            {letter}
          </span>
        ) : null}
      </div>
    </div>
  )
}
