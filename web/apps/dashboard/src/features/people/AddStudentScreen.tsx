// Dashboard artboard 3c — הוספת חניך: "שיוך למשק בית קיים במקום חשבון חדש".
//
// The artboard says "משק בית". **There is no household** (L9, §4.3): "'My children' is
// simply SELECT student_id FROM guardian WHERE person_id = me." So the screen attaches the
// child to an existing **parent**, and the copy says parent — the artboard's word describes
// the intent, not an entity anybody should build.
//
// **The client never sends a person_id it guessed.** L7 — matching is on a VERIFIED email or
// phone, and a client cannot verify anything. It submits the address; the server decides
// whether that is somebody it already has, which is why `guardian_matched` and not a client
// hint is what ends up in the audit trail.
//
// **No price field** (L2). `price_plan` is W4's table; the conversion screen stores an id,
// and the prices screen is M6's.
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { WeekdayPicker, attendsWeekdaysFor } from './WeekdayPicker'
import type { DashboardPeopleClient, GroupOption } from './peopleClient'

//: §5.4(a) is 'child details AND GROUP -> save'. `group_id` empty is the phone-enquiry
//: case: §5.4a's lead is 'a real student who simply has no enrollment', so the form must
//: keep letting a manager say 'not yet' rather than forcing a group nobody chose.
type Child = {
  first_name: string
  last_name: string
  birthdate: string
  group_id: string
  /** C12 — which of the group's training days this child comes to. `null` is 'untouched',
   *  which RENDERS as every day ticked. Storing the selection as null-until-touched keeps
   *  'all ticked by default' derived from the days as they load, instead of writing them
   *  into state from an effect the moment they arrive. */
  weekdays: number[] | null
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '40rem',
}

const blank = (): Child => ({
  first_name: '',
  last_name: '',
  birthdate: '',
  group_id: '',
  weekdays: null,
})

export function AddStudentScreen({
  locale,
  client,
  onCreated,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onCreated?: () => void
}) {
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [children, setChildren] = useState<Child[]>([blank()])
  const [groups, setGroups] = useState<GroupOption[]>([])
  // Keyed by group, so two children in the same group share one lookup.
  const [daysByGroup, setDaysByGroup] = useState<Record<string, number[]>>({})
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [invitationToken, setInvitationToken] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let live = true
    client
      .groups()
      .then((body) => live && setGroups(body.items ?? []))
      // A group list that fails to load is not a reason to block the form: a student with
      // no group is a legal outcome, so the picker degrades to 'not yet' rather than
      // trapping the manager on a screen they cannot submit.
      .catch(() => live && setGroups([]))
    return () => {
      live = false
    }
  }, [client])

  // C12's checkboxes are 'over the GROUP'S scheduled weekdays', so the days come from the
  // schedule seam once a group is chosen — never from a hardcoded week.
  const chosenGroups = [...new Set(children.map((child) => child.group_id).filter(Boolean))]
  const groupKey = [...chosenGroups].sort().join(',')
  useEffect(() => {
    if (!groupKey) return
    let live = true
    Promise.all(
      groupKey.split(',').map((groupId) =>
        client
          .weekdayOptions(groupId)
          .then((body) => [groupId, body.training_weekdays ?? []] as const),
      ),
    )
      .then((pairs) => live && setDaysByGroup(Object.fromEntries(pairs)))
      .catch(() => live && setDaysByGroup({}))
    return () => {
      live = false
    }
  }, [client, groupKey])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setFailed(false)
    try {
      let token: string | null = null
      // §5.4a's worked example: "יעל submits one form with דנה and יוסי. The manager
      // approves once." Each child is its own request; the SERVER matches them onto the
      // same parent by the verified address, which is what stops a second Person appearing.
      for (const child of children) {
        const trainingDays = daysByGroup[child.group_id] ?? []
        const response = await client.createStudent({
          first_name: child.first_name,
          last_name: child.last_name,
          birthdate: child.birthdate || null,
          // §5.4(a) — naming a group enrols the child in the same save. The server
          // validates the pattern against the group's real schedule.
          group_id: child.group_id || null,
          attends_weekdays: child.group_id
            ? attendsWeekdaysFor(child.weekdays ?? trainingDays, trainingDays)
            : null,
          guardian: {
            first_name: parentFirst,
            last_name: parentLast,
            email: email || null,
            phone: phone || null,
            relation: 'parent',
          },
        })
        if (!response.ok) {
          setFailed(true)
          return
        }
        const body = (await response.json()) as { invitation_token?: string | null }
        token = token ?? body.invitation_token ?? null
      }
      setInvitationToken(token)
      setDone(true)
      onCreated?.()
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <section aria-labelledby="add-done" data-testid="add-student-done">
        <h2 id="add-done">{t(locale, 'people.student.saved')}</h2>
        {invitationToken ? (
          // §5.4(a) — 'sends the parent an invitation'. Shown once, for a parent standing
          // at the desk; only its hash is stored, so it cannot be shown again.
          <p data-testid="add-student-invitation">{invitationToken}</p>
        ) : (
          // L7 — a matched parent already has a login. §5.4a: 'No second invitation, no
          // second account, no second login.'
          <p data-testid="add-student-matched">{t(locale, 'people.request.matchedPerson')}</p>
        )}
      </section>
    )
  }

  return (
    <form onSubmit={submit} style={formStyle} aria-labelledby="add-student" data-testid="add-student">
      <h1 id="add-student">{t(locale, 'people.student.add')}</h1>

      <fieldset>
        <legend>{t(locale, 'people.guardian.one')}</legend>
        {/* The artboard's "משק בית" is a PARENT. L9 — no household entity exists. */}
        <p data-testid="add-student-parent-hint">{t(locale, 'people.request.matchedHint')}</p>
        <TextField
          label={t(locale, 'people.student.firstName')}
          value={parentFirst}
          onChange={(event) => setParentFirst(event.target.value)}
          required
        />
        <TextField
          label={t(locale, 'people.student.lastName')}
          value={parentLast}
          onChange={(event) => setParentLast(event.target.value)}
          required
        />
        <TextField
          label={t(locale, 'people.student.email')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label={t(locale, 'people.student.phone')}
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </fieldset>

      {children.map((child, index) => (
        <fieldset key={index} data-testid={`add-student-child-${index}`}>
          <legend>{t(locale, 'people.student.one')}</legend>
          <TextField
            label={t(locale, 'people.student.firstName')}
            value={child.first_name}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) =>
                  i === index ? { ...c, first_name: event.target.value } : c,
                ),
              )
            }
            required
          />
          <TextField
            label={t(locale, 'people.student.lastName')}
            value={child.last_name}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) => (i === index ? { ...c, last_name: event.target.value } : c)),
              )
            }
            required
          />
          <TextField
            label={t(locale, 'people.student.birthdate')}
            type="date"
            value={child.birthdate}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) => (i === index ? { ...c, birthdate: event.target.value } : c)),
              )
            }
          />
          {/* §5.4(a) — 'child details AND GROUP'. Optional, because a lead with no
              enrollment is a real and common outcome (§5.4a). */}
          <label>
            {t(locale, 'people.enrollment.group')}
            <select
              value={child.group_id}
              onChange={(event) =>
                setChildren((current) =>
                  current.map((c, i) =>
                    // Changing the group clears the day selection: the ticks belonged to
                    // the old group's timetable and mean nothing against the new one.
                    i === index ? { ...c, group_id: event.target.value, weekdays: null } : c,
                  ),
                )
              }
              data-testid={`add-student-group-${index}`}
            >
              <option value="">{t(locale, 'people.enrollment.noGroupYet')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          {child.group_id ? (
            <WeekdayPicker
              locale={locale}
              trainingWeekdays={daysByGroup[child.group_id] ?? []}
              // C12 — 'all ticked by default'. Derived, not stored.
              selected={child.weekdays ?? daysByGroup[child.group_id] ?? []}
              onChange={(next) =>
                setChildren((current) =>
                  current.map((c, i) => (i === index ? { ...c, weekdays: next } : c)),
                )
              }
            />
          ) : null}
        </fieldset>
      ))}

      <Button
        variant="secondary"
        onClick={() => setChildren((current) => [...current, blank()])}
        data-testid="add-student-add-child"
      >
        {t(locale, 'people.landing.addChild')}
      </Button>

      {failed ? (
        <span data-testid="add-student-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
            {t(locale, 'people.error.generic')}
          </Alert>
        </span>
      ) : null}

      <Button type="submit" disabled={sending} data-testid="add-student-submit">
        {t(locale, 'people.student.add')}
      </Button>
    </form>
  )
}
