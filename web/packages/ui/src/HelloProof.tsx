import { useEffect, useState } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDisplayMode } from '@studio/core'
import { useTheme } from './ThemeProvider'
import type { ThemePreference } from './theme'

const PREFERENCES: ThemePreference[] = ['light', 'dark', 'system']

/** One run per script D6 claims Rubik covers. Rendered isolated (SPEC §9). */
const PROOF_RUNS = ['hebrew', 'latin', 'cyrillic', 'digits'] as const

/**
 * The M0.1 skeleton screen. It exists to prove three things are wired, not to be
 * a design: Rubik loads with the Hebrew and Cyrillic subsets, dir flows from the
 * locale, and light/dark both resolve. M1 replaces it.
 */
export function HelloProof({
  appNameKey,
  locale = 'he',
}: {
  appNameKey: string
  locale?: Locale
}) {
  const { preference, resolved, setPreference } = useTheme()
  const displayMode = useDisplayMode()
  const [fontReady, setFontReady] = useState(false)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = DIRECTION[locale]
  }, [locale])

  useEffect(() => {
    // document.fonts is absent in jsdom; the real proof runs in the Playwright gate.
    void document.fonts?.ready.then(() =>
      setFontReady(document.fonts.check('1rem "Rubik Variable"')),
    )
  }, [])

  return (
    <main
      style={{
        minBlockSize: '100dvh',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        background: 'var(--ground)',
        color: 'var(--fg)',
      }}
    >
      <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t(locale, appNameKey)}</p>
      <h1 style={{ margin: 0, fontWeight: 600 }}>{t(locale, 'common.hello.title')}</h1>

      <p
        data-testid="font-proof"
        data-font-ready={fontReady}
        style={{
          fontSize: '1.25rem',
          margin: 0,
          paddingBlockEnd: 'var(--space-4)',
          borderBlockEnd: '1px solid var(--border)',
        }}
      >
        {PROOF_RUNS.map((run, i) => (
          <span key={run}>
            {i > 0 ? <span aria-hidden="true"> · </span> : null}
            {/* SPEC §9 — each run is isolated, or the separators reorder around
                the direction change and the line reads as a bidi bug. */}
            <bdi>{t(locale, `common.hello.fontProof.${run}`)}</bdi>
          </span>
        ))}
      </p>

      <dl style={{ display: 'grid', gap: 'var(--space-3)', margin: 0 }}>
        <div>
          <dt style={{ color: 'var(--text-muted)' }}>{t(locale, 'common.hello.direction')}</dt>
          <dd data-testid="direction" style={{ marginInlineStart: 0 }}>
            {DIRECTION[locale]}
          </dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-muted)' }}>{t(locale, 'common.hello.theme')}</dt>
          <dd data-testid="resolved-theme" style={{ marginInlineStart: 0 }}>
            {resolved}
          </dd>
        </div>
        <div>
          <dd data-testid="display-mode" style={{ marginInlineStart: 0 }}>
            {t(
              locale,
              displayMode === 'browser'
                ? 'common.displayMode.browser'
                : 'common.displayMode.standalone',
            )}
          </dd>
        </div>
      </dl>

      <div role="group" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {PREFERENCES.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preference === p}
            onClick={() => setPreference(p)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${preference === p ? 'var(--fg)' : 'var(--border)'}`,
              background: preference === p ? 'var(--fg)' : 'var(--surface)',
              color: preference === p ? 'var(--ground)' : 'var(--fg)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {t(locale, `common.theme.${p}`)}
          </button>
        ))}
      </div>
    </main>
  )
}
