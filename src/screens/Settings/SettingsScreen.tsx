import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_DAILY_CALORIES,
  ensurePersistentStorage,
  getSettingOr,
  getTargetForDate,
  isPersistentStorage,
  setSetting,
  setTarget,
  type Target,
} from '../../db/index.ts'
import { DEFAULT_PROVIDER, hasApiKey, PROVIDERS, type ProviderId } from '../../services/keyVault.ts'
import { MACRO_LABELS, type MacroKey } from '../Today/summary.ts'
import ApiKeyCard from './ApiKeyCard.tsx'

/** Goal fields are text so a half-typed or cleared value stays editable. */
type GoalValues = { calories: string } & Record<MacroKey, string>

const EMPTY_GOAL: GoalValues = { calories: '', protein_g: '', carbs_g: '', fat_g: '' }

function goalValuesFrom(target: Target | undefined): GoalValues {
  const text = (n: number | undefined) => (typeof n === 'number' && n > 0 ? String(n) : '')
  return {
    calories: text(target?.dailyCalories),
    protein_g: text(target?.protein_g),
    carbs_g: text(target?.carbs_g),
    fat_g: text(target?.fat_g),
  }
}

/** A blank or non-positive field means "no goal for this macro". */
function optionalGrams(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">{title}</h2>
      {description && <p className="mt-2 text-sm text-mist-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function GramField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="rounded-2xl bg-ink-700/70 px-3.5 py-3">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        value={value}
        placeholder="—"
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-center text-2xl font-semibold tabular-nums text-mist-100 outline-none placeholder:text-mist-500/60"
      />
      <label
        htmlFor={id}
        className="mt-1 block text-center text-[11px] font-semibold uppercase tracking-wider text-mist-500"
      >
        {label}
      </label>
    </div>
  )
}

/**
 * Settings: the daily goal, which AI provider to use, and that provider's key.
 * Keys are handled entirely by the key vault and never touch the database.
 */
export default function SettingsScreen({ onGoalChanged }: { onGoalChanged?: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [goal, setGoal] = useState<GoalValues>(EMPTY_GOAL)
  const [persisted, setPersisted] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Bumped whenever a key is saved or removed below, so the warning under the
  // provider picker reflects the vault without a reload.
  const [keyRevision, setKeyRevision] = useState(0)
  const calorieId = useId()

  const missingKey = useMemo(
    () => !hasApiKey(provider),
    // keyRevision is the trigger: hasApiKey reads localStorage, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, keyRevision],
  )
  const providerLabel = PROVIDERS.find((option) => option.id === provider)?.label ?? provider

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [storedProvider, target, storagePersisted] = await Promise.all([
          getSettingOr('provider', DEFAULT_PROVIDER),
          getTargetForDate(),
          isPersistentStorage(),
        ])
        if (cancelled) return
        setProvider(storedProvider)
        setGoal(goalValuesFrom(target))
        setPersisted(storagePersisted)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const setGoalField = (key: keyof GoalValues, value: string) => {
    setGoal((current) => ({ ...current, [key]: value }))
    setSaved(false)
    setError(null)
  }

  async function chooseProvider(next: ProviderId) {
    setProvider(next)
    try {
      await setSetting('provider', next)
    } catch {
      setError("Couldn't save that choice to this device.")
    }
  }

  async function saveGoal() {
    const calories = Number.parseFloat(goal.calories)
    if (!Number.isFinite(calories) || calories <= 0) {
      setError('Enter a daily calorie goal above zero.')
      return
    }

    setSaving(true)
    try {
      await setTarget({
        dailyCalories: Math.round(calories),
        protein_g: optionalGrams(goal.protein_g),
        carbs_g: optionalGrams(goal.carbs_g),
        fat_g: optionalGrams(goal.fat_g),
      })
      setSaved(true)
      onGoalChanged?.()
    } catch {
      setError("Couldn't save your goal to this device.")
    } finally {
      setSaving(false)
    }
  }

  async function askForPersistentStorage() {
    setPersisted(await ensurePersistentStorage())
  }

  return (
    <div className="px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">CalTrack</p>
        <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-mist-100">Settings</h1>
      </header>

      {status === 'error' ? (
        <p role="alert" className="mt-10 text-sm text-mist-300">
          Couldn't read your settings from this device.
        </p>
      ) : (
        <div className={status === 'loading' ? 'invisible' : ''}>
          <Section
            title="Daily goal"
            description="Applies from today onward. Earlier days keep the goal they were logged against."
          >
            <label htmlFor={calorieId} className="block text-sm text-mist-500">
              Calories
            </label>
            <div className="mt-2 rounded-2xl bg-ink-700/70 px-4 py-5">
              <input
                id={calorieId}
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                value={goal.calories}
                placeholder={String(DEFAULT_DAILY_CALORIES)}
                onChange={(event) => setGoalField('calories', event.target.value)}
                className="w-full bg-transparent text-center text-5xl font-semibold tabular-nums text-mist-100 outline-none placeholder:text-mist-500/60"
              />
              <span className="mt-1 block text-center text-sm text-accent">kcal per day</span>
            </div>

            <fieldset className="mt-4 border-0 p-0">
              <legend className="mb-2 text-sm text-mist-500">
                Macro goals in grams (optional)
              </legend>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(MACRO_LABELS) as MacroKey[]).map((key) => (
                  <GramField
                    key={key}
                    label={MACRO_LABELS[key]}
                    value={goal[key]}
                    onChange={(value) => setGoalField(key, value)}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-mist-500">
                Leave a macro blank and its bar on Today shows that day's mix instead.
              </p>
            </fieldset>

            <button
              type="button"
              onClick={() => void saveGoal()}
              disabled={saving}
              className="mt-4 w-full rounded-xl border border-accent/60 py-3.5 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
            >
              {saved ? 'Goal saved' : 'Save goal'}
            </button>
          </Section>

          <Section
            title="AI provider"
            description="Used to turn what you describe into calories and macros."
          >
            <div
              role="radiogroup"
              aria-label="AI provider"
              className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-700/70 p-1.5"
            >
              {PROVIDERS.map((option) => {
                const selected = option.id === provider
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => void chooseProvider(option.id)}
                    className={`rounded-xl py-3 text-base font-medium transition active:scale-[0.98] ${
                      selected ? 'bg-accent/15 text-accent' : 'text-mist-300'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {missingKey && (
              <p role="status" className="mt-3 text-sm text-warn">
                No key saved for {providerLabel} — add one below before logging with AI.
              </p>
            )}
          </Section>

          <Section
            title="API keys"
            description="Your key stays in this browser on this device. It is never uploaded, never written to the database, and never shown in full again."
          >
            <ul className="flex flex-col gap-3">
              {PROVIDERS.map((option) => (
                <ApiKeyCard
                  key={option.id}
                  provider={option}
                  onKeyChange={() => setKeyRevision((revision) => revision + 1)}
                />
              ))}
            </ul>
          </Section>

          <Section title="On-device storage">
            <div className="rounded-2xl bg-ink-700/70 px-4 py-4">
              <p className="text-base text-mist-100">
                {persisted ? 'Protected from cleanup' : 'Best effort'}
              </p>
              <p className="mt-1.5 text-sm text-mist-500">
                {persisted
                  ? 'This browser has promised to keep your meals unless you delete them.'
                  : 'The browser may clear your meals if the device runs low on space.'}
              </p>
              {!persisted && (
                <button
                  type="button"
                  onClick={() => void askForPersistentStorage()}
                  className="mt-3 w-full rounded-xl border border-ink-500 py-2.5 text-sm text-mist-300 transition active:scale-[0.98]"
                >
                  Ask again
                </button>
              )}
            </div>
          </Section>

          {error && (
            <p role="alert" className="mt-6 text-center text-sm text-mist-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
