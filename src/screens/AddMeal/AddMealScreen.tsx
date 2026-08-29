import { useEffect, useId, useRef, useState } from 'react'
import { getSettingOr } from '../../db/index.ts'
import { DEFAULT_PROVIDER, type ProviderId } from '../../services/keyVault.ts'
import { getTextProvider, LLMError, type MealEstimate } from '../../services/llm/index.ts'

/** The three ways to log a meal. Only text is built; the rest come later. */
const MODES = [
  { id: 'text', label: 'Text', ready: true },
  { id: 'voice', label: 'Voice', ready: false },
  { id: 'photo', label: 'Photo', ready: false },
] as const

/**
 * Describe a meal, hand it to the AI, and go on to Confirm. Nothing is saved
 * here — this screen only ever produces an estimate to review.
 */
export default function AddMealScreen({
  description,
  onDescriptionChange,
  onEstimate,
  onManualEntry,
  onOpenSettings,
  onCancel,
}: {
  /** Held by the caller so coming back from Confirm keeps what was typed. */
  description: string
  onDescriptionChange: (value: string) => void
  onEstimate: (estimate: MealEstimate) => void
  onManualEntry: () => void
  onOpenSettings: () => void
  onCancel: () => void
}) {
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<LLMError | null>(null)
  const textId = useId()
  // Lets an unmounted screen ignore a request that is still in flight.
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    void getSettingOr('provider', DEFAULT_PROVIDER)
      .then((stored) => {
        if (active.current) setProvider(stored)
      })
      .catch(() => {
        // The default provider is a fine assumption if settings won't read.
      })
    return () => {
      active.current = false
    }
  }, [])

  async function estimate() {
    if (description.trim().length === 0) {
      setError(new LLMError('bad-output', 'Describe what you ate first.'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const estimated = await getTextProvider(provider).estimateFromText(description)
      if (active.current) onEstimate(estimated)
    } catch (thrown) {
      if (!active.current) return
      setError(
        thrown instanceof LLMError
          ? thrown
          : new LLMError('server', 'Something went wrong estimating that meal.'),
      )
    } finally {
      if (active.current) setBusy(false)
    }
  }

  // Only a missing or rejected key is fixed in Settings; a network blip is not.
  const settingsWouldHelp = error?.kind === 'no-key' || error?.kind === 'auth' || error?.kind === 'unsupported'

  return (
    <div
      className="flex min-h-[100svh] flex-col px-6 pb-10"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
    >
      <button
        type="button"
        onClick={onCancel}
        className="self-start text-base text-mist-300 transition active:scale-[0.98]"
      >
        ← Back
      </button>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-mist-100">Add meal</h1>

      <div
        role="tablist"
        aria-label="How to log this meal"
        className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-ink-600"
      >
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={mode.ready}
            disabled={!mode.ready}
            title={mode.ready ? undefined : 'Coming soon'}
            className={`border-r border-ink-600 py-3.5 text-base transition last:border-r-0 ${
              mode.ready
                ? 'border border-accent/70 bg-ink-800 font-medium text-accent'
                : 'text-mist-300 disabled:opacity-45'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <label htmlFor={textId} className="sr-only">
        Describe what you ate
      </label>
      <textarea
        id={textId}
        value={description}
        onChange={(event) => {
          onDescriptionChange(event.target.value)
          setError(null)
        }}
        placeholder="Describe what you ate…"
        rows={5}
        autoCapitalize="sentences"
        enterKeyHint="done"
        className="mt-6 w-full resize-none rounded-2xl border border-ink-600 bg-ink-700/70 px-4 py-4 text-lg leading-relaxed text-mist-100 outline-none placeholder:text-mist-500/70 focus:border-accent/60"
      />

      {error && (
        <div role="alert" className="mt-5 text-center">
          <p className="text-sm text-mist-300">{error.message}</p>
          {settingsWouldHelp && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-3 rounded-xl border border-ink-500 px-5 py-2.5 text-sm text-mist-300 transition active:scale-[0.98]"
            >
              Open Settings
            </button>
          )}
        </div>
      )}

      <div className="mt-auto pt-10">
        <button
          type="button"
          onClick={() => void estimate()}
          disabled={busy}
          className="w-full rounded-xl border border-accent/60 py-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Estimating…' : 'Estimate calories'}
        </button>
        <button
          type="button"
          onClick={onManualEntry}
          disabled={busy}
          className="mt-4 w-full py-2 text-base text-mist-500 transition active:scale-[0.98] disabled:opacity-50"
        >
          Enter manually
        </button>
      </div>
    </div>
  )
}
