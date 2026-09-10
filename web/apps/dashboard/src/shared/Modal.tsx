// The dashboard's dialog, in one place.
//
// `useModalDialog` from @studio/ui already does the hard half — focus in, Tab trapped,
// Escape out, focus restored to whatever opened it — and its own header explains why each
// of those is load-bearing. What it does NOT carry is the markup: the backdrop, the panel,
// the labelled heading and the close control. Three screens had hand-written their own copy
// of that markup with slightly different inline styles, and the screens the owner asked to
// turn into popups on 2026-09-10 would have made it six.
//
// So this is the markup, once, over that hook. It is deliberately NOT in @studio/ui: the
// shared package is a registry three apps and every lane touch, and a dialog shell that
// only the dashboard has needed so far does not earn that coupling yet. If the staff or
// parent app grows the same need, it moves — with tests — rather than being copied.
import type { ReactNode } from 'react'
import { Button, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export function Modal({
  locale,
  onClose,
  title,
  children,
  footer,
  testId,
  width = '34rem',
}: {
  locale: Locale
  onClose: () => void
  /** Names the dialog for a screen reader AND heads it visibly. One string, so the two can
   *  never disagree — which is the usual way an `aria-label` goes stale. */
  title: string
  children: ReactNode
  footer?: ReactNode
  testId?: string
  width?: string
}) {
  const dialog = useModalDialog(true, onClose)
  const titleId = testId ? `${testId}-title` : 'modal-title'
  return (
    <div
      // The backdrop closes on a click that STARTED and ended on it. A click that began
      // inside the panel and drifted out — selecting text in a field and releasing past the
      // edge — is not a request to discard the form, and treating it as one loses typing.
      data-testid={testId ? `${testId}-backdrop` : undefined}
      onClick={onClose}
      style={{
        alignItems: 'center',
        background: 'color-mix(in srgb, var(--fg) 40%, transparent)',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        padding: 'var(--space-4)',
        position: 'fixed',
        zIndex: 40,
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
        style={{
          background: 'var(--ground)',
          border: 'var(--border-width-hairline) solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          inlineSize: `min(${width}, 100%)`,
          maxBlockSize: '85vh',
          overflowY: 'auto',
          padding: 'var(--space-4)',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 'var(--space-3)',
            justifyContent: 'space-between',
          }}
        >
          <h2 id={titleId} style={{ margin: 0 }}>
            {title}
          </h2>
          <Button
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
            variant="ghost"
          >
            {t(locale, 'common.cancel')}
          </Button>
        </div>

        {children}

        {footer ? <div>{footer}</div> : null}
      </div>
    </div>
  )
}
