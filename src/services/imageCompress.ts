// Shrinking a photo before it ever leaves the device.
//
// A phone camera produces multi-megabyte images; sending one raw would be slow
// on cellular and needlessly expensive. Everything here runs client-side: the
// original file is decoded, drawn into a canvas at a bounded size, and
// re-encoded as JPEG. Only that smaller copy is ever sent anywhere.
import { LLMError } from './llm/types.ts'

/** Longest edge of the image we send. Plenty for identifying food. */
export const MAX_EDGE = 1024
/** JPEG quality. Visibly fine for photos, a fraction of the bytes. */
export const JPEG_QUALITY = 0.7

/** The image formats the Messages API accepts. */
export const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export type ImageMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

/** A photo that is ready to preview and to send. */
export interface CompressedImage {
  /** `data:image/jpeg;base64,…` — what the preview `<img>` renders. */
  dataUrl: string
  /** The payload half of {@link dataUrl}, which is what the API wants. */
  base64: string
  mediaType: ImageMediaType
  width: number
  height: number
  /** Roughly what the encoded image weighs, for the "142 KB" hint. */
  bytes: number
}

const UNREADABLE = "Couldn't read that photo. Try another one."

export function isSupportedMediaType(value: string): value is ImageMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(value)
}

/**
 * The size to draw at: the long edge capped at `maxEdge`, aspect ratio kept,
 * and never larger than the original — upscaling would add bytes and no detail.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const w = Math.floor(width)
  const h = Math.floor(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new LLMError('bad-output', UNREADABLE)
  }

  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: w, height: h }

  const scale = maxEdge / longest
  // Rounding can land on 0 for an extremely thin image; one pixel is the floor.
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

/**
 * Split a base64 data URL into the two things the API needs. Rejects anything
 * that is not a base64 data URL in a format the API accepts, so a bad file is
 * caught here rather than as a 400 after the upload.
 */
export function splitDataUrl(dataUrl: string): { mediaType: ImageMediaType; base64: string } {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]*)$/i.exec(dataUrl.trim())
  if (!match) throw new LLMError('bad-output', UNREADABLE)

  const mediaType = match[1].toLowerCase()
  const base64 = match[2]

  if (!isSupportedMediaType(mediaType)) {
    throw new LLMError('unsupported', 'That image format isn’t supported. Try a JPEG or PNG.')
  }
  if (base64.length === 0) throw new LLMError('bad-output', UNREADABLE)

  return { mediaType, base64 }
}

/** How many bytes a base64 payload decodes to. Four characters carry three. */
export function decodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

/**
 * Decode a file into an `<img>`. Using an element rather than `createImageBitmap`
 * because Safari applies EXIF orientation here, so a photo taken sideways is
 * drawn the way the owner saw it.
 */
function loadImage(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const revoke = () => URL.revokeObjectURL(url)
    const image = new Image()
    image.onload = () => resolve({ image, revoke })
    image.onerror = () => {
      revoke()
      reject(new LLMError('bad-output', UNREADABLE))
    }
    image.src = url
  })
}

/**
 * A picked photo, resized and re-encoded. Throws {@link LLMError} for every
 * expected failure — a non-image file, an undecodable one, a canvas the browser
 * refused to export.
 */
export async function compressImage(
  file: File,
  maxEdge: number = MAX_EDGE,
  quality: number = JPEG_QUALITY,
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new LLMError('unsupported', 'That file isn’t an image. Pick a photo.')
  }

  const { image, revoke } = await loadImage(file)
  let dataUrl: string
  let size: { width: number; height: number }
  try {
    size = targetDimensions(image.naturalWidth, image.naturalHeight, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (context === null) throw new LLMError('bad-output', UNREADABLE)
    context.drawImage(image, 0, 0, size.width, size.height)

    // Always JPEG: it is the format we want, and it keeps the media type we
    // send from depending on whatever the phone happened to hand us.
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  } finally {
    revoke()
  }

  const { mediaType, base64 } = splitDataUrl(dataUrl)
  return {
    dataUrl,
    base64,
    mediaType,
    width: size.width,
    height: size.height,
    bytes: decodedByteLength(base64),
  }
}
