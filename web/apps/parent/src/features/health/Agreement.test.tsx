// `הסכם הרשמה` on the parent side: the clause rule, the ת.ז. check, and the three steps.
//
// The properties worth protecting here are the ones a family could be harmed by:
//   * a clause confirmation surviving a change to the answers it was confirmed against;
//   * a ת.ז. with a transposed pair being accepted at the field;
//   * a step being shown to somebody who already completed it, or skipped for somebody who
//     has not.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AgreementFlow, nextStep } from './AgreementFlow'
import { DeclarationForm } from './DeclarationForm'
import { ClubTermsStep } from './ClubTermsStep'
import { RegistrationStep } from './RegistrationStep'
import { applicableClause, CLAUSE_LIMITED, CLAUSE_NONE } from './clauses'
import { isValidNationalId } from './nationalId'
import type { AgreementStatusOut, HealthClient, TemplateSchema } from './healthClient'

const SCHEMA: TemplateSchema = {
  title: 'הצהרת בריאות',
  version: 2,
  sections: [
    {
      id: 'medical',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'האם יש אסתמה?', flag: true },
        { id: 'chest_pain', type: 'boolean', label: 'כאבים בחזה?' },
        { id: 'restrictions', type: 'text', label: 'מגבלות', required: false },
        { id: 'special_notes', type: 'text', label: 'הערות', required: false },
        // Template v2's declaration question. Not a fourth input type — the club's own
        // sentence, with WHICH sentence derived from the answers above it.
        { id: 'clause_confirmed', type: 'clause', label: 'אישור ההצהרה', required: true },
      ],
    },
  ],
}

const OWES_EVERYTHING: AgreementStatusOut = {
  health_signed: false,
  registration_complete: false,
  terms_accepted: false,
  complete: false,
  club_terms_version: 1,
  // NOT a "done" flag like the four above — it says the club's registration template asks
  // for a school grade, and the server defaults it to true. False here would quietly put
  // every test that uses this baseline on the non-default path.
  school_class_required: true,
}

function makeClient(status: Partial<AgreementStatusOut> = {}): HealthClient {
  const merged = { ...OWES_EVERYTHING, ...status }
  return {
    template: vi.fn().mockResolvedValue({ id: 'tpl-1', kind: 'full', version: 2, schema: SCHEMA }),
    declaration: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockResolvedValue({ id: 'd1' }),
    pdfUrl: (id: string) => `/x/${id}`,
    agreementStatus: vi.fn().mockResolvedValue(merged),
    saveRegistration: vi.fn().mockResolvedValue({ ...merged, registration_complete: true }),
    acceptClubTerms: vi.fn().mockResolvedValue({ ...merged, terms_accepted: true, complete: true }),
  } as unknown as HealthClient
}

// -- the clause rule ---------------------------------------------------------------
describe('the club’s two health clauses', () => {
  it('offers the no-limitations clause when nothing was declared', () => {
    expect(applicableClause(SCHEMA, { asthma: false })).toBe(CLAUSE_NONE)
  })

  it('offers the limited clause on any yes', () => {
    expect(applicableClause(SCHEMA, { asthma: true })).toBe(CLAUSE_LIMITED)
  })

  it('counts a non-flag answer too', () => {
    // `chest_pain` raises no coach badge, but a parent who ticked it is not declaring "no
    // medical limitations of any kind". The clause follows the ANSWERS, not the flags.
    expect(applicableClause(SCHEMA, { chest_pain: true })).toBe(CLAUSE_LIMITED)
  })

  it('ignores a free note that is not an answer to a question', () => {
    // `הערות בריאות מיוחדות` — "מרכיב משקפיים" is not a declaration that a child cannot train.
    expect(applicableClause(SCHEMA, { special_notes: 'מרכיב משקפיים' })).toBe(CLAUSE_NONE)
  })

  it('ignores whitespace typed into a medical field', () => {
    expect(applicableClause(SCHEMA, { restrictions: '   ' })).toBe(CLAUSE_NONE)
  })

  it('agrees with the server on the same inputs', () => {
    // The client copy exists so a parent sees the sentence while signing; the server re-derives
    // it and refuses a mismatch. These are the cases where the two could drift apart.
    expect(applicableClause(SCHEMA, {})).toBe(CLAUSE_NONE)
    expect(applicableClause(SCHEMA, { restrictions: 'לא מבצע נפילות' })).toBe(CLAUSE_LIMITED)
  })
})

// -- the ת.ז. ----------------------------------------------------------------------
describe('the national id check digit', () => {
  it('accepts a valid id and rejects a transposed one', () => {
    expect(isValidNationalId('100000017')).toBe(true)
    expect(isValidNationalId('100000071')).toBe(false)
  })

  it('pads a short id rather than refusing it', () => {
    // People write theirs without the leading zeros and every official form accepts that.
    expect(isValidNationalId('18')).toBe(true)
  })

  it('refuses all zeros even though the arithmetic passes', () => {
    expect(isValidNationalId('000000000')).toBe(false)
  })

  it('refuses junk and empty input', () => {
    for (const value of ['', '   ', 'abcdefghi', '12345678901', null, undefined]) {
      expect(isValidNationalId(value)).toBe(false)
    }
  })
})

// -- which step is owed ------------------------------------------------------------
describe('nextStep', () => {
  it('asks for the club terms before family details', () => {
    expect(nextStep(OWES_EVERYTHING)).toBe('terms')
  })

  it('moves to registration once the terms are in', () => {
    expect(nextStep({ ...OWES_EVERYTHING, terms_accepted: true })).toBe('registration')
  })

  it('moves to health once registration is in', () => {
    expect(
      nextStep({ ...OWES_EVERYTHING, registration_complete: true, terms_accepted: true }),
    ).toBe('health')
  })

  it('returns null when the family owes nothing', () => {
    expect(
      nextStep({
        ...OWES_EVERYTHING,
        registration_complete: true,
        health_signed: true,
        terms_accepted: true,
        complete: true,
      }),
    ).toBeNull()
  })

  it('skips the terms for a family that already accepted this version', () => {
    // The consequence the design is built around: a parent correcting one asthma answer is not
    // walked back through the `תקנון` they agreed to last month.
    expect(nextStep({ ...OWES_EVERYTHING, registration_complete: true, terms_accepted: true })).toBe(
      'health',
    )
  })
})

// -- the flow ----------------------------------------------------------------------
describe('AgreementFlow', () => {
  it('opens on the club-terms step and says where the family is', async () => {
    render(
      <AgreementFlow
        client={makeClient()}
        locale="he"
        studentId="st1"
        studentName="נועה לוי"
      />,
    )
    expect(await screen.findByTestId('agreement-step-terms')).toBeInTheDocument()
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('renders nothing at all once the agreement is complete', async () => {
    // Not a "you are done" screen: the gate above this renders the app instead, and a step that
    // lingered would be a family stuck looking at a finished form.
    const client = makeClient({
      registration_complete: true,
      health_signed: true,
      terms_accepted: true,
      complete: true,
    })
    const { container } = render(
      <AgreementFlow client={client} locale="he" studentId="st1" studentName="נועה לוי" />,
    )
    await waitFor(() => expect(container.querySelector('h1')).toBeNull())
  })

  it('tells the caller the moment nothing is outstanding', async () => {
    const onCompleted = vi.fn()
    render(
      <AgreementFlow
        client={makeClient({
          registration_complete: true,
          health_signed: true,
          terms_accepted: true,
          complete: true,
        })}
        locale="he"
        onCompleted={onCompleted}
        studentId="st1"
        studentName="נועה לוי"
      />,
    )
    await waitFor(() => expect(onCompleted).toHaveBeenCalled())
  })
})

// -- the clause on the form the parent signs ---------------------------------------
describe('DeclarationForm and the club’s clause', () => {
  it('shows the sentence the answers entitle the family to, and swaps it when they change', async () => {
    render(
      <DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />,
    )
    const clause = await screen.findByTestId('declaration-clause')
    expect(clause).toHaveTextContent(t('he', 'health.declaration.clause.none'))

    await userEvent.click(
      screen.getAllByRole('radio', { name: t('he', 'health.declaration.yes') })[0]!,
    )
    await waitFor(() =>
      expect(screen.getByTestId('declaration-clause')).toHaveTextContent(
        t('he', 'health.declaration.clause.limited'),
      ),
    )
  })

  it('clears a confirmation when the answers stop supporting it', async () => {
    // **The case this behaviour exists for.** A parent ticks "no medical limitations", then goes
    // back and answers yes to asthma. Without clearing, the confirmation sits there and they
    // sign a sentence that became false without ever seeing it change. The server refuses that
    // submission — but a 422 at the end of a long form is a worse way to learn it than the box
    // simply un-ticking.
    render(
      <DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />,
    )
    await screen.findByTestId('declaration-clause')

    const confirm = screen.getByRole('checkbox', {
      name: t('he', 'health.declaration.clause.confirm'),
    })
    await userEvent.click(confirm)
    expect(confirm).toBeChecked()

    await userEvent.click(
      screen.getAllByRole('radio', { name: t('he', 'health.declaration.yes') })[0]!,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: t('he', 'health.declaration.clause.confirm') }),
      ).not.toBeChecked(),
    )
  })
})

// -- the terms step ----------------------------------------------------------------
describe('ClubTermsStep', () => {
  it('shows all three payment clauses the club supplied', async () => {
    render(<ClubTermsStep locale="he" onAccept={vi.fn()} />)
    expect(screen.getByTestId('health.clubTerms.payment.cheques')).toHaveTextContent(
      'עמותת מכבי נתניה סיף ואגרוף',
    )
    expect(screen.getByTestId('health.clubTerms.payment.cancellation')).toHaveTextContent('27')
    expect(screen.getByTestId('health.clubTerms.payment.proRata')).toBeInTheDocument()
  })

  it('will not submit until the box is ticked', async () => {
    const onAccept = vi.fn()
    render(<ClubTermsStep locale="he" onAccept={onAccept} />)
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))
    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'health.clubTerms.required'))).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))
    expect(onAccept).toHaveBeenCalled()
  })
})

// -- the registration step ---------------------------------------------------------
describe('RegistrationStep', () => {
  it('refuses a ת.ז. that fails its check digit, at the field', async () => {
    const onSubmit = vi.fn()
    render(
      <RegistrationStep locale="he" onSubmit={onSubmit} studentName="נועה לוי" />,
    )
    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '123456789')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getAllByText(t('he', 'health.registration.nationalIdInvalid')).length,
    ).toBeGreaterThan(0)
  })

  it('submits the required fields once they are valid', async () => {
    const onSubmit = vi.fn()
    render(<RegistrationStep locale="he" onSubmit={onSubmit} studentName="נועה לוי" />)

    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '100000009')
    await userEvent.type(ids[1]!, '100000017')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.grade')), "ג'")
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.address')), 'הרצל 12')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.city')), 'נתניה')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const body = onSubmit.mock.calls[0]![0]
    expect(body.child.national_id).toBe('100000009')
    expect(body.child.city).toBe('נתניה')
    expect(body.signer.national_id).toBe('100000017')
  })

  it('lets an adult who is their own guardian through with no school class', async () => {
    // `selfStudent` in the join form makes a student of the parent themselves, and the
    // registration gate then demanded a כיתה nobody could answer. The server stopped
    // requiring it; this is the other half — the submit never fired while the form did.
    const onSubmit = vi.fn()
    render(
      <RegistrationStep
        locale="he"
        onSubmit={onSubmit}
        schoolClassRequired={false}
        studentName="יובל בוגר"
      />,
    )

    expect(
      screen.queryByLabelText(t('he', 'health.registration.grade')),
    ).not.toBeInTheDocument()

    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '100000009')
    await userEvent.type(ids[1]!, '100000017')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.address')), 'ביאליק 4')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.city')), 'נתניה')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0].child.grade).toBe('')
  })

  it('still demands a school class for a child', async () => {
    // The guard: the flag defaults to true, so nothing about an ordinary registration moves.
    const onSubmit = vi.fn()
    render(<RegistrationStep locale="he" onSubmit={onSubmit} studentName="נועה לוי" />)

    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '100000009')
    await userEvent.type(ids[1]!, '100000017')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.address')), 'הרצל 12')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.city')), 'נתניה')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t('he', 'health.registration.grade'))).toBeInTheDocument()
  })

  it('drops a pickup row the parent never filled in', async () => {
    // An empty repeatable row somebody tabbed past is not a person who may collect a child.
    const onSubmit = vi.fn()
    render(<RegistrationStep locale="he" onSubmit={onSubmit} studentName="נועה לוי" />)
    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '100000009')
    await userEvent.type(ids[1]!, '100000017')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.grade')), "ג'")
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.address')), 'הרצל 12')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.city')), 'נתניה')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    expect(onSubmit.mock.calls[0]![0].pickup_contacts).toEqual([])
  })

  it("refuses a second parent's ת.ז. that is wrong, even though giving one is optional", async () => {
    // Optional to PROVIDE is not optional to get right: a typo here lands on an insurance list
    // exactly as hard as one in the child's own.
    const onSubmit = vi.fn()
    render(<RegistrationStep locale="he" onSubmit={onSubmit} studentName="נועה לוי" />)
    const ids = screen.getAllByLabelText(t('he', 'health.registration.nationalId'))
    await userEvent.type(ids[0]!, '100000009')
    await userEvent.type(ids[1]!, '100000017')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.grade')), "ג'")
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.address')), 'הרצל 12')
    await userEvent.type(screen.getByLabelText(t('he', 'health.registration.city')), 'נתניה')
    await userEvent.type(
      screen.getByLabelText(
        `${t('he', 'health.registration.otherParent')} · ${t('he', 'health.registration.nationalId')}`,
      ),
      '123456789',
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
