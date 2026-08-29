import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMealsForDate,
  getTargetForDate,
  sumTotals,
  toDateKey,
  DEFAULT_DAILY_CALORIES,
  ZERO_TOTALS,
  type DateKey,
  type MealWithItems,
  type Target,
} from '../../db/index.ts'
import CalorieRing from './CalorieRing.tsx'
import MacroBars from './MacroBars.tsx'
import MealList from './MealList.tsx'
import { calorieSummary, formatDayHeading, macroBars } from './summary.ts'

export default function TodayScreen({
  date = toDateKey(),
  reloadKey = 0,
  onAddMeal,
  onEditMeal,
}: {
  /** Day to show. Defaults to today; passed in so tests can pin it. */
  date?: DateKey
  /** Bump to re-read the database after a save or delete elsewhere. */
  reloadKey?: number
  onAddMeal: () => void
  onEditMeal: (meal: MealWithItems) => void
}) {
  const [meals, setMeals] = useState<MealWithItems[]>([])
  const [target, setTarget] = useState<Target | undefined>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    try {
      const [rows, dayTarget] = await Promise.all([getMealsForDate(date), getTargetForDate(date)])
      setMeals(rows)
      setTarget(dayTarget)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const totals = useMemo(
    () => (meals.length > 0 ? sumTotals(meals.flatMap((meal) => meal.items)) : ZERO_TOTALS),
    [meals],
  )
  const summary = calorieSummary(totals.calories, target?.dailyCalories ?? DEFAULT_DAILY_CALORIES)
  const bars = useMemo(() => macroBars(totals, target), [totals, target])

  return (
    <div className="px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">
          {formatDayHeading(new Date())}
        </p>
        <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-mist-100">Today</h1>
      </header>

      <section aria-label="Calories remaining" className="mt-10 flex flex-col items-center">
        <CalorieRing summary={summary} />
        <p className="mt-6 text-sm text-mist-500">
          <span className="font-semibold tabular-nums text-mist-100">{summary.eaten}</span> eaten
          <span className="mx-3" />
          <span className="font-semibold tabular-nums text-mist-100">{summary.goal}</span> goal
        </p>
      </section>

      <section aria-label="Macros" className="mt-6">
        <MacroBars bars={bars} />
      </section>

      <section aria-label="Meals" className="mt-10">
        {status === 'error' ? (
          <p role="alert" className="text-center text-sm text-mist-300">
            Couldn't read your meals from this device.
          </p>
        ) : meals.length === 0 ? (
          <div className={`flex flex-col items-center ${status === 'loading' ? 'invisible' : ''}`}>
            <div className="h-14 w-14 rounded-full border border-dashed border-ink-500" />
            <p className="mt-5 text-base text-mist-300">Nothing logged yet</p>
            <button
              type="button"
              onClick={onAddMeal}
              className="mt-5 rounded-xl border border-accent/60 px-6 py-3 text-base font-medium text-accent transition active:scale-[0.98]"
            >
              Log your first meal
            </button>
          </div>
        ) : (
          <MealList meals={meals} onSelect={onEditMeal} />
        )}
      </section>
    </div>
  )
}
