import { useState } from 'react'
import TodayScreen from './screens/Today/TodayScreen.tsx'
import MealForm from './screens/AddMeal/MealForm.tsx'
import TabBar from './components/TabBar.tsx'
import type { MealWithItems } from './db/index.ts'

/**
 * Two screens so far, so navigation is a piece of state rather than a router
 * dependency. `editing` carries the meal the form should open with.
 */
type View = { name: 'today' } | { name: 'meal'; editing?: MealWithItems }

export default function App() {
  const [view, setView] = useState<View>({ name: 'today' })
  // Bumped after a save or delete so Today re-reads the database on return.
  const [reloadKey, setReloadKey] = useState(0)

  const goToday = () => setView({ name: 'today' })

  if (view.name === 'meal') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <MealForm
          // Remount per meal so the form starts from that meal's values.
          key={view.editing?.id ?? 'new'}
          meal={view.editing}
          onDone={() => {
            setReloadKey((key) => key + 1)
            goToday()
          }}
          onCancel={goToday}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col">
      <main className="flex-1 pb-28">
        <TodayScreen
          reloadKey={reloadKey}
          onAddMeal={() => setView({ name: 'meal' })}
          onEditMeal={(meal) => setView({ name: 'meal', editing: meal })}
        />
      </main>
      <TabBar onAddMeal={() => setView({ name: 'meal' })} />
    </div>
  )
}
