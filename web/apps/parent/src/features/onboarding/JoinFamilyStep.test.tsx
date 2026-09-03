import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinFamilyStep } from './JoinFamilyStep'

const groups = [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }]

type PricePlanRow = {
  id: string
  name: string
  monthly_amount_agorot: number
  sessions_per_week: number | null
}

function stubPricePlans(items: PricePlanRow[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/price-plans')) {
        return new Response(JSON.stringify({ items }), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fillSigner(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
  await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
  await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
  await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')
}

function currentPanel() {
  return screen.getByTestId(/^join-family-panel-/)
}

describe('JoinFamilyStep (per-student panels)', () => {
  it('starts with an empty subject list and requires at least one row before submitting', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
        token="tok-1"
      />,
    )
    expect(screen.queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    await user.click(screen.getByTestId('join-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
    await screen.findByRole('alert')
    expect(screen.getAllByText(t('he', 'people.join.required')).length).toBeGreaterThan(0)
  })

  it('the forward button is never disabled, even while invalid', () => {
    stubPricePlans()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )
    expect(screen.getByTestId('join-submit')).not.toBeDisabled()
  })

  // F6 -- the real fix under test: a per-student PANEL, not a flat, continuous scroll.
  it('F6 -- a saved student collapses to a summary row; only one panel is open at a time', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )

    // Before any student is added, there is no panel at all -- an empty list.
    expect(screen.queryByTestId(/^join-family-panel-/)).toBeNull()

    await user.click(screen.getByTestId('join-add-child'))
    // "+ הוספת תלמיד" opens exactly ONE panel -- the birthdate field (only rendered
    // inside an open panel) proves it, not a continuously-scrolling flat form.
    const panel = currentPanel()
    // Index [0]: a fresh row defaults to "minor" (no birthdate typed yet), so the
    // family block's own "שם מלא" field is already showing alongside the child's own --
    // same default the pre-panel flat list used ("a fresh row is a minor until
    // answered otherwise").
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'דנה')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2000-01-01')

    // Save → back to the list: the panel closes, the row collapses to a summary.
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    expect(screen.queryByTestId(/^join-family-panel-/)).toBeNull()
    expect(screen.getByText('דנה')).toBeInTheDocument()

    // Add the next -- opens ITS OWN panel; the first stays collapsed (one at a time,
    // never two full forms on screen together the way the old flat list rendered).
    await user.click(screen.getByTestId('join-add-child'))
    expect(screen.getAllByTestId(/^join-family-panel-/)).toHaveLength(1)
    expect(screen.getAllByLabelText(t('he', 'people.join.birthdate'))).toHaveLength(1)
  })

  it('an edit action reopens a saved student’s panel', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    let panel = currentPanel()
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'דנה')
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    await user.click(screen.getByTestId(/^join-family-edit-/))
    panel = currentPanel()
    expect(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]).toHaveValue('דנה')
  })

  // Decision 9, confirmed already correct -- must still work after the panel rewrite.
  it('"I train too" adds a self row with no name/birthdate fields, and no parent/pickup cards', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )
    await user.click(screen.getByTestId('join-add-self'))
    const panel = currentPanel()
    expect(within(panel).queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    expect(within(panel).queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
    // only one signer -- the button disappears once a self row exists
    expect(screen.queryByTestId('join-add-self')).toBeNull()
  })

  it('submits a valid payload with one self row, price_plan_id null when no plan is offered', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
        token="tok-1"
      />,
    )
    await fillSigner(user)
    await user.click(screen.getByTestId('join-add-self'))
    const panel = currentPanel()
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        children: [
          expect.objectContaining({
            self_student: true,
            group_ids: ['g1'],
            price_plan_id: null,
            other_parent: null,
            pickup_contacts: [],
          }),
        ],
      }),
      [],
    )
  })

  // Decision 12 / F8 -- the explicit "18 or older?" toggle is gone; age is derived from
  // the birthdate the parent already typed, and that alone decides whether the
  // second-parent/pickup section renders.
  it('decision 12/F8 -- no 18+ toggle exists; a birthdate under 18 shows the family block, one over does not', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    const panel = currentPanel()

    // No 18+ question anywhere on the panel.
    expect(within(panel).queryByText(t('he', 'people.join.age18Question'))).toBeNull()
    expect(within(panel).queryByRole('radio')).toBeNull()

    // A birthdate comfortably under 18 -- the family block appears.
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-01-01')
    expect(within(panel).getByText(t('he', 'people.join.pickupTitle'))).toBeInTheDocument()

    // Replaced with a birthdate comfortably over 18 -- the family block disappears.
    const birthdateField = within(panel).getByLabelText(t('he', 'people.join.birthdate'))
    await user.clear(birthdateField)
    await user.type(birthdateField, '1990-01-01')
    expect(within(panel).queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
  })

  it('decision 12 -- the derived flag, not a toggle, is what the payload reflects', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
        token="tok-1"
      />,
    )
    await fillSigner(user)
    await user.click(screen.getByTestId('join-add-child'))
    const panel = currentPanel()
    // Birthdate FIRST: comfortably over 18, so the family block never renders at all --
    // "שם מלא"/"ת.ז." below resolve to the child's own field with no ambiguity.
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '1990-01-01')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.fullName')), 'עידו בוגר')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.nationalId')), '100000009')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'יב')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        children: [
          expect.objectContaining({
            first_name: 'עידו',
            other_parent: null,
            pickup_contacts: [],
          }),
        ],
      }),
      [],
    )
  })

  // F7 -- second parent/pickup are per student now, with a "same as previous" default.
  it('F7 -- "same as previous" is offered and defaults on for a second minor, off for the first', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )

    await user.click(screen.getByTestId('join-add-child'))
    let panel = currentPanel()
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-01-01')
    // The very first minor has nobody earlier to copy from -- no checkbox.
    expect(within(panel).queryByTestId(/^join-family-same-as-previous-/)).toBeNull()
    const firstOtherName = within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[1]!
    await user.type(firstOtherName, 'דוד כהן')
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    await user.click(screen.getByTestId('join-add-child'))
    panel = currentPanel()
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2017-06-01')
    const sameAsPrevious = within(panel).getByTestId(/^join-family-same-as-previous-/)
    expect(sameAsPrevious).toBeChecked()
    // Ticked by default -- the second parent's fields are not editable text inputs, but
    // a resolved summary showing the FIRST minor's own answer.
    expect(within(panel).getByText(/דוד כהן/)).toBeInTheDocument()
  })

  it('F7 -- unticking "same as previous" lets a second student diverge, and two students can carry DIFFERENT other_parent data', async () => {
    stubPricePlans()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
        token="tok-1"
      />,
    )
    await fillSigner(user)

    // First minor.
    await user.click(screen.getByTestId('join-add-child'))
    let panel = currentPanel()
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'דנה')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-01-01')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000009',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[1]!, 'דוד כהן')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    // Second minor -- untick "same as previous" and type a genuinely different name.
    await user.click(screen.getByTestId('join-add-child'))
    panel = currentPanel()
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'יוסי')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2017-06-01')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000058',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ב')
    await user.click(within(panel).getByTestId(/^join-family-same-as-previous-/))
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[1]!, 'שרה לוי')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    await user.click(screen.getByTestId('join-submit'))

    expect(onSubmit).toHaveBeenCalled()
    const payload = onSubmit.mock.calls[0]![0]
    expect(payload.children).toHaveLength(2)
    expect(payload.children[0].other_parent.first_name).toBe('דוד')
    expect(payload.children[1].other_parent.first_name).toBe('שרה')
    expect(payload.children[0].other_parent.first_name).not.toBe(
      payload.children[1].other_parent.first_name,
    )
  })

  // Decision 14 -- each student's own plan, offered only when it covers the groups
  // just chosen for THAT student.
  it('decision 14 -- the plan picker only offers plans covering the chosen groups, and price_plan_id reaches the payload', async () => {
    stubPricePlans([
      { id: 'small', name: 'פעם בשבוע', monthly_amount_agorot: 15_000, sessions_per_week: 1 },
      { id: 'covers', name: 'פעמיים בשבוע', monthly_amount_agorot: 30_000, sessions_per_week: 2 },
    ])
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
        token="tok-1"
      />,
    )
    await fillSigner(user)
    await user.click(screen.getByTestId('join-add-self'))
    const panel = currentPanel()
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))

    // The covering plan is offered and preselected; the too-small one never appears.
    await waitFor(() => expect(within(panel).getByText('פעמיים בשבוע')).toBeInTheDocument())
    expect(within(panel).queryByText('פעם בשבוע')).toBeNull()
    expect(within(panel).getByRole('radio', { name: 'פעמיים בשבוע' })).toBeChecked()

    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        children: [expect.objectContaining({ self_student: true, price_plan_id: 'covers' })],
      }),
      [],
    )
  })

  it('decision 14 -- no covering plan says so, and leaves price_plan_id null', async () => {
    stubPricePlans([
      { id: 'small', name: 'פעם בשבוע', monthly_amount_agorot: 15_000, sessions_per_week: 1 },
    ])
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        token="tok-1"
      />,
    )
    await user.click(screen.getByTestId('join-add-self'))
    const panel = currentPanel()
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await waitFor(() =>
      expect(within(panel).getByText(t('he', 'people.join.noCoveringPlan'))).toBeInTheDocument(),
    )
    expect(within(panel).queryByRole('radio')).toBeNull()
  })

  // -- wave E, Door D: showSignerDetails / allowTrialFieldSet -----------------------
  describe('Door D props', () => {
    it('showSignerDetails=false hides the whole signer card, and the form is valid with no ת.ז./address typed', async () => {
      stubPricePlans()
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(
        <JoinFamilyStep
          displayName="מיכל כהן"
          email={null}
          groups={groups}
          locale="he"
          onBack={vi.fn()}
          onSubmit={onSubmit}
          showSignerDetails={false}
          token="tok-1"
        />,
      )
      expect(screen.queryByLabelText(t('he', 'people.join.nationalId'))).toBeNull()
      expect(screen.queryByLabelText(t('he', 'people.join.address'))).toBeNull()

      await user.click(screen.getByTestId('join-add-child'))
      const panel = currentPanel()
      // Birthdate FIRST: comfortably over 18, so the family block never renders at all
      // and "שם מלא"/"ת.ז." unambiguously resolve to the child's own field.
      await user.type(
        within(panel).getByLabelText(t('he', 'people.join.birthdate')),
        '1990-01-01',
      )
      await user.type(within(panel).getByLabelText(t('he', 'people.join.fullName')), 'עידו בוגר')
      await user.type(
        within(panel).getByLabelText(t('he', 'people.join.nationalId')),
        '100000009',
      )
      await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'יב')
      await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
      await user.click(within(panel).getByTestId(/^join-family-save-/))
      await user.click(screen.getByTestId('join-submit'))

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('allowTrialFieldSet shows a per-row toggle; choosing "trial" hides ת.ז./grade/plan and routes the row to trialChildren, not the member payload', async () => {
      stubPricePlans()
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(
        <JoinFamilyStep
          allowTrialFieldSet
          displayName="מיכל כהן"
          email={null}
          groups={groups}
          locale="he"
          onBack={vi.fn()}
          onSubmit={onSubmit}
          showSignerDetails={false}
          token="tok-1"
        />,
      )
      await user.click(screen.getByTestId('join-add-child'))
      const panel = currentPanel()
      expect(within(panel).getByText(t('he', 'people.join.memberOrTrial'))).toBeInTheDocument()

      // Member fields visible by default (fieldSet defaults to 'member').
      expect(within(panel).getAllByLabelText(t('he', 'people.join.nationalId')).length).toBeGreaterThan(0)

      await user.click(within(panel).getByRole('radio', { name: t('he', 'people.join.trialChoice') }))

      // Switching to trial drops the member-only fields entirely.
      expect(within(panel).queryByLabelText(t('he', 'people.join.nationalId'))).toBeNull()
      expect(within(panel).queryByLabelText(t('he', 'people.join.grade'))).toBeNull()

      await user.type(within(panel).getByLabelText(t('he', 'people.join.fullName')), 'נועה טרייל')
      await user.type(
        within(panel).getByLabelText(t('he', 'people.join.birthdate')),
        '2018-01-01',
      )
      await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
      await user.click(within(panel).getByTestId(/^join-family-save-/))
      await user.click(screen.getByTestId('join-submit'))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ children: [] }),
        [
          expect.objectContaining({
            first_name: 'נועה',
            last_name: 'טרייל',
            group_id: 'g1',
          }),
        ],
      )
    })
  })
})
