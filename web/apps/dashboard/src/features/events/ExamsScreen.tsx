// Artboard 6b — מבחני חגורה, the exam roundup and the form that creates one.
//
// **An exam roundup is a filtered event list, not a second list.** §5.9 makes a belt exam
// an `event` with `type='belt_exam'`, so this asks `/events?type=belt_exam` and renders the
// same card `7a` does. A parallel endpoint would be a second place for an exam to exist.
//
// **Finding 4, kept.** 6b's draft treatment says *why* the draft is incomplete where 7a
// says only טיוטה — the better of the two — and neither artboard draws
// `events.status.draftHint`, which names the consequence. Both ship here.
//
// **Finding 2, fixed.** The canvas's create panel is pre-filled with the highlighted exam's
// values while titled "new exam". It opens blank.
//
// **Finding 1, refused.** The panel makes eligibility configurable on three axes §5.9 does
// not have: a minimum attendance percentage, a block on debt or a missing document, and an
// exam fee tied to a catalogue item. None has a column; 6b's own audit says the decision
// belonged in the W4 contract commit, and it did not make it. The form has none of the three.
//
// **The type is not a choice here.** Everything created on this screen is a `belt_exam`,
// because the server refuses `POST /events/{id}/exam-results` on anything else — a
// mistyped exam would be a screen full of candidates and no way to grade them.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EventDateBadge } from './EventDateBadge'
import { splitByTime } from './EventsScreen'
import type { DashboardEventsClient, EventOut } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }

const rowStyle: CSSProperties = { display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  flex: '1 1 auto',
  minInlineSize: 0,
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const draftStyle: CSSProperties = { ...hintStyle, color: 'var(--pending)' }

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

export function ExamsScreen({
  client,
  locale,
  now,
  onOpen,
}: {
  client: DashboardEventsClient
  locale: Locale
  now: string
  onOpen: (eventId: string) => void
}) {
  const [exams, setExams] = useState<EventOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    client
      .list('belt_exam')
      .then((page) => {
        if (!live) return
        setExams(page.items)
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [client, reloadKey])

  const create = async () => {
    if (!title.trim() || !startsAt) return
    await client.create({
      type: 'belt_exam',
      title: title.trim(),
      description: null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: null,
      location_id: null,
      location_text: null,
      rsvp_deadline: null,
      fee_agorot: null,
      requires_consent: false,
      consent_text: null,
      targets: [],
    })
    // Blank again, so the next open is not pre-filled with what was just created — the
    // same failure 6b finding 2 names, one step later.
    setTitle('')
    setStartsAt('')
    setDrafting(false)
    setReloadKey((key) => key + 1)
  }

  // 6b draws אירועים קרובים and אירועים שהסתיימו as two sections. Split on the START, the
  // same rule 7a uses: `completed` is a status nothing currently sets, so trusting it would
  // file every finished exam under upcoming forever.
  const { upcoming, past } = splitByTime(exams, now)

  const section = (label: string, rows: EventOut[]) =>
    rows.length === 0 ? null : (
      <section style={listStyle}>
        <p style={hintStyle}>{label}</p>
        {rows.map((row) => (
          <Card key={row.id}>
            <article aria-label={row.title} style={rowStyle}>
              <EventDateBadge startsAt={row.starts_at} />
              <div style={bodyStyle}>
                <h3 style={titleStyle}>{row.title}</h3>
                <p style={hintStyle}>
                  {row.location_text} · {t(locale, 'events.exam.candidates')}{' '}
                  {row.rsvp_pending_count + row.rsvp_yes_count}
                </p>
                {row.status === 'draft' ? (
                  <>
                    {/* 6b's copy, which says why — better than 7a's bare טיוטה. */}
                    <p style={draftStyle}>{t(locale, 'events.status.draftWhy')}</p>
                    {/* And the consequence, which neither artboard draws. */}
                    <p style={draftStyle}>{t(locale, 'events.status.draftHint')}</p>
                  </>
                ) : null}
                <p style={{ margin: 0 }}>
                  <Button onClick={() => onOpen(row.id)} variant="secondary">
                    {t(locale, 'events.exam.eligibility')}
                  </Button>
                </p>
              </div>
            </article>
          </Card>
        ))}
      </section>
    )

  return (
    <div style={pageStyle}>
      <header>
        <h2 style={{ margin: 0 }}>{t(locale, 'events.exam.plural')}</h2>
        <p style={hintStyle}>{t(locale, 'events.exam.eligibleHint')}</p>
      </header>

      {loaded && exams.length === 0 ? (
        <EmptyState title={t(locale, 'events.exam.empty')} />
      ) : (
        <>
          {section(t(locale, 'events.list.upcoming'), upcoming)}
          {section(t(locale, 'events.list.past'), past)}
        </>
      )}

      {drafting ? (
        <Card>
          <div style={formStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'events.exam.new')}</h3>
            <TextField
              label={t(locale, 'events.form.name')}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
            <TextField
              label={t(locale, 'events.form.startsAt')}
              onChange={(e) => setStartsAt(e.target.value)}
              type="datetime-local"
              value={startsAt}
            />
            <p style={hintStyle}>{t(locale, 'events.exam.eligibleHint')}</p>
            <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button onClick={() => void create()} variant="primary">
                {t(locale, 'events.form.save')}
              </Button>
              <Button onClick={() => setDrafting(false)} variant="secondary">
                {t(locale, 'events.form.cancel')}
              </Button>
            </span>
          </div>
        </Card>
      ) : (
        <p style={{ margin: 0 }}>
          <Button onClick={() => setDrafting(true)} variant="primary">
            {t(locale, 'events.exam.new')}
          </Button>
        </p>
      )}
    </div>
  )
}
