import { useId, useState } from 'react'
import {
  maskedApiKey,
  removeApiKey,
  setApiKey,
  type ProviderInfo,
} from '../../services/keyVault.ts'

/**
 * One provider's key. The key itself is only ever held in this component's
 * draft state while it is being typed — once saved, the screen shows the
 * masked form and nothing else reads the value back out.
 */
export default function ApiKeyCard({ provider }: { provider: ProviderInfo }) {
  const [masked, setMasked] = useState(() => maskedApiKey(provider.id))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Removing a key means re-pasting it from the provider's console, so it asks.
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const inputId = useId()

  const startEditing = () => {
    setDraft('')
    setError(null)
    setConfirmingRemove(false)
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft('')
    setError(null)
    setEditing(false)
  }

  function handleSave() {
    if (draft.trim().length === 0) {
      setError('Paste a key first.')
      return
    }
    if (!setApiKey(provider.id, draft)) {
      setError("This device wouldn't store the key. Check Safari's storage settings.")
      return
    }
    setMasked(maskedApiKey(provider.id))
    setDraft('')
    setError(null)
    setEditing(false)
  }

  function handleRemove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true)
      return
    }
    removeApiKey(provider.id)
    setMasked(null)
    setConfirmingRemove(false)
  }

  const showInput = editing || masked === null

  return (
    <li className="rounded-2xl bg-ink-700/70 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-base font-medium text-mist-100">
          {provider.label} key
        </label>
        <span className="text-xs text-mist-500">{provider.source}</span>
      </div>

      {showInput ? (
        <>
          <input
            id={inputId}
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            className="mt-3 w-full rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-3 text-base text-mist-100 outline-none placeholder:text-mist-500/70 focus:border-accent/60"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-xl border border-accent/60 py-2.5 text-sm font-medium text-accent transition active:scale-[0.98]"
            >
              Save key
            </button>
            {masked !== null && (
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-xl px-4 py-2.5 text-sm text-mist-500 transition active:scale-[0.98]"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 font-mono text-base tabular-nums text-mist-300">{masked}</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={startEditing}
              className="flex-1 rounded-xl border border-ink-500 py-2.5 text-sm text-mist-300 transition active:scale-[0.98]"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className={`rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] ${
                confirmingRemove ? 'font-medium text-warn' : 'text-mist-500'
              }`}
            >
              {confirmingRemove ? 'Tap again to remove' : 'Remove'}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-mist-300">
          {error}
        </p>
      )}
    </li>
  )
}
