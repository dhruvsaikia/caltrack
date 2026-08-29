import { db } from './db.ts'
import type { SettingKey, SettingsMap } from './types.ts'

/**
 * Non-secret preferences. API keys never come through here — they stay in
 * localStorage on the device (see CLAUDE.md).
 */
export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingsMap[K] | undefined> {
  const row = await db.settings.get(key)
  return row?.value as SettingsMap[K] | undefined
}

export async function getSettingOr<K extends SettingKey>(
  key: K,
  fallback: SettingsMap[K],
): Promise<SettingsMap[K]> {
  return (await getSetting(key)) ?? fallback
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  await db.settings.put({ key, value })
}

export async function removeSetting(key: SettingKey): Promise<void> {
  await db.settings.delete(key)
}

/** Every stored preference as a plain object — handy for JSON export later. */
export async function getAllSettings(): Promise<Partial<SettingsMap>> {
  const rows = await db.settings.toArray()
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<SettingsMap>
}
