import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './registerSW'

// No requestPersistentStorage() here: only the staff app queues offline work (§10.2).

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The boot splash in index.html paints before this file exists — it is what stops a cold
// start showing the page's cream ground between the OS splash and React's own. Removed
// AFTER the first paint, not before: taking it away at mount would put the white gap back,
// one frame wide.
//
// `requestAnimationFrame` twice, because one fires before the paint that renders the tree.
// The app's own splash is the same colour and the same mark, so what a person sees across
// the handover is a screen that does not change.
requestAnimationFrame(() => {
  requestAnimationFrame(() => document.getElementById('boot-splash')?.remove())
})
