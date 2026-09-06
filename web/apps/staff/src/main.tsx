import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lockViewportZoom, requestPersistentStorage } from '@studio/core'
import App from './App'
// §8 — utilities app-wide, preflight scoped to `.tw-scope`. See tailwind.css.
import './tailwind.css'
// AFTER tailwind.css and deliberately so: its rules are unlayered and outrank every
// Tailwind layer, but only a reader checking the order can tell that was on purpose.
import '@studio/ui/app-viewport.css'
import { registerServiceWorker } from './registerSW'

// §10.6 — pending_ops must never be reclaimed. Requested on boot and the result
// recorded for M8's install report rather than discarded. Deliberately not
// awaited: a slow or refused permission must not delay first paint.
void requestPersistentStorage()

// A coach marks attendance one-handed on a phone at the edge of a mat. See the stylesheet
// above and lockViewportZoom's own header for the three behaviours this removes between
// them, and for the accessibility trade it rests on.
lockViewportZoom()

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
