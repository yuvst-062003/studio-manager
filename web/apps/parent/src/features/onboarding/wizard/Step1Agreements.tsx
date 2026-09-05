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
import { DocumentPopup, FaqPopup } from './WizardPopup'
import { LEGAL_DOCS, STEP1_COPY } from './content'
import type { DocumentKey } from './content'

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
  emblemUrl?: string | null
  /** Lifted, not local: the prototype keeps this in the step's own state, so it is lost on
   *  back-navigation and on refresh while the step number IS persisted (§14.2). */
  agreed: boolean
  onAgreedChange: (agreed: boolean) => void
  onContinue: () => void
}

export function Step1Agreements({
  emblemUrl,
  agreed,
  onAgreedChange,
  onContinue,
}: Step1AgreementsProps) {
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

        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#001849]/5 text-[#001849] mb-2.5 shadow-2xs">
          <Swords className="w-4 h-4 text-[#0056c5]" />
          <span className="text-[12px] font-semibold">{STEP1_COPY.seasonBadge}</span>
        </div>

        <h2 className="text-[24px] sm:text-[26px] font-bold text-[#161b28] tracking-tight mb-2">
          {STEP1_COPY.heading}
        </h2>
        <p className="text-[14px] text-[#444650] max-w-[340px] mx-auto leading-relaxed">
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
            className="group w-full flex items-center justify-between p-3.5 rounded-xl bg-white shadow-xs hover:shadow-md border border-[#c5c6d2]/30 transition-all active:scale-[0.99] cursor-pointer text-right"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#e9edff] flex items-center justify-center text-[#0056c5] group-hover:bg-[#0056c5] group-hover:text-white transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[15px] font-bold text-[#0056c5] group-hover:text-[#001849] transition-colors">
                {LEGAL_DOCS[key].title}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[#0056c5]">
              <span className="text-[11px] font-semibold opacity-75 group-hover:opacity-100">
                {STEP1_COPY.viewDocument}
              </span>
              <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            </div>
          </button>
        ))}

        {/* §3.3 — a fourth row, but NOT a fourth document. Two details keep it apart from
            the three above: `5 שאלות` where they say `צפייה במסמך`, and a question mark
            where they carry a document, a shield and a card. */}
        <button
          type="button"
          onClick={() => setFaqOpen(true)}
          className="group w-full flex items-center justify-between p-3.5 rounded-xl bg-white shadow-xs hover:shadow-md border border-[#c5c6d2]/30 transition-all active:scale-[0.99] cursor-pointer text-right"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#e9edff] flex items-center justify-center text-[#0056c5] group-hover:bg-[#0056c5] group-hover:text-white transition-colors">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[15px] font-bold text-[#0056c5] group-hover:text-[#001849] transition-colors">
                {STEP1_COPY.faqTitle}
              </span>
              <span className="text-[11px] text-[#444650]">{STEP1_COPY.faqLead}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#0056c5] shrink-0">
            <span className="text-[11px] font-semibold opacity-75 group-hover:opacity-100">
              {STEP1_COPY.faqCount}
            </span>
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          </div>
        </button>
      </div>

      {/* §3.4 — the confirmation card */}
      <div className="mt-4 p-4 rounded-xl bg-white shadow-md border border-[#e9edff] flex flex-col gap-4">
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
              className={`w-6 h-6 rounded-lg flex items-center justify-center shadow-inner transition-all group-hover:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0056c5] peer-focus-visible:ring-offset-2 ${
                agreed
                  ? 'bg-[#0056c5] text-white'
                  : 'bg-[#e3e7fa] text-transparent border border-[#c5c6d2]'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <span className="text-[13px] font-medium text-[#161b28] leading-snug group-hover:text-[#0056c5] transition-colors">
            {STEP1_COPY.agree}
          </span>
        </label>

        <button
          type="button"
          disabled={!agreed}
          onClick={onContinue}
          className={`w-full h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] ${
            agreed
              ? 'bg-[#001849] hover:bg-[#0056c5] text-white shadow-md cursor-pointer'
              : 'bg-[#dee2f4] text-[#757681] cursor-not-allowed shadow-none'
          }`}
        >
          <span>{STEP1_COPY.continue}</span>
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {openDocument ? (
        (() => {
          const Icon = ICON_FOR[openDocument]
          return (
            <DocumentPopup
              document={LEGAL_DOCS[openDocument]}
              icon={<Icon className="w-5 h-5 text-[#0056c5]" />}
              onClose={() => setOpenDocument(null)}
            />
          )
        })()
      ) : null}

      {faqOpen ? (
        <FaqPopup
          icon={<HelpCircle className="w-5 h-5 text-[#0056c5]" />}
          onClose={() => setFaqOpen(false)}
        />
      ) : null}
    </div>
  )
}
