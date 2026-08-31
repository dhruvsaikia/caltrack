// Which audio format to record in, and what to call it when sending it.
//
// This is the Safari quirk CLAUDE.md warns about. MediaRecorder has no format
// every browser agrees on: iOS/macOS Safari records AAC inside an MP4
// container, Chrome and Edge record Opus inside WebM, Firefox records Opus
// inside Ogg. Hardcoding either one produces a recorder that throws on the
// owner's actual phone, so the format is asked for at runtime and the result
// is translated into a media type the Gemini API recognises.

/**
 * Container/codec pairs offered to MediaRecorder, best first. Opus leads
 * because it is markedly smaller per second than AAC; Safari supports none of
 * the Opus entries and lands on `audio/mp4`.
 */
export const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const

/** The audio media types the Gemini API documents as accepted. */
export const GEMINI_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/opus',
  'audio/webm',
] as const

/**
 * Media types a browser hands back that the API does not list, mapped to the
 * listed name for the same bytes. `audio/mp4` is the important one: it is what
 * Safari produces and what an unmapped request would be rejected for, even
 * though `audio/m4a` names exactly the same AAC-in-MP4 file.
 */
const ALIASES: Record<string, string> = {
  'audio/mp4': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/mp4a-latm': 'audio/m4a',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vorbis': 'audio/ogg',
  'audio/ogg-opus': 'audio/opus',
}

/**
 * A media type stripped down to `type/subtype`: no `;codecs=…`, no stray
 * whitespace, lowercased. Browsers report the codec parameter on
 * `MediaRecorder.mimeType` and on the resulting Blob, and the API wants it gone.
 */
export function baseMimeType(value: string): string {
  return value.split(';')[0].trim().toLowerCase()
}

/**
 * The first format this browser will actually record, or null when none of the
 * candidates is supported — in which case MediaRecorder is left to pick its own
 * default, which is still likely to be something the API accepts.
 *
 * The support check is a parameter rather than a direct call to
 * `MediaRecorder.isTypeSupported` so this can be exercised against a stand-in
 * for Safari, for Chrome, and for a browser that supports nothing.
 */
export function pickRecordingMimeType(
  isSupported: (mimeType: string) => boolean,
): string | null {
  for (const candidate of RECORDING_MIME_TYPES) {
    try {
      if (isSupported(candidate)) return candidate
    } catch {
      // A browser that throws on a type it doesn't know simply doesn't get it.
    }
  }
  return null
}

/**
 * What to tell Gemini a recording is, or null when this browser produced
 * something the API has no name for. Callers treat null as a friendly refusal
 * rather than sending bytes that would come back as a 400.
 */
export function toGeminiMimeType(value: string): string | null {
  const base = baseMimeType(value)
  if (base.length === 0) return null

  const mapped = ALIASES[base] ?? base
  return (GEMINI_AUDIO_MIME_TYPES as readonly string[]).includes(mapped) ? mapped : null
}

/** Whether this browser can record at all — checked before asking for the mic. */
export function supportsRecording(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}
