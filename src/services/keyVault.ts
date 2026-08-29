// API keys for the AI providers.
//
// Keys are the owner's own credentials and live in localStorage on this device
// only — never in IndexedDB, never in the repo, never in a log line or an
// error message. Nothing in this module returns a key to the console, and the
// UI only ever renders the masked form.

export type ProviderId = 'anthropic' | 'gemini'

export interface ProviderInfo {
  id: ProviderId
  label: string
  /** Where the owner gets a key. Public info, no secrets. */
  source: string
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'anthropic', label: 'Anthropic', source: 'console.anthropic.com' },
  { id: 'gemini', label: 'Gemini', source: 'aistudio.google.com' },
]

export const DEFAULT_PROVIDER: ProviderId = 'anthropic'

const STORAGE_PREFIX = 'caltrack.apiKey.'

/**
 * localStorage, or null when it is unavailable — Safari throws on access in
 * some private-browsing and storage-blocked configurations.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function storageKey(provider: ProviderId): string {
  return `${STORAGE_PREFIX}${provider}`
}

/** The stored key, or null when none is saved. Callers must not log the result. */
export function getApiKey(provider: ProviderId): string | null {
  try {
    const value = storage()?.getItem(storageKey(provider))
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function hasApiKey(provider: ProviderId): boolean {
  return getApiKey(provider) !== null
}

/** Saves a key. Returns false when the device refused to store it. */
export function setApiKey(provider: ProviderId, key: string): boolean {
  const trimmed = key.trim()
  if (trimmed.length === 0) return false
  try {
    storage()?.setItem(storageKey(provider), trimmed)
    return getApiKey(provider) !== null
  } catch {
    return false
  }
}

export function removeApiKey(provider: ProviderId): void {
  try {
    storage()?.removeItem(storageKey(provider))
  } catch {
    // Nothing to do — the key either never stored or is already gone.
  }
}

/**
 * A key rendered for display: enough of the prefix to recognise the provider,
 * the last four characters to tell two keys apart, and nothing else.
 * `sk-ant-api03-XXXX…9f2a` → `sk-ant-…9f2a`.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length === 0) return ''
  if (trimmed.length < 8) return '…'

  const chunks = trimmed.split('-')
  const candidate = chunks.length >= 3 ? `${chunks[0]}-${chunks[1]}-` : trimmed.slice(0, 4)
  // Keep at least four characters hidden between the prefix and the last four.
  const prefix = candidate.length + 8 <= trimmed.length ? candidate : ''
  return `${prefix}…${trimmed.slice(-4)}`
}

/** Masked form of the stored key, or null when none is saved. */
export function maskedApiKey(provider: ProviderId): string | null {
  const key = getApiKey(provider)
  return key === null ? null : maskKey(key)
}
