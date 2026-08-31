import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiKey, removeApiKey } from './keyVault.ts'
import { LLMError } from './llm/types.ts'
import { transcribeAudio, transcriptFromResponse } from './transcription.ts'

// Two things are worth pinning down here. First, that what leaves the device is
// right: the recording under a media type Gemini accepts, and the key in a
// header rather than the URL or the body. Second, that no shape of reply — and
// no HTTP failure — can produce anything but a friendly LLMError.

// Node has no localStorage; this is the smallest thing that behaves like one.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const KEY = 'gemini-test-key'

/** A well-formed reply, so parsing is never the thing under test. */
const GOOD_REPLY = {
  candidates: [{ content: { parts: [{ text: 'two eggs and toast with butter' }] } }],
}

function respondWith(payload: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

/** A recording, as MediaRecorder would hand one over. */
function recording(type: string, bytes = 64): Blob {
  return new Blob([new Uint8Array(bytes).fill(7)], { type })
}

function requestOf(fetchMock: ReturnType<typeof respondWith>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  setApiKey('gemini', KEY)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('transcribeAudio — what gets sent', () => {
  it("sends Safari's mp4 recording under the media type Gemini accepts", async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(recording('audio/mp4'))

    const { body } = requestOf(fetchMock)
    const parts = body.contents[0].parts
    // audio/mp4 is what Safari produces and what Gemini does not list.
    expect(parts[1].inlineData.mimeType).toBe('audio/m4a')
    expect(typeof parts[1].inlineData.data).toBe('string')
    expect(parts[1].inlineData.data.length).toBeGreaterThan(0)
    // Base64, with no data-URL prefix left on it.
    expect(parts[1].inlineData.data).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it("sends Chrome's webm recording as webm", async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(recording('audio/webm;codecs=opus'))

    expect(requestOf(fetchMock).body.contents[0].parts[1].inlineData.mimeType).toBe('audio/webm')
  })

  it('prefers an explicit mimeType over the blob\'s own', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    // MediaRecorder knows what it recorded; a Blob's type can come back blank.
    await transcribeAudio(recording(''), { mimeType: 'audio/mp4;codecs=mp4a.40.2' })

    expect(requestOf(fetchMock).body.contents[0].parts[1].inlineData.mimeType).toBe('audio/m4a')
  })

  it('puts the key in a header, never in the URL or the body', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(recording('audio/webm'))

    const { url, headers, init } = requestOf(fetchMock)
    expect(headers['x-goog-api-key']).toBe(KEY)
    expect(url).not.toContain(KEY)
    expect(url.startsWith('https://')).toBe(true)
    expect(init.body as string).not.toContain(KEY)
  })

  it('returns the transcript, trimmed', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({ candidates: [{ content: { parts: [{ text: '  two eggs \n' }] } }] }),
    )

    expect(await transcribeAudio(recording('audio/webm'))).toBe('two eggs')
  })
})

describe('transcribeAudio — refusing before the network', () => {
  it('asks for a Gemini key when none is saved, and never calls out', async () => {
    removeApiKey('gemini')
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    const thrown = await transcribeAudio(recording('audio/webm')).catch((error) => error)
    expect(thrown).toBeInstanceOf(LLMError)
    expect((thrown as LLMError).kind).toBe('no-key')
    expect((thrown as LLMError).message).toMatch(/Settings/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a format Gemini has no name for rather than earning a 400', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    const thrown = await transcribeAudio(recording('audio/amr')).catch((error) => error)
    expect((thrown as LLMError).kind).toBe('unsupported')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an empty recording', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    const thrown = await transcribeAudio(recording('audio/webm', 0)).catch((error) => error)
    expect((thrown as LLMError).kind).toBe('bad-output')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('transcribeAudio — failures', () => {
  it.each([
    [400, 'auth'],
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [418, 'server'],
  ])('turns HTTP %i into a %s error', async (status, kind) => {
    vi.stubGlobal('fetch', respondWith({ error: { message: `key ${KEY} is invalid` } }, status))

    const thrown = await transcribeAudio(recording('audio/webm')).catch((error) => error)
    expect(thrown).toBeInstanceOf(LLMError)
    expect((thrown as LLMError).kind).toBe(kind)
    // The body can echo the request; none of it reaches the owner.
    expect((thrown as LLMError).message).not.toContain(KEY)
  })

  it('reports a network failure as one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const thrown = await transcribeAudio(recording('audio/webm')).catch((error) => error)
    expect((thrown as LLMError).kind).toBe('network')
  })

  it('survives a 200 that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>gateway</html>', { status: 200 })))

    const thrown = await transcribeAudio(recording('audio/webm')).catch((error) => error)
    expect((thrown as LLMError).kind).toBe('bad-output')
  })

  it.each([
    ['no candidates', { candidates: [] }],
    ['a blocked reply', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['parts with no text', { candidates: [{ content: { parts: [{ inlineData: {} }] } }] }],
    ['whitespace only', { candidates: [{ content: { parts: [{ text: '  \n ' }] } }] }],
  ])('asks for another take when the reply has %s', async (_label, payload) => {
    vi.stubGlobal('fetch', respondWith(payload))

    const thrown = await transcribeAudio(recording('audio/webm')).catch((error) => error)
    expect(thrown).toBeInstanceOf(LLMError)
    expect((thrown as LLMError).kind).toBe('bad-output')
  })
})

describe('transcriptFromResponse', () => {
  it('reads the text out of a well-formed reply', () => {
    expect(transcriptFromResponse(GOOD_REPLY)).toBe('two eggs and toast with butter')
  })

  it('joins the parts of a split reply in order', () => {
    expect(
      transcriptFromResponse({
        candidates: [{ content: { parts: [{ text: 'two eggs' }, { text: ' and toast' }] } }],
      }),
    ).toBe('two eggs and toast')
  })

  it('ignores parts that carry something other than text', () => {
    expect(
      transcriptFromResponse({
        candidates: [
          { content: { parts: [{ inlineData: { data: 'x' } }, { text: 'a bowl of soup' }] } },
        ],
      }),
    ).toBe('a bowl of soup')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'two eggs'],
    ['a number', 42],
    ['an array', [{ text: 'two eggs' }]],
    ['an empty object', {}],
    ['candidates as an object', { candidates: { content: { parts: [{ text: 'x' }] } } }],
    ['a candidate that is null', { candidates: [null] }],
    ['content missing', { candidates: [{}] }],
    ['content as a string', { candidates: [{ content: 'two eggs' }] }],
    ['parts missing', { candidates: [{ content: {} }] }],
    ['parts as a string', { candidates: [{ content: { parts: 'two eggs' } }] }],
    ['a part that is null', { candidates: [{ content: { parts: [null] } }] }],
    ['text as a number', { candidates: [{ content: { parts: [{ text: 12 }] } }] }],
  ])('returns an empty string for %s', (_label, payload) => {
    expect(transcriptFromResponse(payload)).toBe('')
  })

  it('skips a null candidate to reach a usable one', () => {
    expect(
      transcriptFromResponse({
        candidates: [null, { content: { parts: [{ text: 'porridge' }] } }],
      }),
    ).toBe('porridge')
  })
})
