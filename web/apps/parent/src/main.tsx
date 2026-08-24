import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// No requestPersistentStorage() here: only the staff app queues offline work (§10.2).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
