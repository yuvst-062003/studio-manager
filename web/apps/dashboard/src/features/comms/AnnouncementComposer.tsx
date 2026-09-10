// The composer — a side drawer with ready templates and free text.
//
// **Third shape, and the owner's own words for it:** *"when pressing write new msgs, a left
// popup opens up with ready template and free text"*, and *"no need to show who gets the
// msgs"*. So the four-step wizard is gone: no stepper, no audience step, no channel step.
// One panel — pick a template or write from scratch, choose when it goes, see what a parent
// will get, send.
//
// It slides from the INLINE-END edge, which is the left of a Hebrew screen and the right of
// an English one. "Left" is the owner describing the Hebrew screen they are looking at, and
// a physical `left` here would put it on the wrong side of the English one — D10's rule,
// and the same reason the student drawer sits on `inset-inline-end`.
//
// **The audience is not asked for, and this is what happens instead.** A message goes to
// the whole club. That is what "no need to show who gets the msgs" means for the person who
// asked — an owner, who can publish studio-wide. A lead coach cannot: §3.2 grants them
// their own groups only, and `scope_type: 'studio'` from them is a 403. So the picker
// survives for exactly that case and is invisible to everyone else, because the alternative
// is a coach whose every send fails with an error they cannot act on.
//
// **Why there is a send time here at all.** The feed beside this panel now has a מתוזמנות
// filter, because the owner asked to see timed messages there. A filter for a state nothing
// in the product can produce is the prototype's hardcoded-count mistake in another costume,
// and scheduling is real end to end: `AnnouncementIn.scheduled_for`, the
// `ix_announcement_studio_id_scheduled_for` index, and `publish_due` in `workers/notify.py`
// which fires every announcement whose moment has passed.
import { useState } from 'react'
import { Button, Icon, TextField, useModalDialog } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { truncateForLockScreen } from './AnnouncementsScreen'
import type { ScopeOption } from './AnnouncementsScreen'
import type { AnnouncementScope } from './dashboardCommsClient'

/**
 * The ready templates. Each is a starting point a manager edits, not a message the product
 * sends on their behalf — every one lands in the boxes below and can be rewritten to
 * nothing.
 *
 * `blank` is first and is not a template: a manager who knows what they want to say should
 * not have to dismiss five suggestions to say it.
 */
export const TEMPLATE_KEYS = ['blank', 'closure', 'exam', 'event', 'payment', 'welcome'] as const

export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

/**
 * The tags a manager can drop into a body. The SERVER substitutes them per recipient when
 * it builds the push — which is why they go in as literal text and the preview shows them
 * literally: rendering a real name here would promise a substitution this screen cannot
 * verify.
 */
export const TAG_KEYS = ['studentName', 'groupName', 'className', 'studioName'] as const

/**
 * `<input type="datetime-local">` yields local wall-clock text with no zone — `2026-09-12T18:30`.
 * The API takes an instant, so the browser's own parse (which reads that text as local time)
 * does the conversion. Anything unparseable returns null rather than `Invalid Date`, which
 * would otherwise reach the wire as `null` from `toISOString()` throwing.
 */
export function localInputToInstant(value: string): string | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function AnnouncementComposer({
  locale,
  scopes,
  canPublishStudioWide,
  recipientCount,
  scopeType,
  scopeId,
  onScope,
  onSend,
  sending,
  sent,
  onClose,
}: {
  locale: Locale
  scopes: readonly ScopeOption[]
  canPublishStudioWide: boolean
  /** From `audience-preview`, or null while it is unknown for the chosen scope. */
  recipientCount: number | null
  scopeType: AnnouncementScope
  scopeId: string | null
  onScope: (type: AnnouncementScope, id: string | null) => void
  /** `scheduledFor` is an ISO instant for a timed send, or null for "go now". */
  onSend: (title: string, body: string, scheduledFor: string | null) => Promise<void>
  sending: boolean
  sent: boolean
  onClose: () => void
}) {
  const [template, setTemplate] = useState<TemplateKey | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [timed, setTimed] = useState(false)
  const [when, setWhen] = useState('')
  // Answered when the moment CHANGES rather than on every render: "has this passed" reads
  // the clock, and a render that reads the clock is a render whose result depends on when
  // it happened to run.
  const [inThePast, setInThePast] = useState(false)
  // Rendered only while open, so the caller's conditional IS the open state. Traps Tab,
  // closes on Escape, and gives focus back to the button that opened it.
  const dialogRef = useModalDialog(true, onClose)

  const instant = timed ? localInputToInstant(when) : null
  const whenChosen = !timed || (instant !== null && !inThePast)
  const written = title.trim() !== '' && body.trim() !== ''
  const audienceChosen = scopeType === 'studio' || scopeId !== null

  const pick = (key: TemplateKey) => {
    setTemplate(key)
    // `blank` writes NOTHING rather than writing emptiness. On the normal path the fields
    // are already empty, so it reads as "start from scratch"; after a template it leaves
    // the manager's own edits alone, which is the only behaviour of the two that cannot
    // destroy typing.
    if (key !== 'blank') {
      setTitle(t(locale, `comms.template.${key}.title`))
      setBody(t(locale, `comms.template.${key}.body`))
    }
  }

  const insertTag = (tag: string) => {
    // Appended rather than inserted at the caret: a caret position is state this component
    // would have to track through every re-render, and appending is what a manager does
    // with these anyway — they are salutations and sign-offs, not mid-sentence words.
    setBody((current) => `${current}${current.endsWith(' ') || current === '' ? '' : ' '}${tag}`)
  }

  return (
    <div className="composer__scrim" data-testid="composer-scrim" onClick={onClose}>
      <section
        aria-labelledby="composer-title"
        aria-modal="true"
        className="composer"
        data-testid="announcement-composer"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="composer__head">
          <span aria-hidden="true" className="composer__mark">
            <Icon name="messages" size={20} />
          </span>
          <div className="composer__heading">
            <h2 className="composer__title" id="composer-title">
              {t(locale, 'comms.composer.title')}
            </h2>
            <p className="composer__lead">{t(locale, 'comms.composer.lead')}</p>
          </div>
          <button
            aria-label={t(locale, 'common.a11y.close')}
            className="composer__close"
            data-testid="composer-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="composer__body">
          {/* ── ready templates ─────────────────────────────────────────────────────── */}
          <section aria-labelledby="composer-templates-title">
            <h3 className="composer__section" id="composer-templates-title">
              {t(locale, 'comms.composer.templates')}
            </h3>
            <ul className="composer__templates" data-testid="composer-templates">
              {TEMPLATE_KEYS.map((key) => (
                <li key={key}>
                  <button
                    aria-pressed={template === key}
                    className="composer__template"
                    data-testid={`template-${key}`}
                    onClick={() => pick(key)}
                    type="button"
                  >
                    <span className="composer__template-text">
                      <span className="composer__template-name">
                        {t(locale, `comms.template.${key}.name`)}
                      </span>
                      {/* The template's own words, not a description of them: what a
                          manager needs in order to choose between six is what each SAYS.
                          A blank one has nothing to preview, so it keeps its description. */}
                      <span className="composer__template-hint">
                        {key === 'blank'
                          ? t(locale, 'comms.template.blank.hint')
                          : t(locale, `comms.template.${key}.body`)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* ── free text ───────────────────────────────────────────────────────────── */}
          <section aria-labelledby="composer-write-title">
            <h3 className="composer__section" id="composer-write-title">
              {t(locale, 'comms.composer.write')}
            </h3>
            <TextField
              data-testid="composer-title-field"
              label={t(locale, 'comms.announcement.subject')}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
            <TextField
              data-testid="composer-body-field"
              label={t(locale, 'comms.announcement.body')}
              multiline
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              value={body}
            />
            <div className="composer__tags" data-testid="composer-tags">
              <span className="composer__tags-label">{t(locale, 'comms.composer.tags')}</span>
              {TAG_KEYS.map((key) => {
                const tag = t(locale, `comms.tag.${key}`)
                return (
                  <button
                    className="composer__tag"
                    data-testid={`tag-${key}`}
                    key={key}
                    onClick={() => insertTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── when it goes ────────────────────────────────────────────────────────── */}
          <section aria-labelledby="composer-when-title" data-testid="composer-when">
            <h3 className="composer__section" id="composer-when-title">
              {t(locale, 'comms.composer.when')}
            </h3>
            <div className="composer__when">
              <button
                aria-pressed={!timed}
                className="composer__choice"
                data-testid="composer-send-now"
                onClick={() => setTimed(false)}
                type="button"
              >
                <Icon name="messages" size={15} />
                {t(locale, 'comms.composer.sendNow')}
              </button>
              <button
                aria-pressed={timed}
                className="composer__choice"
                data-testid="composer-send-later"
                onClick={() => setTimed(true)}
                type="button"
              >
                <Icon name="clock" size={15} />
                {t(locale, 'comms.composer.sendLater')}
              </button>
            </div>
            {timed ? (
              <TextField
                data-testid="composer-when-field"
                // The past is refused rather than silently corrected, and the field says
                // why: a disabled send button with no explanation is a dead end.
                error={inThePast ? t(locale, 'comms.composer.pastTime') : undefined}
                hint={t(locale, 'comms.composer.whenHint')}
                label={t(locale, 'comms.announcement.schedule')}
                onChange={(event) => {
                  const value = event.target.value
                  setWhen(value)
                  // A moment that has already passed is not a schedule — `publish_due`
                  // would fire it on its next sweep, so the manager would have picked next
                  // Tuesday and got "now". Refusing costs one correction; accepting it
                  // sends the message.
                  const picked = localInputToInstant(value)
                  setInThePast(picked !== null && new Date(picked).getTime() <= Date.now())
                }}
                type="datetime-local"
                value={when}
              />
            ) : null}
          </section>

          {/* ── who, only when the sender is not allowed the whole club ──────────────── */}
          {canPublishStudioWide ? null : (
            <section aria-labelledby="composer-audience-title" data-testid="composer-audience">
              <h3 className="composer__section" id="composer-audience-title">
                {t(locale, 'comms.audience.title')}
              </h3>
              <p className="composer__note">{t(locale, 'comms.audience.limitedToOwnGroups')}</p>
              <div className="composer__scopes">
                {scopes
                  .filter((option) => option.type === 'group')
                  .map((option) => (
                    <Button
                      key={option.id}
                      onClick={() => onScope('group', option.id)}
                      variant={scopeId === option.id ? 'primary' : 'secondary'}
                    >
                      {option.name}
                    </Button>
                  ))}
              </div>
            </section>
          )}

          {/* ── what a parent will actually get ──────────────────────────────────────── */}
          <section aria-labelledby="composer-preview-title">
            <h3 className="composer__section" id="composer-preview-title">
              {t(locale, 'comms.composer.preview')}
            </h3>
            <div className="push-preview" data-testid="push-preview">
              <div className="push-preview__phone">
                {/* The status bar is what tells a manager at a glance that they are looking
                    at a LOCK SCREEN rather than at another panel of this app. The clock is
                    a fixed sample and not the real time — a live clock here would be a
                    detail that redraws every minute and means nothing. */}
                <div aria-hidden="true" className="push-preview__status" dir="ltr">
                  <span>12:45</span>
                  <span>▮▮▮</span>
                </div>
                <div className="push-preview__card">
                  <span className="push-preview__app">
                    <span className="push-preview__app-name">
                      <span aria-hidden="true" className="push-preview__icon">
                        G
                      </span>
                      {t(locale, 'common.appName.parent')}
                    </span>
                    <span>{t(locale, 'comms.composer.now')}</span>
                  </span>
                  <strong className="push-preview__title" data-testid="push-preview-title">
                    {truncateForLockScreen(title) || t(locale, 'comms.composer.noTitle')}
                  </strong>
                  <span className="push-preview__body" data-testid="push-preview-body">
                    {truncateForLockScreen(body, 120) || t(locale, 'comms.composer.noBody')}
                  </span>
                </div>
              </div>
              <p className="composer__note">{t(locale, 'comms.composer.previewNote')}</p>
            </div>
            {/* D7 — push is the only live channel. One line rather than a step of its own:
                it is a fact about the product, not a choice the manager makes. */}
            <p className="composer__note" data-testid="composer-channels">
              {t(locale, 'comms.composer.channelNote')}
            </p>
          </section>
        </div>

        <footer className="composer__foot">
          <Button data-testid="composer-cancel" onClick={onClose} variant="ghost">
            {t(locale, 'common.cancel')}
          </Button>
          {sent ? (
            <span className="composer__sent" data-testid="announcement-sent">
              {t(locale, timed ? 'comms.composer.scheduled' : 'comms.announcement.published')}
            </span>
          ) : null}
          {/* The button says what it is about to DO and to how many people. "Broadcast now
              (24 recipients)" is a different promise from "Send", and it is the one a
              manager should be reading before they press it — which is also how the count
              stays on screen without a step asking them to choose an audience. A timed send
              says the other thing, because it is not going anywhere yet. */}
          <Button
            data-testid="composer-send"
            disabled={!written || !audienceChosen || !whenChosen || sending}
            onClick={() => void onSend(title, body, instant)}
          >
            {timed
              ? t(locale, 'comms.composer.scheduleAction')
              : recipientCount === null
                ? t(locale, 'comms.announcement.publish')
                : fill(t(locale, 'comms.composer.publishToCount'), { count: recipientCount })}
          </Button>
        </footer>
      </section>
    </div>
  )
}
