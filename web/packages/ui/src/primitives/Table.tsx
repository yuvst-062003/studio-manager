import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type TableColumn<Row> = {
  id: string
  header: ReactNode
  /**
   * Explicit, required. The audit's `#/students` finding — "the header currently
   * collapses into one run-on string because no widths are assigned" — is the defect
   * this parameter exists to make impossible.
   */
  width: string
  cell: (row: Row) => ReactNode
}

/**
 * Watches `(max-width: …)` so the stacked layout follows a live resize, not only the
 * width at mount. jsdom answers matches:false, so tests render the table layout
 * unless they stub matchMedia.
 */
function useStacked(stackBelow: number): boolean {
  const query = `(max-width: ${stackBelow - 1}px)`
  const [stacked, setStacked] = useState(() => globalThis.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = globalThis.matchMedia?.(query)
    if (!mq) return
    const onChange = (event: MediaQueryListEvent) => setStacked(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return stacked
}

/**
 * The table primitive (dashboard F1b / F11). One definition of two behaviours:
 *
 * - Wide: a real `<table>` with a required `<caption>`, `<th scope="col">`, explicit
 *   per-column widths, logical `text-align: start`, inside its own `overflow-x`
 *   container so the page never scrolls sideways.
 * - Below `stackBelow` (default 768px): each row renders as a labelled card. The
 *   first column is the row's identity and leads the card; every other value keeps
 *   its column header as a label, because a bare number in a card has lost the
 *   header that explained it.
 */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  stackBelow = 768,
  empty,
}: {
  caption: string
  columns: TableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  stackBelow?: number
  /** Rendered instead of the table when there are no rows. */
  empty?: ReactNode
}) {
  const stacked = useStacked(stackBelow)

  if (rows.length === 0 && empty !== undefined) return <>{empty}</>

  if (stacked) {
    const [identity, ...rest] = columns
    if (!identity) return null
    return (
      <ul aria-label={caption} className="studio-table-cards" data-testid="table-cards">
        {rows.map((row) => (
          <li className="studio-table-cards__card" key={rowKey(row)}>
            <div className="studio-table-cards__identity">{identity.cell(row)}</div>
            <dl className="studio-table-cards__values">
              {rest.map((column) => (
                <div className="studio-table-cards__pair" key={column.id}>
                  <dt>{column.header}</dt>
                  <dd>{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="studio-table-scroll">
      <table className="studio-table" data-testid="table">
        <caption>{caption}</caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th key={column.id} scope="row">
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.id}>{column.cell(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
