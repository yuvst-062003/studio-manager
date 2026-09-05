import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// §9 — utilities app-wide, preflight scoped to `.tw-scope`. See tailwind.css.
import './tailwind.css'
import { registerServiceWorker } from './registerSW'

// No requestPersistentStorage() here: only the staff app queues offline work (§10.2).

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
