// `שימור לפי ותק` — four horizontal bar rows with printed percentages, three in ink and
// the weakest in `--danger`.
//
// `ProgressBar` is adopted rather than rebuilt: `4g`'s primitives table maps this row to
// it exactly — "label, value, max, readout — track, fill and printed percentage". Its fill
// grows from the inline start, which in Hebrew is the right, with no positioning at all.
//
// **A bucket with no cohort draws no bar.** The same rule `4c` applies to a group with no
// decided marks: a bar at 0% is a claim, and "nobody has been here long enough yet" is not
// that claim. The cohort size is printed beside every row, because a 100% bar over a
// cohort of two is a different fact from a 100% bar over a cohort of eighty.
//
// **The footnote is authored copy, shown only when the data says it** — `4g` finding 8
// leaves "authored or generated" open, and generated text is a Hebrew string the i18n
// layer cannot reach and no translator ever sees. So the sentence lives in three locale
// files and renders only while the first three months really are the weakest stretch.
//
// **B5.8 — four identical rows is not more honest than one.** A studio too young for any
// bucket to have a cohort renders `retention.noCohort` four times, which reads as an
// error repeated rather than one honest fact. When every bucket has no measurable
// percent, the whole list collapses to one `EmptyState`.
import { EmptyState, ProgressBar } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RetentionBucket } from './client'

/** The weakest bucket among those that HAVE a percentage. A bucket with no cohort is not
 *  weak; it is unknown, and colouring it red would accuse the club of a churn problem it
 *  has no evidence for. */
export function weakestBucket(buckets: RetentionBucket[]): RetentionBucket | null {
  const measured = buckets.filter((bucket) => bucket.percent !== null)
  if (measured.length < 2) return null
  return measured.reduce((worst, bucket) =>
    (bucket.percent ?? 0) < (worst.percent ?? 0) ? bucket : worst,
  )
}

export function RetentionPanel({
  locale,
  buckets,
  undatedDepartures,
}: {
  locale: Locale
  buckets: RetentionBucket[]
  /** Students marked as gone with no `left_on`. They are in no cohort, and the screen
   *  says so rather than quietly shrinking the denominator. */
  undatedDepartures: number
}) {
  const weakest = weakestBucket(buckets)

  // B5.8 — no bucket has a cohort old enough to measure. One sentence, not four.
  if (buckets.every((bucket) => bucket.percent === null)) {
    return (
      <div data-testid="retention-panel">
        <EmptyState title={t(locale, 'reports.retention.emptyAll')} />
      </div>
    )
  }

  return (
    <div data-testid="retention-panel">
      {/* The definition, beside the figure. A percentage whose denominator is unstated is
          a percentage somebody quotes wrongly, and this one is easy to read as "share of
          all students still here", which it is not. */}
      <p className="dash-kpi__note" data-testid="retention-basis">
        {t(locale, 'reports.retention.basis')}
      </p>
      <ol className="dash-retention">
        {buckets.map((bucket) => (
          <li
            className="dash-retention__row"
            data-testid={`retention-${bucket.key}`}
            data-weakest={String(weakest?.key === bucket.key)}
            key={bucket.key}
          >
            <span className="dash-retention__label">
              <span>{t(locale, `reports.retention.bucket.${bucket.key}`)}</span>
              <span className="dash-retention__cohort">
                {t(locale, 'reports.retention.cohort').replace('{{count}}', String(bucket.cohort))}
              </span>
            </span>
            {bucket.percent === null ? (
              <span className="dash-kpi__note" data-testid={`retention-empty-${bucket.key}`}>
                {t(locale, 'reports.retention.noCohort')}
              </span>
            ) : (
              <ProgressBar
                label={`${t(locale, `reports.retention.bucket.${bucket.key}`)}${
                  weakest?.key === bucket.key ? ` — ${t(locale, 'reports.retention.weakest')}` : ''
                }`}
                max={100}
                readout={`${bucket.percent}%`}
                value={bucket.percent}
              />
            )}
          </li>
        ))}
      </ol>
      {weakest?.key === 'm0_3' ? (
        <p className="dash-kpi__note" data-testid="retention-insight">
          {t(locale, 'reports.retention.insightEarly')}
        </p>
      ) : null}
      {undatedDepartures > 0 ? (
        <p className="dash-kpi__note" data-testid="retention-undated">
          {t(locale, 'reports.retention.undatedDepartures').replace(
            '{{count}}',
            String(undatedDepartures),
          )}
        </p>
      ) : null}
    </div>
  )
}
