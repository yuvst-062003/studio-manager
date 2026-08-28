// Parent artboard 12c, and §5.5's gate.
//
// Four tests carry the weight and three of them are negatives: the pad must NOT mirror inside
// `dir="rtl"`, the form must NOT submit with a question unanswered, and the gate must NOT render
// the app behind it. The fourth is 12c finding 5's third answer state, which the artboard does
// not draw and which a two-position switch cannot express.
import { render, screen } from '@testing-library/react'
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
  version: 1,
  is_bundled_default: true,
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
      // Added with the typed-name route below: it renders the name INTO the canvas, so the
      // recorder has to answer the text calls or the fallback throws instead of signing.
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
  })

  it('a parent who cannot use a pointer can still sign, by typing their name', async () => {
    // SC 2.1.1, at the highest cost this product can charge for it. §6.1 step 6 makes the
    // declaration a HARD GATE — until it is signed, no other screen in the parent app is
    // reachable — so a pad that only answered to a pointer did not lack an affordance, it
    // locked a keyboard-only parent out of the entire product with no way to report it from
    // inside. The typed name is rendered into the canvas, so the backend still receives one
    // base64 PNG and `signature_image` still holds ink.
    const onChange = vi.fn()
    render(<SignaturePad locale="he" onChange={onChange} />)

    const field = screen.getByLabelText(t('he', 'health.declaration.signatureTyped'))
    await userEvent.type(field, 'דנה כהן')

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toBe('data:image/png;base64,AAAA')
  })

  it('clearing the typed name un-signs the pad rather than leaving stale ink', async () => {
    // Emitting `null` is what the form reads to keep its submit button disabled. A pad that
    // kept the last PNG after the field was emptied would let a parent submit a signature
    // they had visibly just deleted.
    const onChange = vi.fn()
    render(<SignaturePad locale="he" onChange={onChange} />)
    const field = screen.getByLabelText(t('he', 'health.declaration.signatureTyped'))
    await userEvent.type(field, 'א')
    await userEvent.clear(field)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('the typed field is NOT direction-isolated, unlike the canvas', () => {
    // The canvas is pinned to `ltr` because a STROKE PATH must not mirror. A name is text: a
    // Hebrew name has to lay out right-to-left like every other name in the app, and copying
    // the canvas's exception onto it would be cargo-culting the fix.
    render(<SignaturePad locale="he" onChange={vi.fn()} />)
    const field = screen.getByLabelText(t('he', 'health.declaration.signatureTyped'))
    expect(field.getAttribute('dir')).toBeNull()
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

  it("D11's caveat is on the screen the parent signs", async () => {
    // 12c finding 3. A family signing something the app privately describes as a starting point
    // should be told so on the page they sign.
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    expect(await screen.findByText(t('he', 'health.template.disclaimer'))).toBeInTheDocument()
  })

  it('says the declaration never expires rather than showing a validity date', async () => {
    // §5.5, and the seventh artboard to assume otherwise (12c finding 1).
    render(<DeclarationForm client={makeClient()} locale="he" studentId="st1" studentName="נועה לוי" />)
    expect(await screen.findByText(t('he', 'health.declaration.noExpiry'))).toBeInTheDocument()
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

  it('a trial-signed declaration is still gated', () => {
    // §5.5's gate is about the FULL declaration. Three questions on a phone during a trial
    // funnel is not the record the club needs before a child trains regularly.
    render(
      <HealthGate
        client={makeClient()}
        locale="he"
        students={[
          {
            id: 'st1',
            display_name: 'נועה לוי',
            health_status: 'trial_signed',
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
