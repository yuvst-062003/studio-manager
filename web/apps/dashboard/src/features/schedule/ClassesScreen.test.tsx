// `#/classes` — the classes index.
//
// Two owner corrections shaped it. First: classes come before groups, and a class is what
// you open to find its groups. Then, on seeing a small edit popup beside it — *"remove the
// popup, it's irrelevant. If want to edit, then the full wizard, but with the details
// already in it."* So this screen has no editor of its own: both ways in are §3.21's seven
// steps, and what these tests hold is that neither door leads anywhere else.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClassesScreen } from './ClassesScreen'
import type { ClassSummary, GroupSummary, ScheduleClient } from './client'

const CLASSES: ClassSummary[] = [
  {
    id: 'c1',
    name: "ג'ודו",
    description: 'לילדים ונוער',
    discipline: 'judo',
    color: null,
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
    updateClass: vi.fn(async () => CLASSES[0] as ClassSummary),
    ...overrides,
  } as unknown as ScheduleClient
}

function renderScreen(client = stub()) {
  render(
    <ClassesScreen
      client={client}
      groups={GROUPS}
      hrefForClass={(id) => `#/classes/${id}`}
      hrefForWizard={(id) => (id ? `#/classes/${id}/edit` : '#/classes/new')}
      locale="he"
      onChanged={() => undefined}
    />,
  )
  return client
}

async function cardsSettle() {
  await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(2))
}

describe('ClassesScreen', () => {
  it('lists one card per class, with its discipline as the eyebrow', async () => {
    renderScreen()
    await cardsSettle()
    expect(screen.getByText("ג'ודו")).toBeInTheDocument()
    expect(screen.getByText('קרב מגע')).toBeInTheDocument()
    expect(screen.getByText('judo')).toBeInTheDocument()
  })

  it('opens the class, which is where its groups live', async () => {
    renderScreen()
    await cardsSettle()
    expect(screen.getByRole('link', { name: "ג'ודו" })).toHaveAttribute('href', '#/classes/c1')
  })

  it('counts the ACTIVE groups of each class, and says so in words', async () => {
    renderScreen()
    await cardsSettle()
    // Two active plus one archived: an archived group is not a group the class runs.
    expect(screen.getByTestId('class-groups-c1')).toHaveTextContent('2')
    // Zero is stated, not left blank.
    expect(screen.getByTestId('class-groups-c2')).toBeInTheDocument()
  })

  it('states active or archived in words, never by dimming alone', async () => {
    renderScreen()
    await cardsSettle()
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
        hrefForWizard={() => '#/classes/new'}
        locale="he"
      />,
    )
    await cardsSettle()
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(document.body.textContent ?? '').not.toMatch(/תפוסה|מלאה/)
  })

  it('carries no per-class colour anywhere — the owner cut it', async () => {
    // `class.color` is still a column; nothing on this screen reads it, and no badge is
    // tinted by it. A swatch that meant nothing would be worse than no swatch.
    const { container } = render(
      <ClassesScreen
        client={stub({
          listClasses: vi.fn(async () => [{ ...(CLASSES[0] as ClassSummary), color: 'debt' }]),
        })}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        hrefForWizard={() => '#/classes/new'}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(1))
    expect(container.querySelector('[data-colour]')).toBeNull()
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
        hrefForWizard={() => '#/classes/new'}
        locale="he"
      />,
    )
    await cardsSettle()
    expect(screen.queryByTestId('new-class-open')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /פעולות עבור/ })).not.toBeInTheDocument()
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <ClassesScreen
        client={stub()}
        groups={GROUPS}
        hrefForClass={(id) => `#/classes/${id}`}
        hrefForWizard={() => '#/classes/new'}
        locale={locale}
        onChanged={() => undefined}
      />,
    )
    await cardsSettle()
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

describe('both doors are the wizard', () => {
  afterEach(() => {
    globalThis.location.hash = ''
  })

  it('sends "new class" to the wizard with no class behind it', async () => {
    renderScreen()
    await cardsSettle()
    // A link, not a button: the wizard is a route, so it opens in a tab and the back
    // button works.
    expect(screen.getByTestId('new-class-open')).toHaveAttribute('href', '#/classes/new')
  })

  it('sends "edit" to the SAME wizard, opened on that class', async () => {
    renderScreen()
    await cardsSettle()
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    await waitFor(() => expect(globalThis.location.hash).toBe('#/classes/c1/edit'))
  })

  it('has no editor of its own — no popup, no dialog, no form', async () => {
    // The owner's correction, as a standing assertion. If a small editor ever comes back
    // to this screen, this is the test that says it was deliberate.
    renderScreen()
    await cardsSettle()
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.edit') }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('class-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('class-name')).not.toBeInTheDocument()
  })

  it('still archives and revives from the row menu, which is not an edit', async () => {
    // Retiring a class is one field and no flow. Sending it through seven steps would be
    // the opposite mistake to the one the popup made.
    const client = renderScreen()
    await cardsSettle()
    await userEvent.click(screen.getByRole('button', { name: /ג'ודו/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.classes.retire') }))
    await waitFor(() => expect(client.updateClass).toHaveBeenCalledWith('c1', { is_active: false }))
  })
})
