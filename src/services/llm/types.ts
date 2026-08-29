// The contract every AI provider implements, plus the shape their answers are
// normalised into. Screens only ever see these types — never a raw HTTP
// response, and never anything provider-specific.
import type { Confidence, FoodItem } from '../../db/index.ts'
import type { ProviderId } from '../keyVault.ts'

/** One food the model identified. Same shape a stored food item takes. */
export type EstimatedItem = Omit<FoodItem, 'id' | 'mealId'>

/**
 * A normalised meal estimate. `total_calories` is always the sum of `items`,
 * recomputed on parse, so what the Confirm screen shows and what the database
 * later sums can never disagree.
 */
export interface MealEstimate {
  items: EstimatedItem[]
  total_calories: number
  confidence: Confidence
  /** The model's caveat, when it offered one. */
  notes?: string
}

/** What went wrong, for screens that want to react rather than just display. */
export type LLMErrorKind =
  | 'no-key'
  | 'unsupported'
  | 'network'
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'bad-output'

/**
 * A failure with a message that is safe to render as-is. Nothing that builds
 * one of these ever puts an API key in the message.
 */
export class LLMError extends Error {
  readonly kind: LLMErrorKind

  constructor(kind: LLMErrorKind, message: string) {
    super(message)
    this.name = 'LLMError'
    this.kind = kind
  }
}

export interface LLMProvider {
  readonly id: ProviderId
  readonly label: string
  /**
   * Turn a free-text meal description into a structured estimate.
   * Rejects with an {@link LLMError} for every expected failure.
   */
  estimateFromText(description: string, signal?: AbortSignal): Promise<MealEstimate>
}
