// §5.4b's join-link card, after the permanent-link decision of 2026-08-31.
//
// The behaviour worth pinning is a REMOVAL: while a copyable link is live the card offers
// no "קישור חדש". Regenerating revokes the link already sitting in the club's WhatsApp
// groups, and a permanent link gives nobody a reason to want that — so replacing one is
// two deliberate steps (ביטול, then create) rather than one tap next to the copy button.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { SharingCards } from './SharingCards'

const LINK = 'https://app.example.test/join/tok-1'

function stubStatus(body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/onboarding-link')) {
        return new Response(JSON.stringify(body), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the join-link card', () => {
  it('shows a live permanent link with copy, and offers no regenerate beside it', async () => {
    stubStatus({
      active: true,
      expires_at: null,
      registered_count: 3,
      landing_url: null,
      url: LINK,
    })
    render(<SharingCards locale="he" />)

    expect(await screen.findByTestId('join-link-url')).toHaveTextContent(LINK)
    expect(screen.getByRole('button', { name: t('he', 'people.join.card.copy') })).toBeInTheDocument()
    // The removal, asserted: no way to kill the shared link by reflex.
    expect(screen.queryByTestId('join-link-new')).toBeNull()
    // Revoking is still offered — it is the answer to a leak, and it is deliberate.
    expect(screen.getByTestId('join-link-revoke')).toBeInTheDocument()
    expect(screen.getByTestId('join-link-status')).toHaveTextContent(
      t('he', 'people.join.card.permanent'),
    )
  })

  it('offers a new link when there is none', async () => {
    stubStatus({
      active: false,
      expires_at: null,
      registered_count: 0,
      landing_url: null,
      url: null,
    })
    render(<SharingCards locale="he" />)

    expect(await screen.findByTestId('join-link-new')).toBeInTheDocument()
    expect(screen.queryByTestId('join-link-url')).toBeNull()
    expect(screen.queryByTestId('join-link-revoke')).toBeNull()
  })

  it('explains a pre-2026-08-31 link and offers the new one that replaces it', async () => {
    // Live, but only its hash was ever stored, so it cannot be shown. Creating a new one
    // is the ONLY way to get a copyable link — which is why the button survives here.
    stubStatus({
      active: true,
      expires_at: '2026-09-06T15:01:21Z',
      registered_count: 0,
      landing_url: null,
      url: null,
    })
    render(<SharingCards locale="he" />)

    await waitFor(() =>
      expect(screen.getByText(t('he', 'people.join.card.legacyNote'))).toBeInTheDocument(),
    )
    expect(screen.getByTestId('join-link-new')).toBeInTheDocument()
    expect(screen.queryByTestId('join-link-url')).toBeNull()
  })
})
