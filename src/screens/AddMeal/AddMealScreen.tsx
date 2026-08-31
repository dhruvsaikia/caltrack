import { useEffect, useId, useRef, useState } from 'react'
import { getSettingOr, type MealSource } from '../../db/index.ts'
import { compressImage, type CompressedImage } from '../../services/imageCompress.ts'
import { DEFAULT_PROVIDER, hasApiKey, type ProviderId } from '../../services/keyVault.ts'
import {
  getImageProvider,
  getTextProvider,
  LLMError,
  type MealEstimate,
} from '../../services/llm/index.ts'
import VoiceRecorder from './VoiceRecorder.tsx'

/** The three ways to log a meal. */
const MODES = [
  { id: 'text', label: 'Text', ready: true },
  { id: 'voice', label: 'Voice', ready: true },
  { id: 'photo', label: 'Photo', ready: true },
] as const

type Mode = 'text' | 'voice' | 'photo'

/**
 * Voice leans on both providers at once: Gemini writes the recording down
 * because the Messages API takes no audio, and Anthropic turns those words into
 * calories. Saying which key is missing before the mic opens means the owner
 * never speaks a sentence only to find it had nowhere to go.
 */
function missingVoiceKeys(): string | null {
  const gemini = hasApiKey('gemini')
  const anthropic = hasApiKey('anthropic')
  if (gemini && anthropic) return null
  if (!gemini && !anthropic) {
    return 'Voice needs both keys: Gemini to hear you, Anthropic to count the calories. Neither is saved yet.'
  }
  if (!gemini) {
    return 'Voice needs a Gemini key to turn your recording into words. None is saved yet.'
  }
  return 'Voice needs an Anthropic key to turn your words into calories. None is saved yet.'
}

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
  // A blocked microphone is fixed in the browser's own site permissions, not
  // in CalTrack's Settings, so it suppresses the button that offers them.
  const [micBlocked, setMicBlocked] = useState(false)
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

  /**
   * Show a problem, remembering whether it was the microphone — everything
   * else that reaches here is either fixed in Settings or fixed by retrying.
   */
  function report(next: LLMError | null, fromMicrophone = false) {
    setError(next)
    setMicBlocked(next !== null && fromMicrophone)
  }

  /** Shared tail of both estimate paths: report, or hand the answer upward. */
  async function run(source: MealSource, estimating: () => Promise<MealEstimate>) {
    setBusy(true)
    report(null)
    try {
      const estimated = await estimating()
      if (active.current) onEstimate(estimated, source)
    } catch (thrown) {
      if (!active.current) return
      report(
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
        report(new LLMError('bad-output', 'Choose a photo first.'))
        return
      }
      await run('photo', () => getImageProvider(provider).estimateFromImage(photo))
      return
    }

    if (description.trim().length === 0) {
      report(
        new LLMError(
          'bad-output',
          mode === 'voice' ? 'Record what you ate first.' : 'Describe what you ate first.',
        ),
      )
      return
    }
    // A transcript is words like any other, so voice rejoins the text pipeline
    // here — same model, same Confirm screen, only the stored source differs.
    await run(mode === 'voice' ? 'voice' : 'text', () =>
      getTextProvider(provider).estimateFromText(description),
    )
  }

  /**
   * Shrink the picked file before it is previewed, so what the owner sees is
   * exactly what would be sent. The original never leaves this function.
   */
  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setPreparing(true)
    report(null)
    try {
      const compressed = await compressImage(file)
      if (active.current) onPhotoChange(compressed)
    } catch (thrown) {
      if (!active.current) return
      report(
        thrown instanceof LLMError
          ? thrown
          : new LLMError('bad-output', "Couldn't read that photo. Try another one."),
      )
    } finally {
      if (active.current) setPreparing(false)
    }
  }

  // Only a missing or rejected key is fixed in Settings; a network blip is not,
  // and neither is a microphone the browser is holding back.
  const settingsWouldHelp =
    !micBlocked &&
    (error?.kind === 'no-key' || error?.kind === 'auth' || error?.kind === 'unsupported')
  const working = busy || preparing
  // Read fresh each render: the vault is localStorage, and coming back from
  // Settings with a key just added should clear this without a reload.
  const voiceBlocked = mode === 'voice' ? missingVoiceKeys() : null

  /**
   * The meal description. Text mode types into it; voice mode fills it with the
   * transcript and lets the owner correct whatever was misheard before the
   * estimate is asked for.
   */
  const descriptionField = (label: string, showLabel: boolean, placeholder: string) => (
    <>
      <label
        htmlFor={textId}
        className={showLabel ? 'block text-sm text-mist-500' : 'sr-only'}
      >
        {label}
      </label>
      <textarea
        id={textId}
        value={description}
        onChange={(event) => {
          onDescriptionChange(event.target.value)
          report(null)
        }}
        placeholder={placeholder}
        rows={5}
        autoCapitalize="sentences"
        enterKeyHint="done"
        className="mt-2 w-full resize-none rounded-2xl border border-ink-600 bg-ink-700/70 px-4 py-4 text-lg leading-relaxed text-mist-100 outline-none placeholder:text-mist-500/70 focus:border-accent/60"
      />
    </>
  )

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
                report(null)
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
      ) : mode === 'voice' ? (
        <div>
          {voiceBlocked === null ? (
            <VoiceRecorder
              disabled={working}
              onTranscript={(text) => {
                onDescriptionChange(text)
                report(null)
              }}
              // The recorder's own failures are the device's, not the vault's;
              // a key rejected during transcription still points at Settings.
              onError={(thrown) => report(thrown, thrown?.kind === 'unsupported')}
            />
          ) : (
            <div
              role="status"
              className="mt-6 rounded-2xl border border-ink-600 bg-ink-700/70 px-5 py-10 text-center"
            >
              <p className="text-base leading-relaxed text-mist-100">{voiceBlocked}</p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-5 rounded-xl border border-ink-500 px-5 py-2.5 text-sm text-mist-300 transition active:scale-[0.98]"
              >
                Open Settings
              </button>
            </div>
          )}

          {/* The transcript, shown before anything is estimated, so a misheard
              word is caught here rather than in the saved meal. */}
          {description.trim().length > 0 && (
            <div className="mt-6">
              {descriptionField('What it heard', true, 'Describe what you ate…')}
              <p className="mt-2 text-xs text-mist-500">
                Edit anything it got wrong before estimating.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">{descriptionField('Describe what you ate', false, 'Describe what you ate…')}</div>
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
        {/* Nothing to estimate with until a key is saved, so the button would
            only ever restate the message above it. */}
        {voiceBlocked === null && (
          <button
            type="button"
            onClick={() => void estimate()}
            disabled={working}
            className="w-full rounded-xl border border-accent/60 py-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Estimating…' : 'Estimate calories'}
          </button>
        )}
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
