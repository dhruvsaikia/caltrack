// Pure calorie/macro math for the Today screen. Kept out of the components so
// the numbers can be unit-tested without rendering anything.
import type { Target, Totals } from '../../db/index.ts'

export interface CalorieSummary {
  eaten: number
  goal: number
  /** Calories still available. 0 once the goal is met or passed. */
  remaining: number
  /** Calories past the goal. 0 while still under it. */
  over: number
  /** Share of the goal eaten, clamped to 0–1 so the ring never overdraws. */
  progress: number
}

export function calorieSummary(eaten: number, goal: number): CalorieSummary {
  const safeGoal = Number.isFinite(goal) && goal > 0 ? goal : 0
  const safeEaten = Number.isFinite(eaten) && eaten > 0 ? Math.round(eaten) : 0
  const difference = safeGoal - safeEaten
  return {
    eaten: safeEaten,
    goal: safeGoal,
    remaining: Math.max(difference, 0),
    over: Math.max(-difference, 0),
    progress: safeGoal === 0 ? 0 : Math.min(safeEaten / safeGoal, 1),
  }
}

export type MacroKey = 'protein_g' | 'carbs_g' | 'fat_g'

export interface MacroBar {
  key: MacroKey
  label: string
  grams: number
  /** Bar fill, 0–1. */
  fraction: number
  /** True when the fill is measured against a goal rather than the day's mix. */
  hasGoal: boolean
}

export const MACRO_LABELS: Record<MacroKey, string> = {
  protein_g: 'Protein',
  carbs_g: 'Carbs',
  fat_g: 'Fat',
}

/**
 * Bars for the three macros. When the day's target sets a gram goal the bar
 * measures progress toward it; otherwise there is nothing to aim at, so it
 * shows that macro's share of the day's total grams instead.
 */
export function macroBars(totals: Totals, target?: Target): MacroBar[] {
  const keys: MacroKey[] = ['protein_g', 'carbs_g', 'fat_g']
  const totalGrams = keys.reduce((sum, key) => sum + totals[key], 0)

  return keys.map((key) => {
    const grams = totals[key]
    const goal = target?.[key]
    const hasGoal = typeof goal === 'number' && goal > 0
    const fraction = hasGoal
      ? Math.min(grams / goal, 1)
      : totalGrams > 0
        ? grams / totalGrams
        : 0
    return { key, label: MACRO_LABELS[key], grams: Math.round(grams * 10) / 10, fraction, hasGoal }
  })
}

/** `SATURDAY, AUG 29` — the eyebrow above the Today heading. */
export function formatDayHeading(date: Date): string {
  return date
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase()
}

/** Local clock time a meal was logged, e.g. `8:14 AM`. */
export function formatLoggedAt(loggedAt: number): string {
  return new Date(loggedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
