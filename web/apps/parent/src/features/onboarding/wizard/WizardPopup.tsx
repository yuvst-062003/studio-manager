// §3.2 and §3.3 -- one popup, two body shapes. Three documents render sectioned prose or a
// list of highlighted paragraphs; the FAQ renders a collapsible list of questions. The
// chrome, the animation and every accessibility guarantee are identical across all four,
// which is the point of building it once.
import { useCallback, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, ChevronDown, X } from 'lucide-react'
import { useDialog } from './useDialog'
import { FAQ_ITEMS, STEP1_COPY } from './content'
import type { LegalDocument } from './content'

type PopupShellProps = {
  title: string
  subtitle?: string
  icon: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

function PopupShell({ title, subtitle, icon, onClose, children, footer }: PopupShellProps) {
  const titleId = useId()
  const dialogRef = useDialog(true, onClose)

  return (
    <div
      className="tw-scope fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-[480px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-[#c5c6d2]/30 focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 bg-[#f2f3ff] border-b border-[#c5c6d2]/30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#e9edff] flex items-center justify-center text-[#0056c5] shrink-0">
              {icon}
            </div>
            <div className="flex flex-col min-w-0">
              <h3 id={titleId} className="text-[17px] font-bold text-[#161b28] truncate">
                {title}
              </h3>
              {subtitle ? (
                <span className="text-[12px] text-[#444650] truncate">{subtitle}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label={STEP1_COPY.close}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#e3e7fa] text-[#444650] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto text-[14px] leading-relaxed text-[#161b28]">
          {children}
        </div>

        {footer ? (
          <div className="p-4 bg-[#f2f3ff] border-t border-[#c5c6d2]/30 shrink-0">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function DocumentPopup({
  document: doc,
  icon,
  onClose,
}: {
  document: LegalDocument
  icon: ReactNode
  onClose: () => void
}) {
  return (
    <PopupShell
      title={doc.title}
      icon={icon}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 px-5 rounded-xl bg-[#0056c5] hover:bg-[#001849] text-white font-semibold text-[15px] shadow-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
        >
          {STEP1_COPY.closeDocument}
        </button>
      }
    >
      {'sections' in doc ? (
        <div className="space-y-4">
          {doc.sections.map((section) => (
            <div key={section.heading} className="space-y-1">
              <h4 className="text-[15px] font-bold text-[#001849]">{section.heading}</h4>
              <p className="text-[14px] text-[#444650] leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {doc.paragraphs.map((paragraph) => (
            <div
              key={paragraph}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#f2f3ff] border border-[#c5c6d2]/30"
            >
              <CheckCircle2 className="w-5 h-5 text-[#0056c5] shrink-0 mt-0.5" />
              <p className="text-[14px] text-[#161b28] leading-relaxed">{paragraph}</p>
            </div>
          ))}
        </div>
      )}
    </PopupShell>
  )
}

export function FaqPopup({ icon, onClose }: { icon: ReactNode; onClose: () => void }) {
  //: §3.3 -- all five collapsed on open, so the reader meets the LIST and opens the one
  //: they want. The prototype pre-opened the first, which hides the other four below the
  //: fold on a phone.
  const [openId, setOpenId] = useState<string | null>(null)
  const panelIdFor = useCallback((id: string) => `faq-panel-${id}`, [])
  const buttonIdFor = useCallback((id: string) => `faq-button-${id}`, [])


  return (
    <PopupShell
      title={STEP1_COPY.faqTitle}
      subtitle={STEP1_COPY.faqLead}
      icon={icon}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item) => {
          const isOpen = openId === item.id
          return (
            <div
              key={item.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? 'bg-white border-[#0056c5]/30 shadow-xs ring-1 ring-[#0056c5]/10'
                  : 'bg-white/80 border-[#dee2f4] hover:bg-white hover:border-[#c5c6d2]'
              }`}
            >
              <button
                type="button"
                id={buttonIdFor(item.id)}
                aria-expanded={isOpen}
                aria-controls={panelIdFor(item.id)}
                onClick={() => setOpenId((previous) => (previous === item.id ? null : item.id))}
                className="w-full p-3.5 flex items-center justify-between gap-3 text-right cursor-pointer transition-colors"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-[#e9edff] text-[#001849] shrink-0 self-start sm:self-auto">
                      {item.category}
                    </span>
                    <span className="text-[13.5px] font-bold text-[#161b28] leading-snug">
                      {item.question}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[#444650] transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[#0056c5] bg-[#e9edff]' : 'bg-[#f2f3ff]'
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </button>

              {isOpen ? (
                <div
                  id={panelIdFor(item.id)}
                  role="region"
                  aria-labelledby={buttonIdFor(item.id)}
                  className="px-4 pb-3.5 pt-1 text-[13px] text-[#444650] leading-relaxed border-t border-[#f2f3ff]"
                >
                  <p className="bg-[#faf8ff] p-3 rounded-lg border border-[#e9edff]/60">
                    {item.answer}
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </PopupShell>
  )
}
