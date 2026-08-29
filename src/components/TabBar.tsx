type IconProps = { className?: string }

function RingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function BarsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <rect x="4" y="13" width="3.5" height="7" rx="1.2" />
      <rect x="10.25" y="7" width="3.5" height="13" rx="1.2" />
      <rect x="16.5" y="10" width="3.5" height="10" rx="1.2" />
    </svg>
  )
}

export default function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[430px] border-t border-ink-600/60 bg-ink-900/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid h-20 grid-cols-3 items-center">
        <li className="flex justify-center">
          <button
            type="button"
            aria-current="page"
            className="flex flex-col items-center gap-1.5 px-4 py-2 text-accent"
          >
            <RingIcon className="h-6 w-6" />
            <span className="text-xs font-medium">Today</span>
          </button>
        </li>

        <li className="flex justify-center">
          <button
            type="button"
            aria-label="Add meal"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/60 bg-accent/10 text-accent shadow-[0_0_24px_-6px_var(--color-accent)] transition active:scale-95"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </li>

        <li className="flex justify-center">
          <button
            type="button"
            className="flex flex-col items-center gap-1.5 px-4 py-2 text-mist-500"
          >
            <BarsIcon className="h-6 w-6" />
            <span className="text-xs font-medium">Trends</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
