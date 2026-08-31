import { useEffect, useRef, useState } from 'react'
import { pickRecordingMimeType, supportsRecording } from '../../services/audioFormat.ts'
import { LLMError } from '../../services/llm/index.ts'
import { transcribeAudio } from '../../services/transcription.ts'

/** Recordings stop themselves here. A meal takes a sentence, not a monologue. */
export const MAX_SECONDS = 60
/** How often the timer redraws while recording. */
const TICK_MS = 200

type Phase = 'idle' | 'starting' | 'recording' | 'transcribing'

function clock(seconds: number): string {
  const whole = Math.min(MAX_SECONDS, Math.max(0, Math.floor(seconds)))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Tap to record, tap to stop, and the words come back.
 *
 * The microphone stream is opened when recording starts and every track is
 * stopped the moment it ends — including when this screen goes away mid-take —
 * so the browser's recording indicator never outlives the recording.
 */
export default function VoiceRecorder({
  disabled,
  onTranscript,
  onError,
}: {
  disabled: boolean
  /** The transcribed words, handed up to become the meal description. */
  onTranscript: (text: string) => void
  /** A problem to show, or null to clear whatever the last attempt left behind. */
  onError: (error: LLMError | null) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const active = useRef(true)

  /** Give the microphone back. Safe to call twice. */
  function releaseMic() {
    if (ticker.current !== null) {
      clearInterval(ticker.current)
      ticker.current = null
    }
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      // Leaving mid-take: drop the audio and hand the mic straight back.
      try {
        if (recorder.current?.state === 'recording') recorder.current.stop()
      } catch {
        // Already stopped, or torn down by the browser. Nothing to do.
      }
      releaseMic()
    }
  }, [])

  function stop() {
    try {
      if (recorder.current?.state === 'recording') recorder.current.stop()
    } catch {
      // The `onstop` handler below normally runs the cleanup; if stopping threw
      // it never will, so unwind here instead.
      releaseMic()
      if (active.current) setPhase('idle')
    }
  }

  async function start() {
    // A fresh attempt should not sit under the last one's complaint.
    onError(null)
    if (!supportsRecording()) {
      onError(
        new LLMError('unsupported', "This browser can't record audio. Type the meal instead."),
      )
      return
    }

    setPhase('starting')
    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Denied, dismissed, no microphone, or an insecure origin — the fix is
      // much the same either way, and the browser's own reason is not worth
      // showing to the owner.
      if (active.current) setPhase('idle')
      onError(
        new LLMError(
          'unsupported',
          'CalTrack needs microphone access to record. Allow it for this site, then try again.',
        ),
      )
      return
    }

    // The screen may have gone away while the permission sheet was up.
    if (!active.current) {
      mic.getTracks().forEach((track) => track.stop())
      return
    }
    stream.current = mic

    // Asked at record time rather than hardcoded: Safari answers `audio/mp4`
    // where Chrome answers WebM, and either would throw in the other browser.
    const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type))

    let media: MediaRecorder
    try {
      media = new MediaRecorder(mic, mimeType === null ? undefined : { mimeType })
    } catch {
      releaseMic()
      setPhase('idle')
      onError(
        new LLMError(
          'unsupported',
          "This browser wouldn't start a recording. Type the meal instead.",
        ),
      )
      return
    }

    chunks.current = []
    recorder.current = media

    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }

    media.onstop = () => {
      releaseMic()
      // `media.mimeType` is what was actually recorded, and so is the type the
      // API needs to be told about — a Blob's own type can come back blank.
      const type = media.mimeType || mimeType || ''
      const audio = new Blob(chunks.current, type.length > 0 ? { type } : undefined)
      chunks.current = []
      void transcribe(audio, type)
    }

    media.onerror = () => {
      releaseMic()
      chunks.current = []
      if (active.current) setPhase('idle')
      onError(new LLMError('bad-output', 'That recording stopped unexpectedly. Try again.'))
    }

    startedAt.current = Date.now()
    setElapsed(0)
    setPhase('recording')
    media.start()

    ticker.current = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000
      setElapsed(seconds)
      if (seconds >= MAX_SECONDS) stop()
    }, TICK_MS)
  }

  async function transcribe(audio: Blob, mimeType: string) {
    if (active.current) setPhase('transcribing')
    try {
      const text = await transcribeAudio(audio, { mimeType })
      if (active.current) {
        setPhase('idle')
        onTranscript(text)
      }
    } catch (thrown) {
      if (!active.current) return
      setPhase('idle')
      onError(
        thrown instanceof LLMError
          ? thrown
          : new LLMError('server', "Couldn't turn that recording into words."),
      )
    }
  }

  if (phase === 'transcribing') {
    return (
      <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-700/70 px-4 py-12 text-center">
        <p aria-live="polite" className="text-base text-mist-100">
          Writing down what you said…
        </p>
        <p className="mt-1.5 text-sm text-mist-500">
          You'll see the transcript before anything is estimated.
        </p>
      </div>
    )
  }

  if (phase === 'recording') {
    const remaining = Math.max(0, MAX_SECONDS - elapsed)
    return (
      <div className="mt-6 rounded-2xl border border-accent/50 bg-ink-700/70 px-4 py-10 text-center">
        <p className="flex items-center justify-center gap-2.5 text-base text-mist-100">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full bg-warn motion-safe:animate-pulse"
          />
          Recording
        </p>
        <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-mist-100">
          {clock(elapsed)}
        </p>
        <p className="mt-2 text-sm text-mist-500">
          {remaining <= 10
            ? `Stops on its own in ${Math.ceil(remaining)}s`
            : `Stops on its own at ${clock(MAX_SECONDS)}`}
        </p>
        <button
          type="button"
          onClick={stop}
          className="mt-6 w-full rounded-xl border border-accent/60 py-3.5 text-base font-medium text-accent transition active:scale-[0.98]"
        >
          Stop
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={disabled || phase === 'starting'}
      className="mt-6 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-500 px-4 py-12 text-center transition active:scale-[0.98] disabled:opacity-50"
    >
      <span className="text-base text-mist-100">
        {phase === 'starting' ? 'Waiting for the mic…' : 'Tap to record'}
      </span>
      <span className="text-sm text-mist-500">Say what you ate — up to a minute</span>
    </button>
  )
}
