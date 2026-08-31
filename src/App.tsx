import { useState } from 'react'
import TodayScreen from './screens/Today/TodayScreen.tsx'
import AddMealScreen from './screens/AddMeal/AddMealScreen.tsx'
import MealForm from './screens/AddMeal/MealForm.tsx'
import ConfirmScreen from './screens/Confirm/ConfirmScreen.tsx'
import SettingsScreen from './screens/Settings/SettingsScreen.tsx'
import TrendsScreen from './screens/Trends/TrendsScreen.tsx'
import TabBar, { type Tab } from './components/TabBar.tsx'
import type { MealSource, MealWithItems } from './db/index.ts'
import type { CompressedImage } from './services/imageCompress.ts'
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
  | { name: 'confirm'; estimate: MealEstimate; source: MealSource }
  | { name: 'trends' }
  | { name: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'today' })
  // Bumped after a save or delete so Today re-reads the database on return.
  const [reloadKey, setReloadKey] = useState(0)
  // These live here so stepping forward to Confirm and back keeps what was
  // typed, and the photo that was picked.
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<CompressedImage | null>(null)

  const reload = () => setReloadKey((key) => key + 1)
  const goToday = () => setView({ name: 'today' })

  const finishAdding = () => {
    setDescription('')
    setPhoto(null)
    reload()
    goToday()
  }

  if (view.name === 'add') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <AddMealScreen
          description={description}
          onDescriptionChange={setDescription}
          photo={photo}
          onPhotoChange={setPhoto}
          onEstimate={(estimate, source) => setView({ name: 'confirm', estimate, source })}
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
          // A photo estimate has no typed words, so the meal name falls back
          // to the first food the model named.
          description={view.source === 'photo' ? '' : description}
          source={view.source}
          onSaved={finishAdding}
          // Back keeps the description and photo so either can be retried.
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
    else if (tab === 'trends') setView({ name: 'trends' })
    else if (tab === 'today') goToday()
  }

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col">
      <main className="flex-1 pb-28">
        {view.name === 'settings' ? (
          // A new goal changes the ring, so Today re-reads when it comes back.
          <SettingsScreen onGoalChanged={reload} />
        ) : view.name === 'trends' ? (
          <TrendsScreen reloadKey={reloadKey} />
        ) : (
          <TodayScreen
            reloadKey={reloadKey}
            onAddMeal={() => setView({ name: 'add' })}
            onEditMeal={(meal) => setView({ name: 'meal', editing: meal })}
          />
        )}
      </main>
      <TabBar
        active={view.name === 'settings' || view.name === 'trends' ? view.name : 'today'}
        onNavigate={goTo}
        onAddMeal={() => setView({ name: 'add' })}
      />
    </div>
  )
}
