// §3.12's four-step broadcast wizard — "the strongest single idea in the prototype".
//
// It replaces a flat composer where subject, body, audience and publish sat in one column,
// which is fine for the third message a manager sends and no help at all for the first.
// Four steps, in the prototype's own order: what kind of message · what it says · who gets
// it · how it goes and what they will see.
//
// **The preview is back, and this notes why.** A preview pane sat beside the old composer
// for one morning in August and the owner asked for it to be removed the same day. This is
// not that: that pane was permanent, took half the composer's width, and showed a preview
// of a message nobody had finished writing. This one IS the last step — a manager reaches
// it having written the thing, and what it answers is the question that step asks, "what
// will a parent actually see". §3.12 asks for it by name.
//
// D7 governs the channels: **push is the only live one.** WhatsApp and SMS are drawn and
// permanently disabled with בקרוב — legal under `inert-buttons.test.ts`, whose one exemption
// is an unconditionally disabled control, and honest in a way that hiding them is not: a
// manager who cannot see that SMS is coming assumes it never will be.
//
// Not ported, each already named in §3.12: the prototype's hardcoded audience counts (14
// for debt, 9 for missing health, 72 for judo, regardless of the roster) when
// `audience-preview` returns the true number; its "98.4% delivery" and "148 connected" KPI
// cards; and its scheduling step, which promises timing in its own subtitle and renders no
// date control at all.
import { useCallback, useMemo, useState } from 'react'
import { Button, SegmentedControl, Stepper, TextField } from '@studio/ui'
import type { StepperNode } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { truncateForLockScreen } from './AnnouncementsScreen'
import type { ScopeOption } from './AnnouncementsScreen'
import type { AnnouncementScope } from './dashboardCommsClient'

const STEPS = ['kind', 'content', 'audience', 'send'] as const
type StepId = (typeof STEPS)[number]

/**
 * The five templates the prototype offers. Each is a starting point a manager edits, not a
 * message the product sends on their behalf — every one lands in step 2's boxes and can be
 * rewritten to nothing.
 *
 * `blank` is first and is not a template: a manager who knows what they want to say should
 * not have to dismiss five suggestions to say it.
 */
export const TEMPLATE_KEYS = [
  'blank',
  'closure',
  'exam',
  'event',
  'payment',
  'welcome',
] as const

export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

/**
 * The tags a manager can drop into a body. They are substituted by the SERVER when the push
 * is built, per recipient — which is why they are inserted as literal text here and are not
 * previewed with a real name: showing "דנה" in the preview would promise a substitution this
 * screen cannot verify.
 */
export const TAG_KEYS = ['studentName', 'groupName', 'className', 'studioName'] as const

export function AnnouncementWizard({
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
}: {
  locale: Locale
  scopes: readonly ScopeOption[]
  canPublishStudioWide: boolean
  /** From `audience-preview`, or null while it is unknown for the chosen scope. */
  recipientCount: number | null
  scopeType: AnnouncementScope
  scopeId: string | null
  onScope: (type: AnnouncementScope, id: string | null) => void
  onSend: (title: string, body: string) => Promise<void>
  sending: boolean
  sent: boolean
}) {
  const [active, setActive] = useState<StepId>('kind')
  const [visited, setVisited] = useState<Set<StepId>>(new Set())
  const [template, setTemplate] = useState<TemplateKey | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const index = STEPS.indexOf(active)
  const audienceChosen = scopeType === 'studio' || scopeId !== null
  const written = title.trim() !== '' && body.trim() !== ''

  const advance = useCallback(() => {
    setVisited((current) => new Set(current).add(active))
    const next = STEPS[index + 1]
    if (next) setActive(next)
  }, [active, index])

  const nodes = useMemo<StepperNode[]>(
    () =>
      STEPS.map((id, at) => ({
        id,
        title: t(locale, `comms.wizard.step.${id}.title`),
        subtitle: t(locale, `comms.wizard.step.${id}.subtitle`),
        state: id === active ? 'current' : visited.has(id) ? 'done' : 'upcoming',
        // Every step is reachable: nothing here writes until the last one, so walking
        // backwards and forwards costs nothing and a locked rail would only be in the way.
        reachable: at === 0 || visited.has(STEPS[at - 1] as StepId) || visited.has(id),
      })),
    [active, locale, visited],
  )

  const pick = (key: TemplateKey) => {
    setTemplate(key)
    // `blank` writes NOTHING rather than writing emptiness. On the normal path the fields
    // are already empty, so it reads as "start from scratch"; on the way back from a
    // template it leaves the manager's own edits alone, which is the only behaviour of the
    // two that cannot destroy typing.
    if (key !== 'blank') {
      setTitle(t(locale, `comms.template.${key}.title`))
      setBody(t(locale, `comms.template.${key}.body`))
    }
    advance()
  }

  const insertTag = (tag: string) => {
    // Appended rather than inserted at the caret: a caret position is state this component
    // would have to track through every re-render, and appending is what a manager does
    // with these anyway — they are salutations and sign-offs, not mid-sentence words.
    setBody((current) => `${current}${current.endsWith(' ') || current === '' ? '' : ' '}${tag}`)
  }

  return (
    <section aria-labelledby="wizard-title" className="comms-wizard" data-testid="announcement-wizard">
      <h2 className="comms-wizard__title" id="wizard-title">
        {t(locale, 'comms.announcement.create')}
      </h2>

      <Stepper
        label={t(locale, 'comms.wizard.progress')}
        locale={locale}
        nodes={nodes}
        onPick={(id) => setActive(id as StepId)}
      />

      <div className="comms-wizard__body" data-testid={`wizard-step-${active}`}>
        {active === 'kind' ? (
          <>
            <p className="comms-wizard__lead">{t(locale, 'comms.wizard.kind.lead')}</p>
            <ul className="comms-templates" data-testid="wizard-templates">
              {TEMPLATE_KEYS.map((key) => (
                <li key={key}>
                  <button
                    aria-pressed={template === key}
                    className="comms-template"
                    data-testid={`template-${key}`}
                    onClick={() => pick(key)}
                    type="button"
                  >
                    <span className="comms-template__name">
                      {t(locale, `comms.template.${key}.name`)}
                    </span>
                    <span className="comms-template__hint">
                      {t(locale, `comms.template.${key}.hint`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {active === 'content' ? (
          <>
            <p className="comms-wizard__lead">{t(locale, 'comms.wizard.content.lead')}</p>
            <TextField
              data-testid="wizard-title"
              label={t(locale, 'comms.announcement.subject')}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
            <TextField
              data-testid="wizard-body"
              label={t(locale, 'comms.announcement.body')}
              multiline
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              value={body}
            />
            {/* The prototype's dynamic-tag pills. The SERVER substitutes these per
                recipient when it builds the push — which is why they go in as literal text
                and the preview below shows them literally too. */}
            <div className="comms-tags" data-testid="wizard-tags">
              <span className="comms-tags__label">{t(locale, 'comms.wizard.content.tags')}</span>
              {TAG_KEYS.map((key) => {
                const tag = t(locale, `comms.tag.${key}`)
                return (
                  <button
                    className="comms-tag"
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
          </>
        ) : null}

        {active === 'audience' ? (
          <>
            <p className="comms-wizard__lead">{t(locale, 'comms.wizard.audience.lead')}</p>
            {canPublishStudioWide ? null : (
              <p className="comms-wizard__note">{t(locale, 'comms.audience.limitedToOwnGroups')}</p>
            )}
            <SegmentedControl
              legend={t(locale, 'comms.audience.title')}
              onValueChange={(next) => onScope(next as AnnouncementScope, null)}
              options={[
                // A lead coach never sees the studio-wide option: §5.11's grant is "their
                // own groups", and offering a scope the API will refuse is a 403 discovered
                // after the message is written.
                ...(canPublishStudioWide
                  ? [
                      { value: 'studio', label: t(locale, 'comms.audience.studio') },
                      { value: 'class', label: t(locale, 'comms.audience.class') },
                    ]
                  : []),
                { value: 'group', label: t(locale, 'comms.audience.group') },
              ]}
              value={scopeType}
            />
            {scopeType === 'studio' ? null : (
              <div className="comms-wizard__scopes">
                {scopes
                  .filter((option) => option.type === scopeType)
                  .map((option) => (
                    <Button
                      key={option.id}
                      onClick={() => onScope(scopeType, option.id)}
                      variant={scopeId === option.id ? 'primary' : 'secondary'}
                    >
                      {option.name}
                    </Button>
                  ))}
              </div>
            )}
            {/* The real number, from `audience-preview`. The prototype hardcodes 14, 9 and
                72 regardless of the roster; this is the count the server computes. */}
            {audienceChosen && recipientCount !== null ? (
              <p className="comms-wizard__count" data-testid="audience-size">
                {fill(t(locale, 'comms.audience.recipients'), { count: recipientCount })}
              </p>
            ) : (
              <p className="comms-wizard__note" data-testid="audience-none">
                {t(locale, 'comms.audience.none')}
              </p>
            )}
          </>
        ) : null}

        {active === 'send' ? (
          <>
            <p className="comms-wizard__lead">{t(locale, 'comms.wizard.send.lead')}</p>

            {/* D7 — one live channel, and two stated futures. Permanently disabled, which
                is `inert-buttons.test.ts`'s one exemption, and honest in a way hiding them
                is not: a manager who cannot see that SMS is coming assumes it never will. */}
            <ul className="comms-channels" data-testid="wizard-channels">
              <li className="comms-channel" data-live="true" data-testid="channel-push">
                <span className="comms-channel__name">{t(locale, 'comms.channel.push')}</span>
                <span className="comms-channel__state">{t(locale, 'comms.channel.live')}</span>
              </li>
              {(['whatsapp', 'sms'] as const).map((channel) => (
                <li className="comms-channel" data-testid={`channel-${channel}`} key={channel}>
                  <span className="comms-channel__name">
                    {t(locale, `comms.channel.${channel}`)}
                  </span>
                  <span className="comms-channel__state">{t(locale, 'comms.channel.soon')}</span>
                </li>
              ))}
            </ul>

            {/* §3.12's live phone-notification preview — see the file header on why this
                is back. `truncateForLockScreen` is the SAME rule the server applies when it
                builds the push, so what this shows is what a lock screen shows. */}
            <div className="push-preview" data-testid="push-preview">
              <div className="push-preview__phone">
                <div className="push-preview__card">
                  <span className="push-preview__app">{t(locale, 'common.appName.parent')}</span>
                  <strong className="push-preview__title" data-testid="push-preview-title">
                    {truncateForLockScreen(title) || t(locale, 'comms.wizard.send.noTitle')}
                  </strong>
                  <span className="push-preview__body" data-testid="push-preview-body">
                    {truncateForLockScreen(body, 120) || t(locale, 'comms.wizard.send.noBody')}
                  </span>
                </div>
              </div>
              <p className="comms-wizard__note">{t(locale, 'comms.wizard.send.previewNote')}</p>
            </div>

            <Button
              data-testid="wizard-publish"
              disabled={!written || !audienceChosen || sending}
              onClick={() => void onSend(title, body)}
            >
              {t(locale, 'comms.announcement.publish')}
            </Button>
            {sent ? (
              <p className="comms-wizard__count" data-testid="announcement-sent">
                {t(locale, 'comms.announcement.published')}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <footer className="comms-wizard__foot">
        {index > 0 ? (
          <Button
            data-testid="wizard-back"
            onClick={() => {
              const previous = STEPS[index - 1]
              if (previous) setActive(previous)
            }}
            variant="ghost"
          >
            {t(locale, 'common.setup.back')}
          </Button>
        ) : null}
        {active !== 'send' && active !== 'kind' ? (
          <Button
            data-testid="wizard-next"
            // Step 2 needs something written before "next" means anything; step 3 needs an
            // audience. Neither WRITES, so neither is a point of no return.
            disabled={active === 'content' ? !written : !audienceChosen}
            onClick={advance}
            variant="secondary"
          >
            {t(locale, 'schedule.wizard.next')}
          </Button>
        ) : null}
        <span className="comms-wizard__count" data-testid="wizard-position">
          {fill(t(locale, 'schedule.wizard.stepOf'), { n: index + 1, total: STEPS.length })}
        </span>
      </footer>
    </section>
  )
}
