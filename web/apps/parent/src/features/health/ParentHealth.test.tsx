// §5.5's gate, and the template's own question rules.
//
// **Reduced on 2026-09-12, when the second onboarding flow was deleted.** This file used to
// cover artboard 12c's signature pad and `DeclarationForm` as well; both belonged to
// `AgreementFlow`, the five-step flow the gate used to render, and went with it. The one
// wizard has its own signature field and its own health step, tested beside it.
//
// What is left is the part that was never about those screens: which questions a schema
// shows, which it requires, and who the gate blocks.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HealthGate, firstStudentNeedingDeclaration } from './HealthGate'
import { isVisible, unansweredRequired } from './healthClient'
import type { TemplateSchema } from './healthClient'

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
// ---------------------------------------------------------------------------------
// the pad
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
// **The gate is a decision now, not a flow.** It used to render `AgreementFlow` -- a second
// five-step onboarding flow -- and these tests reached into it. Since 2026-09-12 the gate
// decides WHO is blocked and the shell supplies the one join wizard, so the wizard is stubbed
// here: what is under test is the blocking rule, which is what it always was.
describe('HealthGate', () => {
  // No text: G4 bans an inlined user-facing string, and this stands in for the whole app.
  const app = <p data-testid="the-app" />

  it('a missing declaration blocks the app entirely — the children are not rendered at all', async () => {
    // §5.5: "no other screen is reachable". Not hidden, not covered: absent. A screen that is
    // merely covered is one CSS bug away from being reachable.
    render(
      <HealthGate
        wizard={() => <p data-testid="the-wizard" />}
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
        wizard={() => <p data-testid="the-wizard" />}
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
        wizard={() => <p data-testid="the-wizard" />}
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
        wizard={() => <p data-testid="the-wizard" />}
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
        wizard={() => <p data-testid="the-wizard" />}
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
        wizard={() => <p data-testid="the-wizard" />}
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
      <HealthGate wizard={() => <p data-testid="the-wizard" />} students={[]}>
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
