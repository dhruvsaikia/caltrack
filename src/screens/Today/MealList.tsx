import { sumTotals, type MealWithItems } from '../../db/index.ts'
import { formatLoggedAt } from './summary.ts'

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-mist-500">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The day's meals, oldest first. Tapping one opens it for editing. */
export default function MealList({
  meals,
  onSelect,
}: {
  meals: MealWithItems[]
  onSelect: (meal: MealWithItems) => void
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {meals.map((meal) => {
        const totals = sumTotals(meal.items)
        return (
          <li key={meal.id}>
            <button
              type="button"
              onClick={() => onSelect(meal)}
              className="flex w-full items-center gap-3 rounded-2xl bg-ink-700/70 px-4 py-3.5 text-left transition active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-base font-medium text-mist-100">{meal.name}</span>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-mist-100">
                    {totals.calories}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs text-mist-500 tabular-nums">
                    {formatLoggedAt(meal.loggedAt)} · P {totals.protein_g} · C {totals.carbs_g} · F{' '}
                    {totals.fat_g}
                  </span>
                  <span className="shrink-0 text-xs text-mist-500">kcal</span>
                </div>
              </div>
              <ChevronIcon />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
