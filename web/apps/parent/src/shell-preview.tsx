// A render harness for the design-review loop, NOT a shipped entry — the same arrangement
// `wizard-preview.tsx` records, and deleted the same way once the tab it previews is real.
//
// The shell cannot be screenshotted through the app itself: `App.tsx` needs a session, a
// backend and two passed gates before the bar renders at all. This mounts `ParentShell`
// alone so checkpoint 1 can compare the ported bar against the prototype's.
//
// `?tab=home|shop|updates|profile` picks the active tab, `?badge=<n>` the unread count.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Mirrors main.tsx: fonts.css and tokens.css arrive through @studio/ui's barrel. Without
// it the preview renders in the browser's default serif — the defect that cost the wizard
// its first two checkpoints.
import { ThemeProvider } from '@studio/ui'
import { ParentShell } from './features/shell/ParentShell'
import type { ParentTab } from './features/shell/ParentTabBar'
import './tailwind.css'

const params = new URLSearchParams(window.location.search)
const tab = (params.get('tab') ?? 'home') as ParentTab
const badge = Number(params.get('badge') ?? 2)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ParentShell activeTab={tab} updatesBadgeCount={badge}>
        {/* Stands in for the screen a checkpoint has not ported yet, so the bar is looked
            at against a real page's ground rather than against nothing. */}
        <div className="tw-scope flex-1 px-4 pt-6">
          <div className="h-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700" />
        </div>
      </ParentShell>
    </ThemeProvider>
  </StrictMode>,
)
