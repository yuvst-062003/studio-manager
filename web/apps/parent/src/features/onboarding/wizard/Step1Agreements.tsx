// §3 -- the screen a family meets first. One informed confirmation over three documents,
// plus the FAQ that otherwise arrives by telephone.
//
// Order on the page, per §3's own numbering: emblem, three document rows, the FAQ row,
// then the confirmation card.
import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  CreditCard,
  FileText,
  HelpCircle,
  Shield,
  Swords,
} from 'lucide-react'
import type { Locale } from '@studio/i18n'
import { DocumentPopup, FaqPopup } from './WizardPopup'
import { legalDocs, step1Copy } from './copy'
import type { DocumentKey } from './copy'

const DOCUMENT_ROWS: readonly { key: DocumentKey; icon: typeof FileText }[] = [
  { key: 'terms', icon: FileText },
  { key: 'privacy', icon: Shield },
  { key: 'payments', icon: CreditCard },
]

const ICON_FOR: Record<DocumentKey, typeof FileText> = {
  terms: FileText,
  privacy: Shield,
  payments: CreditCard,
}

export type Step1AgreementsProps = {
  locale: Locale
  emblemUrl?: string | null
  /** `OnboardingInfoOut.club_terms_version`, live off the server's own
   *  `CLUB_TERMS_VERSION` -- not a frontend constant hand-mirrored from it, which is the
   *  gap this prop closes (nothing kept the two in step). Rendered beside the club's own
   *  document card ('payments' -- see `DOCUMENT_ROWS`, the "תקנות ותנאי תשלום" row) when
   *  non-null; renders nothing extra when `null` (doors C/D, whose door has no such
   *  number to show -- see `wizardSources.ts::studioSource.loadStudio`'s own comment). */
  /** Lifted, not local: the prototype keeps this in the step's own state, so it is lost on
   *  back-navigation and on refresh while the step number IS persisted (§14.2). */
  agreed: boolean
  onAgreedChange: (agreed: boolean) => void
  /** §20.5.1 — the optional photography permission. Lifted for the same reason `agreed`
   *  is: the step number survives a refresh, so an answer kept in local state would be
   *  silently lost while the wizard claims to be on the step after it.
   *
   *  **Never gates `onContinue`.** The club's privacy policy promises that refusing
   *  changes nothing, and a Continue button that dims when this is unticked would make
   *  that untrue on the one screen where the family reads it. */
  photoConsent: boolean
  onPhotoConsentChange: (granted: boolean) => void
  onContinue: () => void
}

export function Step1Agreements({
  locale,
  emblemUrl,
  agreed,
  onAgreedChange,
  photoConsent,
  onPhotoConsentChange,
  onContinue,
}: Step1AgreementsProps) {
  const STEP1_COPY = step1Copy(locale)
  const LEGAL_DOCS = legalDocs(locale)
  const [openDocument, setOpenDocument] = useState<DocumentKey | null>(null)
  const [faqOpen, setFaqOpen] = useState(false)

  return (
    <div className="tw-scope flex flex-col w-full pb-16" data-testid="join-welcome">
      {/* §3.1 — club emblem */}
      <div className="relative flex flex-col items-center text-center pt-2 pb-4">
        {emblemUrl ? (
          <img
            src={emblemUrl}
            alt=""
            className="w-36 h-36 object-contain bg-transparent drop-shadow-md transition-transform duration-300 hover:scale-105 mb-4"
          />
        ) : null}

        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[var(--wz-btn-bg)]/5 text-[var(--wz-heading)] mb-2.5 shadow-2xs">
          <Swords className="w-4 h-4 text-[var(--wz-accent)]" />
          <span className="text-[12px] font-semibold">{STEP1_COPY.seasonBadge}</span>
        </div>

        <h2 className="text-[24px] sm:text-[26px] font-bold text-[var(--wz-ink)] tracking-tight mb-2">
          {STEP1_COPY.heading}
        </h2>
        <p className="text-[14px] text-[var(--wz-secondary)] max-w-[340px] mx-auto leading-relaxed">
          {STEP1_COPY.lead}
        </p>
      </div>

      {/* §3.2 — the three documents, then §3.3's FAQ row as a fourth */}
      <div className="flex flex-col gap-2.5 my-3">
        {DOCUMENT_ROWS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpenDocument(key)}
            className="group w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--wz-surface)] shadow-xs hover:shadow-md border border-[var(--wz-line-strong)]/30 transition-all active:scale-[0.99] cursor-pointer text-right"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--wz-tint)] flex items-center justify-center text-[var(--wz-accent)] group-hover:bg-[var(--wz-accent)] group-hover:text-white transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[15px] font-bold text-[var(--wz-accent)] group-hover:text-[var(--wz-heading)] transition-colors">
                {LEGAL_DOCS[key].title}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[var(--wz-accent)]">
              <span className="text-[11px] font-semibold opacity-75 group-hover:opacity-100">
                {STEP1_COPY.viewDocument}
              </span>
              <ChevronLeft className="w-5 h-5 wz-dir-icon transition-transform group-hover:-translate-x-1" />
            </div>
          </button>
        ))}

        {/* §3.3 — a fourth row, but NOT a fourth document. Two details keep it apart from
            the three above: `5 שאלות` where they say `צפייה במסמך`, and a question mark
            where they carry a document, a shield and a card. */}
        <button
          type="button"
          onClick={() => setFaqOpen(true)}
          className="group w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--wz-surface)] shadow-xs hover:shadow-md border border-[var(--wz-line-strong)]/30 transition-all active:scale-[0.99] cursor-pointer text-right"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--wz-tint)] flex items-center justify-center text-[var(--wz-accent)] group-hover:bg-[var(--wz-accent)] group-hover:text-white transition-colors">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[15px] font-bold text-[var(--wz-accent)] group-hover:text-[var(--wz-heading)] transition-colors">
                {STEP1_COPY.faqTitle}
              </span>
              <span className="text-[11px] text-[var(--wz-secondary)]">{STEP1_COPY.faqLead}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[var(--wz-accent)] shrink-0">
            <span className="text-[11px] font-semibold opacity-75 group-hover:opacity-100">
              {STEP1_COPY.faqCount}
            </span>
            <ChevronLeft className="w-5 h-5 wz-dir-icon transition-transform group-hover:-translate-x-1" />
          </div>
        </button>
      </div>

      {/* §3.4 — the confirmation card */}
      <div className="mt-4 p-4 rounded-xl bg-[var(--wz-surface)] shadow-md border border-[var(--wz-tint)] flex flex-col gap-4">
        <label
          htmlFor="wizard-master-agreement"
          className="flex items-start gap-3 cursor-pointer group"
        >
          <div className="relative flex items-center justify-center shrink-0 mt-0.5">
            <input
              id="wizard-master-agreement"
              type="checkbox"
              checked={agreed}
              onChange={(event) => onAgreedChange(event.target.checked)}
              className="sr-only peer"
            />
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shadow-inner transition-all group-hover:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--wz-accent)] peer-focus-visible:ring-offset-2 ${
                agreed
                  ? 'bg-[var(--wz-accent)] text-white'
                  : 'bg-[var(--wz-tint-4)] text-transparent border border-[var(--wz-line-strong)]'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <span className="text-[13px] font-medium text-[var(--wz-ink)] leading-snug group-hover:text-[var(--wz-accent)] transition-colors">
            {STEP1_COPY.agree}
          </span>
        </label>

        {/* §20.5.1 — a SECOND tick, deliberately not part of the one above. Separated by a
            rule and carrying its own "optional" pill, because the two must not read as one
            block of small print: the first is a condition of registering and this one is
            not, and Amendment 13 to חוק הגנת הפרטיות requires the two purposes to carry
            separate consents. */}
        <div className="border-t border-[var(--wz-line)] pt-4">
          <label
            htmlFor="wizard-photo-consent"
            className="flex items-start gap-3 cursor-pointer group"
          >
            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
              <input
                id="wizard-photo-consent"
                type="checkbox"
                checked={photoConsent}
                onChange={(event) => onPhotoConsentChange(event.target.checked)}
                className="sr-only peer"
                aria-describedby="wizard-photo-consent-detail"
              />
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shadow-inner transition-all group-hover:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--wz-accent)] peer-focus-visible:ring-offset-2 ${
                  photoConsent
                    ? 'bg-[var(--wz-accent)] text-white'
                    : 'bg-[var(--wz-tint-4)] text-transparent border border-[var(--wz-line-strong)]'
                }`}
              >
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
            </div>
            <span className="flex flex-col gap-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-[var(--wz-ink)] leading-snug group-hover:text-[var(--wz-accent)] transition-colors">
                  {STEP1_COPY.photoLabel}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--wz-tint-4)] text-[var(--wz-tertiary)] shrink-0">
                  {STEP1_COPY.photoOptional}
                </span>
              </span>
              <span
                id="wizard-photo-consent-detail"
                className="text-[11px] text-[var(--wz-tertiary)] leading-relaxed"
              >
                {STEP1_COPY.photoDetail}
              </span>
            </span>
          </label>
        </div>

        <button
          type="button"
          disabled={!agreed}
          onClick={onContinue}
          className={`w-full h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] ${
            agreed
              ? 'bg-[var(--wz-btn-bg)] hover:bg-[var(--wz-accent)] text-white shadow-md cursor-pointer'
              : 'bg-[var(--wz-line)] text-[var(--wz-tertiary)] cursor-not-allowed shadow-none'
          }`}
        >
          <span>{STEP1_COPY.continue}</span>
          <ArrowLeft className="w-5 h-5 wz-dir-icon" />
        </button>
      </div>

      {openDocument ? (
        (() => {
          const Icon = ICON_FOR[openDocument]
          return (
            <DocumentPopup
              locale={locale}
              document={LEGAL_DOCS[openDocument]}
              icon={<Icon className="w-5 h-5 text-[var(--wz-accent)]" />}
              onClose={() => setOpenDocument(null)}
            />
          )
        })()
      ) : null}

      {faqOpen ? (
        <FaqPopup
          locale={locale}
          icon={<HelpCircle className="w-5 h-5 text-[var(--wz-accent)]" />}
          onClose={() => setFaqOpen(false)}
        />
      ) : null}
    </div>
  )
}
