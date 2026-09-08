// §6 -- the club's documents at a real, public URL (`/legal`, or `/t/<slug>/legal`).
//
// Until now the only way to read the terms was a popup behind a sign-in, which is the
// wrong way round for documents a stranger is asked to accept before committing. This page
// is the same four documents the join wizard shows, on an address a club can put in a
// footer, in an advert and beside a consent tick.
//
// **ONE SOURCE OF LEGAL TEXT: `legalDocs()`.** The owner settled this on 2026-09-08 --
// the join wizard's documents (`people.joinWizard.legal.*`) are the club's real ones. The
// repo holds two older sets, `PolicyDocument`/`reports.privacy.*` and
// `PAYMENT_CLAUSE_KEYS`/`health.clubTerms.*`, and the trial door used to render those, so
// a stranger booking a lesson was shown different terms from a family joining the club.
// Neither is imported here, and `LegalPage.test.tsx` asserts that every sentence unique to
// them is absent from this page -- a guard that survives someone "helpfully" wiring the
// versioned document back in.
//
// The page adds only its own frame (`people.bookTrial.legal.*`: a title, a contents
// heading and a back link), so no legal sentence is duplicated into a second locale key.
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, CreditCard, FileText, HelpCircle, Shield } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { faqItems, legalDocs, step1Copy } from '../onboarding/wizard/copy'
import type { FaqItem, LegalDocument } from '../onboarding/wizard/copy'

/** Tailwind's own `md`, written once so the layout and the media query cannot drift.
 *
 *  The two halves of this page differ in ARIA, not only in pixels -- below the breakpoint
 *  each document is a disclosure with `aria-expanded`, above it the documents are simply
 *  open beside a rail -- and a media query cannot change an ARIA attribute. So the
 *  breakpoint is read in JavaScript and drives BOTH, rather than `md:` utilities drawing
 *  one shape while the markup claims another. */
const WIDE_QUERY = '(min-width: 48rem)'

function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => globalThis.matchMedia?.(WIDE_QUERY).matches ?? false)
  useEffect(() => {
    const mq = globalThis.matchMedia?.(WIDE_QUERY)
    if (!mq) return undefined
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0056c5]'

type SectionModel = {
  /** Stable, so `/legal#legal-privacy` keeps working -- these are linkable anchors, not
   *  render-order ids. Prefixed because the page shares a document with the app shell. */
  readonly id: string
  readonly title: string
  readonly Icon: typeof FileText
  readonly body: ReactNode
}

/** The union `legalDocs()` returns: terms and privacy carry headed sections, payments
 *  carries bare paragraphs. Both shapes are rendered here rather than flattened, because
 *  flattening one into the other would either invent headings or lose them. */
function DocumentBody({ document: doc }: { document: LegalDocument }) {
  if ('sections' in doc) {
    return (
      <div className="flex flex-col gap-4">
        {doc.sections.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1">
            <h3 className="text-[15px] font-bold text-[#001849]">{section.heading}</h3>
            <p className="text-[14px] leading-relaxed text-[#444650]">{section.body}</p>
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {doc.paragraphs.map((paragraph) => (
        <li
          key={paragraph}
          className="flex items-start gap-2.5 rounded-xl border border-[#dee2f4] bg-[#faf8ff] p-3.5"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0056c5]" aria-hidden="true" />
          <p className="text-[14px] leading-relaxed text-[#161b28]">{paragraph}</p>
        </li>
      ))}
    </ul>
  )
}

/** The FAQ is a fourth SECTION, not a fourth document, and its five entries are laid out
 *  flat rather than as an accordion inside an accordion -- a public page is read and
 *  searched, and a question hidden behind two presses is a question nobody finds. */
function FaqBody({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5">
          <span className="self-start rounded bg-[#e9edff] px-1.5 py-0.5 text-[11px] font-bold text-[#001849]">
            {item.category}
          </span>
          <h3 className="text-[15px] font-bold text-[#001849]">{item.question}</h3>
          <p className="text-[14px] leading-relaxed text-[#444650]">{item.answer}</p>
        </div>
      ))}
    </div>
  )
}

function SectionIcon({ Icon }: { Icon: typeof FileText }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e9edff] text-[#0056c5]">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}

/** Above the breakpoint: open, headed, beside the rail. No button, because nothing here
 *  toggles -- a control that never does anything is worse than no control. */
function OpenSection({ section }: { section: SectionModel }) {
  return (
    <section
      id={section.id}
      className="scroll-mt-6 rounded-2xl border border-[#dee2f4] bg-white p-5 shadow-xs sm:p-6"
    >
      <div className="mb-4 flex items-center gap-3 border-b border-[#e9edff] pb-3">
        <SectionIcon Icon={section.Icon} />
        <h2 className="text-[18px] font-bold text-[#161b28]">{section.title}</h2>
      </div>
      {section.body}
    </section>
  )
}

/** Below it: the APG disclosure pattern -- the button lives INSIDE the heading, so the
 *  document keeps exactly one `h2` in both layouts, and the panel is always in the DOM
 *  (hidden, not unmounted) so `aria-controls` always names an element that exists. */
function CollapsibleSection({
  section,
  open,
  onToggle,
  buttonId,
  panelId,
}: {
  section: SectionModel
  open: boolean
  onToggle: () => void
  buttonId: string
  panelId: string
}) {
  return (
    <section
      id={section.id}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#dee2f4] bg-white shadow-xs"
    >
      <h2 className="text-[16px] font-bold text-[#161b28]">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-start transition-colors hover:bg-[#faf8ff] ${FOCUS_RING}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <SectionIcon Icon={section.Icon} />
            <span className="text-[16px] font-bold text-[#161b28]">{section.title}</span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[#0056c5] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-[#e9edff] px-4 pb-4 pt-4"
      >
        {section.body}
      </div>
    </section>
  )
}

export type LegalPageProps = {
  locale: Locale
  /** The club's own name, from the landing payload. Data, not copy -- it is never
   *  translated, and it is the only thing on the page that varies by studio. */
  studioName: string
  logoUrl?: string | null
  /** Where "back to the form" goes. The page holds no route knowledge of its own; the
   *  caller already knows whether this club lives at `/trial` or `/t/<slug>/trial`. */
  backHref: string
}

export function LegalPage({ locale, studioName, logoUrl, backHref }: LegalPageProps) {
  const documents = legalDocs(locale)
  const faq = faqItems(locale)
  const step1 = step1Copy(locale)
  const wide = useWideLayout()
  const baseId = useId()
  const contentsId = `${baseId}-contents`
  const [openId, setOpenId] = useState<string | null>(null)

  const sections: readonly SectionModel[] = [
    {
      id: 'legal-terms',
      title: documents.terms.title,
      Icon: FileText,
      body: <DocumentBody document={documents.terms} />,
    },
    {
      id: 'legal-privacy',
      title: documents.privacy.title,
      Icon: Shield,
      body: <DocumentBody document={documents.privacy} />,
    },
    {
      id: 'legal-payments',
      title: documents.payments.title,
      Icon: CreditCard,
      body: <DocumentBody document={documents.payments} />,
    },
    {
      id: 'legal-faq',
      title: step1.faqTitle,
      Icon: HelpCircle,
      body: <FaqBody items={faq} />,
    },
  ]

  return (
    <div className="tw-scope min-h-screen bg-[#faf8ff] text-[#161b28]" data-testid="legal-page">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col items-center gap-3 border-b border-[#dee2f4] pb-6 text-center sm:pb-8">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-16 w-16 object-contain drop-shadow-sm sm:h-20 sm:w-20"
            />
          ) : null}
          <p className="text-[13px] font-semibold text-[#0056c5]">{studioName}</p>
          <h1 className="text-[26px] font-bold tracking-tight text-[#001849] sm:text-[32px]">
            {t(locale, 'people.bookTrial.legal.title')}
          </h1>
        </header>

        <main>
          <div
            className={
              wide
                ? 'mt-8 grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-start gap-10'
                : 'mt-6 flex flex-col gap-3'
            }
          >
            {wide ? (
              <nav
                aria-labelledby={contentsId}
                className="sticky top-6 rounded-2xl border border-[#dee2f4] bg-white p-4 shadow-xs"
                data-testid="legal-contents"
              >
                <h2 id={contentsId} className="text-[13px] font-bold tracking-wide text-[#444650]">
                  {t(locale, 'people.bookTrial.legal.contents')}
                </h2>
                <ol className="mt-3 flex flex-col gap-1">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] font-semibold text-[#0056c5] transition-colors hover:bg-[#e9edff] hover:text-[#001849] ${FOCUS_RING}`}
                      >
                        <section.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{section.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <div className="flex flex-col gap-3 md:gap-6">
              {sections.map((section) =>
                wide ? (
                  <OpenSection key={section.id} section={section} />
                ) : (
                  <CollapsibleSection
                    key={section.id}
                    section={section}
                    open={openId === section.id}
                    onToggle={() =>
                      setOpenId((previous) => (previous === section.id ? null : section.id))
                    }
                    buttonId={`${baseId}-${section.id}-button`}
                    panelId={`${baseId}-${section.id}-panel`}
                  />
                ),
              )}
            </div>
          </div>

          <div className="mt-10 border-t border-[#dee2f4] pt-6">
            <a
              href={backHref}
              data-testid="legal-back"
              className={`inline-flex items-center gap-2 rounded-xl bg-[#001849] px-5 py-3 text-[15px] font-bold text-white shadow-md transition-colors hover:bg-[#0056c5] ${FOCUS_RING}`}
            >
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
              <span>{t(locale, 'people.bookTrial.legal.back')}</span>
            </a>
          </div>
        </main>
      </div>
    </div>
  )
}
