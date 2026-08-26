// The shell, the drawer and the studio switcher. SPEC §5.2, §6.2, §9, and
// .claude/rules/ui-rtl-a11y.md.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AppShell } from './AppShell'
import { NavDrawer } from './NavDrawer'
import { StudioSwitcher } from './StudioSwitcher'

const ITEMS = [
  { key: 'today', labelKey: 'common.nav.today', href: '/' },
  { key: 'schedule', labelKey: 'common.nav.schedule', href: '/schedule' },
]

const ONE = [{ studioId: 'a', studioName: 'מועדון א', studioIsDemo: false }]
const TWO = [...ONE, { studioId: 'b', studioName: 'מועדון ב', studioIsDemo: false }]

const PHYSICAL = ['margin-left', 'margin-right', 'padding-left', 'padding-right', 'left:', 'right:']

describe('StudioSwitcher', () => {
  it('is hidden for a person who belongs to one studio', () => {
    // §5.2 — 'A person belonging to more than one studio gets a studio switcher;
    // otherwise it is hidden.'
    const { container } = render(
      <StudioSwitcher studios={ONE} activeStudioId="a" onSwitch={vi.fn()} locale="he" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is hidden for a person who belongs to none', () => {
    const { container } = render(
      <StudioSwitcher studios={[]} activeStudioId={null} onSwitch={vi.fn()} locale="he" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders for a person who belongs to two', () => {
    render(<StudioSwitcher studios={TWO} activeStudioId="a" onSwitch={vi.fn()} locale="he" />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('has an accessible name', () => {
    render(<StudioSwitcher studios={TWO} activeStudioId="a" onSwitch={vi.fn()} locale="he" />)
    expect(screen.getByRole('combobox')).toHaveAccessibleName()
  })

  it('marks the demo studio, so nobody reads its numbers as a real club', async () => {
    // §19.1 — the demo studio exists in production so a live deploy can be smoke-tested,
    // which means it appears in this list next to real clubs.
    render(
      <StudioSwitcher
        studios={[...ONE, { studioId: 'd', studioName: 'מועדון הדגמה', studioIsDemo: true }]}
        activeStudioId="a"
        onSwitch={vi.fn()}
        locale="he"
      />,
    )
    const demo = screen.getByRole('option', { name: /מועדון הדגמה/ })
    expect(demo.textContent).toContain(t('he', 'common.nav.demoStudio'))
  })

  it('reports the chosen studio', async () => {
    const onSwitch = vi.fn()
    render(<StudioSwitcher studios={TWO} activeStudioId="a" onSwitch={onSwitch} locale="he" />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b')
    expect(onSwitch).toHaveBeenCalledWith('b')
  })
})

describe('NavDrawer', () => {
  it('is a labelled navigation landmark', () => {
    render(<NavDrawer open items={ITEMS} onClose={vi.fn()} locale="he" />)
    expect(screen.getByRole('navigation')).toHaveAccessibleName()
  })

  it('renders nothing when closed, rather than moving it off-screen', () => {
    // An off-screen drawer is still in the tab order and still read aloud — a keyboard
    // user would tab into a menu they cannot see.
    const { container } = render(
      <NavDrawer open={false} items={ITEMS} onClose={vi.fn()} locale="he" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<NavDrawer open items={ITEMS} onClose={onClose} locale="he" />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a backdrop click', async () => {
    const onClose = vi.fn()
    render(<NavDrawer open items={ITEMS} onClose={onClose} locale="he" />)
    await userEvent.click(screen.getByTestId('nav-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('labels every item from i18n rather than inline text', () => {
    // G4 — no user-facing string is ever inlined in a component.
    render(<NavDrawer open items={ITEMS} onClose={vi.fn()} locale="he" />)
    expect(screen.getByRole('link', { name: t('he', 'common.nav.today') })).toBeInTheDocument()
  })

  it('uses no physical CSS property', () => {
    // G12 / D10. ESLint's no-restricted-syntax rule reads JS object properties and
    // catches this too — this test is what survives someone disabling the rule for a
    // line, and the drawer is the one component whose layout actually flips.
    const { container } = render(<NavDrawer open items={ITEMS} onClose={vi.fn()} locale="he" />)
    for (const element of container.querySelectorAll('[style]')) {
      const style = element.getAttribute('style') ?? ''
      for (const banned of PHYSICAL) expect(style).not.toContain(banned)
    }
  })
})

describe('AppShell', () => {
  it('renders one main landmark and a header', () => {
    render(
      <AppShell title="היום" items={ITEMS} locale="he">
        <p>תוכן</p>
      </AppShell>,
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('gives the drawer trigger an accessible name and aria-expanded', () => {
    render(
      <AppShell title="היום" items={ITEMS} locale="he">
        <p>תוכן</p>
      </AppShell>,
    )
    const trigger = screen.getByRole('button', { name: t('he', 'common.nav.menu') })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens and closes the drawer', async () => {
    render(
      <AppShell title="היום" items={ITEMS} locale="he">
        <p>תוכן</p>
      </AppShell>,
    )
    expect(screen.queryByRole('navigation')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.nav.menu') }))
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renders the dev bar above the header', () => {
    // §19.4's artboard puts it there, and a bar that pushes the app down is one nobody
    // mistakes for part of the product.
    const { container } = render(
      <AppShell title="היום" items={ITEMS} locale="he" devBar={<div data-testid="bar" />}>
        <p>תוכן</p>
      </AppShell>,
    )
    // Document order, not sibling index: the design pass nested the header inside the
    // shell's flex frame, and where the bar sits relative to it is the property — not
    // how flat the DOM is.
    const bar = screen.getByTestId('bar')
    const header = screen.getByRole('banner')
    expect(container).toContainElement(bar)
    expect(
      bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('hides the studio switcher when there is nothing to switch between', () => {
    render(
      <AppShell
        title="היום"
        items={ITEMS}
        locale="he"
        studios={ONE}
        activeStudioId="a"
        onSwitchStudio={vi.fn()}
      >
        <p>תוכן</p>
      </AppShell>,
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
