// הכנסות לפי חוג — what judo earned and what karate earned, for one month.
//
// Owner, 2026-09-09: "Reports — per class." It is the one screen where per-class pricing
// changes a DECISION rather than a layout: the two disciplines now bill separately, so
// "which one carries the club" is a question that has an answer for the first time.
//
// Two things this panel must not get wrong, both of them about a number that lies:
//
//   * THE TOTAL IS NOT THE SUM OF THE COLUMN, and it is deliberately rendered OUTSIDE the
//     table so nobody is tempted to make it one. A child billed for judo AND karate is one
//     human in two rows; the server sends its own DISTINCT headcount and this prints that.
//     Adding the column up would overstate membership by exactly the multi-class families
//     this feature created, growing every time one takes a second discipline. The money
//     total is a real sum — and is also the server's, so the two can never drift.
//   * THE UNASSIGNED ROW IS SHOWN, NOT HIDDEN. Registration fees, manual charges and every
//     tuition charge raised before per-class pricing carry no class. Dropping them would
//     leave the rows visibly failing to reach the total with nothing saying why.
import { Table } from '@studio/ui'
import { formatAgorot } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ClassMonthRow } from './client'

export function ByClassPanel({
  locale,
  rows,
  total,
}: {
  locale: Locale
  rows: readonly ClassMonthRow[]
  /** The server's own totals. Never recomputed from `rows` — see the header. */
  total: ClassMonthRow
}) {
  return (
    <div data-testid="reports-by-class">
      <Table
        caption={t(locale, 'reports.byClass.caption')}
        columns={[
          {
            id: 'class',
            header: t(locale, 'reports.byClass.col.class'),
            width: '10rem',
            cell: (row: ClassMonthRow) =>
              row.class_id === null ? (
                // Named, never a dash: "—" reads as a rendering fault rather than as a
                // real bucket a manager can go and fix.
                <span data-testid="by-class-unassigned">
                  {t(locale, 'reports.byClass.unassigned')}
                </span>
              ) : (
                <bdi>{row.class_name}</bdi>
              ),
          },
          {
            id: 'students',
            header: t(locale, 'reports.byClass.col.students'),
            width: '6rem',
            cell: (row: ClassMonthRow) => String(row.students),
          },
          {
            id: 'total',
            header: t(locale, 'reports.byClass.col.total'),
            width: '8rem',
            cell: (row: ClassMonthRow) => formatAgorot(row.total_agorot),
          },
          {
            id: 'settled',
            header: t(locale, 'reports.byClass.col.settled'),
            width: '8rem',
            cell: (row: ClassMonthRow) => formatAgorot(row.settled_agorot),
          },
        ]}
        empty={<p>{t(locale, 'reports.byClass.empty')}</p>}
        rowKey={(row: ClassMonthRow) => row.class_id ?? 'unassigned'}
        rows={[...rows]}
      />
      {rows.length > 0 ? (
        <p data-testid="by-class-total">
          <strong>{t(locale, 'reports.byClass.total')}</strong>{' '}
          <span data-testid="by-class-total-students">
            {t(locale, 'reports.byClass.totalStudents').replace(
              '{{count}}',
              String(total.students),
            )}
          </span>{' '}
          · <span data-testid="by-class-total-money">{formatAgorot(total.total_agorot)}</span>
        </p>
      ) : null}
    </div>
  )
}
