import { useState } from 'react'
import TodayScreen from './screens/Today/TodayScreen.tsx'
import AddMealScreen from './screens/AddMeal/AddMealScreen.tsx'
import MealForm from './screens/AddMeal/MealForm.tsx'
import ConfirmScreen from './screens/Confirm/ConfirmScreen.tsx'
import SettingsScreen from './screens/Settings/SettingsScreen.tsx'
import TabBar, { type Tab } from './components/TabBar.tsx'
import type { MealWithItems } from './db/index.ts'
import type { MealEstimate } from './services/llm/index.ts'

/**
 * A handful of screens, so navigation is a piece of state rather than a router
 * dependency. `editing` carries the meal the form should open with, and
 * `estimate` the AI answer the Confirm screen is reviewing.
 */
type View =
  | { name: 'today' }
  | { name: 'add' }
  | { name: 'meal'; editing?: MealWithItems }
  | { name: 'confirm'; estimate: MealEstimate }
  | { name: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'today' })
  // Bumped after a save or delete so Today re-reads the database on return.
  const [reloadKey, setReloadKey] = useState(0)
  // Lives here so stepping forward to Confirm and back keeps what was typed.
  const [description, setDescription] = useState('')

  const reload = () => setReloadKey((key) => key + 1)
  const goToday = () => setView({ name: 'today' })

  const finishAdding = () => {
    setDescription('')
    reload()
    goToday()
  }

  if (view.name === 'add') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <AddMealScreen
          description={description}
          onDescriptionChange={setDescription}
          onEstimate={(estimate) => setView({ name: 'confirm', estimate })}
          onManualEntry={() => setView({ name: 'meal' })}
          onOpenSettings={() => setView({ name: 'settings' })}
          onCancel={goToday}
        />
      </div>
    )
  }

  if (view.name === 'confirm') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <ConfirmScreen
          estimate={view.estimate}
          description={description}
          onSaved={finishAdding}
          // Back keeps the description so the wording can be adjusted and retried.
          onBack={() => setView({ name: 'add' })}
          onDiscard={finishAdding}
        />
      </div>
    )
  }

  if (view.name === 'meal') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <MealForm
          // Remount per meal so the form starts from that meal's values.
          key={view.editing?.id ?? 'new'}
          meal={view.editing}
          onDone={finishAdding}
          onCancel={goToday}
        />
      </div>
    )
  }

  const goTo = (tab: Tab) => {
    if (tab === 'settings') setView({ name: 'settings' })
    else if (tab === 'today') goToday()
  }

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col">
      <main className="flex-1 pb-28">
        {view.name === 'settings' ? (
          // A new goal changes the ring, so Today re-reads when it comes back.
          <SettingsScreen onGoalChanged={reload} />
        ) : (
          <TodayScreen
            reloadKey={reloadKey}
            onAddMeal={() => setView({ name: 'add' })}
            onEditMeal={(meal) => setView({ name: 'meal', editing: meal })}
          />
        )}
      </main>
      <TabBar
        active={view.name === 'settings' ? 'settings' : 'today'}
        onNavigate={goTo}
        onAddMeal={() => setView({ name: 'add' })}
      />
    </div>
  )
}
