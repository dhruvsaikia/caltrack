import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  dailyTotalsInRange,
  getAllTargets,
  toDateKey,
  type DateKey,
  type Target,
  type Totals,
} from '../../db/index.ts'
import CalorieBars from './CalorieBars.tsx'
import {
  formatMonthHeading,
  monthSummary,
  streaks,
  weekSummary,
  type TrendsRange,
} from './trends.ts'

/**
 * Far enough back to be "everything". Best-streak needs the whole history, and
 * one indexed range scan over a personal app's meals is cheaper than paging.
 */
const BEGINNING_OF_TIME: DateKey = '2000-01-01'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">{children}</p>
  )
}

function RangeToggle({
  range,
  onChange,
}: {
  range: TrendsRange
  onChange: (range: TrendsRange) => void
}) {
  const options: { value: TrendsRange; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ]
  return (
    <div role="tablist" aria-label="Time range" className="flex rounded-xl bg-ink-800 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={range === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            range === option.value ? 'bg-ink-700 text-mist-100' : 'text-mist-500'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function StreakCard({ current, best }: { current: number; best: number }) {
  const unit = current === 1 ? 'day' : 'days'
  return (
    <section aria-label="Streak" className="flex items-center gap-5 rounded-2xl bg-ink-800 p-5">
      <span className="text-4xl font-bold tabular-nums text-accent">{current}</span>
      <div>
        <p className="text-base font-semibold text-mist-100">{unit} streak</p>
        <p className="mt-0.5 text-sm text-mist-500">
          {best > 0 ? `Best ${best} ${best === 1 ? 'day' : 'days'}` : 'Log a meal to start one'}
        </p>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-ink-800 px-3 py-4 text-center">
      <p className="text-xl font-semibold tabular-nums text-mist-100">{value}</p>
      <p className="mt-1 text-xs text-mist-500">{label}</p>
    </div>
  )
}

export default function TrendsScreen({
  date = toDateKey(),
  reloadKey = 0,
}: {
  /** Day to treat as today. Defaults to today; passed in so tests can pin it. */
  date?: DateKey
  /** Bump to re-read the database after a save or delete elsewhere. */
  reloadKey?: number
}) {
  const [range, setRange] = useState<TrendsRange>('week')
  const [totals, setTotals] = useState<Map<DateKey, Totals>>(new Map())
  const [targets, setTargets] = useState<Target[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    try {
      const [daily, allTargets] = await Promise.all([
        dailyTotalsInRange(BEGINNING_OF_TIME, date),
        getAllTargets(),
      ])
      setTotals(daily)
      setTargets(allTargets)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const summary = useMemo(
    () =>
      range === 'week' ? weekSummary(totals, targets, date) : monthSummary(totals, targets, date),
    [range, totals, targets, date],
  )
  const streak = useMemo(() => streaks(totals.keys(), date), [totals, date])

  if (status === 'error') {
    return (
      <div className="px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
        <h1 className="text-4xl font-bold tracking-tight text-mist-100">Trends</h1>
        <p role="alert" className="mt-8 text-center text-sm text-mist-300">
          Couldn't read your meals from this device.
        </p>
      </div>
    )
  }

  return (
    <div
      className={status === 'loading' ? 'px-6 opacity-0' : 'px-6'}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
    >
      <header className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>{range === 'week' ? 'This week' : formatMonthHeading(summary.start)}</Eyebrow>
          <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-mist-100">Trends</h1>
        </div>
        <RangeToggle range={range} onChange={setRange} />
      </header>

      <div className="mt-8">
        <StreakCard current={streak.current} best={streak.best} />
      </div>

      <section aria-label="Daily intake" className="mt-9">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Daily intake</Eyebrow>
          <p className="text-sm text-mist-500">
            {summary.daysLogged === 0 ? (
              'no meals logged yet'
            ) : (
              <>
                avg{' '}
                <span className="font-semibold tabular-nums text-mist-100">
                  {summary.averageCalories}
                </span>{' '}
                kcal
              </>
            )}
          </p>
        </div>

        <div className="mt-5">
          <CalorieBars
            summary={summary}
            labelInterval={range === 'week' ? 1 : 5}
            height={range === 'week' ? 220 : 190}
          />
        </div>

        <p className="mt-3 text-xs text-mist-500">
          {summary.goalVaries
            ? 'Dashed line: your most recent goal — it changed during this range.'
            : `Dashed line: your ${summary.goalLine} kcal daily goal.`}
        </p>

        {/* The chart is pixels; this is the same information for a screen reader. */}
        <ul className="sr-only">
          {summary.points
            .filter((point) => !point.isFuture)
            .map((point) => (
              <li key={point.date}>
                {point.date}: {point.logged ? `${point.calories} kcal` : 'nothing logged'}
              </li>
            ))}
        </ul>
      </section>

      {range === 'month' && (
        <section aria-label="This month" className="mt-8 flex gap-3">
          <Stat
            value={summary.daysLogged === 0 ? '—' : String(summary.averageCalories)}
            label="avg kcal"
          />
          <Stat value={`${summary.daysLogged}/${summary.daysElapsed}`} label="days logged" />
          <Stat value={String(summary.daysWithinGoal)} label="within goal" />
        </section>
      )}
    </div>
  )
}
