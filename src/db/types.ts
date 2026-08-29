// Data model for CalTrack. Everything lives on-device in IndexedDB; these
// types are the single source of truth for what a stored record looks like.

/** How a meal got into the app. */
export type MealSource = 'manual' | 'text' | 'photo' | 'voice'

/** How sure the model was about an AI estimate. Absent for manual entries. */
export type Confidence = 'low' | 'medium' | 'high'

/** A local calendar day, `YYYY-MM-DD`. Never a UTC timestamp. */
export type DateKey = string

/** One food inside a meal. Macros are grams, calories are kcal. */
export interface FoodItem {
  id: number
  mealId: number
  name: string
  portion: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/** A logged meal. Its nutrition is the sum of its {@link FoodItem}s. */
export interface Meal {
  id: number
  /** Local day the meal counts toward. */
  date: DateKey
  /** Epoch ms the meal was recorded, for ordering within a day. */
  loggedAt: number
  name: string
  source: MealSource
  confidence?: Confidence
  notes?: string
}

/** A meal joined with its foods — what screens actually render. */
export interface MealWithItems extends Meal {
  items: FoodItem[]
}

/** A meal plus its foods, before either has an id. */
export interface MealDraft extends Omit<Meal, 'id'> {
  items: Omit<FoodItem, 'id' | 'mealId'>[]
}

/** Summed nutrition across a set of foods. */
export interface Totals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/**
 * A daily calorie/macro goal that applies from `effectiveFrom` onward, until
 * a later target supersedes it. Keeping history means past days keep the goal
 * they were actually judged against.
 */
export interface Target {
  id: number
  effectiveFrom: DateKey
  dailyCalories: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
}

/**
 * Non-secret app preferences, stored as one key/value row each.
 * API keys are NOT here — they live in localStorage only (see CLAUDE.md).
 */
export interface SettingsMap {
  provider: 'anthropic' | 'gemini'
  lastBackupAt: number
  hasPersistedStorage: boolean
}

export type SettingKey = keyof SettingsMap

export interface SettingRow<K extends SettingKey = SettingKey> {
  key: K
  value: SettingsMap[K]
}
