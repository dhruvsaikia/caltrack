// Placeholder Today screen (System 1). Values are static until the data
// system lands; nothing here reads or writes storage yet.
const GOAL = 1500
const EATEN = 0

const MACROS = [
  { label: 'Protein', grams: 0 },
  { label: 'Carbs', grams: 0 },
  { label: 'Fat', grams: 0 },
] as const

function formatToday(date: Date) {
  return date
    .toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase()
}

function CalorieRing({ remaining }: { remaining: number }) {
  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 200 200" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <circle
          cx="100"
          cy="100"
          r="92"
          fill="none"
          stroke="var(--color-ink-600)"
          strokeWidth="10"
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-6xl font-semibold tracking-tight text-mist-100 tabular-nums">
          {remaining}
        </span>
        <span className="mt-1 text-sm text-mist-500">kcal left</span>
      </div>
    </div>
  )
}

function MacroCard({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="rounded-2xl bg-ink-700/70 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">
          {label}
        </span>
        <span className="text-sm font-semibold text-mist-100 tabular-nums">{grams}g</span>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-ink-500/70" />
    </div>
  )
}

export default function TodayScreen() {
  const remaining = Math.max(GOAL - EATEN, 0)

  return (
    <div className="px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">
          {formatToday(new Date())}
        </p>
        <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-mist-100">Today</h1>
      </header>

      <section aria-label="Calories remaining" className="mt-10 flex flex-col items-center">
        <CalorieRing remaining={remaining} />
        <p className="mt-6 text-sm text-mist-500">
          <span className="font-semibold text-mist-100 tabular-nums">{EATEN}</span> eaten
          <span className="mx-3" />
          <span className="font-semibold text-mist-100 tabular-nums">{GOAL}</span> goal
        </p>
      </section>

      <section aria-label="Macros" className="mt-6 grid grid-cols-3 gap-3">
        {MACROS.map((macro) => (
          <MacroCard key={macro.label} label={macro.label} grams={macro.grams} />
        ))}
      </section>

      <section aria-label="Meals" className="mt-14 flex flex-col items-center">
        <div className="h-14 w-14 rounded-full border border-dashed border-ink-500" />
        <p className="mt-5 text-base text-mist-300">Nothing logged yet</p>
        <button
          type="button"
          className="mt-5 rounded-xl border border-accent/60 px-6 py-3 text-base font-medium text-accent transition active:scale-[0.98]"
        >
          Log your first meal
        </button>
      </section>
    </div>
  )
}
