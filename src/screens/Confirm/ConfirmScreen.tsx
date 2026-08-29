import { useId, useState } from 'react'
import {
  addMeal,
  sumTotals,
  toDateKey,
  type Confidence,
  type DateKey,
  type MealSource,
} from '../../db/index.ts'
import type { EstimatedItem, MealEstimate } from '../../services/llm/index.ts'
import { MACRO_LABELS, type MacroKey } from '../Today/summary.ts'

/** Numbers stay as text while being edited so a cleared field stays editable. */
interface ItemDraft {
  name: string
  portion: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

// Low confidence is the one worth noticing, so it borrows the over-goal colour.
const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: 'bg-accent/25 text-accent-soft',
  medium: 'bg-accent/15 text-accent',
  low: 'bg-warn/15 text-warn',
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const blankIfZero = (n: number) => (n > 0 ? String(n) : '')

function toDraft(item: EstimatedItem): ItemDraft {
  return {
    name: item.name,
    portion: item.portion,
    calories: blankIfZero(item.calories),
    protein_g: blankIfZero(item.protein_g),
    carbs_g: blankIfZero(item.carbs_g),
    fat_g: blankIfZero(item.fat_g),
  }
}

function toItem(draft: ItemDraft): EstimatedItem {
  return {
    name: draft.name.trim(),
    portion: draft.portion.trim(),
    calories: toNumber(draft.calories),
    protein_g: toNumber(draft.protein_g),
    carbs_g: toNumber(draft.carbs_g),
    fat_g: toNumber(draft.fat_g),
  }
}

/**
 * A name for the meal as a whole. The model describes foods, not meals, so the
 * owner's own words are the best title — trimmed to something that fits a row.
 */
export function mealNameFrom(description: string, items: EstimatedItem[]): string {
  const collapsed = description.trim().replace(/\s+/g, ' ')
  if (collapsed.length === 0) return items[0]?.name ?? 'Meal'
  if (collapsed.length <= 40) return collapsed
  const cut = collapsed.slice(0, 40)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function TotalTile({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="rounded-2xl bg-ink-700/70 px-3.5 py-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-mist-100">{grams}g</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-mist-500">
        {label}
      </p>
    </div>
  )
}

function ItemNumberField({
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
    <div className="rounded-xl bg-ink-800 px-2 py-2">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={value}
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-center text-base font-semibold tabular-nums text-mist-100 outline-none placeholder:text-mist-500/60"
      />
      <label
        htmlFor={id}
        className="mt-0.5 block text-center text-[10px] font-semibold uppercase tracking-wider text-mist-500"
      >
        {label}
      </label>
    </div>
  )
}

/**
 * Review an AI estimate before it becomes a meal. Every number is editable and
 * nothing reaches the database until "Add to Today" is tapped. The meal is
 * stored as food items, so it sums exactly the way a manual entry does.
 */
export default function ConfirmScreen({
  estimate,
  description,
  source = 'text',
  date = toDateKey(),
  onSaved,
  onBack,
  onDiscard,
}: {
  estimate: MealEstimate
  /** What was typed on the Add screen; seeds the meal name. Empty for a photo. */
  description: string
  /** Which Add-screen path produced this estimate. Stored with the meal. */
  source?: MealSource
  date?: DateKey
  onSaved: () => void
  onBack: () => void
  onDiscard: () => void
}) {
  const [name, setName] = useState(() => mealNameFrom(description, estimate.items))
  const [drafts, setDrafts] = useState<ItemDraft[]>(() => estimate.items.map(toDraft))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameId = useId()

  const items = drafts.map(toItem)
  // Shown and saved from the same numbers, so the two can never disagree.
  const totals = sumTotals(items)

  const setField = (index: number, key: keyof ItemDraft, value: string) =>
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, [key]: value } : draft)),
    )

  const removeItem = (index: number) =>
    setDrafts((current) => current.filter((_, i) => i !== index))

  async function save() {
    const mealName = name.trim()
    if (!mealName) {
      setError('Give the meal a name.')
      return
    }
    const kept = items.filter((item) => item.name.length > 0)
    if (kept.length === 0) {
      setError('Keep at least one food.')
      return
    }

    setBusy(true)
    try {
      await addMeal({
        date,
        loggedAt: Date.now(),
        name: mealName,
        source,
        confidence: estimate.confidence,
        notes: estimate.notes,
        items: kept,
      })
      onSaved()
    } catch {
      setError("Couldn't save this meal to your device.")
      setBusy(false)
    }
  }

  return (
    <div
      className="flex min-h-[100svh] flex-col px-6 pb-10"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
    >
      <button
        type="button"
        onClick={onBack}
        className="self-start text-base text-mist-300 transition active:scale-[0.98]"
      >
        ← Back
      </button>

      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {source === 'photo' ? 'Photo estimate' : 'AI estimate'}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight text-mist-100">Confirm</h1>
        <span
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${CONFIDENCE_STYLES[estimate.confidence]}`}
        >
          {CONFIDENCE_LABELS[estimate.confidence]}
        </span>
      </div>

      <label htmlFor={nameId} className="mt-7 block text-sm text-mist-500">
        Meal
      </label>
      <input
        id={nameId}
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        enterKeyHint="done"
        className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-700/70 px-4 py-4 text-lg text-mist-100 outline-none placeholder:text-mist-500/70 focus:border-accent/60"
      />

      <p className="mt-6 text-sm text-mist-500">Calories</p>
      <div className="mt-2 rounded-2xl bg-ink-700/70 px-4 py-5">
        <p className="text-center text-5xl font-semibold tabular-nums text-mist-100">
          {totals.calories}
        </p>
        <p className="mt-1 text-center text-sm text-accent">kcal</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {(Object.keys(MACRO_LABELS) as MacroKey[]).map((key) => (
          <TotalTile key={key} label={MACRO_LABELS[key]} grams={totals[key]} />
        ))}
      </div>

      <p className="mt-6 text-sm text-mist-500">Estimated by AI — tap to edit</p>

      <ul className="mt-3 flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <li key={index} className="rounded-2xl bg-ink-700/70 px-3.5 py-3.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setField(index, 'name', event.target.value)}
                placeholder="Food"
                aria-label={`Food ${index + 1} name`}
                autoComplete="off"
                enterKeyHint="done"
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-mist-100 outline-none placeholder:text-mist-500/70"
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${draft.name || `food ${index + 1}`}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-mist-500 transition active:scale-95"
              >
                ×
              </button>
            </div>
            <input
              type="text"
              value={draft.portion}
              onChange={(event) => setField(index, 'portion', event.target.value)}
              placeholder="Portion"
              aria-label={`Food ${index + 1} portion`}
              autoComplete="off"
              enterKeyHint="done"
              className="mt-1 w-full bg-transparent text-sm text-mist-500 outline-none placeholder:text-mist-500/60"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              <ItemNumberField
                label="kcal"
                value={draft.calories}
                onChange={(value) => setField(index, 'calories', value)}
              />
              {(Object.keys(MACRO_LABELS) as MacroKey[]).map((key) => (
                <ItemNumberField
                  key={key}
                  label={MACRO_LABELS[key]}
                  value={draft[key]}
                  onChange={(value) => setField(index, key, value)}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      {estimate.notes && <p className="mt-4 text-sm text-mist-500">{estimate.notes}</p>}

      {error && (
        <p role="alert" className="mt-5 text-center text-sm text-mist-300">
          {error}
        </p>
      )}

      <div className="mt-auto pt-10">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full rounded-xl border border-accent/60 py-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
        >
          Add to Today
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="mt-4 w-full py-2 text-base text-mist-500 transition active:scale-[0.98] disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
