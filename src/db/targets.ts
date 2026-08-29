import { db } from './db.ts'
import { isDateKey, toDateKey } from './dates.ts'
import type { DateKey, Target } from './types.ts'

/** Used until the owner sets a goal in Settings. */
export const DEFAULT_DAILY_CALORIES = 2000

/**
 * Set (or replace) the goal that takes effect on `effectiveFrom`. Earlier days
 * keep whichever target was in force then.
 */
export async function setTarget(
  target: Omit<Target, 'id' | 'effectiveFrom'> & { effectiveFrom?: DateKey },
): Promise<number> {
  const effectiveFrom = target.effectiveFrom ?? toDateKey()
  if (!isDateKey(effectiveFrom)) throw new Error(`Invalid target date: ${effectiveFrom}`)
  if (!Number.isFinite(target.dailyCalories) || target.dailyCalories <= 0) {
    throw new Error('Daily calorie target must be a positive number')
  }

  return db.transaction('rw', db.targets, async () => {
    const existing = await db.targets.where('effectiveFrom').equals(effectiveFrom).first()
    if (existing) {
      await db.targets.update(existing.id, { ...target, effectiveFrom })
      return existing.id
    }
    return db.targets.add({ ...target, effectiveFrom })
  })
}

/** The goal in force on `date` — the latest one starting on or before it. */
export async function getTargetForDate(date: DateKey = toDateKey()): Promise<Target | undefined> {
  return db.targets.where('effectiveFrom').belowOrEqual(date).last()
}

/** Calorie goal for `date`, falling back to {@link DEFAULT_DAILY_CALORIES}. */
export async function getDailyCalorieTarget(date: DateKey = toDateKey()): Promise<number> {
  const target = await getTargetForDate(date)
  return target?.dailyCalories ?? DEFAULT_DAILY_CALORIES
}

export async function getAllTargets(): Promise<Target[]> {
  return db.targets.orderBy('effectiveFrom').toArray()
}

export async function deleteTarget(id: number): Promise<void> {
  await db.targets.delete(id)
}
