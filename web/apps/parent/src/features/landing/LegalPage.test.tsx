// §6 -- the public documents page.
//
// The load-bearing test here is the negative one. Three sets of legal text live in this
// repo and only `legalDocs()` is the club's real one (owner, 2026-09-08); the screen this
// page replaces rendered the other two, so a stranger booking a trial read different terms
// from a family joining the club. `renders nothing from the two older sources` asserts that
// every sentence UNIQUE to `reports.privacy.*` and `health.clubTerms.*` is absent -- built
// from the bundles themselves, so it keeps working when either set is edited.
//
// It has to be built that way, because the three sets overlap: 47 of the 147 foreign
// strings are byte-identical to a `joinWizard.legal.*` one (the older documents were the
// source the wizard's were copied from). Asserting "no reports.privacy value appears" would
// therefore fail on text this page is SUPPOSED to show. What identifies the wrong source is
// the text only it has -- e.g. its own `terms.s4.body`, its versioning chrome, and the
// FOURTH payment clause that `PAYMENT_CLAUSE_KEYS` renders and `legalDocs()` does not.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bundles } from '@studio/i18n'
import { faqItems, legalDocs, step1Copy } from '../onboarding/wizard/copy'
import type { LegalDocument } from '../onboarding/wizard/copy'
import { LegalPage } from './LegalPage'

const DOCS = legalDocs('he')
const FAQ = faqItems('he')
const STEP1 = step1Copy('he')
const BACK_HREF = '/t/gladiator/trial'

/** Everything the parent app's own `people`/`common` namespaces may legitimately put on a
 *  screen. A foreign string that also exists here cannot be evidence of the wrong source. */
const ALLOWED_TEXT = [...Object.values(bundles.he.people), ...Object.values(bundles.he.common)]
const ALLOWED = new Set(ALLOWED_TEXT)

/** The 24 sentences that exist ONLY in the two superseded sources. Thirty characters is the
 *  cut: it keeps whole legal sentences and drops generic UI words ('חזרה', 'ביטול') that
 *  would collide with this page's own chrome and prove nothing either way. */
const FOREIGN_LEGAL_TEXT = [
  ...Object.entries(bundles.he.reports).filter(([key]) => key.startsWith('privacy.')),
  ...Object.entries(bundles.he.health).filter(([key]) => key.startsWith('clubTerms.')),
]
  .map(([, value]) => value)
  .filter((value) => value.length >= 30 && !ALLOWED.has(value))

function sectionsOf(doc: LegalDocument) {
  if (!('sections' in doc)) throw new Error('expected a sectioned document')
  return doc.sections
}

function paragraphsOf(doc: LegalDocument) {
  if (!('paragraphs' in doc)) throw new Error('expected a paragraph document')
  return doc.paragraphs
}

/** `noUncheckedIndexedAccess` is on, and a test that indexes a document by position should
 *  say so out loud rather than assert the compiler away. */
function termsSection(index: number) {
  const section = sectionsOf(DOCS.terms)[index]
  if (!section) throw new Error(`no terms section ${index}`)
  return section
}

function paymentsParagraph(index: number) {
  const paragraph = paragraphsOf(DOCS.payments)[index]
  if (!paragraph) throw new Error(`no payments paragraph ${index}`)
  return paragraph
}

/** jsdom answers `matches: false` to every query, so the breakpoint is forced. The page
 *  reads it once through `matchMedia` because the two layouts differ in ARIA, not only in
 *  pixels -- see `useWideLayout`. */
function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }))
}

function renderPage() {
  return render(
    <LegalPage
      locale="he"
      studioName="מועדון ג׳ודו גלדיאטור"
      logoUrl="https://cdn.example.com/crest.png"
      backHref={BACK_HREF}
    />,
  )
}

function sectionElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`no section #${id}`)
  return element
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LegalPage — the four documents', () => {
  it('renders all four titles, once each', () => {
    stubViewport(true)
    renderPage()

    for (const title of [DOCS.terms.title, DOCS.privacy.title, DOCS.payments.title, STEP1.faqTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    // One page, one h1 — the documents sit under it as h2s.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders the terms document with all eight of its section headings', () => {
    stubViewport(true)
    renderPage()

    const terms = within(sectionElement('legal-terms'))
    const headings = sectionsOf(DOCS.terms)
    expect(headings).toHaveLength(8)
    for (const section of headings) {
      expect(terms.getByRole('heading', { level: 3, name: section.heading })).toBeInTheDocument()
    }
  })

  it('renders the payments document as its three paragraphs — the other shape of the union', () => {
    stubViewport(true)
    renderPage()

    const payments = within(sectionElement('legal-payments'))
    const paragraphs = paragraphsOf(DOCS.payments)
    expect(paragraphs).toHaveLength(3)
    // Three, not the four `PAYMENT_CLAUSE_KEYS` renders: the count itself distinguishes the
    // canonical document from the superseded one.
    expect(payments.getAllByRole('listitem')).toHaveLength(3)
    for (const paragraph of paragraphs) {
      expect(payments.getByText(paragraph)).toBeInTheDocument()
    }
  })

  it('renders the FAQ, which no stranger could reach before', () => {
    stubViewport(true)
    renderPage()

    const faq = within(sectionElement('legal-faq'))
    expect(FAQ.length).toBeGreaterThan(0)
    for (const item of FAQ) {
      expect(faq.getByRole('heading', { level: 3, name: item.question })).toBeInTheDocument()
      expect(faq.getByText(item.answer)).toBeInTheDocument()
    }
  })
})

describe('LegalPage — one source of legal text', () => {
  it('renders nothing from the two older sources', () => {
    stubViewport(true)
    const { container } = renderPage()

    // Guard against the guard silently emptying: if this ever hits zero the test below
    // asserts nothing at all.
    expect(FOREIGN_LEGAL_TEXT.length).toBeGreaterThan(20)

    const pageText = container.textContent ?? ''
    const leaked = FOREIGN_LEGAL_TEXT.filter((value) => pageText.includes(value))
    expect(leaked).toEqual([])
  })

  it('shows the canonical text those sources were meant to replace', () => {
    stubViewport(true)
    const { container } = renderPage()

    // The mirror image of the test above: proof the negative one is passing because the
    // right document is rendered, not because nothing is.
    const pageText = container.textContent ?? ''
    expect(pageText).toContain(termsSection(7).body)
    expect(pageText).toContain(paymentsParagraph(0))
  })
})

describe('LegalPage — the contents rail (md and up)', () => {
  it('is a nav of real anchors, one per section, and every document is open', () => {
    stubViewport(true)
    renderPage()

    const rail = within(screen.getByRole('navigation'))
    const links = rail.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#legal-terms',
      '#legal-privacy',
      '#legal-payments',
      '#legal-faq',
    ])
    expect(links.map((link) => link.textContent)).toEqual([
      DOCS.terms.title,
      DOCS.privacy.title,
      DOCS.payments.title,
      STEP1.faqTitle,
    ])
    // Nothing to press open at this width, so nothing pretends to be pressable.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('LegalPage — collapsible cards (below md)', () => {
  it('offers four disclosure buttons instead of the rail, all closed', () => {
    stubViewport(false)
    renderPage()

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      DOCS.terms.title,
      DOCS.privacy.title,
      DOCS.payments.title,
      STEP1.faqTitle,
    ])
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('opens the panel its aria-controls names, and closes it again', async () => {
    stubViewport(false)
    const user = userEvent.setup()
    renderPage()

    const button = screen.getByRole('button', { name: DOCS.terms.title })
    const panelId = button.getAttribute('aria-controls') ?? ''
    const panel = document.getElementById(panelId)
    // `aria-controls` must name an element that exists even while collapsed — so the panel
    // is hidden, never unmounted.
    expect(panel).not.toBeNull()
    expect(panel).not.toBeVisible()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toBeVisible()
    expect(within(panel as HTMLElement).getByText(termsSection(0).body)).toBeVisible()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toBeVisible()
  })
})

describe('LegalPage — the way back', () => {
  it('links to the trial booking form it was opened from', () => {
    stubViewport(true)
    renderPage()

    const back = screen.getByTestId('legal-back')
    expect(back).toHaveAttribute('href', BACK_HREF)
    expect(back).toHaveTextContent(bundles.he.people['bookTrial.legal.back'] as string)
  })
})
