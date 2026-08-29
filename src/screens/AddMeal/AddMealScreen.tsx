import { useEffect, useId, useRef, useState } from 'react'
import { getSettingOr, type MealSource } from '../../db/index.ts'
import { compressImage, type CompressedImage } from '../../services/imageCompress.ts'
import { DEFAULT_PROVIDER, type ProviderId } from '../../services/keyVault.ts'
import {
  getImageProvider,
  getTextProvider,
  LLMError,
  type MealEstimate,
} from '../../services/llm/index.ts'

/** The three ways to log a meal. Voice comes later. */
const MODES = [
  { id: 'text', label: 'Text', ready: true },
  { id: 'voice', label: 'Voice', ready: false },
  { id: 'photo', label: 'Photo', ready: true },
] as const

type Mode = 'text' | 'voice' | 'photo'

/**
 * Describe or photograph a meal, hand it to the AI, and go on to Confirm.
 * Nothing is saved here — this screen only ever produces an estimate to review.
 */
export default function AddMealScreen({
  description,
  onDescriptionChange,
  photo,
  onPhotoChange,
  onEstimate,
  onManualEntry,
  onOpenSettings,
  onCancel,
}: {
  /** Held by the caller so coming back from Confirm keeps what was typed. */
  description: string
  onDescriptionChange: (value: string) => void
  /** Likewise for the picked photo, so Back doesn't mean picking it again. */
  photo: CompressedImage | null
  onPhotoChange: (photo: CompressedImage | null) => void
  onEstimate: (estimate: MealEstimate, source: MealSource) => void
  onManualEntry: () => void
  onOpenSettings: () => void
  onCancel: () => void
}) {
  // Returning from Confirm with a photo in hand should land back on its tab.
  const [mode, setMode] = useState<Mode>(photo === null ? 'text' : 'photo')
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<LLMError | null>(null)
  const textId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
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

  /** Shared tail of both estimate paths: report, or hand the answer upward. */
  async function run(source: MealSource, estimating: () => Promise<MealEstimate>) {
    setBusy(true)
    setError(null)
    try {
      const estimated = await estimating()
      if (active.current) onEstimate(estimated, source)
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

  async function estimate() {
    if (mode === 'photo') {
      if (photo === null) {
        setError(new LLMError('bad-output', 'Choose a photo first.'))
        return
      }
      await run('photo', () => getImageProvider(provider).estimateFromImage(photo))
      return
    }

    if (description.trim().length === 0) {
      setError(new LLMError('bad-output', 'Describe what you ate first.'))
      return
    }
    await run('text', () => getTextProvider(provider).estimateFromText(description))
  }

  /**
   * Shrink the picked file before it is previewed, so what the owner sees is
   * exactly what would be sent. The original never leaves this function.
   */
  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setPreparing(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      if (active.current) onPhotoChange(compressed)
    } catch (thrown) {
      if (!active.current) return
      setError(
        thrown instanceof LLMError
          ? thrown
          : new LLMError('bad-output', "Couldn't read that photo. Try another one."),
      )
    } finally {
      if (active.current) setPreparing(false)
    }
  }

  // Only a missing or rejected key is fixed in Settings; a network blip is not.
  const settingsWouldHelp = error?.kind === 'no-key' || error?.kind === 'auth' || error?.kind === 'unsupported'
  const working = busy || preparing

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
        {MODES.map((option) => {
          const selected = option.id === mode
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={!option.ready || working}
              title={option.ready ? undefined : 'Coming soon'}
              onClick={() => {
                setMode(option.id as Mode)
                setError(null)
              }}
              className={`border-r border-ink-600 py-3.5 text-base transition last:border-r-0 ${
                selected
                  ? 'border border-accent/70 bg-ink-800 font-medium text-accent'
                  : 'text-mist-300 disabled:opacity-45'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {mode === 'photo' ? (
        <div className="mt-6">
          {/*
            No `capture` attribute on purpose: with it, iOS opens the camera
            straight away, and the owner wants the sheet that offers Photo
            Library as well as Take Photo.
          */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Cleared so picking the same file twice still fires a change.
              event.target.value = ''
              void choosePhoto(file)
            }}
          />

          {photo ? (
            <figure className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-700/70">
              <img
                src={photo.dataUrl}
                alt="The meal you're about to estimate"
                className="max-h-64 w-full object-contain"
              />
              <figcaption className="flex items-center justify-between px-4 py-3 text-sm text-mist-500">
                <span className="tabular-nums">
                  {photo.width}×{photo.height} · {Math.max(1, Math.round(photo.bytes / 1024))} KB
                </span>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={working}
                  className="text-accent transition active:scale-[0.98] disabled:opacity-50"
                >
                  Replace
                </button>
              </figcaption>
            </figure>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={working}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-500 px-4 py-12 text-center transition active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-base text-mist-100">
                {preparing ? 'Preparing photo…' : 'Take or choose a photo'}
              </span>
              <span className="text-sm text-mist-500">Resized on your phone before it's sent</span>
            </button>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}

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
          disabled={working}
          className="w-full rounded-xl border border-accent/60 py-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Estimating…' : 'Estimate calories'}
        </button>
        {/* Looking at a photo takes longer than reading a sentence; say so. */}
        {busy && mode === 'photo' && (
          <p aria-live="polite" className="mt-3 text-center text-sm text-mist-500">
            Reading your photo — this takes a few seconds.
          </p>
        )}
        <button
          type="button"
          onClick={onManualEntry}
          disabled={working}
          className="mt-4 w-full py-2 text-base text-mist-500 transition active:scale-[0.98] disabled:opacity-50"
        >
          Enter manually
        </button>
      </div>
    </div>
  )
}
