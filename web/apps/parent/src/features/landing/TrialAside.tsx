// The booking page's side column: what happens after the button, where the club is, and a
// way to ask before committing.
//
// **It is reassurance, not chrome.** The page it sits beside asks a stranger for a child's
// name, birthdate and a health declaration, and the three things a parent wants to know
// before typing any of that -- what arrives, what to bring, and whether it commits them to
// anything -- have no other home now that the wizard's welcome screen is gone.
//
// Beside the form from `md` up, stacked underneath it on a phone: one flow order, so a
// phone reads the form first and a desktop reads both at once.
import { CalendarCheck, MapPin, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** `0501112222` → `972501112222`, the same normalisation `BookingConfirmed` applies. */
function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d+]/g, '').replace(/^0/, '972')}`
}

export function TrialAside({
  locale,
  address,
  phone,
}: {
  locale: Locale
  /** From the landing payload; the "where" card is simply absent without one. */
  address?: string | null
  phone?: string | null
}) {
  const steps = [
    {
      icon: CalendarCheck,
      title: t(locale, 'people.bookTrial.aside.next1Title'),
      body: t(locale, 'people.bookTrial.aside.next1Body'),
    },
    {
      icon: Sparkles,
      title: t(locale, 'people.bookTrial.aside.next2Title'),
      body: t(locale, 'people.bookTrial.aside.next2Body'),
    },
    {
      icon: ShieldCheck,
      title: t(locale, 'people.bookTrial.aside.next3Title'),
      body: t(locale, 'people.bookTrial.aside.next3Body'),
    },
  ]

  return (
    <aside className="flex flex-col gap-3 md:sticky md:top-6" data-testid="trial-aside">
      <section
        aria-labelledby="trial-aside-next"
        className="rounded-2xl bg-white border border-[#dee2f4] shadow-xs p-4 flex flex-col gap-3"
      >
        <h2 className="text-[15px] font-bold text-[#001849]" id="trial-aside-next">
          {t(locale, 'people.bookTrial.aside.nextTitle')}
        </h2>
        <ol className="flex flex-col gap-3">
          {steps.map(({ icon: Icon, title, body }) => (
            <li className="flex items-start gap-2.5" key={title}>
              <span className="w-8 h-8 rounded-lg bg-[#e9edff] text-[#0056c5] flex items-center justify-center shrink-0">
                <Icon aria-hidden className="w-4 h-4" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-bold text-[#161b28]">{title}</span>
                <span className="text-[12.5px] text-[#444650] leading-relaxed">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {address ? (
        <section
          aria-labelledby="trial-aside-where"
          className="rounded-2xl bg-[#f2f3ff] border border-[#e9edff] p-4 flex flex-col gap-1.5"
        >
          <h2
            className="text-[15px] font-bold text-[#001849] flex items-center gap-1.5"
            id="trial-aside-where"
          >
            <MapPin aria-hidden className="w-4 h-4 text-[#0056c5]" />
            {t(locale, 'people.bookTrial.aside.whereTitle')}
          </h2>
          <p className="text-[13px] text-[#444650]">
            <bdi>{address}</bdi>
          </p>
        </section>
      ) : null}

      {phone ? (
        <section
          aria-labelledby="trial-aside-ask"
          className="rounded-2xl bg-white border border-[#dee2f4] shadow-xs p-4 flex flex-col gap-2"
        >
          <h2 className="text-[15px] font-bold text-[#001849]" id="trial-aside-ask">
            {t(locale, 'people.bookTrial.aside.askTitle')}
          </h2>
          <p className="text-[12.5px] text-[#444650] leading-relaxed">
            {t(locale, 'people.bookTrial.aside.askBody')}
          </p>
          <a
            className="mt-1 h-11 rounded-xl bg-[#e9edff] hover:bg-[#dae1ff] text-[#001849] text-[13.5px] font-bold flex items-center justify-center gap-2 transition-colors"
            data-testid="trial-aside-whatsapp"
            href={whatsappHref(phone)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle aria-hidden className="w-4 h-4" />
            {t(locale, 'people.bookTrial.aside.whatsapp')}
          </a>
        </section>
      ) : null}
    </aside>
  )
}
