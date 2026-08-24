import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { requestPersistentStorage } from '@studio/core'
import App from './App'

// §10.6 — pending_ops must never be reclaimed. Requested on boot and the result
// recorded for M8's install report rather than discarded. Deliberately not
// awaited: a slow or refused permission must not delay first paint.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
