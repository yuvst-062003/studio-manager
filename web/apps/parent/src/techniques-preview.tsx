// A render harness for the design-review loop, NOT a shipped entry — the same role
// `wizard-preview.tsx` plays, and for the same reason: the shell is owned by another
// session, so the screens are reviewed here before anything is wired into `App.tsx`.
// Delete once the library is mounted for real.
//
// `?screen=detail&slug=…` picks a screen, so one harness serves every checkpoint.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
// Mirrors main.tsx: fonts.css and tokens.css arrive through @studio/ui's barrel. Without
// it the preview renders in the browser's default serif with Tailwind's tokens
// unopposed — which is exactly what the wizard's first two checkpoints screenshotted.
import { ThemeProvider } from '@studio/ui'
import { TechniqueDetail } from './features/techniques/TechniqueDetail'
import { TechniquesScreen } from './features/techniques/TechniquesScreen'
import { matchTechniquesPath } from './features/techniques'
import './tailwind.css'

function Preview() {
  const params = new URLSearchParams(globalThis.location.search)
  const [hash, setHash] = useState(
    () => globalThis.location.hash || (params.get('screen') === 'detail'
      ? `#/techniques/${params.get('slug') ?? 'seoi-nage'}`
      : '#/techniques'),
  )

  // The real hash routing, not a prop — so the harness exercises `matchTechniquesPath`
  // and the row links, which is where a route bug would actually live.
  const route = matchTechniquesPath(hash) ?? { kind: 'list' as const }

  return (
    <ThemeProvider>
      <div
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest('a')
          const href = link?.getAttribute('href')
          if (href?.startsWith('#/')) {
            event.preventDefault()
            setHash(href)
          }
        }}
        style={{ maxInlineSize: '390px', marginInline: 'auto', padding: '16px' }}
      >
        {route.kind === 'detail' ? (
          <TechniqueDetail locale="he" slug={route.slug} />
        ) : (
          <TechniquesScreen locale="he" />
        )}
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
