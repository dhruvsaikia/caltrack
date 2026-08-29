import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'
import {
  DEFAULT_DAILY_CALORIES,
  deleteTarget,
  getAllTargets,
  getDailyCalorieTarget,
  getTargetForDate,
  setTarget,
} from './targets.ts'

beforeEach(async () => {
  await db.open()
  await db.targets.clear()
})

describe('targets', () => {
  it('falls back to the default before any target is set', async () => {
    expect(await getTargetForDate('2026-05-10')).toBeUndefined()
    expect(await getDailyCalorieTarget('2026-05-10')).toBe(DEFAULT_DAILY_CALORIES)
  })

  it('applies a target from its start date onward', async () => {
    await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2200 })

    expect(await getDailyCalorieTarget('2026-05-01')).toBe(2200)
    expect(await getDailyCalorieTarget('2026-06-30')).toBe(2200)
  })

  it('leaves earlier days on the older target', async () => {
    await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2200 })
    await setTarget({ effectiveFrom: '2026-05-15', dailyCalories: 1800 })

    expect(await getDailyCalorieTarget('2026-05-14')).toBe(2200)
    expect(await getDailyCalorieTarget('2026-05-15')).toBe(1800)
    expect(await getDailyCalorieTarget('2026-04-30')).toBe(DEFAULT_DAILY_CALORIES)
  })

  it('overwrites rather than duplicating a target for the same day', async () => {
    const first = await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2200 })
    const second = await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2000 })

    expect(second).toBe(first)
    expect(await getAllTargets()).toHaveLength(1)
    expect(await getDailyCalorieTarget('2026-05-02')).toBe(2000)
  })

  it('stores optional macro goals', async () => {
    await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2000, protein_g: 150 })
    expect((await getTargetForDate('2026-05-05'))?.protein_g).toBe(150)
  })

  it('rejects impossible goals', async () => {
    await expect(setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 0 })).rejects.toThrow(
      /positive number/,
    )
    await expect(setTarget({ effectiveFrom: 'May 1st', dailyCalories: 2000 })).rejects.toThrow(
      /Invalid target date/,
    )
    expect(await getAllTargets()).toEqual([])
  })

  it('lists targets oldest first and deletes them', async () => {
    await setTarget({ effectiveFrom: '2026-05-15', dailyCalories: 1800 })
    const older = await setTarget({ effectiveFrom: '2026-05-01', dailyCalories: 2200 })

    expect((await getAllTargets()).map((target) => target.effectiveFrom)).toEqual([
      '2026-05-01',
      '2026-05-15',
    ])

    await deleteTarget(older)
    expect(await getDailyCalorieTarget('2026-05-02')).toBe(DEFAULT_DAILY_CALORIES)
  })
})
