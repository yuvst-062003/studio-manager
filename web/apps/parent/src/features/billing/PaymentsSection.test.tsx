// §7.9 -- `PaymentsSection.tsx:287` rendered a bare `null` while its first read was in
// flight. This gate wraps the whole app (`App.tsx`), so that blank moment was not a blank
// section, it was a blank screen with nothing on it at all.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentsSection, submitUpayForm } from './PaymentsSection'

const LOCALE = 'he' as const

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

/** Every endpoint `PaymentsSection` reads on mount, answered with an empty-but-valid shape. */
function respond(path: string): Response {
  if (path === '/api/v1/me/charges?status=open') return jsonResponse({ items: [] })
  if (path === '/api/v1/me/payment-promises') return jsonResponse({ items: [] })
  if (path === '/api/v1/me/standing-order') return jsonResponse({ active: false })
  if (path === '/api/v1/me/students') return jsonResponse({ items: [] })
  if (path === '/api/v1/me/standing-order-links') return jsonResponse({ items: [] })
  if (path === '/api/v1/me/prepay-terms') {
    return jsonResponse({
      cash_prepay_months: 0,
      cheque_prepay_months: 0,
      monthly_total_agorot: 0,
    })
  }
  if (path === '/api/v1/me/balance') return jsonResponse({ credit_agorot: 0, debt_agorot: 0 })
  throw new Error(`unexpected fetch: ${path}`)
}

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => respond(path)),
  }
})

beforeEach(async () => {
  // Reset back to the default handler: a test that overrides `mockImplementation` (the
  // pending-promise one below) otherwise leaks its override into whichever test runs next.
  const { apiFetch } = await import('@studio/core')
  vi.mocked(apiFetch).mockImplementation(async (path: string) => respond(path))
})

describe('submitUpayForm', () => {
  afterEach(() => {
    document.body.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('submits a plain top-level navigation when no target is given', () => {
    const submit = vi.fn()
    HTMLFormElement.prototype.submit = submit
    submitUpayForm({ action: 'https://app.upay.co.il/x', fields: { a: '1' } })
    const form = document.body.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.target).toBe('')
    expect(form?.action).toBe('https://app.upay.co.il/x')
    expect(form?.method).toBe('post')
    expect(submit).toHaveBeenCalled()
  })

  it('submits into a named iframe instead of the top window when a target is given', () => {
    HTMLFormElement.prototype.submit = vi.fn()
    submitUpayForm({ action: 'https://app.upay.co.il/x', fields: { a: '1' } }, 'upay-overlay-frame')
    const form = document.body.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.target).toBe('upay-overlay-frame')
  })
})

describe('the payments section gate', () => {
  it('shows a loading state rather than a bare screen while its first read is in flight', async () => {
    const { apiFetch } = await import('@studio/core')
    let releaseCharges: (value: Response) => void = () => {}
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/v1/me/charges?status=open') {
        return new Promise<Response>((resolve) => {
          releaseCharges = resolve
        })
      }
      return respond(path)
    })

    const { container } = render(<PaymentsSection locale={LOCALE} />)
    expect(screen.getByTestId('payments-section-loading')).toBeInTheDocument()
    expect(container).not.toBeEmptyDOMElement()

    releaseCharges(jsonResponse({ items: [] }))
    await waitFor(() => expect(screen.queryByTestId('payments-section-loading')).toBeNull())
  })

  it('renders the payments screen once every read has settled', async () => {
    render(<PaymentsSection locale={LOCALE} />)
    expect(await screen.findByTestId('payments-screen')).toBeInTheDocument()
  })
})
