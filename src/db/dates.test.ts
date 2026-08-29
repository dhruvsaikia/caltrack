import { describe, expect, it } from 'vitest'
import { addDays, dateRange, fromDateKey, isDateKey, toDateKey } from './dates.ts'

describe('date keys', () => {
  it('formats a local date, not a UTC one', () => {
    // 11pm local on the 5th must stay the 5th even when UTC has rolled over.
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  it('pads months and days', () => {
    expect(toDateKey(new Date(2026, 8, 3))).toBe('2026-09-03')
  })

  it('validates shape and realness', () => {
    expect(isDateKey('2026-02-28')).toBe(true)
    expect(isDateKey('2026-2-8')).toBe(false)
    expect(isDateKey('not-a-date')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
  })

  it('round-trips through a Date at local midnight', () => {
    const date = fromDateKey('2026-03-15')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(15)
    expect(toDateKey(date)).toBe('2026-03-15')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
    expect(dateRange('2026-01-05', '2026-01-05')).toEqual(['2026-01-05'])
    expect(dateRange('2026-01-05', '2026-01-04')).toEqual([])
  })
})
