// The terms of service and the privacy policy, rendered from i18n and nothing else.
//
// **No markdown, no rich-text dependency, and none was needed.** The document is a title
// and twelve heading/body pairs per document, which is `<h3>` + `<p>` in a loop. Adding a
// renderer would put a parser in front of legal copy — text that must render identically
// in three locales and two directions and be quoted verbatim in a support conversation.
//
// Every string is a key in `reports.ts` under `privacy.*` (there is no `privacy` namespace
// and a lane cannot add one — `types.ts` lists exactly nine). The DRAFT notice is one of
// those keys rather than markup, so it disappears the day `policy_is_draft` goes false and
// leaves nothing behind.
//
// RTL: no physical properties anywhere in this file, and the one place a bare number could
// appear — the version label — is a `dir="ltr"` island (`0.1-draft` in the middle of a
// Hebrew sentence otherwise renders with the `0` and the `1` on the wrong sides).
import { Alert, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The section numbers each document carries. Adding one is adding two keys per locale. */
const TERMS_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const
const POLICY_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

const documentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const

function Sections({
  locale,
  prefix,
  sections,
}: {
  locale: Locale
  prefix: 'terms' | 'policy'
  sections: readonly number[]
}) {
  return (
    <>
      {sections.map((n) => (
        <section key={n}>
          <h3 style={{ marginBlock: '0 var(--space-1)', fontSize: 'var(--text-body)' }}>
            {t(locale, `reports.privacy.${prefix}.s${n}.title`)}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {t(locale, `reports.privacy.${prefix}.s${n}.body`)}
          </p>
        </section>
      ))}
    </>
  )
}

/**
 * The draft banner. Rendered whenever the server says the published text is a draft, and
 * never conditional on anything the client decides for itself.
 *
 * `role="alert"` is deliberately NOT set (see `Alert`'s own note): this is static page
 * content, present from the moment the screen loads, and a live region that fires on every
 * render teaches people to ignore it.
 */
export function DraftNotice({ label, locale }: { label: string; locale: Locale }) {
  return (
    <Alert iconLabel={t(locale, 'reports.privacy.draft.badge')} tone="pending">
      <span data-testid="policy-draft-notice">
        <strong>{t(locale, 'reports.privacy.draft.badge')}</strong>{' '}
        {t(locale, 'reports.privacy.draft.notice')}{' '}
        <span>
          {t(locale, 'reports.privacy.doc.version')}{' '}
          {/* A bare version string inside RTL copy. `bdi` + an explicit ltr direction is
              the island the a11y rule asks for. */}
          <bdi dir="ltr">{label}</bdi>
        </span>
      </span>
    </Alert>
  )
}

export function PolicyDocument({
  locale,
  isDraft,
  versionLabel,
}: {
  locale: Locale
  isDraft: boolean
  versionLabel: string
}) {
  return (
    <div data-testid="policy-document" style={documentStyle}>
      {isDraft ? <DraftNotice label={versionLabel} locale={locale} /> : null}
      <Card>
        <h2 style={{ marginBlock: 0 }}>{t(locale, 'reports.privacy.terms.title')}</h2>
        <Sections locale={locale} prefix="terms" sections={TERMS_SECTIONS} />
      </Card>
      <Card>
        <h2 style={{ marginBlock: 0 }}>{t(locale, 'reports.privacy.policy.title')}</h2>
        <Sections locale={locale} prefix="policy" sections={POLICY_SECTIONS} />
      </Card>
    </div>
  )
}
