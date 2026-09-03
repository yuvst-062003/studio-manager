import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, renderIn } from '../testing'
import { Table } from './Table'
import type { TableColumn } from './Table'

type Row = { id: string; name: string; balance: string }

const COLUMNS: TableColumn<Row>[] = [
  { id: 'name', header: 'שם', width: '12rem', cell: (row) => row.name },
  { id: 'balance', header: 'יתרה', width: '8rem', cell: (row) => row.balance },
]

const ROWS: Row[] = [
  { id: 'a', name: 'דנה לוי', balance: '320 ₪' },
  { id: 'b', name: 'יוסי כהן', balance: '0 ₪' },
]

function stackedMatchMedia() {
  // jsdom's own matchMedia answers matches:false, so stubbing true simulates the
  // narrow viewport without a layout engine.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe.each(DIRECTIONS)('Table in $locale ($dir)', ({ locale }) => {
  it('renders a real table with caption, column headers and explicit widths', () => {
    renderIn(<Table caption="חניכים" columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />, {
      locale,
    })
    const table = screen.getByTestId('table')
    expect(within(table).getByText('חניכים').tagName).toBe('CAPTION')
    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveAttribute('scope', 'col')
    const cols = table.querySelectorAll('colgroup col')
    expect(cols).toHaveLength(2)
    expect((cols[0] as HTMLElement).style.width).toBe('12rem')
    // The scroll container is the primitive's own — the page never scrolls sideways.
    expect(table.parentElement).toHaveClass('studio-table-scroll')
  })
})

describe('Table', () => {
  it('uses the first column as the row header', () => {
    renderIn(<Table caption="חניכים" columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />)
    const rowHeader = screen.getByRole('rowheader', { name: 'דנה לוי' })
    expect(rowHeader).toHaveAttribute('scope', 'row')
  })

  it('renders the empty node instead of an empty table', () => {
    renderIn(
      <Table caption="חניכים" columns={COLUMNS} empty={<p>אין חניכים</p>} rowKey={(r) => r.id} rows={[]} />,
    )
    expect(screen.getByText('אין חניכים')).toBeVisible()
    expect(screen.queryByTestId('table')).toBeNull()
  })

  it('clips the caption out of the visual flow by default, keeping it in the a11y tree (A5)', () => {
    renderIn(<Table caption="חניכים" columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />)
    const caption = within(screen.getByTestId('table')).getByText('חניכים')
    expect(caption.tagName).toBe('CAPTION')
    // Same technique as home.css's now-deleted local override: never display:none, which
    // would remove it from the accessibility tree along with the visual flow.
    expect(caption).toHaveClass('studio-visually-hidden')
  })

  it('prints the caption on screen when a caller opts in with captionVisible', () => {
    renderIn(
      <Table captionVisible caption="חניכים" columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />,
    )
    const caption = within(screen.getByTestId('table')).getByText('חניכים')
    expect(caption).not.toHaveClass('studio-visually-hidden')
  })

  it('below stackBelow renders labelled cards, identity first', () => {
    stackedMatchMedia()
    renderIn(<Table caption="חניכים" columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />)
    const cards = screen.getByTestId('table-cards')
    expect(screen.queryByTestId('table')).toBeNull()
    expect(cards).toHaveAttribute('aria-label', 'חניכים')
    const first = within(cards).getAllByRole('listitem')[0]!
    // The identity leads the card; the other value keeps its column header as a label.
    expect(within(first).getByText('דנה לוי')).toBeVisible()
    expect(within(first).getByText('יתרה')).toBeVisible()
    expect(within(first).getByText('320 ₪')).toBeVisible()
    expect(within(first).queryByText('שם')).toBeNull()
  })
})
