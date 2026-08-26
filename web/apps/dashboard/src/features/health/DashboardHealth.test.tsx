// Dashboard artboard 4e, and D11's editor behind it.
//
// The tests that carry weight are negatives. 4e's opening line is that **no medical content
// appears on this screen** — so the load-bearing assertion is that no flag label and no answer is
// anywhere in the DOM, on a row whose student has every flag raised. And D11's caveat must be on
// the editor unconditionally, so the assertion is that it is there before anything is changed.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { DocumentsScreen, chaseable, chipStatusFor, statusLabel } from './DocumentsScreen'
import {
  TemplateEditor,
  withFlag,
  withNewQuestion,
  withQuestionLabel,
  withoutQuestion,
} from './TemplateEditor'
import type { DashboardHealthClient, EditableSchema, HealthStatusSummaryOut } from './healthClient'

const ROWS: HealthStatusSummaryOut[] = [
  {
    student_id: 'st1',
    student_display_name: 'נועה לוי',
    health_status: 'missing',
    last_reminder_sent_at: null,
  },
  {
    student_id: 'st2',
    student_display_name: 'איתי כהן',
    health_status: 'signed',
    last_reminder_sent_at: null,
  },
  {
    student_id: 'st3',
    student_display_name: 'דנה מזרחי',
    health_status: 'trial_signed',
    last_reminder_sent_at: null,
  },
]

const SCHEMA: EditableSchema = {
  title: 'הצהרת בריאות',
  version: 1,
  is_bundled_default: true,
  sections: [
    {
      id: 'medical',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'האם יש אסתמה?', flag: true },
        { id: 'allergy', type: 'boolean', label: 'האם יש אלרגיה?', flag: true },
      ],
    },
  ],
}

function makeClient(over: Partial<DashboardHealthClient> = {}): DashboardHealthClient {
  return {
    summary: vi.fn().mockResolvedValue(ROWS),
    remind: vi.fn().mockResolvedValue({ last_reminder_sent_at: '2026-11-03T12:00:00Z' }),
    templates: vi.fn().mockResolvedValue({
      items: [{ id: 'tpl-1', kind: 'full', version: 1 }],
    }),
    template: vi.fn().mockResolvedValue({
      id: 'tpl-1',
      kind: 'full',
      version: 1,
      schema: SCHEMA,
      source_pdf_object_key: null,
      published_at: null,
    }),
    saveDraft: vi.fn().mockResolvedValue({
      id: 'tpl-2',
      kind: 'full',
      version: 2,
      schema: { ...SCHEMA, version: 2, is_bundled_default: undefined },
      source_pdf_object_key: null,
      published_at: null,
    }),
    publish: vi.fn().mockResolvedValue({
      template: { id: 'tpl-2', kind: 'full', version: 2, schema: SCHEMA },
      declarations_recomputed: 7,
    }),
    pdfUrl: (id: string) => `/api/v1/students/${id}/health-declaration/pdf`,
    ...over,
  } as unknown as DashboardHealthClient
}

// ---------------------------------------------------------------------------------
describe('DocumentsScreen', () => {
  it('renders no medical content at all — not one flag label, not one answer', async () => {
    // 4e's opening line, as an assertion. This is the whole reason the compliance view exists
    // separately from the record: a manager chasing declarations needs to know WHO, and nothing
    // about what any of the completed ones say.
    render(<DocumentsScreen client={makeClient()} locale="he" />)
    await screen.findByText('נועה לוי')

    const body = document.body.textContent ?? ''
    for (const flag of [
      'health.flag.asthma',
      'health.flag.allergy',
      'health.flag.medication',
      'health.flag.epilepsy',
      'health.flag.heart',
      'health.flag.diabetes',
      'health.flag.injury',
      'health.flag.other',
    ] as const) {
      expect(body).not.toContain(t('he', flag))
    }
  })

  it('warns that opening a declaration is logged, beside the control that opens it', async () => {
    // 4e finding 1. §11.2 logs the read; the manager is told before it happens, not after. The
    // artboard does not draw this, and 4e says explicitly not to read the silence as a decision.
    render(<DocumentsScreen client={makeClient()} locale="he" />)
    expect(await screen.findByTestId('audit-notice-st2')).toHaveTextContent(
      t('he', 'health.documents.viewFullNotice'),
    )
  })

  it('offers the audit notice only where a full record can actually be opened', async () => {
    render(<DocumentsScreen client={makeClient()} locale="he" />)
    await screen.findByText('נועה לוי')
    expect(screen.queryByTestId('audit-notice-st1')).toBeNull()
  })

  it('shows a reminder button on a row that owes a declaration, and reports the send', async () => {
    const client = makeClient()
    render(<DocumentsScreen client={client} locale="he" />)
    await screen.findByText('נועה לוי')

    const buttons = screen.getAllByRole('button', {
      name: t('he', 'health.reminder.send'),
    })
    await userEvent.click(buttons[0]!)
    expect(client.remind).toHaveBeenCalledWith('st1')
    expect(await screen.findByText(t('he', 'health.reminder.sent'))).toBeInTheDocument()
  })

  it('renders the goal state when everything is filed', async () => {
    // 4e finding 8 — the empty state the artboard omits, on the screen whose empty state is the
    // point of the feature.
    render(<DocumentsScreen client={makeClient({ summary: vi.fn().mockResolvedValue([]) })} locale="he" />)
    expect(await screen.findByText(t('he', 'health.documents.empty'))).toBeInTheDocument()
  })

  it('the group request counts exactly the rows on screen that still owe something', () => {
    // 4e finding 6, decided. The artboard's own count excludes its awaiting-signature four and
    // its relationship to the row checkboxes is undefined. A count derived from the rows cannot
    // disagree with them.
    expect(chaseable(ROWS).map((row) => row.student_id)).toEqual(['st1', 'st3'])
  })

  it('maps every document state onto a chip the design system actually has', () => {
    // 4e finding 7: `ChipStatus` covers none of the document states. Mapped by meaning rather
    // than by inventing a fourth chip primitive inside a feature directory.
    expect(chipStatusFor('missing')).toBe('debt')
    expect(chipStatusFor('trial_signed')).toBe('pending')
    expect(chipStatusFor('signed')).toBe('paid')
  })

  it('never renders an expiry, because declarations do not expire', async () => {
    // 4e finding 2, refused. §5.5 is explicit and this would be the ninth artboard to say
    // otherwise. There is no expiry string in the namespace to render even if a row wanted one.
    render(<DocumentsScreen client={makeClient()} locale="he" />)
    await screen.findByText('נועה לוי')
    expect(document.body.textContent).not.toContain('פג')
  })

  it('labels each status without leaking what it was derived from', () => {
    expect(statusLabel('he', 'missing')).toBe(t('he', 'health.badge.missing'))
    expect(statusLabel('en', 'signed')).toBe(t('en', 'health.badge.signed'))
  })

  it('renders in English too', async () => {
    render(<DocumentsScreen client={makeClient()} locale="en" />)
    expect(await screen.findByText(t('en', 'health.documents.title'))).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------------
describe('TemplateEditor', () => {
  it("renders D11's caveat unconditionally, before anything can be changed", async () => {
    // D11: "the app must say so where the manager edits it". Not behind a disclosure, not after
    // a first edit. This string is not optional.
    render(<TemplateEditor client={makeClient()} locale="he" />)
    expect(await screen.findByText(t('he', 'health.template.disclaimer'))).toBeInTheDocument()
  })

  it('says the questions are the bundled ones while they still are', async () => {
    render(<TemplateEditor client={makeClient()} locale="he" />)
    expect(await screen.findByTestId('template-provenance')).toHaveTextContent(
      t('he', 'health.template.editingBundled'),
    )
  })

  it("says they are the club's own once the marker is gone", async () => {
    const client = makeClient({
      template: vi.fn().mockResolvedValue({
        id: 'tpl-1',
        kind: 'full',
        version: 2,
        schema: { ...SCHEMA, is_bundled_default: undefined },
        source_pdf_object_key: null,
        published_at: null,
      }),
    })
    render(<TemplateEditor client={client} locale="he" />)
    expect(await screen.findByTestId('template-provenance')).toHaveTextContent(
      t('he', 'health.template.editingYours'),
    )
  })

  it('saves a draft rather than editing what parents are signing', async () => {
    const client = makeClient()
    render(<TemplateEditor client={client} locale="he" />)
    await screen.findByDisplayValue('האם יש אסתמה?')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.template.save') }))
    expect(client.saveDraft).toHaveBeenCalled()
    expect(await screen.findByText(t('he', 'health.template.saved'))).toBeInTheDocument()
  })

  it('reports how many declarations a publish re-derived', async () => {
    // Flags are a function of (answers, template version), so publishing invalidates every
    // declaration's. A publish that said nothing about the roster it just fixed would look
    // identical to one that fixed nothing.
    const client = makeClient()
    render(<TemplateEditor client={client} locale="he" />)
    await screen.findByDisplayValue('האם יש אסתמה?')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'health.template.publish') }))
    expect(await screen.findByText(/7/)).toBeInTheDocument()
  })

  it('renders every question as an editable field — D11 in one assertion', async () => {
    render(<TemplateEditor client={makeClient()} locale="he" />)
    expect(await screen.findByDisplayValue('האם יש אסתמה?')).toBeInTheDocument()
    expect(screen.getByDisplayValue('האם יש אלרגיה?')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------------
describe('the schema edits, without a DOM', () => {
  it('rewording changes one question and leaves the rest alone', () => {
    const next = withQuestionLabel(SCHEMA, 'asthma', 'האם אובחנה אסתמה?')
    expect(next.sections[0]!.questions[0]!.label).toBe('האם אובחנה אסתמה?')
    expect(next.sections[0]!.questions[1]!.label).toBe('האם יש אלרגיה?')
  })

  it('removing takes exactly one question out', () => {
    const next = withoutQuestion(SCHEMA, 'allergy')
    expect(next.sections[0]!.questions.map((q) => q.id)).toEqual(['asthma'])
  })

  it('a new question is not a flag question by default', () => {
    // A flag puts a ⚠ on a coach's roster. A question that silently became one because it was
    // the default is a warning nobody chose to raise, and §5.5's badge is only useful while it
    // is trusted.
    const next = withNewQuestion(SCHEMA, 'medical')
    expect(next.sections[0]!.questions.at(-1)!.flag).toBe(false)
  })

  it('a new question gets an id that collides with nothing', () => {
    const once = withNewQuestion(SCHEMA, 'medical')
    const twice = withNewQuestion(once, 'medical')
    const ids = twice.sections[0]!.questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a flag can be turned on and off explicitly', () => {
    expect(withFlag(SCHEMA, 'asthma', false).sections[0]!.questions[0]!.flag).toBe(false)
    expect(withFlag(SCHEMA, 'asthma', true).sections[0]!.questions[0]!.flag).toBe(true)
  })

  it('none of the edits mutates the schema it was given', () => {
    const before = JSON.stringify(SCHEMA)
    withQuestionLabel(SCHEMA, 'asthma', 'x')
    withoutQuestion(SCHEMA, 'asthma')
    withNewQuestion(SCHEMA, 'medical')
    withFlag(SCHEMA, 'asthma', false)
    expect(JSON.stringify(SCHEMA)).toBe(before)
  })
})
