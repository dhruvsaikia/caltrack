// Pure aggregation for the Trends screen. Everything here works on
// `YYYY-MM-DD` local day keys and plain numbers, so the bucketing, the
// averages and the streak rules can be unit-tested without a database or a
// chart. Nothing in this file ever re-derives a day from an epoch timestamp:
// crossing a timezone boundary that way is exactly how a meal ends up on the
// wrong bar.
import {
  addDays,
  dateRange,
  fromDateKey,
  toDateKey,
  DEFAULT_DAILY_CALORIES,
  type DateKey,
  type Target,
  type Totals,
} from '../../db/index.ts'

/** Calories per day, as produced by `dailyTotalsInRange`. */
export type DailyTotals = ReadonlyMap<DateKey, Totals>

export type TrendsRange = 'week' | 'month'

/** One bar. `calories` is null for a day with nothing logged — an unlogged
 *  day is an absence, not a zero, and the chart draws it differently. */
export interface DayPoint {
  date: DateKey
  calories: number | null
  /** The goal that was in force on this specific day. */
  goal: number
  /** Short axis label: a weekday initial in week view, a date in month view. */
  label: string
  logged: boolean
  isToday: boolean
  /** A day later than today — blank, and excluded from every statistic. */
  isFuture: boolean
}

export interface RangeSummary {
  points: DayPoint[]
  start: DateKey
  end: DateKey
  /** Mean calories across logged days only. 0 when nothing is logged. */
  averageCalories: number
  daysLogged: number
  /** Logged days whose calories landed at or under that day's goal. */
  daysWithinGoal: number
  /** Days in the range up to and including today. */
  daysElapsed: number
  /** Goal to draw the reference line at — the one in force on the last day. */
  goalLine: number
  /** True when the goal changed inside the range, so one line can't tell the
   *  whole story. The screen says so rather than quietly drawing one. */
  goalVaries: boolean
}

export interface Streaks {
  /** Consecutive logged days ending today or yesterday. */
  current: number
  /** Longest run of consecutive logged days ever recorded. */
  best: number
}

/**
 * The goal in force on `date`: the latest target starting on or before it.
 * `targets` may be in any order.
 */
export function goalForDate(targets: readonly Target[], date: DateKey): number {
  let best: Target | undefined
  for (const target of targets) {
    if (target.effectiveFrom > date) continue
    if (!best || target.effectiveFrom > best.effectiveFrom) best = target
  }
  return best?.dailyCalories ?? DEFAULT_DAILY_CALORIES
}

/** Monday of the week containing `date`. The mockup's bars read M–S. */
export function startOfWeek(date: DateKey): DateKey {
  const weekday = fromDateKey(date).getDay() // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7))
}

export function startOfMonth(date: DateKey): DateKey {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: DateKey): DateKey {
  const first = fromDateKey(startOfMonth(date))
  // Day 0 of the next month is the last day of this one.
  return toDateKey(new Date(first.getFullYear(), first.getMonth() + 1, 0))
}

/** `M`, `T`, `W`… — locale-aware so it isn't hard-coded English. */
function weekdayInitial(date: DateKey): string {
  return fromDateKey(date).toLocaleDateString(undefined, { weekday: 'narrow' })
}

/** Turn a span of days into bars, resolving each day's own goal. */
export function buildPoints(
  start: DateKey,
  end: DateKey,
  totals: DailyTotals,
  targets: readonly Target[],
  today: DateKey,
  labelFor: (date: DateKey) => string,
): DayPoint[] {
  return dateRange(start, end).map((date) => {
    const calories = totals.get(date)?.calories
    // A stored day with 0 kcal (every food deleted) still counts as logged;
    // only a missing day is an absence.
    const logged = calories !== undefined
    return {
      date,
      calories: logged ? calories : null,
      goal: goalForDate(targets, date),
      label: labelFor(date),
      logged,
      isToday: date === today,
      isFuture: date > today,
    }
  })
}

function summarize(points: DayPoint[], start: DateKey, end: DateKey): RangeSummary {
  const logged = points.filter((point) => point.logged)
  const sum = logged.reduce((total, point) => total + (point.calories ?? 0), 0)
  const past = points.filter((point) => !point.isFuture)
  const goals = new Set(past.map((point) => point.goal))
  const lastGoal = past.at(-1)?.goal ?? points.at(-1)?.goal ?? DEFAULT_DAILY_CALORIES

  return {
    points,
    start,
    end,
    averageCalories: logged.length === 0 ? 0 : Math.round(sum / logged.length),
    daysLogged: logged.length,
    daysWithinGoal: logged.filter((point) => (point.calories ?? 0) <= point.goal).length,
    daysElapsed: past.length,
    goalLine: lastGoal,
    goalVaries: goals.size > 1,
  }
}

/** Monday–Sunday of the week containing `today`. */
export function weekSummary(
  totals: DailyTotals,
  targets: readonly Target[],
  today: DateKey = toDateKey(),
): RangeSummary {
  const start = startOfWeek(today)
  const end = addDays(start, 6)
  return summarize(buildPoints(start, end, totals, targets, today, weekdayInitial), start, end)
}

/** Every day of the calendar month containing `today`. */
export function monthSummary(
  totals: DailyTotals,
  targets: readonly Target[],
  today: DateKey = toDateKey(),
): RangeSummary {
  const start = startOfMonth(today)
  const end = endOfMonth(today)
  const label = (date: DateKey) => String(Number(date.slice(8)))
  return summarize(buildPoints(start, end, totals, targets, today, label), start, end)
}

/**
 * Current and best run of consecutive logged days.
 *
 * The current streak may end today *or* yesterday: a day that simply hasn't
 * been eaten through yet shouldn't read as a broken streak at breakfast.
 */
export function streaks(dates: Iterable<DateKey>, today: DateKey = toDateKey()): Streaks {
  // Ignore anything in the future — a mis-dated meal shouldn't inflate a run.
  const logged = new Set([...dates].filter((date) => date <= today))
  if (logged.size === 0) return { current: 0, best: 0 }

  const sorted = [...logged].sort()
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] === addDays(sorted[i - 1], 1) ? run + 1 : 1
    if (run > best) best = run
  }

  const anchor = logged.has(today) ? today : logged.has(addDays(today, -1)) ? addDays(today, -1) : null
  let current = 0
  for (let date = anchor; date && logged.has(date); date = addDays(date, -1)) current += 1

  return { current, best }
}

/** `AUGUST 2026` — the eyebrow above the Trends heading in month view. */
export function formatMonthHeading(date: DateKey): string {
  return fromDateKey(date)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    .toUpperCase()
}
