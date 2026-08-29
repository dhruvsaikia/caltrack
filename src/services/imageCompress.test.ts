import { describe, expect, it } from 'vitest'
import {
  MAX_EDGE,
  decodedByteLength,
  isSupportedMediaType,
  splitDataUrl,
  targetDimensions,
} from './imageCompress.ts'
import { LLMError } from './llm/types.ts'

// `compressImage` itself needs a canvas, so the browser half is left to manual
// testing. Everything it decides with is here.

describe('targetDimensions', () => {
  it('leaves an image that already fits alone', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('never upscales a small photo', () => {
    expect(targetDimensions(120, 90)).toEqual({ width: 120, height: 90 })
  })

  it('caps the long edge of a landscape photo', () => {
    expect(targetDimensions(4032, 3024)).toEqual({ width: MAX_EDGE, height: 768 })
  })

  it('caps the long edge of a portrait photo', () => {
    expect(targetDimensions(3024, 4032)).toEqual({ width: 768, height: MAX_EDGE })
  })

  it('keeps the aspect ratio within a rounding error', () => {
    const { width, height } = targetDimensions(4000, 2251)
    expect(Math.abs(width / height - 4000 / 2251)).toBeLessThan(0.01)
  })

  it('treats the boundary as fitting', () => {
    expect(targetDimensions(MAX_EDGE, 500)).toEqual({ width: MAX_EDGE, height: 500 })
    expect(targetDimensions(MAX_EDGE + 1, 500)).toEqual({ width: MAX_EDGE, height: 500 })
  })

  it('honours a caller-supplied edge', () => {
    expect(targetDimensions(2000, 1000, 500)).toEqual({ width: 500, height: 250 })
  })

  it('keeps a very wide panorama at least one pixel tall', () => {
    expect(targetDimensions(40000, 10)).toEqual({ width: MAX_EDGE, height: 1 })
  })

  it('rejects sizes that are not a real image', () => {
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [-10, 10],
      [Number.NaN, 100],
      [Number.POSITIVE_INFINITY, 100],
    ]) {
      expect(() => targetDimensions(w, h)).toThrowError(LLMError)
    }
  })
})

describe('splitDataUrl', () => {
  it('splits a JPEG data URL into media type and payload', () => {
    expect(splitDataUrl('data:image/jpeg;base64,AAECAwQ=')).toEqual({
      mediaType: 'image/jpeg',
      base64: 'AAECAwQ=',
    })
  })

  it('normalises the media type to lower case', () => {
    expect(splitDataUrl('data:IMAGE/PNG;base64,AAEC').mediaType).toBe('image/png')
  })

  it('ignores surrounding whitespace', () => {
    expect(splitDataUrl('  data:image/webp;base64,AAEC  ').mediaType).toBe('image/webp')
  })

  it('rejects a format the API will not accept', () => {
    try {
      splitDataUrl('data:image/svg+xml;base64,AAEC')
      expect.unreachable('svg should not be accepted')
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(LLMError)
      expect((thrown as LLMError).kind).toBe('unsupported')
    }
  })

  it('rejects a URL that is not base64 data', () => {
    for (const bad of ['', 'https://example.com/a.jpg', 'data:image/jpeg,rawbytes', 'nonsense']) {
      expect(() => splitDataUrl(bad)).toThrowError(LLMError)
    }
  })

  it('rejects an empty payload', () => {
    try {
      splitDataUrl('data:image/jpeg;base64,')
      expect.unreachable('an empty image should not be accepted')
    } catch (thrown) {
      expect((thrown as LLMError).kind).toBe('bad-output')
    }
  })
})

describe('isSupportedMediaType', () => {
  it('accepts what the API accepts and nothing else', () => {
    expect(isSupportedMediaType('image/jpeg')).toBe(true)
    expect(isSupportedMediaType('image/png')).toBe(true)
    expect(isSupportedMediaType('image/gif')).toBe(true)
    expect(isSupportedMediaType('image/webp')).toBe(true)
    expect(isSupportedMediaType('image/heic')).toBe(false)
    expect(isSupportedMediaType('application/pdf')).toBe(false)
  })
})

describe('decodedByteLength', () => {
  it('counts three bytes per four characters', () => {
    expect(decodedByteLength('AAAA')).toBe(3)
    expect(decodedByteLength('AAAAAAAA')).toBe(6)
  })

  it('discounts padding', () => {
    // "AAECAwQ=" is five bytes; "AAECAw==" is four.
    expect(decodedByteLength('AAECAwQ=')).toBe(5)
    expect(decodedByteLength('AAECAw==')).toBe(4)
  })

  it('is zero for nothing', () => {
    expect(decodedByteLength('')).toBe(0)
  })
})
