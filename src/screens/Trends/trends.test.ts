import { describe, expect, it } from 'vitest'
import {
  buildPoints,
  endOfMonth,
  goalForDate,
  monthSummary,
  startOfMonth,
  startOfWeek,
  streaks,
  weekSummary,
  type DailyTotals,
} from './trends.ts'
import { DEFAULT_DAILY_CALORIES, type DateKey, type Target } from '../../db/index.ts'

/** Build the `dailyTotalsInRange` shape from `{ day: calories }`. */
const totalsOf = (days: Record<DateKey, number>): DailyTotals =>
  new Map(
    Object.entries(days).map(([date, calories]) => [
      date,
      { calories, protein_g: 0, carbs_g: 0, fat_g: 0 },
    ]),
  )

const target = (effectiveFrom: DateKey, dailyCalories: number, id = 1): Target => ({
  id,
  effectiveFrom,
  dailyCalories,
})

describe('goalForDate', () => {
  it('falls back to the default when no target has been set', () => {
    expect(goalForDate([], '2026-08-31')).toBe(DEFAULT_DAILY_CALORIES)
  })

  it('uses the latest target starting on or before the day', () => {
    const targets = [target('2026-08-10', 2200, 1), target('2026-08-20', 1800, 2)]
    expect(goalForDate(targets, '2026-08-19')).toBe(2200)
    expect(goalForDate(targets, '2026-08-20')).toBe(1800)
    expect(goalForDate(targets, '2026-09-01')).toBe(1800)
  })

  it('ignores targets that had not taken effect yet', () => {
    expect(goalForDate([target('2026-08-20', 1800)], '2026-08-01')).toBe(DEFAULT_DAILY_CALORIES)
  })
})

describe('week and month boundaries', () => {
  it('starts the week on Monday', () => {
    // 2026-08-31 is a Monday; 2026-09-06 the Sunday that closes that week.
    expect(startOfWeek('2026-08-31')).toBe('2026-08-31')
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31')
    expect(startOfWeek('2026-09-02')).toBe('2026-08-31')
  })

  it('walks a week back across a month boundary', () => {
    expect(startOfWeek('2026-09-01')).toBe('2026-08-31')
  })

  it('finds the last day of months of every length', () => {
    expect(startOfMonth('2026-02-14')).toBe('2026-02-01')
    expect(endOfMonth('2026-02-14')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-14')).toBe('2024-02-29') // leap year
    expect(endOfMonth('2026-04-14')).toBe('2026-04-30')
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31')
  })
})

describe('buildPoints', () => {
  it('marks unlogged days as absent rather than zero', () => {
    const points = buildPoints(
      '2026-08-31',
      '2026-09-02',
      totalsOf({ '2026-08-31': 1900 }),
      [],
      '2026-09-01',
      () => 'x',
    )
    expect(points.map((point) => point.calories)).toEqual([1900, null, null])
    expect(points.map((point) => point.logged)).toEqual([true, false, false])
  })

  it('keeps a logged day that came to zero calories', () => {
    const [point] = buildPoints(
      '2026-08-31',
      '2026-08-31',
      totalsOf({ '2026-08-31': 0 }),
      [],
      '2026-08-31',
      () => 'x',
    )
    expect(point).toMatchObject({ logged: true, calories: 0 })
  })

  it('flags today and the days after it', () => {
    const points = buildPoints('2026-08-30', '2026-09-01', new Map(), [], '2026-08-31', () => 'x')
    expect(points.map((point) => point.isToday)).toEqual([false, true, false])
    expect(points.map((point) => point.isFuture)).toEqual([false, false, true])
  })

  it('gives each day the goal that was in force that day', () => {
    const points = buildPoints(
      '2026-08-30',
      '2026-08-31',
      new Map(),
      [target('2026-08-31', 1800)],
      '2026-08-31',
      () => 'x',
    )
    expect(points.map((point) => point.goal)).toEqual([DEFAULT_DAILY_CALORIES, 1800])
  })
})

describe('weekSummary', () => {
  const targets = [target('2026-01-01', 2000)]

  it('covers Monday to Sunday of the week containing today', () => {
    const summary = weekSummary(new Map(), targets, '2026-09-02')
    expect(summary.start).toBe('2026-08-31')
    expect(summary.end).toBe('2026-09-06')
    expect(summary.points).toHaveLength(7)
  })

  it('averages logged days only, ignoring the gaps', () => {
    const summary = weekSummary(
      totalsOf({ '2026-08-31': 1800, '2026-09-02': 2200 }),
      targets,
      '2026-09-02',
    )
    expect(summary.daysLogged).toBe(2)
    expect(summary.averageCalories).toBe(2000)
    // Mon–Wed have passed; Thu–Sun have not.
    expect(summary.daysElapsed).toBe(3)
  })

  it("counts days at or under that day's goal as within it", () => {
    const summary = weekSummary(
      totalsOf({ '2026-08-31': 2000, '2026-09-01': 2001, '2026-09-02': 1200 }),
      targets,
      '2026-09-02',
    )
    expect(summary.daysWithinGoal).toBe(2)
  })

  it('reports zeros for an empty week without dividing by zero', () => {
    const summary = weekSummary(new Map(), targets, '2026-09-02')
    expect(summary).toMatchObject({ averageCalories: 0, daysLogged: 0, daysWithinGoal: 0 })
  })

  it('flags a goal that changed mid-range and lines up on the latest one', () => {
    const changed = [target('2026-01-01', 2000, 1), target('2026-09-01', 1700, 2)]
    const summary = weekSummary(new Map(), changed, '2026-09-02')
    expect(summary.goalVaries).toBe(true)
    expect(summary.goalLine).toBe(1700)
    expect(weekSummary(new Map(), targets, '2026-09-02')).toMatchObject({
      goalVaries: false,
      goalLine: 2000,
    })
  })
})

describe('monthSummary', () => {
  it('covers every day of the month containing today', () => {
    const summary = monthSummary(new Map(), [], '2026-02-14')
    expect(summary.start).toBe('2026-02-01')
    expect(summary.end).toBe('2026-02-28')
    expect(summary.points).toHaveLength(28)
    expect(summary.points.at(-1)?.label).toBe('28')
  })

  it('ignores meals logged in a neighbouring month', () => {
    const summary = monthSummary(
      totalsOf({ '2026-07-31': 9999, '2026-08-01': 1500, '2026-09-01': 9999 }),
      [],
      '2026-08-31',
    )
    expect(summary.daysLogged).toBe(1)
    expect(summary.averageCalories).toBe(1500)
  })
})

describe('streaks', () => {
  const today = '2026-08-31'

  it('returns zeros for an empty database', () => {
    expect(streaks([], today)).toEqual({ current: 0, best: 0 })
  })

  it('counts a first-ever day logged today as a streak of one', () => {
    expect(streaks([today], today)).toEqual({ current: 1, best: 1 })
  })

  it('keeps the streak alive when today has nothing logged yet', () => {
    expect(streaks(['2026-08-29', '2026-08-30'], today)).toEqual({ current: 2, best: 2 })
  })

  it('breaks the streak when yesterday is missing too', () => {
    expect(streaks(['2026-08-27', '2026-08-28', '2026-08-29'], today)).toEqual({
      current: 0,
      best: 3,
    })
  })

  it('counts only the run touching today, but remembers the best one', () => {
    expect(
      streaks(
        ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-30', '2026-08-31'],
        today,
      ),
    ).toEqual({ current: 2, best: 4 })
  })

  it('runs across a month boundary', () => {
    expect(streaks(['2026-07-30', '2026-07-31', '2026-08-01'], '2026-08-01')).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('is unmoved by duplicate days or an out-of-order list', () => {
    expect(streaks(['2026-08-31', '2026-08-30', '2026-08-31'], today)).toEqual({
      current: 2,
      best: 2,
    })
  })

  it('ignores a meal mis-dated into the future', () => {
    expect(streaks(['2026-09-05', '2026-08-31'], today)).toEqual({ current: 1, best: 1 })
  })
})
