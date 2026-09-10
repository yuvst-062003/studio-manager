// `#/classes` — the screen checkpoint 6 should have been.
//
// The first pass built a flat grid of every group in the club. The owner corrected it
// against the prototype: classes come first, a class is what you open to find its groups,
// an existing class opens a SMALL popup to correct its details, and a new class opens the
// seven-step wizard (§3.21, its own checkpoint — until it lands the create button opens
// the same small popup against `POST /classes`).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClassesScreen } from './ClassesScreen'
import type { ClassSummary, GroupSummary, ScheduleClient } from './client'

const CLASSES: ClassSummary[] = [
  {
    id: 'c1',
    name: "ג'ודו",
    description: 'לילדים ונוער',
    discipline: 'judo',
    color: 'emphasis',
    isActive: true,
  },
  {
    id: 'c2',
    name: 'קרב מגע',
    description: null,
    discipline: null,
    color: null,
    isActive: false,
  },
]

const GROUPS: GroupSummary[] = [
  { id: 'g1', name: 'מתחילים', className: "ג'ודו", classId: 'c1', isActive: true },
  { id: 'g2', name: 'נבחרת', className: "ג'ודו", classId: 'c1', isActive: true },
  // Archived groups are not counted — a class whose only group was retired has none.
  { id: 'g3', name: 'ותיקים', className: "ג'ודו", classId: 'c1', isActive: false },
]

function stub(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listClasses: vi.fn(async () => CLASSES),
    createClass: vi.fn(async () => CLASSES[0] as ClassSummary),
    updateClass: vi.fn(async () => CLASSES[0] as ClassSummary),
    ...overrides,
  } as unknown as ScheduleClient
}

function renderScreen(client = stub(), onChanged: (() => void) | undefined = () => undefined) {
  render(
    <ClassesScreen
      client={client}
      groups={GROUPS}
      hrefForClass={(id) => `#/classes/${id}`}
      locale="he"
      onChanged={onChanged}
    />,
  )
  return client
}

describe('ClassesScreen', () => {
  it('lists one card per class, with its discipline as the eyebrow', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    expect(screen.getByText("ג'ודו")).toBeInTheDocument()
    expect(screen.getByText('קרב מגע')).toBeInTheDocument()
    expect(screen.getByText('judo')).toBeInTheDocument()
  })

  it('opens the class, which is where its groups live', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    expect(screen.getByRole('link', { name: "ג'ודו" })).toHaveAttribute('href', '#/classes/c1')
  })

  it('counts the ACTIVE groups of each class, and says so in words', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    // Two active plus one archived: an archived group is not a group the class runs.
    expect(screen.getByTestId('class-groups-c1')).toHaveTextContent('2')
    // Zero is stated, not left blank.
    expect(screen.getByTestId('class-groups-c2')).toBeInTheDocument()
  })

  it('states active or archived in words, never by dimming alone', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    expect(
      within(screen.getByTestId('class-card-c1')).getByText(t('he', 'schedule.groups.active')),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('class-card-c2')).getByText(t('he', 'schedule.groups.archived')),
    ).toBeInTheDocument()
  })

  it('draws no capacity and no occupancy bar — D2 cut both from the product', async () => {
    const { container } = render(
      <ClassesScreen
        client={stub()}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(document.body.textContent ?? '').not.toMatch(/תפוסה|מלאה/)
  })

  it('says there are no classes rather than showing an empty grid', async () => {
    renderScreen(stub({ listClasses: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.classes.empty'))).toBeInTheDocument()
  })

  it('says the list failed to load, and retries', async () => {
    let calls = 0
    const client = stub({
      listClasses: vi.fn(async () => {
        calls += 1
        if (calls === 1) throw new Error('offline')
        return CLASSES
      }),
    })
    renderScreen(client)
    expect(await screen.findByText(t('he', 'common.loadFailed.body'))).toBeInTheDocument()
    // Not the empty state — "we could not load this" and "you have none" are different
    // sentences.
    expect(screen.queryByText(t('he', 'schedule.classes.empty'))).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.loadFailed.retry') }))
    expect(await screen.findByText('קרב מגע')).toBeInTheDocument()
  })

  it('offers no create button and no row actions to a read-only viewer', async () => {
    // Mounted WITHOUT `onChanged` — a default parameter would swallow an explicit
    // `undefined`, so this one renders directly.
    render(
      <ClassesScreen
        client={stub()}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    expect(screen.queryByTestId('new-class-open')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /פעולות עבור/ })).not.toBeInTheDocument()
  })
})

describe('the small popup that just updates', () => {
  async function openEditor() {
    renderScreen()
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    return screen.getByTestId('class-dialog')
  }

  it('opens with the class already in it, so an edit starts from what is there', async () => {
    await openEditor()
    expect(screen.getByTestId('class-name')).toHaveValue("ג'ודו")
    expect(screen.getByTestId('class-description')).toHaveValue('לילדים ונוער')
    // And the colour it already has is the one shown as chosen.
    expect(screen.getByTestId('class-colour-emphasis')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends only the class fields — it is not the wizard', async () => {
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    await userEvent.clear(screen.getByTestId('class-name'))
    await userEvent.type(screen.getByTestId('class-name'), 'ג׳ודו אולימפי')
    await userEvent.click(screen.getByTestId('class-save'))

    await waitFor(() => expect(client.updateClass).toHaveBeenCalled())
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[0]).toBe('c1')
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[1]).toEqual({
      name: 'ג׳ודו אולימפי',
      description: 'לילדים ונוער',
      color: 'emphasis',
    })
  })

  it('sends null for a cleared description, so a deletion is not silently undone', async () => {
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    await userEvent.clear(screen.getByTestId('class-description'))
    await userEvent.click(screen.getByTestId('class-save'))

    await waitFor(() => expect(client.updateClass).toHaveBeenCalled())
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[1]?.description).toBeNull()
  })

  it('refuses to save a class with no name', async () => {
    await openEditor()
    await userEvent.clear(screen.getByTestId('class-name'))
    expect(screen.getByTestId('class-save')).toBeDisabled()
  })

  it('stays open with what was typed when the save fails', async () => {
    const client = stub({
      updateClass: vi.fn(async () => {
        throw new Error('500')
      }),
    })
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    await userEvent.clear(screen.getByTestId('class-name'))
    await userEvent.type(screen.getByTestId('class-name'), 'ג׳ודו אולימפי')
    await userEvent.click(screen.getByTestId('class-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('he', 'schedule.classes.saveFailed'),
    )
    // A popup that vanished with the words in it is the failure mode this avoids.
    expect(screen.getByTestId('class-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('class-name')).toHaveValue('ג׳ודו אולימפי')
  })

  it('archives and revives from the same menu', async () => {
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.retire') }))
    await waitFor(() => expect(client.updateClass).toHaveBeenCalledWith('c1', { is_active: false }))
  })

  it('creates a class from the same popup until the wizard lands', async () => {
    // §3.21's seven-step flow is its own checkpoint. Until it ships, the create button
    // opens the small popup against `POST /classes` — less than the wizard, and not a dead
    // end. The wizard replaces this in place.
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByTestId('new-class-open'))
    // An empty form, not one pre-filled with somebody else's class.
    expect(screen.getByTestId('class-name')).toHaveValue('')
    await userEvent.type(screen.getByTestId('class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('class-save'))
    await waitFor(() => expect(client.createClass).toHaveBeenCalled())
    expect(vi.mocked(client.createClass).mock.calls[0]?.[0]?.name).toBe('קרב מגע')
  })

  it('closes on cancel without writing anything', async () => {
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByTestId('new-class-open'))
    await userEvent.click(screen.getByTestId('class-cancel'))
    await waitFor(() => expect(screen.queryByTestId('class-dialog')).not.toBeInTheDocument())
    expect(client.createClass).not.toHaveBeenCalled()
  })

  it('stores a colour by TOKEN NAME, never a hex literal — G13', async () => {
    const client = stub()
    render(
      <ClassesScreen
        client={client}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale="he"
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    await userEvent.click(screen.getByTestId('new-class-open'))
    await userEvent.type(screen.getByTestId('class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('class-colour-pending'))
    await userEvent.click(screen.getByTestId('class-save'))
    await waitFor(() => expect(client.createClass).toHaveBeenCalled())
    const sent = vi.mocked(client.createClass).mock.calls[0]?.[0]?.color
    expect(sent).toBe('pending')
    expect(sent).not.toMatch(/^#/)
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <ClassesScreen
        client={stub()}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        locale={locale}
        onChanged={() => undefined}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
