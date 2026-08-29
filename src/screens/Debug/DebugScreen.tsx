// Temporary UI for System 2. It exists so the data layer can be exercised on
// a real device; the Today screen replaces it in System 3.
import { useCallback, useEffect, useState } from 'react'
import {
  addMeal,
  deleteMeal,
  getDailyCalorieTarget,
  getMealsForDate,
  setTarget,
  sumTotals,
  toDateKey,
  type MealWithItems,
  type Totals,
} from '../../db/index.ts'

const SAMPLE_MEALS = [
  {
    name: 'Eggs and toast',
    items: [
      { name: 'Eggs', portion: '2 large', calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
      { name: 'Toast', portion: '1 slice', calories: 90, protein_g: 3, carbs_g: 16, fat_g: 1 },
    ],
  },
  {
    name: 'Chicken rice bowl',
    items: [
      { name: 'Chicken breast', portion: '150g', calories: 245, protein_g: 46, carbs_g: 0, fat_g: 5 },
      { name: 'Rice', portion: '1 cup', calories: 205, protein_g: 4, carbs_g: 45, fat_g: 0.4 },
    ],
  },
  {
    name: 'Greek yogurt',
    items: [
      { name: 'Greek yogurt', portion: '170g', calories: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7 },
    ],
  },
] as const

export default function DebugScreen() {
  const [meals, setMeals] = useState<MealWithItems[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [target, setTargetCalories] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = toDateKey()

  const refresh = useCallback(async () => {
    try {
      const [rows, goal] = await Promise.all([getMealsForDate(today), getDailyCalorieTarget(today)])
      setMeals(rows)
      setTotals(sumTotals(rows.flatMap((meal) => meal.items)))
      setTargetCalories(goal)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the database')
    }
  }, [today])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    }
  }

  const addSample = () =>
    run(() => {
      const sample = SAMPLE_MEALS[meals.length % SAMPLE_MEALS.length]
      return addMeal({
        date: today,
        loggedAt: Date.now(),
        name: sample.name,
        source: 'manual',
        items: sample.items.map((item) => ({ ...item })),
      })
    })

  return (
    <section className="mt-12 px-6 pb-10" aria-label="Data system debug">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">
        Debug · data system
      </h2>
      <p className="mt-1.5 text-sm text-mist-500">
        {today} · target{' '}
        <span className="tabular-nums text-mist-300">{target ?? '—'}</span> kcal · logged{' '}
        <span className="tabular-nums text-mist-300">{totals?.calories ?? 0}</span> kcal
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addSample}
          className="rounded-xl border border-accent/60 px-4 py-2.5 text-sm font-medium text-accent transition active:scale-[0.98]"
        >
          Add sample meal
        </button>
        <button
          type="button"
          onClick={() => run(() => setTarget({ dailyCalories: 2000 }))}
          className="rounded-xl border border-ink-500 px-4 py-2.5 text-sm font-medium text-mist-300 transition active:scale-[0.98]"
        >
          Set target 2000
        </button>
        <button
          type="button"
          onClick={() => run(() => Promise.all(meals.map((meal) => deleteMeal(meal.id))))}
          className="rounded-xl border border-ink-500 px-4 py-2.5 text-sm font-medium text-mist-300 transition active:scale-[0.98]"
        >
          Clear today
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-mist-300">
          {error}
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-2">
        {meals.length === 0 && <li className="text-sm text-mist-500">No meals stored for today.</li>}
        {meals.map((meal) => {
          const mealTotals = sumTotals(meal.items)
          return (
            <li key={meal.id} className="rounded-2xl bg-ink-700/70 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-mist-100">{meal.name}</span>
                <span className="text-sm tabular-nums text-mist-300">
                  {mealTotals.calories} kcal
                </span>
              </div>
              <p className="mt-1 text-xs text-mist-500">
                {meal.items.map((item) => `${item.name} (${item.portion})`).join(' · ') || 'No foods'}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-mist-500 tabular-nums">
                  P {mealTotals.protein_g} · C {mealTotals.carbs_g} · F {mealTotals.fat_g}
                </span>
                <button
                  type="button"
                  onClick={() => run(() => deleteMeal(meal.id))}
                  className="text-xs font-medium text-mist-500 underline underline-offset-4"
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
