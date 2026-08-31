import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the device asks for reduced motion. CSS transitions are already
 * neutralised in index.css; this is for animation that JavaScript drives —
 * Recharts' bar grow-in — which a stylesheet cannot reach.
 */
export default function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true,
  )

  useEffect(() => {
    const media = window.matchMedia?.(QUERY)
    if (!media) return
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}
