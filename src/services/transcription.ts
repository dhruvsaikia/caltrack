// Speech to text, via Gemini.
//
// Voice is the one thing Anthropic cannot do — the Messages API takes text,
// images and documents, but not audio — so a recording goes to Gemini, comes
// back as plain words, and from there follows exactly the same path a typed
// description does.
//
// Same rules as every other provider call: the key is read from the vault at
// call time, put in a header, and never stored, logged, or written into an
// error message. The recording is a request body and nothing else — it is not
// kept, and nothing about it is logged.
import { toGeminiMimeType } from './audioFormat.ts'
import { getApiKey } from './keyVault.ts'
import { LLMError } from './llm/types.ts'

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Gemini's general model; it takes inline audio and is cheap at this length. */
const MODEL = 'gemini-3.7-flash'

/**
 * Short on purpose. The model is being asked to write down words, not to
 * interpret them — the meal parsing happens afterwards, in the text pipeline.
 */
const PROMPT = [
  'Transcribe this recording of someone saying what they ate.',
  'Reply with the transcript only — no commentary, no labels, no quotation marks.',
  'If nobody speaks, reply with nothing at all.',
].join(' ')

/**
 * Inline audio shares a 20 MB request budget with the prompt. A minute of
 * Opus or AAC is a small fraction of that; anything near the ceiling is a bug
 * worth catching here rather than as a 400.
 */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024

/** A recording turned into base64, without ever touching a data URL. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // String.fromCharCode is applied in chunks: one call with a million
  // arguments overflows the call stack on Safari.
  const CHUNK = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

/**
 * The transcript inside a generateContent reply, ignoring anything that is not
 * a text part. Returns '' for every malformed shape rather than throwing, so
 * the caller decides what an empty answer means.
 */
export function transcriptFromResponse(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''

  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return ''

  const first = candidates.find(
    (candidate): candidate is { content?: unknown } =>
      typeof candidate === 'object' && candidate !== null,
  )
  if (first === undefined) return ''

  const content = first.content
  if (typeof content !== 'object' || content === null) return ''

  const parts = (content as { parts?: unknown }).parts
  if (!Array.isArray(parts)) return ''

  return parts
    .filter(
      (part): part is { text: string } =>
        typeof part === 'object' &&
        part !== null &&
        typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => part.text)
    .join('')
    .trim()
}

/**
 * An HTTP failure turned into something worth reading. The body is never
 * surfaced: it can echo request details, and the owner cannot act on it.
 *
 * 400 is grouped with the authentication failures on purpose — Gemini answers
 * an invalid key with `400 INVALID_ARGUMENT`, and by this point the format and
 * size of the recording have already been checked, so the key is what is left.
 */
function errorForStatus(status: number): LLMError {
  if (status === 400 || status === 401 || status === 403) {
    return new LLMError('auth', 'Gemini rejected that request. Check your Gemini key in Settings.')
  }
  if (status === 429) {
    return new LLMError('rate-limit', "You've hit Gemini's rate limit. Try again in a moment.")
  }
  if (status >= 500) {
    return new LLMError('server', 'Gemini is having trouble right now. Try again shortly.')
  }
  return new LLMError('server', "Gemini couldn't handle that recording.")
}

/**
 * A recording, transcribed. Rejects with an {@link LLMError} for every expected
 * failure — no key saved, a format Gemini won't take, a rejected key, a network
 * that isn't there, or a reply with no words in it.
 *
 * `mimeType` defaults to the Blob's own type, which is what MediaRecorder set.
 */
export async function transcribeAudio(
  audio: Blob,
  options: { mimeType?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const apiKey = getApiKey('gemini')
  if (apiKey === null) {
    throw new LLMError('no-key', 'No Gemini key saved yet. Voice needs one — add it in Settings.')
  }

  if (audio.size === 0) {
    throw new LLMError('bad-output', "That recording came out empty. Try again and speak after the timer starts.")
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new LLMError('bad-output', 'That recording is too long to send. Try a shorter one.')
  }

  const mimeType = toGeminiMimeType(options.mimeType ?? audio.type)
  if (mimeType === null) {
    throw new LLMError(
      'unsupported',
      "This browser recorded in a format Gemini can't read. Type the meal instead.",
    )
  }

  const data = await blobToBase64(audio)

  let response: Response
  try {
    response = await fetch(`${ENDPOINT_BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header, not a query parameter: a key in the URL ends up in logs and
        // in history. Nothing else in this request carries it.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: PROMPT }, { inlineData: { mimeType, data } }],
          },
        ],
      }),
      signal: options.signal,
    })
  } catch {
    // Offline, DNS, CORS, or an aborted request — all the same to the owner.
    throw new LLMError('network', "Couldn't reach Gemini — check your connection.")
  }

  if (!response.ok) throw errorForStatus(response.status)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new LLMError('bad-output', "Couldn't make sense of what Gemini sent back. Try again.")
  }

  const transcript = transcriptFromResponse(payload)
  if (transcript.length === 0) {
    throw new LLMError('bad-output', "Didn't catch any words in that. Try recording again.")
  }
  return transcript
}
