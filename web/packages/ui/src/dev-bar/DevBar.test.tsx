import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { clearSlot } from '../slots'
import { DevBar } from './DevBar'
import { registerDevTool } from './tools'

const DEVELOPER = { isDeveloper: true, studioName: 'מועדון הדגמה' }

describe('DevBar', () => {
  beforeEach(() => clearSlot('dev-bar'))

  it('renders nothing when there is no identity at all', () => {
    const { container } = renderIn(<DevBar identity={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an identity without the developer flag', () => {
    // §19.4 — "Rendered only when the authenticated identity has is_developer."
    const { container } = renderIn(
      <DevBar identity={{ isDeveloper: false, studioName: 'Real Club' }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders for a developer identity, and names the studio it is acting in', () => {
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.getByTestId('studio-dev-bar')).toBeInTheDocument()
    expect(screen.getByText('מועדון הדגמה')).toBeInTheDocument()
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<DevBar identity={DEVELOPER} locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(screen.getByText(t(locale, 'common.dev.title'))).toBeInTheDocument()
  })

  it('says explicitly that there is no student persona — §19.3', () => {
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.getByText(t('he', 'common.dev.noStudentPersona'))).toBeInTheDocument()
  })

  it('shows a pending marker naming the milestone for each unbuilt tool', () => {
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.getByTestId('dev-tool-pending-offline')).toHaveTextContent('M5')
    expect(screen.getByTestId('dev-tool-pending-runJob')).toHaveTextContent('M6')
  })

  it('renders a tool a lane registered, in slot order', () => {
    registerDevTool('offline', () => <span>offline-tool</span>)
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.getByText('offline-tool')).toBeInTheDocument()
  })

  it('drops the pending marker once a lane registers that tool', () => {
    registerDevTool('offline', () => <span>offline-tool</span>)
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.queryByTestId('dev-tool-pending-offline')).toBeNull()
  })

  it('is a complementary landmark, so a screen reader can skip it', () => {
    // It is developer chrome wrapped around someone else's app. An unlabelled div
    // would sit in the tab order and the reading order with no way past it.
    renderIn(<DevBar identity={DEVELOPER} />)
    expect(screen.getByRole('complementary', { name: t('he', 'common.dev.title') })).toBeInTheDocument()
  })
})
