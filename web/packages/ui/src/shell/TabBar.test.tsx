// The bottom bar every phone artboard draws (1a/9a) — link items navigate, an action
// item (staff's עוד) is a button, and exactly one item carries aria-current.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from '../primitives/Icon'
import { SideNav } from './SideNav'
import { TabBar } from './TabBar'

describe('TabBar', () => {
  it('renders link items with hrefs and marks the active one for a screen reader', () => {
    render(
      <TabBar
        label="ניווט"
        items={[
          { key: 'home', label: 'בית', href: '#/', icon: <Icon name="home" />, active: true },
          { key: 'payments', label: 'תשלומים', href: '#/payments', icon: <Icon name="payments" /> },
        ]}
      />,
    )
    expect(screen.getByTestId('tab-home')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('tab-payments')).toHaveAttribute('href', '#/payments')
    expect(screen.getByTestId('tab-payments')).not.toHaveAttribute('aria-current')
  })

  it('carries an unread badge, with the count in the accessible name', () => {
    // Parent `2a` §7 draws "four tabs, with an unread badge on messages" and `TabBarItem`
    // had no badge field at all, so a parent with four unread announcements got no signal
    // anywhere in the app. The count goes in the ACCESSIBLE NAME rather than beside the
    // label as bare text: a screen reader announcing "messages 4" is the whole point, and
    // a bare "4" floating next to a word is not a count of anything in particular.
    render(
      <TabBar
        label="ניווט"
        items={[
          { key: 'home', label: 'בית', href: '#/', icon: <span />, active: true },
          { key: 'messages', label: 'הודעות', href: '#/announcements', icon: <span />, badge: 4 },
        ]}
      />,
    )
    expect(screen.getByTestId('tab-messages-badge')).toHaveTextContent('4')
    expect(screen.getByTestId('tab-messages')).toHaveAccessibleName(/4/)
  })

  it('renders no badge at zero — an empty inbox is not a notification', () => {
    render(
      <TabBar
        label="ניווט"
        items={[{ key: 'messages', label: 'הודעות', href: '#/announcements', icon: <span />, badge: 0 }]}
      />,
    )
    expect(screen.queryByTestId('tab-messages-badge')).toBeNull()
    expect(screen.getByTestId('tab-messages')).toHaveAccessibleName('הודעות')
  })

  it('caps the badge so a long-absent parent does not widen the bar', () => {
    render(
      <TabBar
        label="ניווט"
        items={[{ key: 'messages', label: 'הודעות', href: '#/announcements', icon: <span />, badge: 132 }]}
      />,
    )
    expect(screen.getByTestId('tab-messages-badge')).toHaveTextContent('99+')
  })

  it('renders an action item as a button and fires it', async () => {
    const onSelect = vi.fn()
    render(
      <TabBar
        label="ניווט"
        items={[{ key: 'more', label: 'עוד', icon: <Icon name="menu" />, onSelect }]}
      />,
    )
    await userEvent.click(screen.getByTestId('tab-more'))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

describe('SideNav', () => {
  it('renders groups, badges, and the ink-pill active state', () => {
    render(
      <SideNav
        label="ניווט ראשי"
        studioName="מועדון הדגמה"
        groups={[
          {
            key: 'daily',
            label: 'יומיום',
            items: [
              { key: 'schedule', label: 'לוח שבועי', href: '#/schedule', icon: <Icon name="calendar" />, active: true },
              { key: 'billing', label: 'תשלומים', href: '#/billing', icon: <Icon name="payments" />, badge: { text: '12', tone: 'red' } },
            ],
          },
        ]}
        settingsItem={{ key: 'settings', label: 'הגדרות', href: '#/settings', icon: <Icon name="settings" /> }}
        footer={{ name: 'מיכל מנהלת', note: 'מנהלת מועדון' }}
      />,
    )
    expect(screen.getByTestId('sidenav-schedule')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('sidenav-billing')).toHaveTextContent('12')
    expect(screen.getByTestId('sidenav-settings')).toBeInTheDocument()
    expect(screen.getByText('מיכל מנהלת')).toBeInTheDocument()
  })
})
