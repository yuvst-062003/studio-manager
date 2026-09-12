// §5.4(a) — הוספת חניכים. One family at a time.
//
// **What this replaced, and why (owner review, 2026-09-12/13).** It was student-first and
// three fields wide: full name · 18 ומעלה? · guardian email · guardian phone, submitted
// straight to `POST /students`. Three things were wrong with it:
//
//   1. **The phone could not be used.** There is no SMS integration and none is planned,
//      so the field asked a manager for a number the product cannot send to. Removed.
//   2. **It could only add one child.** A parent with two children meant filling the same
//      form twice with the same email and hoping the server joined them — it does
//      (`pending_guardian` matches an unbound Person), but the manager had no way to see
//      that it would. Now the screen holds a roster, the way the parent's own wizard does.
//   3. **It created on the first press.** The last button issues real students and real
//      invitation links, which is hard to undo; there is a read-only summary in front of
//      it now.
//
// **The email belongs to the TRAINEE, not to the screen.** Every trainee has exactly one
// account that signs in for them: a parent's while they are a minor, their own from 18 —
// because from 18 they are also the one signing the health declaration. A single family
// email at the top of the screen was the first draft of this, and it was wrong for the
// commonest mixed household in a judo club: a nine-year-old and a nineteen-year-old. The
// field lives in the trainee's own sheet, directly under the age that decides its label,
// and pre-fills from the trainee before them so siblings still cost one typing.
//
// **Age, not a boolean.** `18 ומעלה?` threw away something the manager knows. An age
// decides minor/adult by itself, relabels the email field, and reads back on the card. The
// exact birthdate is still the user's to confirm in the join wizard — inventing one from an
// age would put a wrong date in a medical record.
//
// **The visual language is the parent wizard's, in the dashboard's own colours.** The
// numbered step strip, the icon tiles, the chips and the full-cover sheet come from §5.4b's
// wizard, which is what the owner asked this screen to look like. The hue does not: this
// app runs `data-surface="studio-os"`, and painting one screen in the parent app's navy
// would put a different product in the middle of the dashboard.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Icon } from '@studio/ui'
import type { IconName } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { CopyButton } from './SharingCards'
import { ImportStudentsPanel } from './ImportStudentsPanel'
import type { DashboardPeopleClient, GroupOption } from './peopleClient'

/** The three arrangements a human settles, and the only ones offerable here.
 *
 *  The card is absent on purpose: it is the one method that arrives without a person —
 *  uPay's IPN closes its own charge — so there is nothing for a manager to mark, and a
 *  card payment typed in by hand is one the club could never reconcile against its
 *  merchant account. `POST /students/{id}/convert` refuses `upay_card` with a 422. */
type PaidBy = 'cash' | 'cheque' | 'standing_order'

type Trainee = {
  /** Local only. The server's id does not exist until the last button. */
  key: string
  name: string
  age: string
  email: string
  beltRankId: string
  groupId: string
  planId: string
  paidBy: PaidBy | ''
}

type Outcome = {
  key: string
  name: string
  email: string
  studentId: string | null
  invitationUrl: string | null
  /** What did not land for this trainee, if anything. The student may exist while the
   *  conversion failed — saying so is better than a green tick over a half-written row. */
  problem: 'create' | 'convert' | 'belt' | null
}

const ADULT_AGE = 18
const isAdultAge = (age: string) => Number(age) >= ADULT_AGE

function emptyTrainee(key: string, email: string): Trainee {
  return { key, name: '', age: '', email, beltRankId: '', groupId: '', planId: '', paidBy: '' }
}

/** Splits a typed full name on the FIRST whitespace — everything after it is the last
 *  name, so a middle or additional surname stays together ("יעל בת כהן" → "יעל" ·
 *  "בת כהן"). A single word is legal (a mononym, or simply a name typed without a space):
 *  `StudentCreate.last_name` requires at least one character, so a lone space is used
 *  rather than inventing a second name the manager never typed. */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim()
  const boundary = trimmed.search(/\s/)
  if (boundary === -1) return { first_name: trimmed, last_name: ' ' }
  return {
    first_name: trimmed.slice(0, boundary),
    last_name: trimmed.slice(boundary + 1).trim() || ' ',
  }
}

const today = () => new Date().toISOString().slice(0, 10)

// ── styles ──────────────────────────────────────────────────────────────────────────
// Inline objects rather than a stylesheet, for the reason the rest of this app already
// gives: the dashboard ports its screens without Tailwind, and every value below is a
// token from `packages/ui/src/tokens.css` so `data-surface="studio-os"` and dark mode both
// come out right without this file naming a single colour of its own.
const column: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }
const card: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: '11px',
  padding: 'var(--space-4)',
}
const rowBetween: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
}
const chipBase: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '999px',
  border: '1px solid transparent',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
}
const metaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
  fontSize: '12px',
  color: 'var(--text-secondary)',
}
const tile: CSSProperties = {
  inlineSize: '44px',
  blockSize: '44px',
  borderRadius: '10px',
  background: 'var(--emphasis-tint)',
  color: 'var(--accent)',
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
}
const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBlockEnd: '4px',
}
const control: CSSProperties = {
  inlineSize: '100%',
  font: 'inherit',
  fontSize: '14px',
  color: 'var(--fg)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-strong)',
  borderRadius: '2px',
  padding: '10px 12px',
  minBlockSize: '44px',
}
const hint: CSSProperties = { margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }
const ghostButton: CSSProperties = {
  inlineSize: '32px',
  blockSize: '32px',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid transparent',
  borderRadius: '6px',
  background: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

function Chip({ tone, icon, children }: { tone: 'neutral' | 'paid' | 'pending'; icon?: IconName; children: React.ReactNode }) {
  const tones: Record<string, CSSProperties> = {
    neutral: { background: 'var(--ground)', color: 'var(--text-secondary)', borderColor: 'var(--border)' },
    paid: { background: 'var(--paid-tint)', color: 'var(--paid)', borderColor: 'var(--paid)' },
    pending: { background: 'var(--pending-tint)', color: 'var(--pending)', borderColor: 'var(--pending)' },
  }
  return (
    <span style={{ ...chipBase, ...tones[tone] }}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  )
}

/** The numbered strip from §5.4b's wizard. Two steps, because this screen has two — and
 *  the count is drawn rather than written, so it cannot drift from the view being shown. */
function StepStrip({ locale, current }: { locale: Locale; current: 1 | 2 }) {
  const steps = [
    { n: 1 as const, title: t(locale, 'people.addStudents.step1'), note: t(locale, 'people.addStudents.step1Note') },
    { n: 2 as const, title: t(locale, 'people.addStudents.step2'), note: t(locale, 'people.addStudents.step2Note') },
  ]
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={rowBetween}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--fg)' }}>
            {t(locale, 'people.addStudents.title')}
          </h1>
          <p style={{ ...hint, marginBlockStart: '2px' }}>{t(locale, 'people.addStudents.lead')}</p>
        </div>
        <span
          data-testid="add-students-step-of"
          style={{ ...chipBase, background: 'var(--ground)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          {t(locale, 'people.addStudents.stepOf').replace('{n}', String(current))}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: 'var(--space-2)' }}>
        {steps.map((step) => {
          const active = step.n === current
          const done = step.n < current
          return (
            <div
              key={step.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '10px 12px',
                borderRadius: '10px',
                background: active ? 'var(--emphasis)' : 'var(--emphasis-tint)',
                color: active ? 'var(--on-emphasis)' : 'var(--accent)',
                border: active ? '1px solid transparent' : '1px solid var(--border)',
              }}
            >
              <span
                aria-hidden
                style={{
                  inlineSize: '24px',
                  blockSize: '24px',
                  borderRadius: '999px',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  flex: 'none',
                  background: active ? 'var(--surface-raised)' : 'transparent',
                  color: active ? 'var(--accent)' : 'inherit',
                  border: active ? 'none' : '1px solid currentColor',
                }}
              >
                {done ? <Icon name="check" size={14} /> : step.n}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{step.title}</span>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>{step.note}</span>
              </span>
            </div>
          )
        })}
      </div>

      <div
        aria-hidden
        style={{ blockSize: '6px', borderRadius: '999px', background: 'var(--ground)', overflow: 'hidden' }}
      >
        <div style={{ blockSize: '100%', inlineSize: `${current * 50}%`, background: 'var(--emphasis)' }} />
      </div>
    </div>
  )
}

export function AddStudentScreen({
  locale,
  client,
  onCreated,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onCreated?: () => void
}) {
  const [view, setView] = useState<'form' | 'review' | 'done'>('form')
  const [trainees, setTrainees] = useState<Trainee[]>([])
  const [sheet, setSheet] = useState<{ index: number | null; draft: Trainee } | null>(null)
  const [groups, setGroups] = useState<readonly GroupOption[]>([])
  const [plans, setPlans] = useState<readonly { id: string; name: string; monthly_amount_agorot: number; active_to: string | null }[]>([])
  //: Keyed by class rather than held as one list, so choosing a group never has to CLEAR
  //: the previous class's ladder — clearing is a synchronous setState inside an effect,
  //: which is the cascading-render the lint rule exists to stop, and a cache answers the
  //: same question without one.
  const [beltsByClass, setBeltsByClass] = useState<Record<string, readonly { id: string; name: string }[]>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [outcomes, setOutcomes] = useState<readonly Outcome[]>([])
  const [emailConfigured, setEmailConfigured] = useState<boolean | undefined>(undefined)
  const [nextKey, setNextKey] = useState(1)

  useEffect(() => {
    let alive = true
    void client
      .groups()
      .then((page) => alive && setGroups(page.items))
      .catch(() => alive && setGroups([]))
    void client
      .pricePlans()
      //: Closed plans are last year's price and must never be offered to a child joining
      //: today — the same filter the convert step on the student's own card applies.
      .then((page) => alive && setPlans(page.items.filter((plan) => plan.active_to === null)))
      .catch(() => alive && setPlans([]))
    return () => {
      alive = false
    }
  }, [client])

  //: §5.9's ladder hangs off the CLASS, not off the group, so the belt list can only be
  //: loaded once a group is chosen — and it is reloaded when the chosen group changes
  //: class, because two classes may run two different ladders.
  const sheetGroupId = sheet?.draft.groupId ?? ''
  const sheetClassId = groups.find((row) => row.id === sheetGroupId)?.class_id ?? null

  useEffect(() => {
    if (!sheetClassId || beltsByClass[sheetClassId]) return
    let alive = true
    const remember = (items: readonly { id: string; name: string }[]) => {
      if (alive) setBeltsByClass((current) => ({ ...current, [sheetClassId]: items }))
    }
    void client
      .beltRanks(sheetClassId)
      .then((page) => remember(page.items))
      //: An empty ladder is remembered too. A club that has not set one up must not make
      //: this screen ask for it again on every keystroke.
      .catch(() => remember([]))
    return () => {
      alive = false
    }
  }, [client, sheetClassId, beltsByClass])

  const belts = sheetClassId ? (beltsByClass[sheetClassId] ?? []) : []

  const groupName = (id: string) =>
    groups.find((row) => row.id === id)?.name ?? t(locale, 'people.addStudents.noGroup')
  const plan = (id: string) => plans.find((row) => row.id === id)
  const beltName = (id: string) => belts.find((row) => row.id === id)?.name ?? ''

  /** The trainees grouped by the address that will receive their link. One family of three
   *  minors is one group and one link; the nineteen-year-old beside them is their own. */
  const recipients = useMemo(() => {
    const out: { email: string; members: Trainee[] }[] = []
    trainees.forEach((trainee) => {
      const found = out.find((row) => row.email === trainee.email)
      if (found) found.members.push(trainee)
      else out.push({ email: trainee.email, members: [trainee] })
    })
    return out
  }, [trainees])

  const ready = trainees.length > 0 && trainees.every((row) => row.email.includes('@'))
  const lastEmail = trainees.filter((row) => row.email).at(-1)?.email ?? ''

  const openAdd = () => {
    setSheet({ index: null, draft: emptyTrainee(`t${nextKey}`, lastEmail) })
    setNextKey((n) => n + 1)
  }

  const saveSheet = () => {
    if (!sheet) return
    const draft = sheet.draft
    setTrainees((current) =>
      sheet.index === null
        ? [...current, draft]
        : current.map((row, index) => (index === sheet.index ? draft : row)),
    )
    setSheet(null)
  }

  /**
   * The one write, at the end.
   *
   * Three calls per trainee, in this order and for this reason:
   *
   *   1. `POST /students` — **without** the group. Creating with a group enrols them, and
   *      `convert` would then refuse with `already enrolled`; the conversion is what sets
   *      the price and records the payment, so it has to be the call that names the group.
   *   2. `convert` — only when a group was chosen. A trainee with no group stays a lead
   *      with no enrolment, which is exactly what "טרם שויך" means.
   *   3. the belt — only when one was chosen, dated today with a note, because a belt a
   *      child already holds is a fact the club learned today rather than an exam it ran.
   *
   * Partial failure is REPORTED, never swallowed: a family whose second child failed to
   * convert must not be shown one green tick over the pair. Each trainee carries its own
   * problem, and the done screen names it.
   */
  const create = async () => {
    setBusy(true)
    setFailed(false)
    const results: Outcome[] = []
    try {
      for (const trainee of trainees) {
        const { first_name, last_name } = splitFullName(trainee.name)
        const adult = isAdultAge(trainee.age)
        const outcome: Outcome = {
          key: trainee.key,
          name: trainee.name,
          email: trainee.email,
          studentId: null,
          invitationUrl: null,
          problem: null,
        }
        results.push(outcome)

        const response = await client.createStudent({
          first_name,
          last_name,
          birthdate: null,
          guardian: adult
            ? //: "18 ומעלה means self-guarding: the student IS the guardian and the email
              //: is theirs." Their own split name is reused rather than asked twice — and
              //: this branch is what stops an adult becoming two Person rows.
              { first_name, last_name, email: trainee.email, relation: 'self' }
            : //: `GuardianCreate` accepts an email with no names, which is this form's whole
              //: bargain: the manager types almost nothing and the parent fills the rest in
              //: the wizard they land in.
              { email: trainee.email, relation: 'parent' },
        })
        if (!response.ok) {
          outcome.problem = 'create'
          continue
        }
        const body = (await response.json()) as {
          student?: { id?: string }
          invitation_url?: string | null
          invitation_token?: string | null
          invitation_email_configured?: boolean
        }
        outcome.studentId = body.student?.id ?? null
        outcome.invitationUrl = body.invitation_url ?? body.invitation_token ?? null
        if (body.invitation_email_configured !== undefined) {
          setEmailConfigured(body.invitation_email_configured)
        }

        if (outcome.studentId && trainee.groupId) {
          const converted = await client.convert(outcome.studentId, {
            group_id: trainee.groupId,
            started_on: today(),
            price_plan_id: trainee.planId || null,
            payment_received: trainee.paidBy || null,
          })
          if (!converted.ok) outcome.problem = 'convert'
        }

        if (outcome.studentId && trainee.beltRankId && outcome.problem === null) {
          const awarded = await client.awardBelt(outcome.studentId, {
            belt_rank_id: trainee.beltRankId,
            awarded_on: today(),
            note: t('he', 'people.addStudents.beltNote'),
          })
          if (!awarded.ok) outcome.problem = 'belt'
        }
      }
      setOutcomes(results)
      setView('done')
      onCreated?.()
    } catch {
      setOutcomes(results)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // ── the trainee sheet ─────────────────────────────────────────────────────────────
  const sheetView = () => {
    if (!sheet) return null
    const draft = sheet.draft
    const set = (patch: Partial<Trainee>) =>
      setSheet((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current))
    const adult = isAdultAge(draft.age)

    return (
      <div
        data-testid="trainee-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={
          sheet.index === null
            ? t(locale, 'people.addStudents.sheetAdd')
            : t(locale, 'people.addStudents.sheetEdit')
        }
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'var(--scrim)',
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-3)',
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSheet(null)
        }}
      >
        <div
          style={{
            ...card,
            inlineSize: 'min(560px, 100%)',
            maxBlockSize: '100%',
            overflowY: 'auto',
            padding: 0,
          }}
        >
          <div
            style={{
              ...rowBetween,
              padding: 'var(--space-3) var(--space-4)',
              borderBlockEnd: '1px solid var(--border)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ ...tile, inlineSize: '36px', blockSize: '36px' }}>
                <Icon name="martialArts" size={18} />
              </span>
              <strong style={{ fontSize: '16px' }}>
                {sheet.index === null
                  ? t(locale, 'people.addStudents.sheetAdd')
                  : t(locale, 'people.addStudents.sheetEdit')}
              </strong>
            </span>
            <button
              type="button"
              data-testid="trainee-cancel"
              aria-label={t(locale, 'people.addStudents.cancel')}
              style={ghostButton}
              onClick={() => setSheet(null)}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <div style={{ ...column, padding: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 7rem', gap: 'var(--space-3)' }}>
              <div>
                <label style={fieldLabel} htmlFor="trainee-name">
                  {t(locale, 'people.student.fullName')}
                </label>
                <input
                  id="trainee-name"
                  data-testid="trainee-name"
                  style={control}
                  value={draft.name}
                  onChange={(event) => set({ name: event.target.value })}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="trainee-age">
                  {t(locale, 'people.addStudents.age')}
                </label>
                <input
                  id="trainee-age"
                  data-testid="trainee-age"
                  type="number"
                  min={3}
                  max={99}
                  style={control}
                  value={draft.age}
                  onChange={(event) => set({ age: event.target.value })}
                />
              </div>
            </div>
            <p style={{ ...hint, marginBlockStart: '-8px' }}>{t(locale, 'people.addStudents.ageHint')}</p>

            <div>
              <label style={fieldLabel} htmlFor="trainee-email">
                {/* The age relabels this the moment it crosses 18 — that is the moment the
                    question changes from "who is your parent" to "what is your address". */}
                <span data-testid="trainee-email-label">
                  {adult
                    ? t(locale, 'people.addStudents.emailSelf')
                    : t(locale, 'people.addStudents.emailParent')}
                </span>
              </label>
              <input
                id="trainee-email"
                data-testid="trainee-email"
                type="email"
                dir="ltr"
                style={control}
                value={draft.email}
                onChange={(event) => set({ email: event.target.value })}
              />
              <p style={hint} data-testid="trainee-email-hint">
                {adult
                  ? t(locale, 'people.addStudents.emailSelfHint')
                  : t(locale, 'people.addStudents.emailParentHint')}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--space-3)' }}>
              <div>
                <label style={fieldLabel} htmlFor="trainee-group">
                  {t(locale, 'people.student.group')}
                </label>
                <select
                  id="trainee-group"
                  data-testid="trainee-group"
                  style={control}
                  value={draft.groupId}
                  onChange={(event) => set({ groupId: event.target.value, beltRankId: '' })}
                >
                  <option value="">{t(locale, 'people.addStudents.noGroup')}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="trainee-belt">
                  {t(locale, 'people.addStudents.belt')}
                </label>
                <select
                  id="trainee-belt"
                  data-testid="trainee-belt"
                  style={control}
                  value={draft.beltRankId}
                  disabled={belts.length === 0}
                  onChange={(event) => set({ beltRankId: event.target.value })}
                >
                  <option value="">{t(locale, 'people.addStudents.beltNone')}</option>
                  {belts.map((belt) => (
                    <option key={belt.id} value={belt.id}>
                      {belt.name}
                    </option>
                  ))}
                </select>
                {belts.length === 0 ? (
                  //: The ladder belongs to the class, and a group is what names one. Said
                  //: plainly rather than offering an empty picker.
                  <p style={hint}>{t(locale, 'people.addStudents.beltNeedsGroup')}</p>
                ) : null}
              </div>
            </div>

            <div>
              <label style={fieldLabel} htmlFor="trainee-plan">
                {t(locale, 'people.convert.plan')}
              </label>
              <select
                id="trainee-plan"
                data-testid="trainee-plan"
                style={control}
                value={draft.planId}
                disabled={!draft.groupId}
                onChange={(event) => set({ planId: event.target.value })}
              >
                <option value="">{t(locale, 'people.convert.planNone')}</option>
                {plans.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · ₪{Math.round(row.monthly_amount_agorot / 100)}
                  </option>
                ))}
              </select>
              {!draft.groupId ? <p style={hint}>{t(locale, 'people.addStudents.planNeedsGroup')}</p> : null}
            </div>

            {/* Money already in hand is the one fact on this sheet with a consequence
                outside it — it makes the family's own wizard two steps instead of three —
                so it gets a ground of its own, and loses it while the answer is "not yet". */}
            <div
              style={{
                borderRadius: '11px',
                padding: 'var(--space-3)',
                border: `1px solid ${draft.paidBy ? 'var(--paid)' : 'var(--border)'}`,
                background: draft.paidBy ? 'var(--paid-tint)' : 'var(--ground)',
              }}
            >
              <label style={{ ...fieldLabel, color: 'var(--fg)' }} htmlFor="trainee-paid">
                {t(locale, 'people.convert.paymentReceived')}
              </label>
              <select
                id="trainee-paid"
                data-testid="trainee-paid"
                style={control}
                value={draft.paidBy}
                disabled={!draft.groupId}
                onChange={(event) => set({ paidBy: event.target.value as PaidBy | '' })}
              >
                <option value="">{t(locale, 'people.convert.paymentReceivedNone')}</option>
                <option value="cash">{t(locale, 'people.convert.methodCash')}</option>
                <option value="cheque">{t(locale, 'people.convert.methodCheque')}</option>
                <option value="standing_order">{t(locale, 'people.convert.methodStandingOrder')}</option>
              </select>
              <p style={hint} data-testid="trainee-paid-hint">
                {!draft.groupId
                  ? t(locale, 'people.addStudents.planNeedsGroup')
                  : draft.paidBy
                    ? t(locale, 'people.convert.paymentReceivedHint')
                    : t(locale, 'people.convert.paymentReceivedCardNote')}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-4)',
              borderBlockStart: '1px solid var(--border)',
            }}
          >
            <Button variant="secondary" onClick={() => setSheet(null)}>
              {t(locale, 'people.addStudents.cancel')}
            </Button>
            <Button
              data-testid="trainee-save"
              disabled={!draft.name.trim() || !draft.age || !draft.email.includes('@')}
              onClick={saveSheet}
            >
              {t(locale, 'people.addStudents.save')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── one trainee's row ─────────────────────────────────────────────────────────────
  const traineeRow = (trainee: Trainee, index: number) => {
    const adult = isAdultAge(trainee.age)
    const priced = plan(trainee.planId)
    return (
      <li key={trainee.key} data-testid={`trainee-row-${index}`} style={{ ...card, ...rowBetween, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', minInlineSize: 0, flex: 1 }}>
          <span style={tile} aria-hidden>
            <Icon name="martialArts" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minInlineSize: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '16px' }}>{trainee.name}</strong>
              <Chip tone="neutral">
                {adult
                  ? t(locale, 'people.addStudents.adult')
                  : `${t(locale, 'people.addStudents.age')} ${trainee.age}`}
              </Chip>
              {trainee.beltRankId ? <Chip tone="neutral" icon="belts">{beltName(trainee.beltRankId)}</Chip> : null}
              {trainee.paidBy ? (
                <Chip tone="paid" icon="check">
                  {t(locale, `people.convert.method${trainee.paidBy === 'cash' ? 'Cash' : trainee.paidBy === 'cheque' ? 'Cheque' : 'StandingOrder'}`)}
                </Chip>
              ) : (
                <Chip tone="pending" icon="clock">{t(locale, 'people.addStudents.awaitingPayment')}</Chip>
              )}
            </div>

            <span style={metaRow}>
              <Icon name="groups" size={14} />
              <span>{groupName(trainee.groupId)}</span>
              <span aria-hidden>·</span>
              <Icon name="payments" size={14} />
              <span>
                {priced
                  ? `${priced.name} · ₪${Math.round(priced.monthly_amount_agorot / 100)}`
                  : t(locale, 'people.convert.planNone')}
              </span>
            </span>

            <span style={metaRow}>
              <Icon name="mail" size={14} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {adult ? t(locale, 'people.addStudents.viaSelf') : t(locale, 'people.addStudents.viaParent')}
              </span>
              <bdi dir="ltr" style={{ fontSize: '12px' }}>{trainee.email}</bdi>
            </span>

            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} data-testid={`trainee-steps-${index}`}>
              {t(locale, 'people.addStudents.wizardSteps').replace('{n}', String(trainee.paidBy ? 2 : 3))}
            </span>
          </div>
        </div>

        <span style={{ display: 'flex', gap: '2px', flex: 'none' }}>
          <button
            type="button"
            style={ghostButton}
            data-testid={`trainee-edit-${index}`}
            aria-label={`${t(locale, 'people.addStudents.edit')}: ${trainee.name}`}
            onClick={() => setSheet({ index, draft: trainee })}
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            type="button"
            style={ghostButton}
            data-testid={`trainee-remove-${index}`}
            aria-label={`${t(locale, 'people.addStudents.remove')}: ${trainee.name}`}
            onClick={() => setTrainees((current) => current.filter((_, i) => i !== index))}
          >
            <Icon name="trash" size={16} />
          </button>
        </span>
      </li>
    )
  }

  // ── done ──────────────────────────────────────────────────────────────────────────
  if (view === 'done') {
    const byEmail: { email: string; members: Outcome[] }[] = []
    outcomes.forEach((outcome) => {
      const found = byEmail.find((row) => row.email === outcome.email)
      if (found) found.members.push(outcome)
      else byEmail.push({ email: outcome.email, members: [outcome] })
    })
    const problems = outcomes.filter((outcome) => outcome.problem !== null)

    return (
      <section data-testid="add-student-done" style={{ ...column, maxInlineSize: '52rem' }}>
        <div style={{ ...card, display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <span style={{ ...tile, background: 'var(--paid-tint)', color: 'var(--paid)' }} aria-hidden>
            <Icon name="check" size={22} />
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px' }}>
              {t(locale, 'people.addStudents.doneTitle').replace(
                '{n}',
                String(outcomes.filter((outcome) => outcome.studentId).length),
              )}
            </h1>
            <p style={hint}>{t(locale, 'people.addStudents.doneNote')}</p>
          </div>
        </div>

        {problems.length > 0 ? (
          <span data-testid="add-students-partial">
            <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
              {t(locale, 'people.addStudents.partial').replace(
                '{names}',
                problems.map((outcome) => outcome.name).join(', '),
              )}
            </Alert>
          </span>
        ) : null}

        {byEmail.map((group) => (
          <div key={group.email} style={card}>
            <div style={{ ...metaRow, marginBlockEnd: 'var(--space-2)' }}>
              <Icon name="mail" size={14} />
              <bdi dir="ltr" style={{ fontWeight: 600 }}>{group.email}</bdi>
              <span aria-hidden>·</span>
              <span>{group.members.map((outcome) => outcome.name).join(' · ')}</span>
            </div>
            {group.members[0]?.invitationUrl ? (
              <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <bdi dir="ltr" data-testid="add-student-invite-url" style={{ overflowWrap: 'anywhere', fontSize: '12px' }}>
                  {group.members[0].invitationUrl}
                </bdi>
                <CopyButton locale={locale} value={group.members[0].invitationUrl!} />
              </p>
            ) : (
              //: A matched parent already has a login. §5.4a: "No second invitation, no
              //: second account, no second login."
              <p data-testid="add-student-matched" style={hint}>
                {t(locale, 'people.request.matchedPerson')}
              </p>
            )}
          </div>
        ))}

        {emailConfigured === false ? (
          <span data-testid="add-student-invite-email-unavailable">
            <Alert tone="pending" iconLabel={t(locale, 'people.invite.emailNotConfigured')}>
              {t(locale, 'people.invite.emailNotConfigured')}
            </Alert>
          </span>
        ) : null}

        <div>
          <Button
            variant="secondary"
            data-testid="add-students-restart"
            onClick={() => {
              setTrainees([])
              setOutcomes([])
              setView('form')
            }}
          >
            {t(locale, 'people.addStudents.addAnother')}
          </Button>
        </div>
      </section>
    )
  }

  // ── review ────────────────────────────────────────────────────────────────────────
  if (view === 'review') {
    const settled = trainees.filter((trainee) => trainee.paidBy).length
    return (
      <section data-testid="add-students-review" style={{ ...column, maxInlineSize: '52rem' }}>
        <StepStrip locale={locale} current={2} />

        {recipients.map((group) => {
          const adults = group.members.every((member) => isAdultAge(member.age))
          return (
            <div key={group.email} style={card}>
              <div style={{ ...metaRow, paddingBlockEnd: 'var(--space-2)', borderBlockEnd: '1px solid var(--border)' }}>
                <Icon name={adults ? 'profile' : 'students'} size={14} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {adults ? t(locale, 'people.addStudents.adultRole') : t(locale, 'people.addStudents.parentRole')}
                </span>
                <bdi dir="ltr" style={{ fontWeight: 600 }}>{group.email}</bdi>
                <span aria-hidden>·</span>
                <span>{t(locale, 'people.addStudents.oneLink')}</span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {group.members.map((member) => {
                  const priced = plan(member.planId)
                  return (
                    <li
                      key={member.key}
                      style={{ ...rowBetween, paddingBlock: 'var(--space-2)', alignItems: 'flex-start' }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: '14px' }}>{member.name}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {isAdultAge(member.age)
                            ? t(locale, 'people.addStudents.adult')
                            : `${t(locale, 'people.addStudents.age')} ${member.age}`}
                          {member.beltRankId ? ` · ${beltName(member.beltRankId)}` : ''}
                          {` · ${groupName(member.groupId)}`}
                          {priced ? ` · ${priced.name} ₪${Math.round(priced.monthly_amount_agorot / 100)}` : ''}
                        </span>
                      </span>
                      <Chip tone={member.paidBy ? 'paid' : 'pending'} icon={member.paidBy ? 'check' : 'clock'}>
                        {t(locale, 'people.addStudents.wizardSteps').replace(
                          '{n}',
                          String(member.paidBy ? 2 : 3),
                        )}
                      </Chip>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        <div style={{ ...card, background: 'var(--emphasis-tint)', borderColor: 'var(--accent)' }}>
          <strong style={{ fontSize: '13px' }}>{t(locale, 'people.addStudents.outcomeTitle')}</strong>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: '1.1rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <li>{t(locale, 'people.addStudents.outcomeCreated').replace('{n}', String(trainees.length))}</li>
            <li>{t(locale, 'people.addStudents.outcomeLinks').replace('{n}', String(recipients.length))}</li>
            <li>
              {settled > 0
                ? t(locale, 'people.addStudents.outcomeSettled').replace('{n}', String(settled))
                : t(locale, 'people.addStudents.outcomeAllPay')}
            </li>
          </ul>
        </div>

        {failed ? (
          <span data-testid="add-student-error">
            <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
              {t(locale, 'people.error.generic')}
            </Alert>
          </span>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" data-testid="add-students-back" onClick={() => setView('form')}>
            {t(locale, 'people.addStudents.backToEdit')}
          </Button>
          <Button data-testid="add-students-create" disabled={busy} onClick={() => void create()}>
            {t(locale, 'people.addStudents.create')}
          </Button>
        </div>
      </section>
    )
  }

  // ── the roster ────────────────────────────────────────────────────────────────────
  return (
    <>
      <section data-testid="add-student" style={{ ...column, maxInlineSize: '52rem' }}>
        <StepStrip locale={locale} current={1} />

        <div style={rowBetween}>
          <strong style={{ fontSize: '14px' }}>
            {t(locale, 'people.addStudents.rosterTitle')}{' '}
            <span style={{ color: 'var(--text-muted)' }}>{trainees.length}</span>
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {t(locale, 'people.addStudents.rosterHint')}
          </span>
        </div>

        {trainees.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {trainees.map(traineeRow)}
          </ul>
        ) : (
          <p data-testid="add-students-empty" style={{ ...hint, textAlign: 'center', padding: 'var(--space-4)' }}>
            {t(locale, 'people.addStudents.rosterEmpty')}
          </p>
        )}

        <button
          type="button"
          data-testid="add-trainee"
          onClick={openAdd}
          style={{
            inlineSize: '100%',
            font: 'inherit',
            fontWeight: 600,
            fontSize: '14px',
            minBlockSize: '44px',
            border: '1px dashed var(--border-strong)',
            borderRadius: '11px',
            background: 'none',
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Icon name="plus" size={18} />
          {t(locale, 'people.addStudents.addTrainee')}
        </button>

        <div style={{ ...card, background: 'var(--emphasis-tint)', borderColor: 'var(--accent)', fontSize: '12px' }}>
          {t(locale, 'people.addStudents.accountRule')}
        </div>

        <div style={rowBetween}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {t(locale, 'people.addStudents.footerCounts')
              .replace('{links}', String(recipients.length))
              .replace('{trainees}', String(trainees.length))}
          </span>
          <Button data-testid="add-students-continue" disabled={!ready} onClick={() => setView('review')}>
            {t(locale, 'people.addStudents.continueToReview')}
          </Button>
        </div>
      </section>

      {sheetView()}

      {/* Owner request 2026-08-30 — 'can import a file'. The same screen, because it is the
          same question ("get these families in") answered at a different volume. */}
      <ImportStudentsPanel locale={locale} client={client} onImported={onCreated} />
    </>
  )
}
