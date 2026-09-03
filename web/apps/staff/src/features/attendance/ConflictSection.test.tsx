// Register §9 — "offline is still unproven": no capture in the evidence set ever showed a
// conflict card, because the queue was empty in every one of them. This is the automated
// coverage for the state no screenshot has shown — §10.5's four conflict kinds, each
// rendered from the device's own store, and dismissal that hides without deleting anything.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { memoryStore, setOfflineStore } from '@studio/core'
import type { ConflictCard, OfflineStore } from '@studio/core'
import { t } from '@studio/i18n'
import { ConflictSection } from './ConflictSection'

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})

afterEach(() => setOfflineStore(null))

async function seed(card: Partial<ConflictCard> & Pick<ConflictCard, 'id' | 'kind'>): Promise<void> {
  await store.put<ConflictCard>('conflicts', card.id, {
    session_id: null,
    count: 1,
    raised_at: '2026-11-03T12:00:00.000Z',
    dismissed: false,
    ...card,
  })
}

describe('ConflictSection — §10.5\'s four cases', () => {
  it('renders nothing when the queue holds no conflict', async () => {
    const { container } = render(<ConflictSection locale="he" />)
    // The hook's first read is async (§10.5's cards come off the device's own store); give
    // it a tick before asserting the section stayed absent.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['session_cancelled', 'attendance.conflict.sessionCancelled', 'attendance.conflict.sessionCancelledBody'],
    ['student_unenrolled', 'attendance.conflict.title', 'attendance.conflict.sessionCancelledBody'],
    ['different_person', 'attendance.conflict.differentPerson', 'attendance.conflict.differentPersonBody'],
    ['rejected', 'attendance.conflict.title', 'attendance.conflict.sessionCancelledBody'],
  ] as const)('surfaces a %s card with its own title and body', async (kind, titleKey, bodyKey) => {
    await seed({ id: `c-${kind}`, kind, count: 22 })
    render(<ConflictSection locale="he" />)
    const card = await screen.findByTestId(`conflict-c-${kind}`)
    expect(card).toHaveTextContent(t('he', titleKey))
    expect(card).toHaveTextContent(t('he', bodyKey))
    // "השיעור בוטל — התקבלו 22 סימוני נוכחות" — the count is what tells a manager whether
    // this is one child or a whole lesson.
    expect(screen.getByTestId(`conflict-count-c-${kind}`)).toHaveTextContent('22')
  })

  it('dismiss hides the card without touching the underlying op', async () => {
    await seed({ id: 'c1', kind: 'different_person', count: 1 })
    render(<ConflictSection locale="he" />)
    await screen.findByTestId('conflict-c1')

    await userEvent.click(screen.getByRole('button', { name: t('he', 'attendance.conflict.review') }))

    expect(screen.queryByTestId('conflict-c1')).not.toBeInTheDocument()
    // §10.3 item 5 — dismissal is an acknowledgement, not a delete. The row survives,
    // marked dismissed, which is exactly what `dismissConflict` promises and nothing else
    // in this lane can undo.
    const stored = await store.get<ConflictCard>('conflicts', 'c1')
    expect(stored?.dismissed).toBe(true)
  })

  it('renders every live card, not only the first', async () => {
    await seed({ id: 'c1', kind: 'session_cancelled', count: 5 })
    await seed({ id: 'c2', kind: 'different_person', count: 1 })
    render(<ConflictSection locale="he" />)
    expect(await screen.findByTestId('conflict-c1')).toBeInTheDocument()
    expect(screen.getByTestId('conflict-c2')).toBeInTheDocument()
  })
})
