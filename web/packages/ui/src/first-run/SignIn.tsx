// §6.1 step 2 — '[ המשך עם Google ] [ המשך עם Apple ] — system browser only, never a
// webview (§5.2)'.
//
// Each button is a plain <a href>, so the browser performs a TOP-LEVEL NAVIGATION. Never
// fetch, never an iframe, never a popup: §5.2 says "OAuth must never run inside a webview.
// Google returns disallowed_useragent", and an in-page request is the first step toward
// being one.
//
// The provider list comes from GET /auth/providers, which returns only providers whose
// credentials are configured. A button for an unconfigured provider fails one step AFTER
// the user has picked their account — which is worse than no button, and is what keeps
// Apple invisible until HB-apple-developer closes.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type SignInProvider = { name: string; start_url: string }

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minBlockSize: '44px',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-2)',
  border: 'var(--border-width-hairline) solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  textDecoration: 'none',
}

const LABEL: Record<string, string> = {
  google: 'common.auth.continueWithGoogle',
  apple: 'common.auth.continueWithApple',
}

export function SignIn({
  locale,
  app,
  returnPath = '/',
}: {
  locale: Locale
  app: 'staff' | 'parent' | 'dashboard'
  returnPath?: string
}) {
  const [providers, setProviders] = useState<SignInProvider[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await fetch('/api/v1/auth/providers', { credentials: 'include' })
        if (!response.ok) return
        const body = await response.json()
        if (alive) setProviders(body.items ?? [])
      } catch {
        // Offline on the sign-in screen means no buttons, which is the truth. An error
        // banner here would ask someone to act on something they cannot fix.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div style={listStyle}>
      {providers.map((provider) => (
        <a
          key={provider.name}
          style={buttonStyle}
          href={`${provider.start_url}?app=${app}&return_path=${encodeURIComponent(returnPath)}`}
        >
          {t(locale, LABEL[provider.name] ?? 'common.auth.continueWithGoogle')}
        </a>
      ))}
    </div>
  )
}
