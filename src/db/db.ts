import Dexie, { type EntityTable } from 'dexie'
import type { FoodItem, Meal, SettingRow, Target } from './types.ts'

/**
 * The on-device database. IndexedDB is the source of truth for meal data;
 * nothing is synced anywhere.
 *
 * Indexes:
 *  - meals.date        → fetch a day / a range for Today and Trends
 *  - meals.loggedAt    → order within a day
 *  - foodItems.mealId  → join a meal to its foods
 *  - targets.effectiveFrom → find the goal in force on a given day
 */
export class CalTrackDB extends Dexie {
  meals!: EntityTable<Meal, 'id'>
  foodItems!: EntityTable<FoodItem, 'id'>
  targets!: EntityTable<Target, 'id'>
  settings!: EntityTable<SettingRow, 'key'>

  constructor(name = 'caltrack') {
    super(name)
    this.version(1).stores({
      meals: '++id, date, loggedAt, source',
      foodItems: '++id, mealId, name',
      targets: '++id, &effectiveFrom',
      settings: '&key',
    })
  }
}

export const db = new CalTrackDB()

/**
 * Ask the browser not to evict our data under storage pressure. Safe to call
 * on every launch; browsers may grant, deny, or ignore it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Whether the browser has already promised not to evict our data. */
export async function isPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}
