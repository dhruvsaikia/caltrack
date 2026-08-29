import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'
import { getAllSettings, getSetting, getSettingOr, removeSetting, setSetting } from './settings.ts'

beforeEach(async () => {
  await db.open()
  await db.settings.clear()
})

describe('settings', () => {
  it('returns undefined for an unset key', async () => {
    expect(await getSetting('provider')).toBeUndefined()
    expect(await getSettingOr('provider', 'anthropic')).toBe('anthropic')
  })

  it('stores and reads a value', async () => {
    await setSetting('provider', 'gemini')
    expect(await getSetting('provider')).toBe('gemini')
    expect(await getSettingOr('provider', 'anthropic')).toBe('gemini')
  })

  it('overwrites instead of adding a second row', async () => {
    await setSetting('provider', 'anthropic')
    await setSetting('provider', 'gemini')

    expect(await db.settings.count()).toBe(1)
    expect(await getSetting('provider')).toBe('gemini')
  })

  it('handles non-string values', async () => {
    await setSetting('lastBackupAt', 1767225600000)
    await setSetting('hasPersistedStorage', false)

    expect(await getSetting('lastBackupAt')).toBe(1767225600000)
    expect(await getSetting('hasPersistedStorage')).toBe(false)
    expect(await getSettingOr('hasPersistedStorage', true)).toBe(false)
  })

  it('removes a key', async () => {
    await setSetting('provider', 'gemini')
    await removeSetting('provider')
    expect(await getSetting('provider')).toBeUndefined()
  })

  it('exports everything as a plain object', async () => {
    await setSetting('provider', 'anthropic')
    await setSetting('lastBackupAt', 42)

    expect(await getAllSettings()).toEqual({ provider: 'anthropic', lastBackupAt: 42 })
  })
})
