import type { MacroBar } from './summary.ts'

/** The three macro chips under the ring. */
export default function MacroBars({ bars }: { bars: MacroBar[] }) {
  // A goal suffix won't fit beside the label at phone width, so chips that show
  // one drop the number onto its own line. The whole row switches together —
  // mixed layouts across the three chips read as broken rather than deliberate.
  const stacked = bars.some((bar) => bar.hasGoal)

  return (
    <ul className="grid grid-cols-3 gap-3">
      {bars.map((bar) => (
        <li key={bar.key} className="rounded-2xl bg-ink-700/70 px-3.5 py-3">
          <div className={stacked ? undefined : 'flex items-baseline justify-between gap-2'}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">
              {bar.label}
            </span>
            <span
              className={`text-sm font-semibold tabular-nums text-mist-100 ${
                stacked ? 'mt-1 block' : ''
              }`}
            >
              {bar.grams}
              {bar.hasGoal ? (
                <span className="text-[11px] font-semibold text-mist-500"> / {bar.goal}g</span>
              ) : (
                'g'
              )}
            </span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink-500/70">
            <div
              className="h-full rounded-full bg-accent/80 transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(bar.fraction * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
