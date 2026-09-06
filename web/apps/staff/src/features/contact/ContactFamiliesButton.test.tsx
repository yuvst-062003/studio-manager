// §4.9's shared contact hand-off. The schedule card is its first caller (C2); the student
// card and the task card reuse it later (C4, C8) — this file tests the component itself,
// independent of any one caller's data source.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ContactFamiliesButton } from './ContactFamiliesButton'
import type { ContactFamily } from './ContactFamiliesButton'

const FAMILIES: ContactFamily[] = [
  { person_id: 'p1', name: 'יעל מזרחי', phone: '050-1112222' },
  { person_id: 'p2', name: 'דנה שטרן', phone: null },
]

function renderButton(resolveFamilies: () => Promise<ContactFamily[]>) {
  return render(
    <ContactFamiliesButton
      locale="he"
      triggerLabel="יצירת קשר עם 2 משפחות"
      title="נבחרת נוער"
      message="תזכורת: האימון היום ב-17:30"
      resolveFamilies={resolveFamilies}
    />,
  )
}

const writeText = vi.fn()

beforeEach(() => {
  Object.assign(globalThis.navigator, { clipboard: { writeText } })
})

afterEach(() => {
  writeText.mockReset()
})

describe('ContactFamiliesButton', () => {
  it('shows the trigger the caller asked for, and nothing else, before it is opened', () => {
    render(
      <ContactFamiliesButton
        locale="he"
        triggerLabel="יצירת קשר עם 2 משפחות"
        title="t"
        message="m"
        resolveFamilies={() => Promise.resolve(FAMILIES)}
      />,
    )
    expect(screen.getByTestId('contact-open')).toHaveTextContent('יצירת קשר עם 2 משפחות')
    expect(screen.queryByTestId('contact-panel')).toBeNull()
  })

  it('resolves the families only once the coach actually opens it', async () => {
    const resolve = vi.fn(() => Promise.resolve(FAMILIES))
    renderButton(resolve)
    expect(resolve).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('contact-open'))
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
  })

  it('shows the pre-written message verbatim and says it is ready, never sent', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    expect(await screen.findByTestId('contact-message')).toHaveTextContent(
      'תזכורת: האימון היום ב-17:30',
    )
    // The hint's own words are "nothing is sent automatically" — a real occurrence of a
    // delivery CLAIM would be a sentence saying the message already went out.
    expect(screen.getByText(t('he', 'comms.contact.readyHint'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'comms.delivery.numbersCopied'))).toBeNull()
  })

  it('names the family with no number rather than hiding it — a sentence, not a dead link', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    // One family of the two has no phone — the `.one` plural form names it in words
    // ("משפחה אחת"), the same rule `schedule.today.sessionCount.one` already sets.
    expect(await screen.findByTestId('contact-missing-phone')).toHaveTextContent(
      t('he', 'comms.contact.missingPhoneCount.one'),
    )
  })

  it('copies only the numbers that exist, and says COPIED — never sent', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    await userEvent.click(await screen.findByTestId('contact-copy'))
    expect(writeText).toHaveBeenCalledWith('050-1112222')
    expect(screen.getByTestId('contact-copied')).toHaveTextContent(
      t('he', 'comms.delivery.numbersCopied'),
    )
  })

  it('the WhatsApp link carries the pre-written message and opens in a new tab, embedding no phone', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    const link = await screen.findByTestId('contact-whatsapp')
    expect(link).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('תזכורת')))
    expect(link).toHaveAttribute('href', expect.not.stringContaining('050'))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('offers WhatsApp even when NO family has a phone — it opens a picker, it does not dial', async () => {
    renderButton(() => Promise.resolve([{ person_id: 'p1', name: 'x', phone: null }]))
    await userEvent.click(screen.getByTestId('contact-open'))
    expect(await screen.findByTestId('contact-whatsapp')).toBeInTheDocument()
    expect(screen.queryByTestId('contact-copy')).toBeNull()
    expect(screen.getByTestId('contact-no-numbers')).toBeInTheDocument()
  })

  it('says loading failed rather than showing an empty, silent panel', async () => {
    renderButton(() => Promise.reject(new Error('network')))
    await userEvent.click(screen.getByTestId('contact-open'))
    expect(await screen.findByTestId('contact-failed')).toBeInTheDocument()
  })

  it('closes on the close button and can be reopened', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    await screen.findByTestId('contact-panel')
    await userEvent.click(screen.getByTestId('contact-close'))
    expect(screen.queryByTestId('contact-panel')).toBeNull()
    await userEvent.click(screen.getByTestId('contact-open'))
    expect(await screen.findByTestId('contact-panel')).toBeInTheDocument()
  })

  it('gives the dialog and every control an accessible name', async () => {
    renderButton(() => Promise.resolve(FAMILIES))
    await userEvent.click(screen.getByTestId('contact-open'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'contact-families-title')
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName()
    }
  })
})
