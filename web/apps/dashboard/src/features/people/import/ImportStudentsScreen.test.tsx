// The whole seam (owner, 2026-09-18): a file goes in, families come out grouped and
// checked, a cell is fixed in place, the button runs the same three calls the by-hand
// screen makes, and every row says what happened to it.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { DashboardPeopleClient } from '../peopleClient'
import { ImportStudentsScreen } from './ImportStudentsScreen'

const CSV = [
  'שם פרטי,שם משפחה,תאריך לידה,שם פרטי ההורה,שם משפחה ההורה,אימייל,טלפון,קבוצה,חגורה,מסלול,הסדר תשלום מראש',
  'דנה,כהן,12/04/2018,רות,כהן,ruth@example.com,050-1234567,ג׳ודו ילדים א׳,צהוב,מנוי חודשי,הוראת קבע',
  'יוסי,כהן,03/01/2020,רות,כהן,ruth@example.com,050-1234567,ג׳ודו ילדים א׳,לבן,מנוי חודשי,הוראת קבע',
  'עומר,לוי,30/11/1999,,,omer@example.com,054-7654321,בוגרים,,מנוי חודשי,',
  'נועם,מזרחי,22/06/2016,אבי,מזרחי,avi.m@example.com,,נוער ב׳,,מנוי חודשי,מזומן',
  'אלון,ביטון,12/03/2017,שרה,ביטון,sara.b@example.com,,ג׳ודו ילדים א׳,,מנוי חודשי,',
].join('\n')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeClient(over: Partial<DashboardPeopleClient> = {}) {
  const client = {
    groups: vi.fn(async () => ({
      items: [
        { id: 'g-kids', name: 'ג׳ודו ילדים א׳', class_id: 'c-judo', kind: 'base', is_active: true },
        { id: 'g-teens', name: 'ג׳ודו נוער', class_id: 'c-judo', kind: 'base', is_active: true },
        { id: 'g-adults', name: 'בוגרים', class_id: 'c-judo', kind: 'base', is_active: true },
        // Not offered: an extra, a private lesson, a retired base group.
        { id: 'g-team', name: 'נבחרת', class_id: 'c-judo', kind: 'extra', is_active: true },
        { id: 'g-private', name: 'אימון אישי', class_id: 'c-judo', kind: 'private', is_active: true },
        { id: 'g-old', name: 'קבוצה ישנה', class_id: 'c-judo', kind: 'base', is_active: false },
      ],
    })),
    pricePlans: vi.fn(async () => ({
      items: [
        { id: 'p-month', name: 'מנוי חודשי', monthly_amount_agorot: 34_900, active_to: null },
        { id: 'p-old', name: 'מנוי 2024', monthly_amount_agorot: 29_900, active_to: '2024-12-31' },
      ],
    })),
    beltRanks: vi.fn(async () => ({ items: [{ id: 'b-white', name: 'לבן' }, { id: 'b-yellow', name: 'צהוב' }] })),
    students: vi.fn(async () => ({
      items: [{ id: 's-existing', first_name: 'אלון', last_name: 'ביטון', birthdate: '2017-03-12', guardian_display_names: ['שרה ביטון'] }],
      next_cursor: null,
      has_more: false,
    })),
    createStudent: vi.fn(async (body: { first_name: string }) =>
      json({ student: { id: `s-${body.first_name}` }, invitation_token: 'tok', invitation_email_configured: true, invitation_email_sent: true }, 201),
    ),
    convert: vi.fn(async () => json({})),
    awardBelt: vi.fn(async () => json({}, 201)),
    resendInvitation: vi.fn(async () => json({})),
    ...over,
  }
  return client as unknown as DashboardPeopleClient & typeof client
}

async function uploadCsv(text = CSV) {
  const file = new File([text], 'students.csv', { type: 'text/csv' })
  await userEvent.upload(screen.getByTestId('import-file'), file)
  expect(await screen.findByTestId('import-stats')).toBeInTheDocument()
}

describe('ImportStudentsScreen — step 1', () => {
  it('opens on the file step with the template download, the drop zone and the column table', async () => {
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    expect(screen.getByTestId('import-template')).toHaveTextContent(t('he', 'people.import.template.download'))
    expect(screen.getByTestId('import-drop')).toBeInTheDocument()
    // Eleven rows in the column table, one per column of the contract.
    expect(within(screen.getByTestId('import-columns')).getAllByRole('row')).toHaveLength(12)
    expect(screen.getByTestId('import-step-of')).toHaveTextContent('1')
  })

  it('names a header problem instead of guessing at columns', async () => {
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    await userEvent.upload(screen.getByTestId('import-file'), new File(['x,y\n1,2'], 'bad.csv', { type: 'text/csv' }))
    expect(await screen.findByTestId('import-parse-error')).toHaveTextContent(t('he', 'people.import.error.bad_header'))
  })

  it('downloads the template through a blob, never a data: URI the CSP refuses', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:xlsx')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const client = fakeClient()
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.groups).toHaveBeenCalled())
    await userEvent.click(screen.getByTestId('import-template'))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    const blob = createObjectURL.mock.calls[0]![0]
    expect(blob.type).toContain('spreadsheetml')
    expect(blob.size).toBeGreaterThan(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:xlsx')
  })
})

describe('ImportStudentsScreen — step 2', () => {
  it('groups the rows by family, resolves names against the studio, and names each problem on its row', async () => {
    const client = fakeClient()
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.students).toHaveBeenCalled())
    await uploadCsv()

    expect(screen.getByTestId('import-step-of')).toHaveTextContent('2')
    // Four families: כהן (2), לוי (adult), מזרחי, ביטון.
    expect(screen.getAllByTestId(/^import-family-/)).toHaveLength(4)
    const cohen = screen.getByTestId('import-family-ruth@example.com')
    expect(within(cohen).getAllByTestId(/^import-row-/)).toHaveLength(2)
    expect(cohen).toHaveTextContent(t('he', 'people.import.family.many').replace('{{n}}', '2'))
    expect(screen.getByTestId('import-family-omer@example.com')).toHaveTextContent(t('he', 'people.import.family.adult'))

    // The group select carries the studio's id for a matched name...
    const danaRow = within(cohen).getAllByTestId(/^import-row-/)[0]!
    expect(within(danaRow).getByTestId(/^import-group-/)).toHaveValue('g-kids')
    expect(within(danaRow).getByTestId(/^import-belt-/)).toHaveValue('b-yellow')
    expect(within(danaRow).getByTestId(/^import-payment-/)).toHaveValue('standing_order')
    // Only active BASE groups are offered — the extra, the private lesson and the retired
    // group are not in the dropdown (owner, 2026-09-18).
    const options = within(danaRow).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(expect.arrayContaining(['ג׳ודו ילדים א׳', 'ג׳ודו נוער', 'בוגרים']))
    expect(options).not.toContain('נבחרת')
    expect(options).not.toContain('אימון אישי')
    expect(options).not.toContain('קבוצה ישנה')
    // ...and an unmatched one is a named problem, with the fix on the cell.
    const mizrahi = screen.getByTestId('import-family-avi.m@example.com')
    expect(mizrahi).toHaveTextContent(t('he', 'people.import.problem.unknown_group'))
    // The student already in the club is flagged and left out of the count.
    expect(screen.getByTestId('import-family-sara.b@example.com')).toHaveTextContent(t('he', 'people.import.problem.duplicate'))
    expect(screen.getByTestId('import-run')).toHaveTextContent(t('he', 'people.import.run').replace('{{n}}', '3'))
  })

  it('fixing the cell in place makes the row ready — no trip back to the file', async () => {
    const client = fakeClient()
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.students).toHaveBeenCalled())
    await uploadCsv()
    const mizrahi = screen.getByTestId('import-family-avi.m@example.com')
    await userEvent.selectOptions(within(mizrahi).getByTestId(/^import-group-/), 'g-teens')
    expect(mizrahi).not.toHaveTextContent(t('he', 'people.import.problem.unknown_group'))
    expect(screen.getByTestId('import-run')).toHaveTextContent(t('he', 'people.import.run').replace('{{n}}', '4'))
    // And a duplicate can be imported anyway, deliberately.
    await userEvent.click(within(screen.getByTestId('import-family-sara.b@example.com')).getByTestId(/^import-force-/))
    expect(screen.getByTestId('import-run')).toHaveTextContent(t('he', 'people.import.run').replace('{{n}}', '5'))
  })

  it('the button runs create → convert → belt per ready row, siblings in order, and each row shows its outcome', async () => {
    const client = fakeClient()
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.students).toHaveBeenCalled())
    await uploadCsv()
    await userEvent.click(screen.getByTestId('import-run'))
    await waitFor(() => expect(screen.getByTestId('import-done')).toBeInTheDocument())

    // Three ready rows went; the unknown-group row and the duplicate did not.
    expect(client.createStudent).toHaveBeenCalledTimes(3)
    const names = vi.mocked(client.createStudent).mock.calls.map((call) => call[0].first_name)
    expect(names).toEqual(['דנה', 'יוסי', 'עומר'])
    const dana = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(dana.guardian).toMatchObject({ first_name: 'רות', last_name: 'כהן', email: 'ruth@example.com', relation: 'parent' })
    expect(dana.birthdate).toBe('2018-04-12')
    const omer = vi.mocked(client.createStudent).mock.calls[2]![0]
    expect(omer.guardian).toMatchObject({ relation: 'self', email: 'omer@example.com' })
    expect(vi.mocked(client.convert).mock.calls[0]![1]).toMatchObject({ group_id: 'g-kids', price_plan_id: 'p-month', payment_received: 'standing_order' })
    // Belts: דנה (צהוב) and יוסי (לבן); עומר had none.
    expect(client.awardBelt).toHaveBeenCalledTimes(2)

    expect(screen.getByTestId('import-done')).toHaveTextContent('3')
    const cohen = screen.getByTestId('import-family-ruth@example.com')
    expect(within(cohen).getAllByText(t('he', 'people.import.state.added'))).toHaveLength(2)
    expect(within(cohen).getByTestId(/^import-invite-/)).toHaveTextContent(t('he', 'people.import.invite.held'))
    // The seam the owner actually cares about: the screen reaches the server with the
    // send suppressed, for every row, not merely renders a chip that says so.
    for (const [body] of vi.mocked(client.createStudent).mock.calls) expect(body.send_invitation).toBe(false)
    // The rows that were not ready are still here, still editable.
    expect(screen.getByTestId('import-family-avi.m@example.com')).toHaveTextContent(t('he', 'people.import.problem.unknown_group'))
    expect(screen.getByTestId('import-finish')).toHaveAttribute('href', '#/students')
  })

  it('a failed conversion is named on its row, never hidden under a green tick', async () => {
    const client = fakeClient({
      convert: vi.fn(async (studentId: string) => json({ detail: 'refused' }, studentId === 's-דנה' ? 422 : 200)),
    })
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.students).toHaveBeenCalled())
    await uploadCsv()
    await userEvent.click(screen.getByTestId('import-run'))
    await waitFor(() => expect(screen.getByTestId('import-done')).toBeInTheDocument())
    const cohen = screen.getByTestId('import-family-ruth@example.com')
    expect(cohen).toHaveTextContent(t('he', 'people.import.state.convertFailed'))
    expect(within(cohen).getAllByText(t('he', 'people.import.state.added'))).toHaveLength(1)
  })

  it('a held invitation can be sent to one family on the spot, without sending the rest', async () => {
    // The parent standing at the desk on import day. Everyone else stays held — this is
    // the ONLY way an email leaves this screen, and it takes a deliberate click per family.
    const client = fakeClient({
      createStudent: vi.fn(async (body: { first_name: string }) =>
        json({ student: { id: `s-${body.first_name}` }, invitation_token: 'tok' }, 201),
      ),
    })
    render(<ImportStudentsScreen locale="he" client={client} />)
    await waitFor(() => expect(client.students).toHaveBeenCalled())
    await uploadCsv()
    await userEvent.click(screen.getByTestId('import-run'))
    await waitFor(() => expect(screen.getByTestId('import-done')).toBeInTheDocument())
    const resend = screen.getByTestId('import-resend-ruth@example.com')
    await userEvent.click(resend)
    await waitFor(() => expect(client.resendInvitation).toHaveBeenCalledWith('s-דנה'))
    expect(resend).toHaveTextContent(t('he', 'people.import.invite.sentNow'))
    // One family asked for, one email attempted.
    expect(client.resendInvitation).toHaveBeenCalledTimes(1)
  })
})

// Three dead ends found on 2026-09-23 by filling a file with bad data and looking at the
// screen, rather than by a test that constructed the props it wanted.
describe('a flagged cell can always be answered', () => {
  const ONE = (over: Record<string, string> = {}) => {
    const cells = {
      first: 'דנה', last: 'כהן', birthdate: '12/04/2018', pfirst: 'רות', plast: 'כהן',
      email: 'ruth@example.com', phone: '050-1234567', group: 'ג׳ודו ילדים א׳',
      belt: 'צהוב', plan: 'מנוי חודשי', payment: '', ...over,
    }
    return [
      'שם פרטי,שם משפחה,תאריך לידה,שם פרטי ההורה,שם משפחה ההורה,אימייל,טלפון,קבוצה,חגורה,מסלול,הסדר תשלום מראש',
      [cells.first, cells.last, cells.birthdate, cells.pfirst, cells.plast, cells.email,
       cells.phone, cells.group, cells.belt, cells.plan, cells.payment].join(','),
    ].join('\n')
  }

  it('a card payment can be cleared — the empty choice is a REAL option, not the one already selected', async () => {
    // A <select> fires no change when you pick the option that is already selected, and the
    // empty option's label had been replaced by "in the file: אשראי". The row's own advice
    // is "leave it empty", and empty was the one answer the manager could not give.
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    await uploadCsv(ONE({ payment: 'אשראי' }))
    const select = screen.getByTestId(/^import-payment-/) as HTMLSelectElement
    expect(screen.getByTestId(/^import-state-/)).toHaveTextContent(t('he', 'people.import.problem.card_payment'))

    const values = [...select.options].map((o) => o.value)
    expect(values).toContain('')
    expect(select.value).not.toBe('')

    await userEvent.selectOptions(select, '')
    expect(screen.getByTestId(/^import-state-/)).toHaveTextContent(t('he', 'people.import.state.ready'))
  })

  it('a group with no match can still be answered "no group at all"', async () => {
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    await uploadCsv(ONE({ group: 'קבוצת על', belt: '' }))
    const select = screen.getByTestId(/^import-group-/) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toContain('')
    expect(select.value).not.toBe('')

    await userEvent.selectOptions(select, '')
    expect(screen.getByTestId(/^import-state-/)).toHaveTextContent(t('he', 'people.import.state.ready'))
  })

  it('choosing a group keeps the belt the file named when the new ladder still has it', async () => {
    // Otherwise every row whose group needed fixing asked for its belt a second time — and
    // a belt that had already matched was dropped silently, since the row keeps no name for
    // one that matched.
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    await uploadCsv(ONE({ group: 'קבוצת על', belt: 'צהוב' }))
    const group = screen.getByTestId(/^import-group-/) as HTMLSelectElement
    await userEvent.selectOptions(group, 'g-teens')

    const belt = screen.getByTestId(/^import-belt-/) as HTMLSelectElement
    expect(belt.value).toBe('b-yellow')
    expect(screen.getByTestId(/^import-state-/)).toHaveTextContent(t('he', 'people.import.state.ready'))
  })

  it('offers no "send now" to a family the club can only phone', async () => {
    // `reinvite_guardian` refuses a guardian with no email, so the button could only 422.
    render(<ImportStudentsScreen locale="he" client={fakeClient()} />)
    await uploadCsv(ONE({ email: '', phone: '052-3334444' }))
    await userEvent.click(screen.getByTestId('import-run'))
    await waitFor(() => expect(screen.getByTestId('import-done')).toBeInTheDocument())

    expect(screen.getByTestId(/^import-invite-/)).toHaveTextContent(t('he', 'people.import.invite.held'))
    expect(screen.queryByTestId(/^import-resend-/)).not.toBeInTheDocument()
  })
})
