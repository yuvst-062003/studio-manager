// Parent artboard 12c, and §5.5's gate.
//
// Four tests carry the weight and three of them are negatives: the pad must NOT mirror inside
// `dir="rtl"`, the form must NOT submit with a question unanswered, and the gate must NOT render
// the app behind it. The fourth is 12c finding 5's third answer state, which the artboard does
// not draw and which a two-position switch cannot express.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { DeclarationForm } from './DeclarationForm'
import { HealthGate, firstStudentNeedingDeclaration } from './HealthGate'
import { SignaturePad } from './SignaturePad'
import { isVisible, unansweredRequired } from './healthClient'
import type { HealthClient, TemplateSchema } from './healthClient'

const SCHEMA: TemplateSchema = {
  title: 'הצהרת בריאות',
  version: 2,
  sections: [
    {
      id: 'medical',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'האם יש אסתמה?', flag: true },
        { id: 'allergy', type: 'boolean', label: 'אלרגיה ידועה', flag: true },
        {
          id: 'allergy_details',
          type: 'text',
          label: 'פירוט האלרגיה',
          required: false,
          visible_if: { allergy: true },
        },
      ],
    },
  ],
}

/** Template v2's shape: the same questions plus the club's own declaration clause. */
const CLAUSE_SCHEMA: TemplateSchema = {
  ...SCHEMA,
  sections: [
    ...SCHEMA.sections,
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        {
          id: 'clause_confirmed',
          type: 'clause',
          label: 'אני מאשר/ת את ההצהרה שלמעלה',
          required: true,
        },
      ],
    },
  ],
}

function makeClient(over: Partial<HealthClient> = {}): HealthClient {
  return {
    template: vi.fn().mockResolvedValue({
      id: 'tpl-1',
      kind: 'full',
      version: 1,
      schema: SCHEMA,
      source_pdf_object_key: null,
      published_at: null,
    }),
    declaration: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockResolvedValue({ id: 'd1' }),
    pdfUrl: (id: string) => `/api/v1/students/${id}/health-declaration/pdf`,
    // `הסכם הרשמה`. The default is a family owing everything, because that is what the gate
    // tests below are about — a client whose status came back `complete` would render nothing
    // and every one of them would pass vacuously.
    agreementStatus: vi.fn().mockResolvedValue({
      health_signed: false,
      registration_complete: false,
      terms_accepted: false,
      complete: false,
      club_terms_version: 1,
    }),
    saveRegistration: vi.fn().mockResolvedValue({
      health_signed: false,
      registration_complete: true,
      terms_accepted: false,
      complete: false,
      club_terms_version: 1,
    }),
    acceptClubTerms: vi.fn().mockResolvedValue({
      health_signed: true,
      registration_complete: true,
      terms_accepted: true,
      complete: true,
      club_terms_version: 1,
    }),
    ...over,
  } as unknown as HealthClient
}

// ---------------------------------------------------------------------------------
// the pad
// ---------------------------------------------------------------------------------
describe('SignaturePad', () => {
  beforeEach(() => {
    // jsdom's canvas has no 2d context. The pad's coordinate maths is what these tests are
    // about, so the context is stubbed to a recorder rather than the whole component mocked.
    const strokes: { x: number; y: number }[] = []
    ;(globalThis as unknown as { __strokes: typeof strokes }).__strokes = strokes
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      beginPath: vi.fn(),
      moveTo: vi.fn((x: number, y: number) => strokes.push({ x, y })),
      lineTo: vi.fn((x: number, y: number) => strokes.push({ x, y })),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
  })

  it('renders no typed-name field -- drawing is the only way to sign (decision 13)', () => {
    // The typed-full-name fallback under the pad is deleted outright, not hidden behind a
    // flag: a keyboard-only parent who can't draw is told, via the accessibility statement,
    // to call the club instead. `queryByRole('textbox')` rather than a missing-label check
    // -- the label string itself no longer exists in any locale, so asking for it would
    // prove nothing. The canvas (role="img") and the clear button (role="button") staying
    // present is what rules out "the whole pad failed to render" as the reason.
    render(<SignaturePad locale="he" onChange={vi.fn()} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByTestId('signature-canvas')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'health.declaration.signatureClear') }),
    ).toBeInTheDocument()
  })

  it('the canvas is direction-isolated, so a stroke cannot be flipped by an RTL ancestor', () => {
    // 12c: "A stroke is a person's handwriting; a transform derived from `dir` would flip it."
    render(
      <div dir="rtl">
        <SignaturePad locale="he" onChange={vi.fn()} />
      </div>,
    )
    expect(screen.getByTestId('signature-canvas').getAttribute('dir')).toBe('ltr')
  })

  it('a pointer path drawn left to right produces increasing canvas x, inside dir="rtl"', () => {
    const canvasProto = HTMLCanvasElement.prototype
    // `new DOMRect` rather than an object literal: D10's rule bans a `left:` property, and the
    // real API is what the component reads anyway.
    canvasProto.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 600, 200))
    render(
      <div dir="rtl">
        <SignaturePad locale="he" onChange={vi.fn()} />
      </div>,
    )
    const canvas = screen.getByTestId('signature-canvas')
    const strokes = (globalThis as unknown as { __strokes: { x: number }[] }).__strokes
    strokes.length = 0

    const fire = (type: string, clientX: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          clientX,
          clientY: 100,
          bubbles: true,
          pointerId: 1,
        }),
      )
    fire('pointerdown', 100)
    fire('pointermove', 200)
    fire('pointermove', 300)

    const xs = strokes.map((point) => point.x)
    expect(xs.length).toBeGreaterThan(0)
    expect(xs.at(-1)!).toBeGreaterThan(xs[0]!)
  })

  it('an untouched pad reports no signature and its clear control is unavailable', () => {
    const onChange = vi.fn()
    render(<SignaturePad locale="he" onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: t('he', 'health.declaration.signatureClear'),
      }),
    ).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------------
// visibility and completeness — the rules, without a DOM
// ---------------------------------------------------------------------------------
describe('the question rules', () => {
  it('a detail field appears only once its condition holds', () => {
    const question = SCHEMA.sections[0]!.questions[2]!
    expect(isVisible(question, { allergy: false })).toBe(false)
    expect(isVisible(question, { allergy: true })).toBe(true)
  })

  it('a flag question is required even though it does not say so', () => {
    // §5.5 gives a coach a ⚠ derived from these and nothing else, so an unanswered one is a
    // warning that silently is not one. Matches the server.
    expect(unansweredRequired(SCHEMA, {})).toEqual(['asthma', 'allergy'])
  })

  it('an invisible question is never required', () => {
    expect(unansweredRequired(SCHEMA, { asthma: false, allergy: false })).toEqual([])
  })
})

// ---------------------------------------------------------------------------------
// the form
// ---------------------------------------------------------------------------------
describe('DeclarationForm', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
  })

  it('a sighted parent can see each boolean question, not only assistive tech', async () => {
    // The SegmentedControl's legend is visually hidden by design (sr-only). If a question's
    // label lives ONLY there, the row renders as a bare כן/לא with no visible question text.
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    const visible = screen
      .getAllByText('האם יש אסתמה?')
      .filter((el) => !el.closest('.studio-segmented__legend'))
    expect(visible.length).toBeGreaterThan(0)
  })

  it('every question starts unanswered — neither כן nor לא is selected', async () => {
    // 12c finding 5, the most consequential gap on the artboard: "a declaration that defaults
    // every question to no and gets signed is a health record nobody actually answered".
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })

  it('refuses to submit while a question is unanswered, and says which state it is in', async () => {
    const client = makeClient()
    render(<DeclarationForm client={client} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    await userEvent.click(
      screen.getByRole('button', {
        name: t('he', 'health.declaration.submit'),
      }),
    )
    expect(client.submit).not.toHaveBeenCalled()
    expect(screen.getByTestId('unanswered-asthma')).toHaveTextContent(
      t('he', 'health.declaration.unanswered'),
    )
  })

  it('refuses to submit an answered form with no signature', async () => {
    const client = makeClient()
    render(<DeclarationForm client={client} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    const radios = screen.getAllByRole('radio')
    // Two questions, two "לא" options.
    await userEvent.click(radios[1]!)
    await userEvent.click(radios[3]!)
    await userEvent.click(
      screen.getByRole('button', {
        name: t('he', 'health.declaration.submit'),
      }),
    )
    expect(client.submit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(t('he', 'health.declaration.signatureRequired'))
  })

  it('a signature drawn on the canvas carries all the way to the submit request body', async () => {
    // The seam this decision cannot skip: not "the pad reports ink" (already covered above)
    // and not "the form blocks with no signature" (the test just above) but the join between
    // them -- draw, answer, submit, and the exact base64 the canvas produced is what
    // `client.submit` receives. Typing is no longer a way to get here at all.
    const client = makeClient()
    render(<DeclarationForm client={client} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    const radios = screen.getAllByRole('radio')
    await userEvent.click(radios[1]!)
    await userEvent.click(radios[3]!)

    const canvas = screen.getByTestId('signature-canvas')
    // `fireEvent`, not a raw `dispatchEvent`: each call is wrapped in `act()`, so `hasInk`
    // has actually flushed by the time the NEXT event fires. Firing all three natively in
    // one synchronous block left `pointerup`'s handler closed over the pre-update `hasInk`
    // -- state update and read happening in the same microtask, so the draw never emitted.
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })

    await userEvent.click(
      screen.getByRole('button', {
        name: t('he', 'health.declaration.submit'),
      }),
    )

    expect(client.submit).toHaveBeenCalledWith('st1', {
      template_id: 'tpl-1',
      answers: { asthma: false, allergy: false },
      signature_image_base64: 'data:image/png;base64,AAAA',
    })
  })

  it('answering yes reveals the detail field, and answering no again clears it', async () => {
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('אלרגיה ידועה')
    const radios = screen.getAllByRole('radio')
    await userEvent.click(radios[2]!) // allergy · כן
    const detail = await screen.findByLabelText('פירוט האלרגיה')
    await userEvent.type(detail, 'בוטנים')
    expect(detail).toHaveValue('בוטנים')

    await userEvent.click(screen.getAllByRole('radio')[3]!) // allergy · לא
    expect(screen.queryByLabelText('פירוט האלרגיה')).toBeNull()
  })

  it("D11's caveat is gone from the screen the parent signs", async () => {
    // The inverse of the assertion that stood here, and the reason is the change itself.
    // 12c finding 3 was right while the questions were OURS: a family signing something the
    // app privately called "a starting point" should be told so. Template v2's declaration is
    // the CLUB's own `טופס הרשמה`, signed alongside the club's own תקנון — so the sentence
    // became false, and printing it on a club's own legal instrument is worse than silence.
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findByText(t('he', 'health.declaration.attestation'))
    expect(
      screen.queryByText(/נקודת פתיחה בלבד|אינו מסמך עמידה ברגולציה/),
    ).not.toBeInTheDocument()
  })

  it('says the declaration never expires rather than showing a validity date', async () => {
    // §5.5, and the seventh artboard to assume otherwise (12c finding 1).
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    expect(await screen.findByText(t('he', 'health.declaration.noExpiry'))).toBeInTheDocument()
  })

  // -- the quick "no known health problems" fill ---------------------------------
  // Thirteen booleans on a phone, and for most families every answer is לא. The third answer
  // state above stays exactly as it is — nothing is preselected on load — and this is the
  // parent's own single tap, not a default. That is the whole distinction: a declaration
  // nobody answered versus one answered in one gesture.
  it('one tap answers every unanswered question with לא', async () => {
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'health.declaration.markAllHealthy') }),
    )

    for (const radio of screen.getAllByRole('radio')) {
      const answered = (radio as HTMLInputElement).value === 'no'
      expect(radio).toHaveProperty('checked', answered)
    }
  })

  it('does not overwrite a כן already given, or the detail typed under it', async () => {
    // The shortcut fills what is still blank. Overwriting a yes would delete a medical answer
    // a parent had already given, on the one form where a silently deleted answer is worst.
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('אלרגיה ידועה')
    await userEvent.click(screen.getAllByRole('radio')[2]!) // allergy · כן
    await userEvent.type(await screen.findByLabelText('פירוט האלרגיה'), 'בוטנים')

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'health.declaration.markAllHealthy') }),
    )

    const radios = screen.getAllByRole('radio')
    expect(radios[1]).toBeChecked() // asthma · לא, filled by the shortcut
    expect(radios[2]).toBeChecked() // allergy · כן, left alone
    expect(radios[3]).not.toBeChecked()
    expect(screen.getByLabelText('פירוט האלרגיה')).toHaveValue('בוטנים')
  })

  it('leaves the declaration clause for the parent to confirm', async () => {
    // The clause is the legal attestation — the sentence the family is signing under. A
    // shortcut that ticked it would sign a statement on their behalf.
    render(
      <DeclarationForm
        client={makeClient({
          template: vi.fn().mockResolvedValue({
            id: 'tpl-1',
            kind: 'full',
            version: 2,
            schema: CLAUSE_SCHEMA,
            source_pdf_object_key: null,
            published_at: null,
          }),
        } as Partial<HealthClient>)}
        locale="he"
        studentId="st1"
        studentName="נועה לוי"
      />,
    )
    await screen.findAllByText('האם יש אסתמה?')

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'health.declaration.markAllHealthy') }),
    )

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('disappears once every question has an answer', async () => {
    // A shortcut that fills nothing is a button that does nothing when pressed.
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    await screen.findAllByText('האם יש אסתמה?')
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'health.declaration.markAllHealthy') }),
    )
    expect(
      screen.queryByRole('button', { name: t('he', 'health.declaration.markAllHealthy') }),
    ).toBeNull()
  })

  it('renders in English too, with the manager’s own question wording untouched', async () => {
    // SPEC §13 renders every component in both directions. 12c finding 4: the QUESTIONS are
    // manager-editable data and are shown as typed; only the app's own copy is translated.
    render(<DeclarationForm client={makeClient()} locale="en" studentId="st1" studentName="Noa Levi" />)
    expect((await screen.findAllByText('האם יש אסתמה?')).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', {
        name: t('en', 'health.declaration.submit'),
      }),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------------
describe('HealthGate', () => {
  // No text: G4 bans an inlined user-facing string, and this stands in for the whole app.
  const app = <p data-testid="the-app" />

  it('a missing declaration blocks the app entirely — the children are not rendered at all', async () => {
    // §5.5: "no other screen is reachable". Not hidden, not covered: absent. A screen that is
    // merely covered is one CSS bug away from being reachable.
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[{ id: 'st1', display_name: 'נועה לוי', health_status: 'missing' }]}
      >
        {app}
      </HealthGate>,
    )
    expect(await screen.findByTestId('health-gate')).toBeInTheDocument()
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('gates a trial-signed child who is no longer on a trial', () => {
    // SPEC line 626 — "The trial declaration is not sufficient for enrollment … converting
    // requires the full form." A converted child on the short form is exactly the case the
    // gate exists for.
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[
          {
            id: 'st1',
            display_name: 'נועה לוי',
            status: 'active',
            health_status: 'trial_signed',
          },
        ]}
      >
        {app}
      </HealthGate>,
    )
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('lets a child who is STILL on a trial through on the short form', () => {
    // §5.5 names the gate condition twice — SPEC lines 688 and 1315 — and both times it is
    // `health_status = missing`. Gating everything short of `signed` is stricter than that,
    // and the extra strictness had one concrete consequence: §5.4a's booking funnel writes
    // `status='trial'` + `health_status='trial_signed'` (app/services/people/trials.py),
    // which is precisely the pair §6.3's reduced trial home renders for. The two rules
    // could never both hold, so `TrialHome` was unreachable in a running app and the
    // `dev+trial` persona walked into a full declaration form instead of the screen it
    // exists to exercise.
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[
          {
            id: 'st1',
            display_name: 'רותם ניסיון',
            status: 'trial',
            health_status: 'trial_signed',
          },
        ]}
      >
        {app}
      </HealthGate>,
    )
    expect(screen.getByTestId('the-app')).toBeInTheDocument()
  })

  it('gates a trial child who signed nothing at all', () => {
    // `missing` is `missing` whatever the student's status. A trial booked by a manager
    // rather than through the funnel has no declaration of any kind.
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[
          {
            id: 'st1',
            display_name: 'רותם ניסיון',
            status: 'trial',
            health_status: 'missing',
          },
        ]}
      >
        {app}
      </HealthGate>,
    )
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('a signed declaration lets the app through', () => {
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[{ id: 'st1', display_name: 'נועה לוי', health_status: 'signed' }]}
      >
        {app}
      </HealthGate>,
    )
    expect(screen.getByTestId('the-app')).toBeInTheDocument()
    expect(screen.queryByTestId('health-gate')).toBeNull()
  })

  it('one child missing a declaration gates the whole app, siblings included', () => {
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[
          { id: 'st1', display_name: 'נועה לוי', health_status: 'signed' },
          { id: 'st2', display_name: 'איתי לוי', health_status: 'missing' },
        ]}
      >
        {app}
      </HealthGate>,
    )
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('a guardian with no children is not gated', () => {
    // A person with no `guardian` row never reaches the parent shell at all (§6.1), but an empty
    // list must not be read as "somebody is missing one".
    render(
      <HealthGate client={makeClient()} locale="he" students={[]}>
        {app}
      </HealthGate>,
    )
    expect(screen.getByTestId('the-app')).toBeInTheDocument()
  })

  it('picks the first child still owing one, so the flow is walked once per child', () => {
    expect(
      firstStudentNeedingDeclaration([
        { id: 'a', display_name: 'א', health_status: 'signed' },
        { id: 'b', display_name: 'ב', health_status: 'missing' },
        { id: 'c', display_name: 'ג', health_status: 'missing' },
      ])?.id,
    ).toBe('b')
  })
})
