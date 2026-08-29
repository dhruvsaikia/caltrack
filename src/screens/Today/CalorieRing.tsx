import type { CalorieSummary } from './summary.ts'

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Remaining-calories dial. The track is always drawn; the accent arc sweeps
 * clockwise from the top as the day fills up, and turns amber once the goal
 * is passed.
 */
export default function CalorieRing({ summary }: { summary: CalorieSummary }) {
  const isOver = summary.over > 0
  const value = isOver ? summary.over : summary.remaining
  const label = isOver ? 'kcal over' : 'kcal left'

  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke="var(--color-ink-600)"
          strokeWidth="12"
        />
        {summary.progress > 0 && (
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke={isOver ? 'var(--color-warn)' : 'var(--color-accent)'}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - summary.progress)}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        )}
      </svg>

      <div className="flex flex-col items-center">
        <span
          className={`text-6xl font-semibold tracking-tight tabular-nums ${
            isOver ? 'text-warn' : 'text-mist-100'
          }`}
        >
          {value}
        </span>
        <span className="mt-1 text-sm text-mist-500">{label}</span>
      </div>
    </div>
  )
}
