import type { ProviderId } from '../keyVault.ts'
import { AnthropicProvider } from './anthropic.ts'
import { LLMError, type LLMProvider } from './types.ts'

export * from './types.ts'
export { parseMealEstimate, stripFences, type ParseOptions } from './parseEstimate.ts'
export { AnthropicProvider } from './anthropic.ts'

/**
 * The provider that handles text parsing for a given choice.
 *
 * Gemini is a listed provider because it will do voice transcription later,
 * but nothing implements text parsing for it yet — saying so plainly beats
 * silently using Anthropic with the owner's Gemini key.
 */
export function getTextProvider(provider: ProviderId): LLMProvider {
  if (provider === 'anthropic') return AnthropicProvider
  throw new LLMError(
    'unsupported',
    'Text estimates use Anthropic right now. Switch provider in Settings.',
  )
}

/** The provider that looks at photos. Same story as text: Anthropic only. */
export function getImageProvider(provider: ProviderId): LLMProvider {
  if (provider === 'anthropic') return AnthropicProvider
  throw new LLMError(
    'unsupported',
    'Photo estimates use Anthropic right now. Switch provider in Settings.',
  )
}
