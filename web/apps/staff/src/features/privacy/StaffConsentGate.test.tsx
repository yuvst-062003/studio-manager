// §6.1 step 5 in the staff app. The gate that was missing entirely: a coach who reads a
// child's health flag, a family's phone number and a register of minors had accepted
// neither the terms nor the privacy policy, while the parent app has blocked on exactly
// these two since M4.
//
// The last test is the one that matters most and it is not about this component at all —
// HB-w6-health-gate-unmounted is in this repo's history because a gate can be perfect and
// still gate nothing if the shell never mounts it.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { StaffConsentGate } from './StaffConsentGate'
import { readConsentState } from './staffConsentClient'
import type { ConsentState, StaffConsentClient } from './staffConsentClient'

const SIGNED: ConsentState = {
  policy_version: 2,
  policy_version_label: '2',
  policy_is_draft: false,
  required: ['terms', 'privacy'],
  outstanding: [],
  records: [],
}
const OUTSTANDING: ConsentState = { ...SIGNED, outstanding: ['terms', 'privacy'] }

function stub(overrides: Partial<StaffConsentClient> = {}): StaffConsentClient {
  return {
    consents: vi.fn<StaffConsentClient['consents']>(async () => OUTSTANDING),
    grant: vi.fn<StaffConsentClient['grant']>(async () => SIGNED),
    ...overrides,
  }
}

function renderGate(client: StaffConsentClient) {
  render(
    <StaffConsentGate client={client} locale="he">
      <p data-testid="the-app" />
    </StaffConsentGate>,
  )
}

describe('the staff consent gate', () => {
  it('hides the app entirely until the two consents are on record', async () => {
    renderGate(stub())
    expect(await screen.findByTestId('staff-consent-gate')).toBeInTheDocument()
    // Not merely covered — not rendered. The tab bar that reaches every other screen is
    // inside these children, and a bar drawn beside the gate is a bar a fast finger uses.
    expect(screen.queryByTestId('the-app')).not.toBeInTheDocument()
  })

  it('lets a coach through once both are accepted', async () => {
    const client = stub()
    renderGate(client)
    await screen.findByTestId('staff-consent-gate')

    await userEvent.click(screen.getByTestId('staff-consent-check-terms'))
    await userEvent.click(screen.getByTestId('staff-consent-check-privacy'))
    await userEvent.click(screen.getByTestId('staff-consent-submit'))

    // The version the SCREEN rendered — the server answers 409 if the wording has moved on,
    // which is what stops a tab left open across a policy change recording agreement to
    // text nobody saw.
    expect(client.grant).toHaveBeenCalledWith(2, { terms: true, privacy: true })
    expect(await screen.findByTestId('the-app')).toBeInTheDocument()
  })

  it('cannot be submitted with only one box ticked', async () => {
    renderGate(stub())
    await screen.findByTestId('staff-consent-gate')
    await userEvent.click(screen.getByTestId('staff-consent-check-terms'))
    expect(screen.getByTestId('staff-consent-submit')).toBeDisabled()
  })

  it('renders nothing at all while the answer is in flight', () => {
    const pending = vi.fn<StaffConsentClient['consents']>(() => new Promise(() => {}))
    const { container } = render(
      <StaffConsentGate client={stub({ consents: pending })} locale="he">
        <p data-testid="the-app" />
      </StaffConsentGate>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('stands aside when the read fails, rather than locking a coach out of a cached app', async () => {
    // A coach opening this in a basement with no signal must not be shut out by a gate that
    // could not reach the server. First sign-in cannot happen offline anyway, so the gate is
    // never skipped on the one launch it exists for.
    renderGate(
      stub({
        consents: vi.fn<StaffConsentClient['consents']>(async () => {
          throw new Error('offline')
        }),
      }),
    )
    expect(await screen.findByTestId('the-app')).toBeInTheDocument()
  })

  it('stays up when the WRITE fails, because an unrecorded acceptance is not one', async () => {
    const client = stub({
      grant: vi.fn<StaffConsentClient['grant']>(async () => {
        throw new Error('500')
      }),
    })
    renderGate(client)
    await screen.findByTestId('staff-consent-gate')

    await userEvent.click(screen.getByTestId('staff-consent-check-terms'))
    await userEvent.click(screen.getByTestId('staff-consent-check-privacy'))
    await userEvent.click(screen.getByTestId('staff-consent-submit'))

    expect(await screen.findByTestId('staff-consent-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('the-app')).not.toBeInTheDocument()
  })

  it('says why a COACH is being asked, which is not what a parent is asked', async () => {
    renderGate(stub())
    await screen.findByTestId('staff-consent-gate')
    expect(screen.getByText(t('he', 'reports.privacy.gate.staffBody'))).toBeInTheDocument()
  })

  it('opens the full text of either document without leaving the gate', async () => {
    renderGate(stub())
    await screen.findByTestId('staff-consent-gate')

    await userEvent.click(screen.getByTestId('staff-consent-read-privacy'))
    expect(await screen.findByTestId('staff-consent-doc')).toBeInTheDocument()
    expect(screen.queryByTestId('the-app')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('staff-consent-doc-back'))
    expect(await screen.findByTestId('staff-consent-gate')).toBeInTheDocument()
  })
})

describe('readConsentState — a body that is not a consent state', () => {
  // The shell's other tests stub `fetch` to answer `{items: []}` for every URL they do not
  // recognise, and a real network can answer anything. `undefined.length` inside a gate is a
  // blank screen where the app used to be.
  it.each([[null], [undefined], ['nope'], [{ items: [] }], [{ outstanding: [] }]])(
    'reads %s as "cannot tell"',
    (body) => {
      expect(readConsentState(body)).toBeNull()
    },
  )

  it('reads a real one', () => {
    expect(readConsentState(SIGNED)).toEqual(SIGNED)
  })
})
