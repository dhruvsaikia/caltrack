import { db } from './db.ts'
import { isDateKey } from './dates.ts'
import type { DateKey, FoodItem, Meal, MealDraft, MealWithItems, Totals } from './types.ts'

export const ZERO_TOTALS: Totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Coerce one food's numbers into something storable. LLM output and hand
 * typing both produce junk (negatives, NaN, 12 decimal places); this is the
 * single choke point that keeps such values out of IndexedDB. Exported so the
 * AI parser clamps model output by exactly these rules before it is shown.
 */
export function sanitizeFoodItem<T extends Omit<FoodItem, 'id' | 'mealId'>>(item: T): T {
  const clamp = (n: number, decimals: number) =>
    Number.isFinite(n) ? round(Math.max(n, 0), decimals) : 0
  return {
    ...item,
    name: item.name.trim(),
    portion: item.portion.trim(),
    calories: clamp(item.calories, 0),
    protein_g: clamp(item.protein_g, 1),
    carbs_g: clamp(item.carbs_g, 1),
    fat_g: clamp(item.fat_g, 1),
  }
}

/** Sum a meal's foods. A meal has no stored totals — they are always derived. */
export function sumTotals(items: Pick<FoodItem, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]): Totals {
  const totals = items.reduce<Totals>(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { ...ZERO_TOTALS },
  )
  return {
    calories: round(totals.calories),
    protein_g: round(totals.protein_g, 1),
    carbs_g: round(totals.carbs_g, 1),
    fat_g: round(totals.fat_g, 1),
  }
}

/** Insert a meal and its foods atomically. Returns the new meal id. */
export async function addMeal(draft: MealDraft): Promise<number> {
  if (!isDateKey(draft.date)) throw new Error(`Invalid meal date: ${draft.date}`)
  const { items, ...meal } = draft

  return db.transaction('rw', db.meals, db.foodItems, async () => {
    const mealId = await db.meals.add({ ...meal, name: meal.name.trim() })
    if (items.length > 0) {
      await db.foodItems.bulkAdd(items.map((item) => ({ ...sanitizeFoodItem(item), mealId })))
    }
    return mealId
  })
}

async function attachItems(meals: Meal[]): Promise<MealWithItems[]> {
  const ids = meals.map((meal) => meal.id)
  const items = await db.foodItems.where('mealId').anyOf(ids).toArray()
  const byMeal = new Map<number, FoodItem[]>(ids.map((id) => [id, []]))
  for (const item of items) byMeal.get(item.mealId)?.push(item)
  return meals.map((meal) => ({ ...meal, items: byMeal.get(meal.id) ?? [] }))
}

export async function getMeal(id: number): Promise<MealWithItems | undefined> {
  const meal = await db.meals.get(id)
  if (!meal) return undefined
  const [withItems] = await attachItems([meal])
  return withItems
}

/** Every meal on one local day, oldest first. */
export async function getMealsForDate(date: DateKey): Promise<MealWithItems[]> {
  const meals = await db.meals.where('date').equals(date).toArray()
  meals.sort((a, b) => a.loggedAt - b.loggedAt)
  return attachItems(meals)
}

/** Every meal from `start` to `end` inclusive, chronological. */
export async function getMealsInRange(start: DateKey, end: DateKey): Promise<MealWithItems[]> {
  const meals = await db.meals.where('date').between(start, end, true, true).toArray()
  meals.sort((a, b) => (a.date === b.date ? a.loggedAt - b.loggedAt : a.date < b.date ? -1 : 1))
  return attachItems(meals)
}

/**
 * Update a meal's fields and, when `items` is given, replace its food list
 * wholesale (the Confirm screen edits the list as a unit). Omitting `items`
 * leaves the existing foods untouched.
 */
export async function updateMeal(
  id: number,
  changes: Partial<Omit<Meal, 'id'>> & { items?: Omit<FoodItem, 'id' | 'mealId'>[] },
): Promise<void> {
  const { items, ...mealChanges } = changes
  if (mealChanges.date !== undefined && !isDateKey(mealChanges.date)) {
    throw new Error(`Invalid meal date: ${mealChanges.date}`)
  }

  await db.transaction('rw', db.meals, db.foodItems, async () => {
    const existing = await db.meals.get(id)
    if (!existing) throw new Error(`No meal with id ${id}`)
    if (Object.keys(mealChanges).length > 0) await db.meals.update(id, mealChanges)
    if (items) {
      await db.foodItems.where('mealId').equals(id).delete()
      if (items.length > 0) {
        await db.foodItems.bulkAdd(items.map((item) => ({ ...sanitizeFoodItem(item), mealId: id })))
      }
    }
  })
}

/** Delete a meal and its foods. No-op if the meal is already gone. */
export async function deleteMeal(id: number): Promise<void> {
  await db.transaction('rw', db.meals, db.foodItems, async () => {
    await db.foodItems.where('mealId').equals(id).delete()
    await db.meals.delete(id)
  })
}

export async function totalsForDate(date: DateKey): Promise<Totals> {
  const meals = await getMealsForDate(date)
  return sumTotals(meals.flatMap((meal) => meal.items))
}

/** Per-day totals across a range. Days with no meals are omitted. */
export async function dailyTotalsInRange(
  start: DateKey,
  end: DateKey,
): Promise<Map<DateKey, Totals>> {
  const meals = await getMealsInRange(start, end)
  const byDate = new Map<DateKey, FoodItem[]>()
  for (const meal of meals) {
    const bucket = byDate.get(meal.date)
    if (bucket) bucket.push(...meal.items)
    else byDate.set(meal.date, [...meal.items])
  }
  return new Map([...byDate].map(([date, items]) => [date, sumTotals(items)]))
}
