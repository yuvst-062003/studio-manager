// §19.4's persona dropdown. Holdback 4, frontend half.
//
// Imports RoleSwitcherTool DIRECTLY and not through ./index — under vitest neither env
// var is set, so index's switch yields the absent shapes and every test here would render
// nothing and pass for the wrong reason. ./index.ts says so in its own header.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { RoleSwitcherTool } from './RoleSwitcherTool'
import { clearSlot } from '../slots'
import { DEV_TOOL_ORDER, devToolKeys } from './tools'

const NOTE = 'אין פרסונת תלמיד — לתלמידים אין התחברות בגרסה 1'

const PERSONAS = {
  items: [
    {
      key: 'owner',
      person_id: 'p-owner',
      studio_id: 's',
      label: 'עידו בעלים',
      roles: ['owner'],
      is_guardian: false,
      tests: 'setup wizard',
    },
    {
      key: 'assistant',
      person_id: 'p-assistant',
      studio_id: 's',
      label: 'נועם עוזר',
      roles: ['assistant_coach'],
      is_guardian: false,
      tests: 'attendance only -- used to verify no financial data leaks',
    },
    {
      key: 'none',
      person_id: 'p-none',
      studio_id: 's',
      label: 'תמר ללא',
      roles: [],
      is_guardian: false,
      tests: 'the refusal screens in both apps',
    },
  ],
  no_student_persona_note: NOTE,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/personas')
        ? new Response(JSON.stringify(PERSONAS), { status: 200 })
        : new Response(
            JSON.stringify({ access_token: 'tok-new', persona_label: 'עידו בעלים' }),
            { status: 200 },
          ),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearSlot('dev-bar')
})

describe('RoleSwitcherTool', () => {
  it('lists every persona the server offers', async () => {
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    // + 1 for the placeholder option.
    expect(screen.getAllByRole('option')).toHaveLength(PERSONAS.items.length + 1)
  })

  it('states the missing student persona rather than hiding it', async () => {
    // §19.3 — 'the dev bar says so explicitly, so the gap is visible rather than
    // confusing.' The wording comes from the server, so the bar cannot drift from it.
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByText(NOTE)).toBeInTheDocument())
  })

  it('labels each persona from i18n rather than the raw name', async () => {
    // G4 — no user-facing string inlined in a component. §19.4's own labels.
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: t('he', 'common.dev.persona.owner') })).toBeInTheDocument()
  })

  it('posts to act-as when a persona is chosen', async () => {
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p-assistant')
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dev/act-as/p-assistant'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('sends the cookie with the switch', async () => {
    // §19.4 writes the persona onto the caller's refresh row. Without credentials the
    // switch would apply to the access token only and silently revert on the next
    // rotation — fifteen minutes into whatever was being tested.
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p-owner')
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/act-as/'),
        expect.objectContaining({ credentials: 'include' }),
      ),
    )
  })

  it('hands the new access token to the caller', async () => {
    // The server mints a NEW token rather than mutating the old one, so a client that
    // dropped it would keep acting as whoever it was before — which looks exactly like
    // the switch not working.
    const onSwitched = vi.fn()
    render(<RoleSwitcherTool locale="he" onSwitched={onSwitched} />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p-owner')
    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith('tok-new', 'עידו בעלים'))
  })

  it('has an accessible name, not a bare control', async () => {
    // .claude/rules/ui-rtl-a11y.md — every interactive element has an accessible name.
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAccessibleName())
  })

  it('survives the persona list failing', async () => {
    // A dev tool that throws takes the bar down with it — and the bar is what a developer
    // is using to diagnose whatever else is wrong.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})

describe('registration', () => {
  it('registers into the dev-bar slot without the container being reopened', async () => {
    await import('./devTools')
    expect(devToolKeys()).toContain('actAs')
  })

  it('sorts before the tool row, because §19.4 draws the persona row above it', () => {
    expect(DEV_TOOL_ORDER.actAs).toBeLessThan(DEV_TOOL_ORDER.offline)
  })
})
