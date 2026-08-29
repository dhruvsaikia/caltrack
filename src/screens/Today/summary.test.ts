import { describe, expect, it } from 'vitest'
import { calorieSummary, macroBars } from './summary.ts'
import type { Target, Totals } from '../../db/index.ts'

const totals = (over: Partial<Totals> = {}): Totals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...over,
})

describe('calorieSummary', () => {
  it('reports what is left under the goal', () => {
    expect(calorieSummary(600, 2000)).toMatchObject({ remaining: 1400, over: 0, progress: 0.3 })
  })

  it('reports the overage once the goal is passed', () => {
    const summary = calorieSummary(2300, 2000)
    expect(summary).toMatchObject({ remaining: 0, over: 300 })
    expect(summary.progress).toBe(1)
  })

  it('treats an exactly-met goal as neither left nor over', () => {
    expect(calorieSummary(2000, 2000)).toMatchObject({ remaining: 0, over: 0, progress: 1 })
  })

  it('survives a missing or nonsense goal', () => {
    expect(calorieSummary(500, 0)).toMatchObject({ goal: 0, remaining: 0, progress: 0 })
    expect(calorieSummary(Number.NaN, 2000)).toMatchObject({ eaten: 0, remaining: 2000 })
  })
})

describe('macroBars', () => {
  it('fills against gram goals when the target sets them', () => {
    const target = { id: 1, effectiveFrom: '2026-08-29', dailyCalories: 2000, protein_g: 150 } as Target
    const [protein, carbs] = macroBars(totals({ protein_g: 75, carbs_g: 100 }), target)
    expect(protein).toMatchObject({ grams: 75, fraction: 0.5, hasGoal: true })
    // No carb goal, so the bar falls back to the day's mix: 100 of 175 grams.
    expect(carbs.hasGoal).toBe(false)
    expect(carbs.fraction).toBeCloseTo(100 / 175)
  })

  it('caps a bar at full when the goal is exceeded', () => {
    const target = { id: 1, effectiveFrom: '2026-08-29', dailyCalories: 2000, fat_g: 60 } as Target
    expect(macroBars(totals({ fat_g: 90 }), target)[2].fraction).toBe(1)
  })

  it('shows empty bars for a day with nothing logged', () => {
    expect(macroBars(totals()).map((bar) => bar.fraction)).toEqual([0, 0, 0])
  })
})
