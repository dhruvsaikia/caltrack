import { beforeEach, describe, expect, it } from 'vitest'
import {
  getApiKey,
  hasApiKey,
  maskKey,
  maskedApiKey,
  removeApiKey,
  setApiKey,
} from './keyVault.ts'

// The test environment is Node, which has no localStorage. This stub is the
// smallest thing that behaves like one.
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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
})

describe('maskKey', () => {
  it('keeps the provider prefix and the last four characters', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop9f2a')).toBe('sk-ant-…9f2a')
  })

  it('falls back to a short prefix for keys without a dashed prefix', () => {
    expect(maskKey('AIzaSyD0123456789abcdefgh')).toBe('AIza…efgh')
  })

  it('never reveals a short key', () => {
    expect(maskKey('abc')).toBe('…')
    expect(maskKey('sk-ant-1234')).toBe('…1234')
  })

  it('hides everything between the prefix and the last four characters', () => {
    const key = 'sk-ant-api03-SECRETMIDDLE1234'
    expect(maskKey(key)).not.toContain('SECRETMIDDLE')
  })

  it('returns an empty string for an empty key', () => {
    expect(maskKey('   ')).toBe('')
  })
})

describe('key vault', () => {
  it('reports no key before one is saved', () => {
    expect(getApiKey('anthropic')).toBeNull()
    expect(hasApiKey('anthropic')).toBe(false)
    expect(maskedApiKey('anthropic')).toBeNull()
  })

  it('stores and reads a key', () => {
    expect(setApiKey('anthropic', 'sk-ant-api03-abcdefghijklmnop9f2a')).toBe(true)
    expect(getApiKey('anthropic')).toBe('sk-ant-api03-abcdefghijklmnop9f2a')
    expect(maskedApiKey('anthropic')).toBe('sk-ant-…9f2a')
  })

  it('trims surrounding whitespace from a pasted key', () => {
    setApiKey('gemini', '  AIzaSyD0123456789abcdefgh\n')
    expect(getApiKey('gemini')).toBe('AIzaSyD0123456789abcdefgh')
  })

  it('rejects a blank key', () => {
    expect(setApiKey('gemini', '   ')).toBe(false)
    expect(hasApiKey('gemini')).toBe(false)
  })

  it('keeps each provider key separate', () => {
    setApiKey('anthropic', 'sk-ant-api03-abcdefghijklmnop9f2a')
    setApiKey('gemini', 'AIzaSyD0123456789abcdefgh')
    removeApiKey('anthropic')
    expect(hasApiKey('anthropic')).toBe(false)
    expect(hasApiKey('gemini')).toBe(true)
  })

  it('survives a device with no usable localStorage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('storage blocked')
      },
      configurable: true,
    })
    expect(getApiKey('anthropic')).toBeNull()
    expect(setApiKey('anthropic', 'sk-ant-api03-abcdefghijklmnop9f2a')).toBe(false)
    expect(() => removeApiKey('anthropic')).not.toThrow()
  })
})
