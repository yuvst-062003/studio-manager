import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// §9 — utilities app-wide, preflight scoped to `.tw-scope`. See tailwind.css.
import './tailwind.css'
// AFTER tailwind.css and deliberately so: its rules are unlayered and outrank every
// Tailwind layer, but only a reader checking the order can tell that was on purpose.
import '@studio/ui/app-viewport.css'
import { lockViewportZoom } from '@studio/core'
import { registerServiceWorker } from './registerSW'

// No requestPersistentStorage() here: only the staff app queues offline work (§10.2).

// Before first paint, not in an effect: an effect runs after React mounts, and a pinch in
// that window zooms a page nothing then un-zooms. The disposer is dropped on purpose —
// this lives as long as the document.
lockViewportZoom()

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
