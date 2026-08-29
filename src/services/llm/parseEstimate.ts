// Turning whatever the model said into a MealEstimate.
//
// Everything here assumes the input is hostile: fenced, wrapped in prose,
// missing fields, strings where numbers belong, numbers where strings belong.
// The only outcomes are a valid estimate or an LLMError — never a throw the
// caller did not expect, and never a half-built object.
import { sanitizeFoodItem, sumTotals, type Confidence } from '../../db/index.ts'
import { LLMError, type EstimatedItem, type MealEstimate } from './types.ts'

const CONFIDENCES: Confidence[] = ['low', 'medium', 'high']

/**
 * Drop a ```json … ``` wrapper, or any prose either side of the JSON body.
 * Falls back to the span between the first `{` and the last `}` because
 * models like to introduce their answer.
 */
export function stripFences(raw: string): string {
  const text = raw.trim()

  const fenced = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(text)
  const inner = (fenced ? fenced[1] : text).trim()

  if (inner.startsWith('{') && inner.endsWith('}')) return inner

  const start = inner.indexOf('{')
  const end = inner.lastIndexOf('}')
  return start !== -1 && end > start ? inner.slice(start, end + 1) : inner
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accepts a number or a numeric string ("42", "3.5 g"). Anything else is 0. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * One food, or null when there is not enough of it to show. A nameless entry
 * is dropped rather than rendered as a blank row the owner has to name.
 */
function toItem(value: unknown): EstimatedItem | null {
  if (!isRecord(value)) return null
  const name = toText(value.name)
  if (name.length === 0) return null

  // Same clamping the database applies, so the Confirm screen shows exactly
  // the numbers that will be stored.
  return sanitizeFoodItem({
    name,
    portion: toText(value.portion),
    calories: toNumber(value.calories),
    protein_g: toNumber(value.protein_g),
    carbs_g: toNumber(value.carbs_g),
    fat_g: toNumber(value.fat_g),
  })
}

function toConfidence(value: unknown): Confidence {
  const text = toText(value).toLowerCase()
  // An unrecognised or missing value is treated as the least certain one.
  return (CONFIDENCES as string[]).includes(text) ? (text as Confidence) : 'low'
}

const BAD_OUTPUT = "The AI's answer didn't make sense. Try rewording it."

/**
 * Parse a model reply into a {@link MealEstimate}.
 * Throws {@link LLMError} of kind `bad-output` when nothing usable is left.
 */
export function parseMealEstimate(raw: string): MealEstimate {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    throw new LLMError('bad-output', BAD_OUTPUT)
  }

  if (!isRecord(parsed)) throw new LLMError('bad-output', BAD_OUTPUT)

  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items = rawItems.map(toItem).filter((item): item is EstimatedItem => item !== null)
  if (items.length === 0) {
    throw new LLMError('bad-output', "The AI didn't find any food in that. Try adding detail.")
  }

  const notes = toText(parsed.notes)

  return {
    items,
    // Derived, never read from the model: a total that disagreed with the
    // items would show one number and save another.
    total_calories: sumTotals(items).calories,
    confidence: toConfidence(parsed.confidence),
    notes: notes.length > 0 ? notes : undefined,
  }
}
