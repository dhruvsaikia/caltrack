import type { DateKey } from './types.ts'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Local-calendar day key for a date. Uses local parts on purpose: a meal at
 * 11pm belongs to that evening, not to the next UTC day.
 */
export function toDateKey(date: Date = new Date()): DateKey {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isDateKey(value: string): value is DateKey {
  return DATE_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`))
}

/** Local midnight for a day key. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** `key` shifted by `days` (may be negative), still a local day key. */
export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Inclusive list of day keys from `start` to `end`. Empty if end < start. */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  const keys: DateKey[] = []
  for (let key = start; key <= end; key = addDays(key, 1)) keys.push(key)
  return keys
}
