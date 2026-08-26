// What a bulk press did — the summary §5.15 step 6 asks for by name, shared by steps 3, 4
// and 5.
//
// **The refusals are the point of this component.** `BulkOutcome` carries them rather than
// raising on the first one, because "aborting the batch on row 200 leaves the manager with
// 199 applied changes, no list of them, and a screen that has to be re-driven from an
// unknown state". A screen that rendered only `applied` would throw that list away and put
// the manager back in exactly the position the server went to trouble to avoid — so every
// refusal is rendered, with its reason, in a real table with a caption.
//
// `applied` gets `role="status"` and not `role="alert"`: it is a confirmation of something
// that went right, announced politely at the next pause rather than interrupting.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill, refusalLabel } from './client'
import type { BulkOutcome } from './client'

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const tableStyle: CSSProperties = { inlineSize: '100%', borderCollapse: 'collapse' }

const cellStyle: CSSProperties = {
  textAlign: 'start',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  verticalAlign: 'top',
}

const headStyle: CSSProperties = {
  ...cellStyle,
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
  borderBlockEnd: 'var(--border-width-strong) solid var(--border-strong)',
}

const captionStyle: CSSProperties = { textAlign: 'start', paddingBlockEnd: 'var(--space-2)' }

const scrollStyle: CSSProperties = { overflowX: 'auto' }

export function BulkOutcomePanel({
  locale,
  outcome,
  testId,
}: {
  locale: Locale
  outcome: BulkOutcome
  testId: string
}) {
  const refused = outcome.refused ?? []
  return (
    <div style={panelStyle} data-testid={testId}>
      <p role="status" data-testid={`${testId}-applied`}>
        {outcome.applied === 0
          ? t(locale, 'schedule.rollover.appliedNone')
          : fill(t(locale, 'schedule.rollover.applied'), { count: outcome.applied })}
      </p>

      {refused.length > 0 ? (
        <section aria-labelledby={`${testId}-refused-title`}>
          <h3 id={`${testId}-refused-title`}>{t(locale, 'schedule.rollover.refusedTitle')}</h3>
          <div style={scrollStyle}>
            <table style={tableStyle}>
              <caption style={captionStyle}>
                {t(locale, 'schedule.rollover.refusedCaption')}
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={headStyle}>
                    {t(locale, 'schedule.rollover.refusedId')}
                  </th>
                  <th scope="col" style={headStyle}>
                    {t(locale, 'schedule.rollover.refusedReason')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {refused.map((refusal) => (
                  <tr key={refusal.id} data-testid={`${testId}-refusal`}>
                    <th scope="row" style={cellStyle}>
                      {refusal.id}
                    </th>
                    <td style={cellStyle}>{refusalLabel(locale, refusal.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
