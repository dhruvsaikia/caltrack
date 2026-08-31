import { Bar, BarChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import usePrefersReducedMotion from '../../components/usePrefersReducedMotion.ts'
import type { DayPoint, RangeSummary } from './trends.ts'

/** Height of the flat marker drawn for a day with nothing logged. */
const RAIL = 3

const COLORS = {
  bar: 'var(--color-ink-500)',
  today: 'var(--color-accent)',
  over: 'var(--color-warn)',
  rail: 'var(--color-ink-600)',
  goal: 'var(--color-ink-500)',
}

function barColor(point: DayPoint): string {
  if ((point.calories ?? 0) > point.goal) return COLORS.over
  if (point.isToday) return COLORS.today
  return COLORS.bar
}

/**
 * Recharts hands a shape whatever props it computed for the bar. Only these
 * matter here, and `payload` is the original {@link DayPoint}.
 */
type ShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: DayPoint
}

/**
 * One day. A logged day is a rounded column; a day with nothing logged is a
 * thin rail on the baseline, so a gap in the data reads as a gap rather than
 * as a very light day. Future days in the current week get nothing at all.
 */
function DayBar(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as ShapeProps
  if (!payload || payload.isFuture) return <g />

  const baseline = y + height
  if (!payload.logged) {
    return (
      <rect
        x={x}
        y={baseline - RAIL}
        width={width}
        height={RAIL}
        rx={RAIL / 2}
        fill={payload.isToday ? COLORS.today : COLORS.rail}
      />
    )
  }

  // Never let a real but tiny day collapse into something thinner than the
  // "nothing logged" rail — the two must stay tellable apart.
  const drawn = Math.max(height, RAIL)
  return (
    <rect
      x={x}
      y={baseline - drawn}
      width={width}
      height={drawn}
      rx={Math.min(4, width / 2)}
      fill={barColor(payload)}
    />
  )
}

type TickProps = { x?: number; y?: number; payload?: { value?: string; index?: number } }

/** Axis labels. Today is picked out in white, as in the design. */
function dayTick(points: DayPoint[], interval: number) {
  return function DayTick(props: unknown) {
    const { x = 0, y = 0, payload } = props as TickProps
    const index = payload?.index ?? 0
    const point = points[index]
    if (!point) return <g />
    const isEdge = index === 0 || index === points.length - 1
    if (interval > 1 && !point.isToday && !isEdge && index % interval !== 0) return <g />

    return (
      <text
        x={x}
        y={y + 14}
        textAnchor="middle"
        fontSize={12}
        fontWeight={point.isToday ? 600 : 500}
        fill={
          point.isToday
            ? 'var(--color-mist-100)'
            : point.isFuture
              ? 'var(--color-ink-500)'
              : 'var(--color-accent-soft)'
        }
      >
        {payload?.value}
      </text>
    )
  }
}

export default function CalorieBars({
  summary,
  /** Label every Nth day. Month view is too dense to label all 31. */
  labelInterval = 1,
  height = 220,
}: {
  summary: RangeSummary
  labelInterval?: number
  height?: number
}) {
  const reducedMotion = usePrefersReducedMotion()
  const { points, goalLine } = summary

  // Recharts skips a null value entirely, so unlogged days ride along at 0 and
  // the shape decides how to draw them. The headroom keeps the tallest bar off
  // the top edge and keeps the goal line on-screen on a very light week.
  const data = points.map((point) => ({ ...point, value: point.calories ?? 0 }))
  const peak = Math.max(goalLine, ...data.map((point) => point.value))
  // A week gets the design's wide columns; a month has to fit 31 of them, so
  // it takes whatever width is left after a much tighter gap.
  const dense = points.length > 10

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap={dense ? '14%' : '22%'}
        >
          <YAxis hide domain={[0, Math.round(peak * 1.15) || 100]} />
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={dayTick(points, labelInterval)}
            height={26}
          />
          <ReferenceLine
            y={goalLine}
            stroke={COLORS.goal}
            strokeWidth={1}
            strokeDasharray="2 4"
            ifOverflow="extendDomain"
          />
          <Bar
            dataKey="value"
            shape={DayBar}
            barSize={dense ? undefined : 30}
            isAnimationActive={!reducedMotion}
            animationDuration={400}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
