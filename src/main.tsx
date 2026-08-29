import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { ensurePersistentStorage } from './db/index.ts'
import './index.css'

registerSW({ immediate: true })

// Ask the browser to keep IndexedDB around; meal data only lives on-device.
void ensurePersistentStorage()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
