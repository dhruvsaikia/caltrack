import { describe, expect, it } from 'vitest'
import {
  baseMimeType,
  pickRecordingMimeType,
  RECORDING_MIME_TYPES,
  toGeminiMimeType,
} from './audioFormat.ts'

// The whole point of this module is that no two browsers record the same
// format, and the owner's phone is the one browser that can't be tried here.
// These stand-ins are what each engine actually answers `isTypeSupported` with.

/** Safari, on iOS and macOS: AAC in an MP4 container, and nothing else. */
const safari = (type: string) => type.startsWith('audio/mp4')

/** Chrome and Edge: Opus in WebM. */
const chrome = (type: string) => type.startsWith('audio/webm')

/** Firefox: Opus in Ogg, and WebM as well. */
const firefox = (type: string) => type.startsWith('audio/ogg') || type.startsWith('audio/webm')

describe('pickRecordingMimeType', () => {
  it('gives Safari the MP4 container it is the only one to support', () => {
    const picked = pickRecordingMimeType(safari)
    expect(picked).not.toBeNull()
    expect(baseMimeType(picked as string)).toBe('audio/mp4')
  })

  it('gives Chrome WebM rather than the MP4 that Safari needs', () => {
    expect(pickRecordingMimeType(chrome)).toBe('audio/webm;codecs=opus')
  })

  it('prefers the codec-qualified entry when a browser accepts both forms', () => {
    expect(pickRecordingMimeType(firefox)).toBe('audio/webm;codecs=opus')
  })

  it('returns null when nothing is supported, so the browser picks its own', () => {
    expect(pickRecordingMimeType(() => false)).toBeNull()
  })

  it('skips a candidate the browser throws on instead of giving up', () => {
    const throwsOnWebm = (type: string) => {
      if (type.startsWith('audio/webm')) throw new TypeError('unrecognised type')
      return type.startsWith('audio/ogg')
    }
    expect(pickRecordingMimeType(throwsOnWebm)).toBe('audio/ogg;codecs=opus')
  })

  it('only ever returns something from the candidate list', () => {
    for (const browser of [safari, chrome, firefox]) {
      expect(RECORDING_MIME_TYPES).toContain(pickRecordingMimeType(browser))
    }
  })

  it('picks a format the API will accept, whichever browser is asking', () => {
    for (const browser of [safari, chrome, firefox]) {
      expect(toGeminiMimeType(pickRecordingMimeType(browser) as string)).not.toBeNull()
    }
  })
})

describe('baseMimeType', () => {
  it('drops the codec parameter browsers report alongside the container', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMimeType('audio/mp4; codecs="mp4a.40.2"')).toBe('audio/mp4')
  })

  it('normalises case and surrounding whitespace', () => {
    expect(baseMimeType('  AUDIO/WebM ; codecs=opus')).toBe('audio/webm')
  })

  it('leaves a plain type alone and copes with an empty one', () => {
    expect(baseMimeType('audio/ogg')).toBe('audio/ogg')
    expect(baseMimeType('')).toBe('')
  })
})

describe('toGeminiMimeType', () => {
  it("renames Safari's audio/mp4 to the audio/m4a the API lists", () => {
    // Same AAC-in-MP4 bytes under both names; only one is accepted.
    expect(toGeminiMimeType('audio/mp4')).toBe('audio/m4a')
    expect(toGeminiMimeType('audio/mp4;codecs=mp4a.40.2')).toBe('audio/m4a')
    expect(toGeminiMimeType('audio/x-m4a')).toBe('audio/m4a')
  })

  it('passes through the types the API already names', () => {
    expect(toGeminiMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(toGeminiMimeType('audio/ogg;codecs=opus')).toBe('audio/ogg')
    expect(toGeminiMimeType('audio/wav')).toBe('audio/wav')
  })

  it('maps the odd spellings a browser or OS might hand over', () => {
    expect(toGeminiMimeType('audio/x-wav')).toBe('audio/wav')
    expect(toGeminiMimeType('audio/wave')).toBe('audio/wav')
  })

  it('returns null rather than sending something the API would reject', () => {
    expect(toGeminiMimeType('video/mp4')).toBeNull()
    expect(toGeminiMimeType('application/octet-stream')).toBeNull()
    expect(toGeminiMimeType('audio/amr')).toBeNull()
    expect(toGeminiMimeType('')).toBeNull()
    expect(toGeminiMimeType('   ')).toBeNull()
    expect(toGeminiMimeType(';codecs=opus')).toBeNull()
  })
})
