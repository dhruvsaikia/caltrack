import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiKey } from '../keyVault.ts'
import type { CompressedImage } from '../imageCompress.ts'
import { AnthropicProvider } from './anthropic.ts'
import { LLMError } from './types.ts'

// What the provider sends for a photo is worth pinning down: a wrong
// media_type or a data-URL prefix left on the payload is a 400 the owner would
// only ever see on their phone.

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

const PHOTO: CompressedImage = {
  dataUrl: 'data:image/jpeg;base64,AAECAwQ=',
  base64: 'AAECAwQ=',
  mediaType: 'image/jpeg',
  width: 1024,
  height: 768,
  bytes: 5,
}

/** A well-formed reply, so the parser is never the thing under test here. */
const GOOD_REPLY = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        items: [
          { name: 'Omelette', portion: '1 plate', calories: 320, protein_g: 20, carbs_g: 3, fat_g: 25 },
        ],
        total_calories: 320,
        confidence: 'low',
        notes: "Couldn't tell how much oil was used.",
      }),
    },
  ],
}

function respondWith(payload: unknown, status = 200) {
  return vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

type FetchMock = ReturnType<typeof respondWith>

/** What the provider actually put on the wire, for the nth call it made. */
function sentInit(fetchMock: FetchMock, index = 0): RequestInit {
  return fetchMock.mock.calls[index][1]
}

function sentBody(fetchMock: FetchMock, index = 0): Record<string, any> {
  return JSON.parse(sentInit(fetchMock, index).body as string)
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  setApiKey('anthropic', 'sk-ant-test-key')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('estimateFromImage', () => {
  it('sends the image as a base64 block with its own media type', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage(PHOTO)

    const body = sentBody(fetchMock)
    const [image, text] = body.messages[0].content
    expect(image).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAECAwQ=' },
    })
    // The data-URL prefix belongs to the preview, never to the request.
    expect(image.source.data).not.toContain('data:')
    expect(text.type).toBe('text')
  })

  it('carries a PNG through unchanged', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage({
      ...PHOTO,
      mediaType: 'image/png',
      base64: 'iVBORw0=',
    })

    expect(sentBody(fetchMock).messages[0].content[0].source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0=',
    })
  })

  it('uses a vision-capable model, not the text one', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage(PHOTO)
    expect(sentBody(fetchMock).model).toBe('claude-sonnet-5')

    await AnthropicProvider.estimateFromText('two eggs')
    expect(sentBody(fetchMock, 1).model).toBe('claude-haiku-4-5')
  })

  it('asks the model to be honest about photo uncertainty', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage(PHOTO)
    expect(sentBody(fetchMock).system).toContain('low')
    expect(sentBody(fetchMock).system).toMatch(/honest/i)
  })

  it('keeps the key in the header and out of the body', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage(PHOTO)

    const init = sentInit(fetchMock)
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test-key')
    expect(init.body as string).not.toContain('sk-ant-test-key')
  })

  it('returns the parsed estimate from the shared pipeline', async () => {
    vi.stubGlobal('fetch', respondWith(GOOD_REPLY))

    const estimate = await AnthropicProvider.estimateFromImage(PHOTO)
    expect(estimate.items).toHaveLength(1)
    expect(estimate.total_calories).toBe(320)
    expect(estimate.confidence).toBe('low')
  })

  it('reports a photo-specific message when no food was found', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({ content: [{ type: 'text', text: '{"items":[],"total_calories":0}' }] }),
    )

    await expect(AnthropicProvider.estimateFromImage(PHOTO)).rejects.toThrowError(/photo/i)
  })

  it('never calls out with an empty image', async () => {
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      AnthropicProvider.estimateFromImage({ ...PHOTO, base64: '' }),
    ).rejects.toBeInstanceOf(LLMError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps HTTP failures onto the shared error kinds', async () => {
    const cases: [number, string][] = [
      [401, 'auth'],
      [429, 'rate-limit'],
      [500, 'server'],
    ]
    for (const [status, kind] of cases) {
      vi.stubGlobal('fetch', respondWith({ error: 'nope' }, status))
      await AnthropicProvider.estimateFromImage(PHOTO).then(
        () => expect.unreachable(`${status} should have thrown`),
        (error: unknown) => {
          expect(error).toBeInstanceOf(LLMError)
          expect((error as LLMError).kind).toBe(kind)
        },
      )
    }
  })

  it('reports a dropped connection as a network problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await AnthropicProvider.estimateFromImage(PHOTO).then(
      () => expect.unreachable('should have thrown'),
      (error: unknown) => expect((error as LLMError).kind).toBe('network'),
    )
  })

  it('says so plainly when there is no key', async () => {
    localStorage.clear()
    const fetchMock = respondWith(GOOD_REPLY)
    vi.stubGlobal('fetch', fetchMock)

    await AnthropicProvider.estimateFromImage(PHOTO).then(
      () => expect.unreachable('should have thrown'),
      (error: unknown) => expect((error as LLMError).kind).toBe('no-key'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
