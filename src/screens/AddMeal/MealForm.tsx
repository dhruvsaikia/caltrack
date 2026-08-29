import { useId, useState, type FormEvent } from 'react'
import {
  addMeal,
  deleteMeal,
  sumTotals,
  toDateKey,
  updateMeal,
  type DateKey,
  type MealWithItems,
} from '../../db/index.ts'
import { MACRO_LABELS, type MacroKey } from '../Today/summary.ts'

const CALORIE_STEP = 50

/** Form state is text so a half-typed field ("1", "") stays editable. */
interface FormValues {
  name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function initialValues(meal?: MealWithItems): FormValues {
  if (!meal) return { name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' }
  const totals = sumTotals(meal.items)
  const blankIfZero = (n: number) => (n > 0 ? String(n) : '')
  return {
    name: meal.name,
    calories: blankIfZero(totals.calories),
    protein_g: blankIfZero(totals.protein_g),
    carbs_g: blankIfZero(totals.carbs_g),
    fat_g: blankIfZero(totals.fat_g),
  }
}

function NumberField({
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
        inputMode="decimal"
        enterKeyHint="done"
        value={value}
        placeholder="0"
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

function StepButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label === '−' ? `Subtract ${CALORIE_STEP} calories` : `Add ${CALORIE_STEP} calories`}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ink-500 text-xl text-mist-300 transition active:scale-95"
    >
      {label}
    </button>
  )
}

/**
 * Manual add/edit screen. A hand-entered meal is stored as a single food item
 * carrying the meal's numbers, so it sums the same way an AI-parsed meal will.
 */
export default function MealForm({
  meal,
  date = toDateKey(),
  onDone,
  onCancel,
}: {
  /** Present when editing an existing meal; absent when adding a new one. */
  meal?: MealWithItems
  date?: DateKey
  onDone: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(meal))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Deleting is one mis-tap away from losing an entry, so it asks once first.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameId = useId()
  const calorieId = useId()

  const isEditing = meal !== undefined
  const set = (key: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  const stepCalories = (delta: number) =>
    set('calories', String(Math.max(toNumber(values.calories) + delta, 0)))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setError('Give the meal a name.')
      return
    }

    const item = {
      name,
      portion: '',
      calories: toNumber(values.calories),
      protein_g: toNumber(values.protein_g),
      carbs_g: toNumber(values.carbs_g),
      fat_g: toNumber(values.fat_g),
    }

    setBusy(true)
    try {
      if (meal) await updateMeal(meal.id, { name, items: [item] })
      else await addMeal({ date, loggedAt: Date.now(), name, source: 'manual', items: [item] })
      onDone()
    } catch {
      setError("Couldn't save this meal to your device.")
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!meal) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setBusy(true)
    try {
      await deleteMeal(meal.id)
      onDone()
    } catch {
      setError("Couldn't delete this meal.")
      setConfirmingDelete(false)
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
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
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-mist-100">
        {isEditing ? 'Edit meal' : 'Add meal'}
      </h1>

      <label htmlFor={nameId} className="mt-8 block text-sm text-mist-500">
        Meal
      </label>
      <input
        id={nameId}
        type="text"
        value={values.name}
        onChange={(event) => set('name', event.target.value)}
        placeholder="What did you eat?"
        autoComplete="off"
        enterKeyHint="done"
        className="mt-2 w-full rounded-2xl border border-ink-600 bg-ink-700/70 px-4 py-4 text-lg text-mist-100 outline-none placeholder:text-mist-500/70 focus:border-accent/60"
      />

      <label htmlFor={calorieId} className="mt-6 block text-sm text-mist-500">
        Calories
      </label>
      <div className="mt-2 flex items-center gap-4 rounded-2xl bg-ink-700/70 px-4 py-5">
        <StepButton label="−" onClick={() => stepCalories(-CALORIE_STEP)} />
        <div className="min-w-0 flex-1">
          <input
            id={calorieId}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            value={values.calories}
            placeholder="0"
            onChange={(event) => set('calories', event.target.value)}
            className="w-full bg-transparent text-center text-5xl font-semibold tabular-nums text-mist-100 outline-none placeholder:text-mist-500/60"
          />
          <span className="mt-1 block text-center text-sm text-accent">kcal</span>
        </div>
        <StepButton label="+" onClick={() => stepCalories(CALORIE_STEP)} />
      </div>

      <fieldset className="mt-4 grid grid-cols-3 gap-3 border-0 p-0">
        <legend className="sr-only">Macros in grams</legend>
        {(Object.keys(MACRO_LABELS) as MacroKey[]).map((key) => (
          <NumberField
            key={key}
            label={MACRO_LABELS[key]}
            value={values[key]}
            onChange={(value) => set(key, value)}
          />
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="mt-5 text-center text-sm text-mist-300">
          {error}
        </p>
      )}

      <div className="mt-auto pt-10">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl border border-accent/60 py-4 text-base font-medium text-accent transition active:scale-[0.98] disabled:opacity-50"
        >
          {isEditing ? 'Save changes' : 'Add to Today'}
        </button>
        <button
          type="button"
          onClick={isEditing ? handleDelete : onCancel}
          disabled={busy}
          className={`mt-4 w-full py-2 text-base transition active:scale-[0.98] disabled:opacity-50 ${
            confirmingDelete ? 'font-medium text-warn' : 'text-mist-500'
          }`}
        >
          {!isEditing ? 'Discard' : confirmingDelete ? 'Tap again to delete' : 'Delete meal'}
        </button>
      </div>
    </form>
  )
}
