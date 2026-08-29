// Anthropic, called straight from the browser.
//
// This is only acceptable because CalTrack is a bring-your-own-key personal
// app: the key is the owner's own, it lives in localStorage on their device,
// and no server of ours ever sees it. The key is read at call time, put in a
// header, and never stored, logged, or included in an error message.
import { getApiKey } from '../keyVault.ts'
import { parseMealEstimate } from './parseEstimate.ts'
import { LLMError, type LLMProvider, type MealEstimate } from './types.ts'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MODEL = 'claude-haiku-4-5'
/** One meal is a handful of foods; this is roomy for that and costs pennies. */
const MAX_TOKENS = 700

/**
 * Deliberately terse. Every token here is paid for on every meal logged, and
 * the parser handles the formatting slips a longer prompt would try to prevent.
 */
const SYSTEM_PROMPT = [
  'Estimate the nutrition of a described meal.',
  'Reply with JSON only — no prose, no code fences:',
  '{"items":[{"name":"","portion":"","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],',
  '"total_calories":0,"confidence":"low|medium|high","notes":""}',
  'One entry per food. portion is what was stated, else a typical serving.',
  'Macros in grams, calories in kcal, numbers not strings.',
  'confidence reflects how clearly the portions were given.',
  'notes: one short caveat, or "".',
].join('\n')

/** The model's reply text, ignoring any non-text blocks. */
function textFromResponse(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const content = (payload as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('')
}

/**
 * An HTTP failure turned into something worth reading. The response body is
 * never surfaced — it can echo request details, and the owner cannot act on it.
 */
function errorForStatus(status: number): LLMError {
  if (status === 401 || status === 403) {
    return new LLMError('auth', 'Anthropic rejected that key. Check it in Settings.')
  }
  if (status === 429) {
    return new LLMError('rate-limit', "You've hit Anthropic's rate limit. Try again in a moment.")
  }
  if (status >= 500) {
    return new LLMError('server', 'Anthropic is having trouble right now. Try again shortly.')
  }
  return new LLMError('server', "Anthropic couldn't handle that request.")
}

export const AnthropicProvider: LLMProvider = {
  id: 'anthropic',
  label: 'Anthropic',

  async estimateFromText(description: string, signal?: AbortSignal): Promise<MealEstimate> {
    const text = description.trim()
    if (text.length === 0) {
      throw new LLMError('bad-output', 'Describe what you ate first.')
    }

    const apiKey = getApiKey('anthropic')
    if (apiKey === null) {
      throw new LLMError('no-key', 'No Anthropic key saved yet. Add one in Settings.')
    }

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          // Required for browser-origin calls; see the note at the top.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
        signal,
      })
    } catch {
      // Offline, DNS, CORS, or an aborted request — all the same to the owner.
      throw new LLMError('network', "Couldn't reach the AI — check your connection.")
    }

    if (!response.ok) throw errorForStatus(response.status)

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new LLMError('bad-output', "The AI's answer didn't make sense. Try rewording it.")
    }

    return parseMealEstimate(textFromResponse(payload))
  },
}
