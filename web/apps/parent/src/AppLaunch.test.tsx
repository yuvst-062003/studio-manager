import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// The launch, asserted against the SHELL: the cover is provided in `AuthedApp` and read in
// `HomeScreen`, and a test that rendered either alone would pass with the wire between
// them cut. Same reasoning as `AppHealthGate.test.tsx`.

const SIGNED_IN = {
  status: 'signed-in' as const,
  access: { staff: false, parent: true },
  studios: [],
  activeStudioId: 'studio-1',
  devTools: false,
  actingAsPersonId: null,
  actingAsLabel: null,
  activeStudioName: 'מועדון הדגמה',
  reload: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => SIGNED_IN,
    useDisplayMode: () => 'standalone' as const,
  }
})

afterEach(() => vi.unstubAllGlobals())

describe('the launch screen over the shell', () => {
  it('covers the app until the family list arrives, then lifts and the home rises', async () => {
    let releaseStudents: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/me/students')) {
          return new Promise<Response>((resolve) => {
            releaseStudents = resolve
          })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(<App />)
    const launch = await screen.findByTestId('launch-screen')
    expect(launch).toHaveAttribute('data-leaving', 'false')

    releaseStudents(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    const home = await screen.findByTestId('parent-home')
    // The home mounted UNDER the cover, so its blocks are held back until it lifts.
    const blocks = home.querySelectorAll('[data-testid="home-block"]')
    expect(blocks.length).toBeGreaterThan(1)
    expect(blocks[0]).toHaveAttribute('data-entered', 'false')

    await waitFor(() => expect(screen.queryByTestId('launch-screen')).toBeNull(), { timeout: 3000 })
    for (const block of blocks) expect(block).toHaveAttribute('data-entered', 'true')
  })

  it('a signed-out visitor gets the launch too, and it leaves for the sign-in screen', async () => {
    ;(SIGNED_IN as { status: string }).status = 'anonymous'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    try {
      render(<App />)
      expect(screen.getByTestId('launch-screen')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByTestId('launch-screen')).toBeNull(), { timeout: 3000 })
    } finally {
      ;(SIGNED_IN as { status: string }).status = 'signed-in'
    }
  })
})
