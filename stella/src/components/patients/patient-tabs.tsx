import { cn } from "@/lib/utils"

export type PatientDetailTab = "dashboard" | "exercise-control"

export function PatientTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: PatientDetailTab
  onTabChange: (tab: PatientDetailTab) => void
}) {
  const tabs: Array<{ id: PatientDetailTab; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "exercise-control", label: "Exercises" },
  ]

  return (
    <div aria-label="Patient detail views" className="border-b" role="tablist">
      <div className="flex gap-6">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <button
              aria-selected={isActive}
              className={cn(
                "-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
