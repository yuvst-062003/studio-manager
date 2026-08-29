// Artboard 7b — the three panels the form did not have: מי מוזמן, פרטים להורים and
// תצוגה מקדימה.
//
// **The audience one is a regression test, not a feature test.** `EventForm` took a
// `targets` prop and its only mount in `App.tsx` passed `[]`. `EventPublishService.
// resolve_targets` returns an empty list when an event has no target rows, so publishing
// created zero registrations — and a publish that reached nobody returns 200 and looks
// exactly like one that worked. The first test below is the one that would have caught it.
//
// **The preview is asserted through the region, never through the page.** The type name,
// the fee sentence and the consent sentence each legitimately appear twice — once as the
// manager's control and once as the parent's view of it — and a bare `getByText` would
// either collide or silently assert the wrong one.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventForm } from './EventForm'
import { describeTargets, reachesNobody, targetKey } from './EventTargetPicker'
import { wallDate, wallTime } from './EventPreviewCard'
import type { DashboardEventsClient } from './client'

const CLASSES = [
  {
    id: 'c1',
    name: 'ג׳ודו ילדים',
    description: null,
    discipline: null,
    color: null,
    is_active: true,
  },
]
const GROUPS = [
  {
    id: 'g1',
    class_id: 'c1',
    name: 'מתחילים',
    description: null,
    age_min: null,
    age_max: null,
    is_active: true,
  },
  {
    id: 'g2',
    class_id: 'c1',
    name: 'נבחרת',
    description: null,
    age_min: null,
    age_max: null,
    is_active: true,
  },
]
const STUDENTS = [{ id: 's1', first_name: 'יוסי', last_name: 'כהן' }]

function makeClient(over: Partial<DashboardEventsClient> = {}): DashboardEventsClient {
  return {
    create: vi.fn().mockResolvedValue({ id: 'e1' }),
    publish: vi.fn().mockResolvedValue({ event: { id: 'e1' }, registrations_created: 3 }),
    classes: vi.fn().mockResolvedValue({ items: CLASSES }),
    groups: vi.fn().mockResolvedValue({ items: GROUPS }),
    searchStudents: vi.fn().mockResolvedValue({ items: STUDENTS }),
    ...over,
  } as unknown as DashboardEventsClient
}

function renderForm(client: DashboardEventsClient) {
  render(<EventForm client={client} locale="he" onSaved={vi.fn()} />)
}

async function fillTheMinimum() {
  await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'אימון חוף')
  await userEvent.type(screen.getByLabelText(t('he', 'events.form.startsAt')), '2026-09-19T16:30')
}

/** The picker's own audience switch, named apart from the location one — they were both
 *  called כל המועדון until `form.locationClub` landed. */
const chooseAudience = (label: string) =>
  userEvent.click(screen.getByRole('radio', { name: t('he', label) }))

/** Narrow the audience and wait for the club's own lists to arrive. The two are one step in
 *  every test that ticks a box: the lists are only rendered once the mode is `chosen`. */
async function narrow() {
  await chooseAudience('events.target.chosen')
  await screen.findByRole('checkbox', { name: 'נבחרת' })
}

const previewRegion = () => screen.getByRole('region', { name: t('he', 'events.preview.title') })

describe('7b — מי מוזמן', () => {
  it('sends a studio target by default, where it used to send nothing at all', async () => {
    // The regression. `targets: []` publishes to a roster of zero and returns 200.
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [{ target_type: 'studio', target_id: null }] }),
    )
  })

  it('sends the groups a manager ticked, composed with a class', async () => {
    // §5.8's normal case: "both beginner groups plus the competition class", not one field.
    const client = makeClient()
    renderForm(client)
    await narrow()
    await userEvent.click(screen.getByRole('checkbox', { name: 'מתחילים' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'נבחרת' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'ג׳ודו ילדים' }))
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))

    // `mock.calls[0]` is `EventCreateIn[] | undefined` under noUncheckedIndexedAccess; the
    // assertion above this line is what makes the index safe, so say so rather than `!`.
    expect(client.create).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(client.create).mock.calls[0]?.[0]
    expect(sent?.targets).toEqual([
      { target_type: 'group', target_id: 'g1', display_name: 'מתחילים' },
      { target_type: 'group', target_id: 'g2', display_name: 'נבחרת' },
      { target_type: 'class', target_id: 'c1', display_name: 'ג׳ודו ילדים' },
    ])
  })

  it('adds a student found by name, and lets the manager take them off again', async () => {
    const client = makeClient()
    renderForm(client)
    await narrow()
    await userEvent.type(screen.getByLabelText(t('he', 'events.target.studentSearch')), 'יוסי')

    await userEvent.click(await screen.findByRole('button', { name: 'יוסי כהן' }))
    expect(screen.getByText(t('he', 'events.target.chosenStudents'))).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: `${t('he', 'events.target.remove')} יוסי כהן` }),
    )
    expect(screen.queryByText(t('he', 'events.target.chosenStudents'))).toBeNull()
  })

  it('does not search on a single letter', async () => {
    // One character of a Hebrew given name matches most of the club, and answering it is a
    // table scan nobody asked for.
    const client = makeClient()
    renderForm(client)
    await narrow()
    await userEvent.type(screen.getByLabelText(t('he', 'events.target.studentSearch')), 'י')
    expect(client.searchStudents).not.toHaveBeenCalled()
  })

  it('refuses to PUBLISH to nobody, where saving a draft is fine', async () => {
    // `publish` materialises the roster once and refuses a second publish, so an event
    // published to nobody can never be invited to anybody — and it returns 200.
    const client = makeClient()
    renderForm(client)
    await narrow()
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.publish') }))
    expect(client.create).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(t('he', 'events.target.required'))
  })

  it('warns when the selection reaches nobody, without blocking the draft', async () => {
    // A half-built draft is ordinary. PUBLISHING one that reaches nobody is the thing
    // nothing else on the screen would mention.
    const client = makeClient()
    renderForm(client)
    await narrow()
    expect(screen.getByText(t('he', 'events.target.required'))).toBeInTheDocument()

    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ targets: [] }))
  })

  it('replaces a narrower selection when the manager goes back to the whole club', async () => {
    // A studio target already sweeps every child; leaving the group rows beside it would
    // show a selection that no longer means anything.
    const client = makeClient()
    renderForm(client)
    await narrow()
    await userEvent.click(screen.getByRole('checkbox', { name: 'נבחרת' }))
    await chooseAudience('events.target.everyone')
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [{ target_type: 'studio', target_id: null }] }),
    )
  })

  it('says that belt and age filters do not exist, rather than drawing them', async () => {
    // The canvas has לפי חגורה and לפי גיל chips. `event_target.target_type` is a CHECK with
    // four members and a lane never runs a migration.
    renderForm(makeClient())
    expect(
      await screen.findByText(t('he', 'events.target.byBeltOrAgeUnsupported')),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /חגורה/ })).toBeNull()
  })

  it('offers a retry when the audiences fail to load, not an empty picker', async () => {
    // An empty list and a failed fetch look identical, and one of them tells a manager
    // their club has no groups.
    const client = makeClient({ groups: vi.fn().mockRejectedValue(new Error('500')) })
    renderForm(client)
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
  })
})

describe('7b — פרטים להורים', () => {
  it('sends what the manager wrote for parents as the description', async () => {
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.type(
      screen.getByLabelText(t('he', 'events.parentDetails.field')),
      'בגד ים, מגבת, בקבוק מים',
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'בגד ים, מגבת, בקבוק מים' }),
    )
  })

  it('says the text is what a parent will read', async () => {
    renderForm(makeClient())
    expect(screen.getByText(t('he', 'events.parentDetails.hint'))).toBeInTheDocument()
  })
})

describe('7b — תצוגה מקדימה', () => {
  it('shows the title, the time range and the parent details as typed', async () => {
    renderForm(makeClient())
    await fillTheMinimum()
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.endsAt')), '2026-09-19T18:30')
    await userEvent.type(
      screen.getByLabelText(t('he', 'events.parentDetails.field')),
      'בגד ים ומגבת',
    )

    const preview = within(previewRegion())
    expect(preview.getByRole('heading', { name: 'אימון חוף' })).toBeInTheDocument()
    expect(preview.getByText('19.09.2026', { exact: false })).toBeInTheDocument()
    // One LTR island, not two sibling times: a range is where this product ships bidi bugs.
    expect(preview.getByText('16:30–18:30')).toBeInTheDocument()
    expect(preview.getByText('בגד ים ומגבת')).toBeInTheDocument()
  })

  it('shows the fee the parent will be charged, from shekels the manager typed', async () => {
    renderForm(makeClient())
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.fee.label') }))
    await userEvent.type(screen.getByLabelText(t('he', 'events.fee.label')), '45')
    const preview = within(previewRegion())
    expect(preview.getByText('45₪')).toBeInTheDocument()
    expect(preview.getByText(t('he', 'events.fee.chargeOnConfirm'))).toBeInTheDocument()
  })

  it('shows nothing for a half-typed price instead of throwing', async () => {
    renderForm(makeClient())
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.fee.label') }))
    await userEvent.type(screen.getByLabelText(t('he', 'events.fee.label')), '.')
    const preview = within(previewRegion())
    expect(preview.queryByText(t('he', 'events.fee.chargeOnConfirm'))).toBeNull()
  })

  it("previews the consent gate on the parent's confirm button", async () => {
    // §5.8 — the RSVP does not count as confirmed until the consent is signed, so the
    // button is disabled here for the reason it will be disabled there.
    renderForm(makeClient())
    const preview = within(previewRegion())
    expect(preview.getByRole('button', { name: t('he', 'events.rsvp.yes') })).toBeDisabled()
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.consent.required') }))
    expect(preview.getByText(t('he', 'events.consent.blocksConfirmation'))).toBeInTheDocument()
  })

  it('names the audience in the preview, and follows the picker', async () => {
    renderForm(makeClient())
    expect(
      within(previewRegion()).getByText(new RegExp(t('he', 'events.target.everyone'))),
    ).toBeInTheDocument()

    await narrow()
    await userEvent.click(screen.getByRole('checkbox', { name: 'נבחרת' }))
    expect(within(previewRegion()).getByText(/1 /)).toBeInTheDocument()
  })
})

describe('the pure helpers', () => {
  it('keys a studio target apart from a class with no id', () => {
    expect(targetKey({ target_type: 'studio', target_id: null })).toBe('studio:')
    expect(targetKey({ target_type: 'class', target_id: 'c1' })).toBe('class:c1')
  })

  it('treats only an empty list as reaching nobody', () => {
    expect(reachesNobody([])).toBe(true)
    expect(reachesNobody([{ target_type: 'studio', target_id: null }])).toBe(false)
  })

  it('says the whole club even when narrower rows sit beside it', () => {
    // "The whole club and two groups" is still the whole club.
    expect(
      describeTargets(
        [
          { target_type: 'group', target_id: 'g1' },
          { target_type: 'studio', target_id: null },
        ],
        'he',
      ),
    ).toBe(t('he', 'events.target.everyone'))
  })

  it('counts audiences and never children', () => {
    // The roster is resolved at publish against enrolments as they stand then. A headcount
    // computed here would be a guess wearing a number's clothes.
    const said = describeTargets(
      [
        { target_type: 'class', target_id: 'c1' },
        { target_type: 'group', target_id: 'g1' },
        { target_type: 'student', target_id: 's1' },
      ],
      'he',
    )
    expect(said).toBe(
      `1 ${t('he', 'events.target.classes')} · 1 ${t('he', 'events.target.groups')} · 1 ${t('he', 'events.target.chosenStudents')}`,
    )
  })

  it('reads a datetime-local literally, never through the browser timezone', () => {
    // `new Date('2026-09-19T16:30')` is parsed in the browser's zone. A preview an hour off
    // for anyone not sitting in Israel is a preview of the wrong event.
    expect(wallDate('2026-09-19T16:30')).toBe('19.09.2026')
    expect(wallTime('2026-09-19T16:30')).toBe('16:30')
    expect(wallTime('2026-09-19T16:30:00')).toBe('16:30')
    expect(wallDate('')).toBeNull()
    expect(wallTime('')).toBeNull()
  })
})
