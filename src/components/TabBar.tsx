export type Tab = 'today' | 'trends' | 'settings'

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

function SlidersIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 8h5M15 8h5M4 16h11M19 16h1" />
      <circle cx="12" cy="8" r="2.6" />
      <circle cx="17" cy="16" r="2.6" />
    </svg>
  )
}

function TabButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: (props: IconProps) => React.JSX.Element
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const Icon = icon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-1.5 px-4 py-2 transition disabled:opacity-60 ${
        active ? 'text-accent' : 'text-mist-500'
      }`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

/**
 * Five slots so the add button stays dead-centre as in the design: Today and
 * Trends on the left, the button in the middle, Settings pinned to the right.
 */
export default function TabBar({
  active,
  onNavigate,
  onAddMeal,
}: {
  active: Tab
  onNavigate: (tab: Tab) => void
  onAddMeal: () => void
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[430px] border-t border-ink-600/60 bg-ink-900/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid h-20 grid-cols-5 items-center">
        <li className="flex justify-center">
          <TabButton
            label="Today"
            icon={RingIcon}
            active={active === 'today'}
            onClick={() => onNavigate('today')}
          />
        </li>

        <li className="flex justify-center">
          <TabButton
            label="Trends"
            icon={BarsIcon}
            active={active === 'trends'}
            onClick={() => onNavigate('trends')}
          />
        </li>

        <li className="flex justify-center">
          <button
            type="button"
            aria-label="Add meal"
            onClick={onAddMeal}
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

        <li aria-hidden="true" />

        <li className="flex justify-center">
          <TabButton
            label="Settings"
            icon={SlidersIcon}
            active={active === 'settings'}
            onClick={() => onNavigate('settings')}
          />
        </li>
      </ul>
    </nav>
  )
}
