// The button half of the import: the same three calls the by-hand screen makes, one row
// after another, and an honest per-row and per-family outcome.
import { describe, expect, it, vi } from 'vitest'
import type { DashboardPeopleClient } from '../peopleClient'
import type { Draft, Family } from './review'
import { runImport, type ImportClient } from './run'

const json = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function draft(over: Partial<Draft>): Draft {
  return {
    id: over.id ?? 'd1',
    line: 2,
    first_name: 'דנה',
    last_name: 'כהן',
    birthdate: '2018-04-12',
    parent_first: 'רות',
    parent_last: 'כהן',
    email: 'ruth@example.com',
    phone: '050-1234567',
    group_id: 'g-kids',
    belt_rank_id: 'b-yellow',
    plan_id: 'p-month',
    payment: 'standing_order',
    group_name: '',
    belt_name: '',
    plan_name: '',
    payment_text: '',
    force: false,
    ...over,
  }
}

function family(members: Draft[], over: Partial<Family> = {}): Family {
  return { key: 'ruth@example.com', email: 'ruth@example.com', parentName: 'רות כהן', phone: '050-1234567', adult: false, members, ...over }
}

function fakeClient(over: Partial<ImportClient> = {}): ImportClient & { calls: string[] } {
  const calls: string[] = []
  const client = {
    calls,
    createStudent: vi.fn(async (body: Parameters<DashboardPeopleClient['createStudent']>[0]) => {
      calls.push(`create:${body.first_name}`)
      return json({ student: { id: `s-${body.first_name}` }, invitation_token: 'tok', invitation_email_configured: true, invitation_email_sent: true })
    }),
    convert: vi.fn(async (studentId: string) => {
      calls.push(`convert:${studentId}`)
      return json({}, 200)
    }),
    awardBelt: vi.fn(async (studentId: string) => {
      calls.push(`belt:${studentId}`)
      return json({}, 201)
    }),
    ...over,
  }
  return client as ImportClient & { calls: string[] }
}

describe('runImport', () => {
  it('creates, converts and awards in that order, one trainee after another, and reports each', async () => {
    const client = fakeClient()
    const rows = [draft({ id: 'd1', first_name: 'דנה' }), draft({ id: 'd2', first_name: 'יוסי', belt_rank_id: '' })]
    const seen: string[] = []
    const result = await runImport([family(rows)], client, {
      today: '2026-09-18',
      beltNote: 'ייבוא',
      onRow: (id, state) => seen.push(`${id}:${state}`),
    })
    expect(client.calls).toEqual(['create:דנה', 'convert:s-דנה', 'belt:s-דנה', 'create:יוסי', 'convert:s-יוסי'])
    expect(result.rows.get('d1')).toMatchObject({ studentId: 's-דנה', problem: null })
    expect(result.rows.get('d2')).toMatchObject({ studentId: 's-יוסי', problem: null })
    expect(seen).toEqual(['d1:sending', 'd1:added', 'd2:sending', 'd2:added'])
    expect(result.families.get('ruth@example.com')).toMatchObject({ invitation: 'sent', studentId: 's-דנה' })
  })

  it('sends the parent as the guardian for a child and the trainee as their own guardian when adult', async () => {
    const client = fakeClient()
    const adult = draft({ id: 'a1', first_name: 'עומר', last_name: 'לוי', parent_first: '', parent_last: '', email: 'omer@example.com', birthdate: '1999-11-30' })
    await runImport(
      [family([draft({})]), family([adult], { key: 'omer@example.com', email: 'omer@example.com', adult: true, parentName: '' })],
      client,
      { today: '2026-09-18', beltNote: 'ייבוא' },
    )
    const [child, self] = vi.mocked(client.createStudent).mock.calls.map((call) => call[0])
    expect(child!.guardian).toMatchObject({ first_name: 'רות', last_name: 'כהן', email: 'ruth@example.com', phone: '050-1234567', relation: 'parent' })
    expect(child!.group_id).toBeUndefined()
    expect(self!.guardian).toMatchObject({ first_name: 'עומר', last_name: 'לוי', email: 'omer@example.com', relation: 'self' })
    expect(self!.birthdate).toBe('1999-11-30')
  })

  it('converts with the plan and the prepaid method, dated today', async () => {
    const client = fakeClient()
    await runImport([family([draft({ payment: 'cash', plan_id: 'p-month' })])], client, { today: '2026-09-18', beltNote: 'ייבוא' })
    expect(vi.mocked(client.convert).mock.calls[0]).toEqual([
      's-דנה',
      { group_id: 'g-kids', started_on: '2026-09-18', price_plan_id: 'p-month', payment_received: 'cash' },
    ])
  })

  it('a row with no group stays a lead — no convert, no belt', async () => {
    const client = fakeClient()
    await runImport([family([draft({ group_id: '', belt_rank_id: '' })])], client, { today: '2026-09-18', beltNote: 'ייבוא' })
    expect(client.calls).toEqual(['create:דנה'])
  })

  it('names a failed convert on that row and keeps going with the next one', async () => {
    const client = fakeClient({
      convert: vi.fn(async (studentId: string) => json({ detail: 'nope' }, studentId === 's-דנה' ? 422 : 200)),
    })
    const result = await runImport([family([draft({ id: 'd1' }), draft({ id: 'd2', first_name: 'יוסי' })])], client, {
      today: '2026-09-18',
      beltNote: 'ייבוא',
    })
    expect(result.rows.get('d1')).toMatchObject({ studentId: 's-דנה', problem: 'convert' })
    expect(result.rows.get('d2')).toMatchObject({ problem: null })
    // A belt is not awarded over a failed conversion.
    expect(vi.mocked(client.awardBelt).mock.calls.map((call) => call[0])).toEqual(['s-יוסי'])
  })

  it('a refused create is a failed row, and a thrown fetch is too', async () => {
    let n = 0
    const client = fakeClient({
      createStudent: vi.fn(async () => {
        n += 1
        if (n === 1) return json({ detail: 'bad' }, 422)
        throw new TypeError('offline')
      }),
    })
    const result = await runImport([family([draft({ id: 'd1' }), draft({ id: 'd2' })])], client, { today: '2026-09-18', beltNote: 'ייבוא' })
    expect(result.rows.get('d1')).toMatchObject({ studentId: null, problem: 'create' })
    expect(result.rows.get('d2')).toMatchObject({ studentId: null, problem: 'create' })
    expect(result.families.get('ruth@example.com')?.invitation).toBe('none')
  })

  it('reads the invitation outcome from the first created member: matched account, unconfigured mail, mail that did not go', async () => {
    const answers = [
      { student: { id: 's1' }, invitation_token: null, invitation_url: null, invitation_email_configured: true, invitation_email_sent: false },
      { student: { id: 's2' }, invitation_token: 'tok', invitation_email_configured: false, invitation_email_sent: false },
      { student: { id: 's3' }, invitation_token: 'tok', invitation_email_configured: true, invitation_email_sent: false },
    ]
    let i = 0
    const client = fakeClient({ createStudent: vi.fn(async () => json(answers[i++])) })
    const fams = [
      family([draft({ id: 'a', group_id: '' })], { key: 'a@x.com', email: 'a@x.com' }),
      family([draft({ id: 'b', group_id: '' })], { key: 'b@x.com', email: 'b@x.com' }),
      family([draft({ id: 'c', group_id: '' })], { key: 'c@x.com', email: 'c@x.com' }),
    ]
    const result = await runImport(fams, client, { today: '2026-09-18', beltNote: 'ייבוא' })
    expect(result.families.get('a@x.com')?.invitation).toBe('not_needed')
    expect(result.families.get('b@x.com')?.invitation).toBe('unconfigured')
    expect(result.families.get('c@x.com')?.invitation).toBe('failed')
  })
})
