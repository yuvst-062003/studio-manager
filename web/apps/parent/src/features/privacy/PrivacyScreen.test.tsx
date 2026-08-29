// §11.3 and §11.4 on the parent's own screen — and above all, the `failed` status.
//
// `app/workers/privacy.py`'s two work functions are named seams that raise on purpose
// (HB-privacy-worker-unbuilt): `assemble_export_bundle` collects nothing and
// `purge_subject_data` deletes nothing. So a request made today ends `failed`, and this
// screen is the only place a guardian or the person answering them can see that.
//
// `deletion_request` carries no constraint that could catch a false success — "the data is
// gone" is not a column — so a screen that softened `failed` into "processing" would be
// telling a guardian their erasure was under way when nothing had been deleted. That is
// the exact failure this lane exists to prevent, and it is what the two `failed` tests
// below hold.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { PrivacyScreen } from './PrivacyScreen'
import type { PrivacyClient, PrivacyRequest, PrivacyRequests } from './privacyClient'

/** See ConsentGate.test.tsx — a `Mock` per method, and still assignable to the real type. */
type MockedPrivacyClient = { [K in keyof PrivacyClient]: Mock } & PrivacyClient

const ME = 'person-1'

function request(over: Partial<PrivacyRequest>): PrivacyRequest {
  return {
    id: 'req-1',
    kind: 'export',
    subject_person_id: ME,
    requested_by_person_id: ME,
    status: 'pending',
    error: null,
    reason: null,
    has_bundle: false,
    created_at: '2026-08-29T06:00:00Z',
    completed_at: null,
    ...over,
  }
}

function client(
  requests: PrivacyRequests,
  over: Partial<Record<keyof PrivacyClient, Mock>> = {},
): MockedPrivacyClient {
  return {
    consents: vi.fn(async () => ({
      policy_version: 0,
      policy_version_label: '0.1-draft',
      policy_is_draft: true,
      required: ['terms', 'privacy'],
      outstanding: [],
      records: [
        {
          consent_type: 'terms',
          version: 0,
          granted: true,
          granted_at: '2026-08-29T06:00:00Z',
          revoked_at: null,
        },
      ],
    })),
    grant: vi.fn(async () => null),
    requests: vi.fn(async () => requests),
    requestExport: vi.fn(async () => ({})),
    requestDeletion: vi.fn(async () => ({})),
    ...over,
  } as unknown as MockedPrivacyClient
}

const EMPTY: PrivacyRequests = { exports: [], deletions: [] }

describe('the privacy screen', () => {
  it('renders §11.3 and §11.4 with nothing requested yet', async () => {
    render(<PrivacyScreen client={client(EMPTY)} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())
    expect(screen.getByTestId('export-request')).toBeInTheDocument()
    expect(screen.getByTestId('deletion-request')).toBeInTheDocument()
  })

  it('reports a FAILED export as failed, with the reason the worker recorded', async () => {
    render(
      <PrivacyScreen
        client={client({
          exports: [
            request({
              status: 'failed',
              error: 'export bundle assembly is not implemented -- no data was collected',
            }),
          ],
          deletions: [],
        })}
        locale="he"
        personId={ME}
      />,
    )
    const row = await screen.findByTestId('privacy-request-req-1')
    expect(row).toHaveTextContent('ההכנה נכשלה')
    // The reason is on screen for the person who has to answer the guardian.
    expect(row).toHaveTextContent('not implemented')
    // Never softened into "preparing". The request is not running.
    expect(row).not.toHaveTextContent('בהכנה')
  })

  it('never renders a failed ERASURE as if it were under way', async () => {
    render(
      <PrivacyScreen
        client={client({
          exports: [],
          deletions: [
            request({
              id: 'del-1',
              kind: 'deletion',
              status: 'failed',
              reason: 'gdpr_request',
              error: 'subject data purge is not implemented -- no data was deleted',
            }),
          ],
        })}
        locale="he"
        personId={ME}
      />,
    )
    const row = await screen.findByTestId('privacy-request-del-1')
    expect(row).toHaveTextContent('המחיקה נכשלה')
    // The sentence that stops a guardian believing their data is gone.
    expect(row).toHaveTextContent('לא נמחק דבר')
    expect(row).not.toHaveTextContent('הושלם')
  })

  it('offers no download, because there is no route that could serve one', async () => {
    // A guard against the obvious next edit. §11.3's bundle lives in object storage and
    // `data_export_request.object_key` is the pointer to it — but no endpoint serves those
    // bytes, and `assemble_export_bundle` raises, so `has_bundle` cannot be true in a
    // running system today. A download button here would be a button to nothing, which is
    // the same class of lie as a `completed` erasure that deleted nothing.
    //
    // When the assembler and its download route land, this test is the place that says so.
    render(
      <PrivacyScreen
        client={client({
          exports: [request({ status: 'completed', has_bundle: true })],
          deletions: [],
        })}
        locale="he"
        personId={ME}
      />,
    )
    const row = await screen.findByTestId('privacy-request-req-1')
    expect(row).toHaveTextContent('מוכן להורדה')
    expect(screen.queryByTestId('export-download-req-1')).toBeNull()
  })

  it('asks the export in one tap', async () => {
    const c = client(EMPTY)
    render(<PrivacyScreen client={c} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('export-request'))
    await waitFor(() => expect(c.requestExport).toHaveBeenCalledWith(ME))
  })

  it('will not request an erasure without a confirm', async () => {
    const c = client(EMPTY)
    render(<PrivacyScreen client={c} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('deletion-request'))
    // The first tap opens the confirm and sends nothing. §11.4 is destructive and
    // irreversible, and the copy says both before the second tap exists.
    expect(c.requestDeletion).not.toHaveBeenCalled()
    const confirm = screen.getByTestId('deletion-confirm')
    expect(screen.getByTestId('deletion-confirm-body')).toHaveTextContent('אינה הפיכה')

    await userEvent.click(confirm)
    await waitFor(() => expect(c.requestDeletion).toHaveBeenCalledWith(ME, 'gdpr_request'))
  })

  it('lets the confirm be backed out of', async () => {
    const c = client(EMPTY)
    render(<PrivacyScreen client={c} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('deletion-request'))
    await userEvent.click(screen.getByTestId('deletion-cancel'))
    expect(screen.queryByTestId('deletion-confirm')).toBeNull()
    expect(c.requestDeletion).not.toHaveBeenCalled()
  })

  it('records a photo consent as a decision, and does not gate on it', async () => {
    // §6.1 step 7 is skippable and "Skipping = NO consent recorded (the safe default)", so
    // it is asked HERE — on a screen with no wall behind it — and never inside the gate a
    // parent is trying to get past.
    const c = client(EMPTY)
    render(<PrivacyScreen client={c} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('photo-allow'))
    await waitFor(() => expect(c.grant).toHaveBeenCalledWith(0, { photo_video: true }))
  })

  it('keeps the draft notice on screen while the long text stays collapsed', async () => {
    // The wording has had no legal review, and that is a fact about what this family
    // agreed to — so it is visible whether or not they expand the document.
    render(<PrivacyScreen client={client(EMPTY)} locale="he" personId={ME} />)
    await waitFor(() => expect(screen.getByTestId('policy-draft-notice')).toBeInTheDocument())
    expect(screen.queryByTestId('policy-document')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'הצגת הנוסח המלא' }))
    expect(screen.getByTestId('policy-document')).toBeInTheDocument()
  })
})
