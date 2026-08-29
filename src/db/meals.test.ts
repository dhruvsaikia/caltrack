import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'
import {
  addMeal,
  dailyTotalsInRange,
  deleteMeal,
  getMeal,
  getMealsForDate,
  getMealsInRange,
  sumTotals,
  totalsForDate,
  updateMeal,
} from './meals.ts'
import type { MealDraft } from './types.ts'

function draft(overrides: Partial<MealDraft> = {}): MealDraft {
  return {
    date: '2026-05-10',
    loggedAt: Date.parse('2026-05-10T08:00:00'),
    name: 'Breakfast',
    source: 'manual',
    items: [
      { name: 'Eggs', portion: '2 large', calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
      { name: 'Toast', portion: '1 slice', calories: 90, protein_g: 3, carbs_g: 16, fat_g: 1 },
    ],
    ...overrides,
  }
}

beforeEach(async () => {
  await db.open()
  await Promise.all([db.meals.clear(), db.foodItems.clear(), db.targets.clear(), db.settings.clear()])
})

describe('sumTotals', () => {
  it('sums an empty list to zero', () => {
    expect(sumTotals([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  })

  it('sums calories and macros', () => {
    expect(
      sumTotals([
        { calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
        { calories: 90, protein_g: 3, carbs_g: 16, fat_g: 1 },
      ]),
    ).toEqual({ calories: 230, protein_g: 15, carbs_g: 17, fat_g: 11 })
  })

  it('rounds away floating-point drift', () => {
    const totals = sumTotals([
      { calories: 0.5, protein_g: 0.1, carbs_g: 0.2, fat_g: 0.1 },
      { calories: 0.5, protein_g: 0.2, carbs_g: 0.1, fat_g: 0.2 },
    ])
    expect(totals).toEqual({ calories: 1, protein_g: 0.3, carbs_g: 0.3, fat_g: 0.3 })
  })
})

describe('meal CRUD', () => {
  it('stores a meal with its foods and reads it back', async () => {
    const id = await addMeal(draft())
    const meal = await getMeal(id)

    expect(meal?.name).toBe('Breakfast')
    expect(meal?.items).toHaveLength(2)
    expect(meal?.items.every((item) => item.mealId === id)).toBe(true)
    expect(sumTotals(meal!.items).calories).toBe(230)
  })

  it('returns undefined for a missing meal', async () => {
    expect(await getMeal(999)).toBeUndefined()
  })

  it('rejects an invalid date instead of writing it', async () => {
    await expect(addMeal(draft({ date: '10-05-2026' }))).rejects.toThrow(/Invalid meal date/)
    expect(await db.meals.count()).toBe(0)
  })

  it('cleans up model-shaped junk numbers', async () => {
    const id = await addMeal(
      draft({
        items: [
          {
            name: '  Yogurt  ',
            portion: ' 1 cup ',
            calories: 149.6,
            protein_g: 8.6666,
            carbs_g: -3,
            fat_g: Number.NaN,
          },
        ],
      }),
    )
    const [item] = (await getMeal(id))!.items

    expect(item.name).toBe('Yogurt')
    expect(item.portion).toBe('1 cup')
    expect(item.calories).toBe(150)
    expect(item.protein_g).toBe(8.7)
    expect(item.carbs_g).toBe(0)
    expect(item.fat_g).toBe(0)
  })

  it('accepts a meal with no foods', async () => {
    const id = await addMeal(draft({ items: [] }))
    expect((await getMeal(id))?.items).toEqual([])
  })

  it('orders a day by log time', async () => {
    await addMeal(draft({ name: 'Dinner', loggedAt: Date.parse('2026-05-10T19:00:00') }))
    await addMeal(draft({ name: 'Lunch', loggedAt: Date.parse('2026-05-10T13:00:00') }))
    await addMeal(draft({ name: 'Breakfast', loggedAt: Date.parse('2026-05-10T08:00:00') }))

    const names = (await getMealsForDate('2026-05-10')).map((meal) => meal.name)
    expect(names).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })

  it('keeps days separate', async () => {
    await addMeal(draft())
    await addMeal(draft({ date: '2026-05-11' }))

    expect(await getMealsForDate('2026-05-10')).toHaveLength(1)
    expect(await getMealsForDate('2026-05-09')).toEqual([])
  })

  it('updates fields without touching the food list', async () => {
    const id = await addMeal(draft())
    await updateMeal(id, { name: 'Brunch', notes: 'ate late' })

    const meal = await getMeal(id)
    expect(meal?.name).toBe('Brunch')
    expect(meal?.notes).toBe('ate late')
    expect(meal?.items).toHaveLength(2)
  })

  it('replaces the food list when items are supplied', async () => {
    const id = await addMeal(draft())
    await updateMeal(id, {
      items: [{ name: 'Oats', portion: '50g', calories: 190, protein_g: 6, carbs_g: 33, fat_g: 3 }],
    })

    const meal = await getMeal(id)
    expect(meal?.items.map((item) => item.name)).toEqual(['Oats'])
    // The replaced rows are really gone, not just detached.
    expect(await db.foodItems.count()).toBe(1)
  })

  it('rejects an update for a meal that does not exist', async () => {
    await expect(updateMeal(42, { name: 'Nope' })).rejects.toThrow(/No meal with id 42/)
  })

  it('deletes a meal and its foods', async () => {
    const id = await addMeal(draft())
    await deleteMeal(id)

    expect(await getMeal(id)).toBeUndefined()
    expect(await db.foodItems.count()).toBe(0)
  })

  it('leaves other meals alone on delete', async () => {
    const keep = await addMeal(draft({ name: 'Lunch' }))
    const drop = await addMeal(draft({ name: 'Dinner' }))
    await deleteMeal(drop)

    expect((await getMeal(keep))?.items).toHaveLength(2)
  })
})

describe('range queries', () => {
  beforeEach(async () => {
    await addMeal(draft({ date: '2026-05-09', name: 'Day 1' }))
    await addMeal(draft({ date: '2026-05-10', name: 'Day 2a' }))
    await addMeal(draft({ date: '2026-05-10', name: 'Day 2b', loggedAt: Date.parse('2026-05-10T20:00:00') }))
    await addMeal(draft({ date: '2026-05-12', name: 'Day 4' }))
  })

  it('includes both endpoints, in chronological order', async () => {
    const names = (await getMealsInRange('2026-05-09', '2026-05-10')).map((meal) => meal.name)
    expect(names).toEqual(['Day 1', 'Day 2a', 'Day 2b'])
  })

  it('excludes days outside the range', async () => {
    const names = (await getMealsInRange('2026-05-11', '2026-05-12')).map((meal) => meal.name)
    expect(names).toEqual(['Day 4'])
  })

  it('totals one day across its meals', async () => {
    expect((await totalsForDate('2026-05-10')).calories).toBe(460)
    expect((await totalsForDate('2026-05-11')).calories).toBe(0)
  })

  it('buckets totals per day and skips empty days', async () => {
    const totals = await dailyTotalsInRange('2026-05-09', '2026-05-12')

    expect([...totals.keys()]).toEqual(['2026-05-09', '2026-05-10', '2026-05-12'])
    expect(totals.get('2026-05-10')?.calories).toBe(460)
    expect(totals.get('2026-05-09')?.protein_g).toBe(15)
  })
})
