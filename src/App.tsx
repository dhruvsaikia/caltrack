import TodayScreen from './screens/Today/TodayScreen.tsx'
import DebugScreen from './screens/Debug/DebugScreen.tsx'
import TabBar from './components/TabBar.tsx'

export default function App() {
  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col">
      <main className="flex-1 pb-28">
        <TodayScreen />
        <DebugScreen />
      </main>
      <TabBar />
    </div>
  )
}
