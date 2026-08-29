// Artboard 7b, card מי מוזמן — §5.8's targeting, on the screen that creates the event.
//
// **This is the gap that made publishing a no-op.** `EventForm` shipped with `targets`
// hardcoded to `[]` at its only mount, and `EventPublishService.resolve_targets` returns an
// empty list for an event with no target rows. Every event a manager created from the
// dashboard therefore published to a roster of nobody — no registrations, no RSVPs, nothing
// for `7c` to list. The form was complete except for the one field that decides who the
// event is for.
//
// **Four target types, because that is what the CHECK allows.** `event_target.target_type`
// is `studio | class | group | student`. The canvas draws two more chips — לפי חגורה and
// לפי גיל — and neither is a member; a lane never runs `alembic revision`, so those two are
// reported on screen rather than half-built as a client-side filter that would resolve to a
// different set of children by the time the event published.
//
// **A class or a group is a sweep; a student is a name.** `resolve_targets` filters a sweep
// to `active`/`trial` and deliberately does not filter a student picked individually
// (§5.9 step 1 — a manager naming a child means that child). Both sentences are on screen,
// because the difference decides who actually gets invited and it is invisible otherwise.
//
// **Targets are resolved at publish, not here.** The picker stores intent — "the two
// beginner groups" — and the roster is materialised from it when the manager publishes. So
// the summary counts audiences, never children: a headcount computed in the browser today
// would be wrong by the time it mattered and there is no dry-run endpoint to ask for the
// real one.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, Checkbox, LoadFailed, SegmentedControl, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ClassOut, DashboardEventsClient, EventTargetOut, GroupOut } from './client'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const listStyle: CSSProperties = {
  border: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  margin: 0,
  padding: 0,
}

const legendStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
  padding: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  alignItems: 'center',
  background: 'color-mix(in srgb, var(--fg) 8%, transparent)',
  borderRadius: 'var(--radius-pill)',
  display: 'flex',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-caption)',
  paddingBlock: '2px',
  paddingInline: 'var(--space-2)',
}

/** Identity of a target row. `target_id` is null for `studio`, which is the whole point of
 *  the empty half — there is exactly one studio target and it names nothing. */
export function targetKey(target: Pick<EventTargetOut, 'target_type' | 'target_id'>): string {
  return `${target.target_type}:${target.target_id ?? ''}`
}

/** Whether `targets` reaches anybody at all. The API accepts an empty list and publishing
 *  it succeeds — with a roster of zero, which looks identical to a publish that worked. */
export function reachesNobody(targets: readonly EventTargetOut[]): boolean {
  return targets.length === 0
}

/**
 * The audience in words, for `7b`'s preview and its footer.
 *
 * Counts AUDIENCES, never children: the roster is resolved from these rows at publish
 * time against enrolments as they stand then, so any headcount this screen printed would
 * be a guess with a number's authority. `studio` short-circuits because "the whole club
 * and two groups" is still the whole club.
 */
export function describeTargets(targets: readonly EventTargetOut[], locale: Locale): string {
  if (targets.length === 0) return t(locale, 'events.target.none')
  if (targets.some((target) => target.target_type === 'studio')) {
    return t(locale, 'events.target.everyone')
  }
  const parts: string[] = []
  const count = (type: EventTargetOut['target_type']) =>
    targets.filter((target) => target.target_type === type).length
  const classes = count('class')
  const groups = count('group')
  const students = count('student')
  if (classes) parts.push(`${classes} ${t(locale, 'events.target.classes')}`)
  if (groups) parts.push(`${groups} ${t(locale, 'events.target.groups')}`)
  if (students) parts.push(`${students} ${t(locale, 'events.target.chosenStudents')}`)
  return parts.join(' · ')
}

export function EventTargetPicker({
  client,
  locale,
  onChange,
  value,
}: {
  client: DashboardEventsClient
  locale: Locale
  onChange: (targets: EventTargetOut[]) => void
  value: EventTargetOut[]
}) {
  const [classes, setClasses] = useState<ClassOut[]>([])
  const [groups, setGroups] = useState<GroupOut[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  // The answer, tagged with the question it answers. Two characters, because one letter of
  // a Hebrew given name matches most of the club and the request is answered by a table
  // scan the manager never asked for.
  const [answer, setAnswer] = useState<{ query: string; items: { id: string; name: string }[] }>()
  const asked = query.trim()
  const searching = asked.length >= 2
  // Derived rather than cleared in the effect: "the box is too short to search" is a fact
  // about `query`, not something that happens to it, and clearing state in an effect body
  // is a cascading render for a value that could just be read.
  const current = searching && answer?.query === asked ? answer : undefined
  const found = current?.items ?? []

  // Derived, not held: a second source of truth for "is this the whole club" is a second
  // thing to keep in step with `value`, and the studio row already says it.
  const mode = value.some((target) => target.target_type === 'studio') ? 'everyone' : 'chosen'

  useEffect(() => {
    let live = true
    Promise.all([client.classes(), client.groups()])
      .then(([classPage, groupPage]) => {
        if (!live) return
        setClasses(classPage.items)
        setGroups(groupPage.items)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  useEffect(() => {
    if (!searching) return
    let live = true
    client
      .searchStudents(asked)
      .then((page) => {
        // `live` guards the ordering as much as the unmount: keystrokes race, and a slower
        // answer to a shorter query would otherwise overwrite the one being typed.
        if (!live) return
        setAnswer({
          query: asked,
          items: page.items.map((student) => ({
            id: student.id,
            name: `${student.first_name} ${student.last_name}`,
          })),
        })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [asked, client, searching])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  const has = (target: Pick<EventTargetOut, 'target_type' | 'target_id'>) =>
    value.some((existing) => targetKey(existing) === targetKey(target))

  const toggle = (target: EventTargetOut) => {
    onChange(
      has(target)
        ? value.filter((existing) => targetKey(existing) !== targetKey(target))
        : [...value, target],
    )
  }

  const setMode = (next: string) => {
    // Switching to "the whole club" REPLACES the selection rather than adding to it: a
    // studio target already sweeps every child, so keeping the narrower rows beside it
    // would leave the manager looking at a selection that no longer means anything.
    onChange(next === 'everyone' ? [{ target_type: 'studio', target_id: null }] : [])
    setQuery('')
  }

  const chosenStudents = value.filter((target) => target.target_type === 'student')

  return (
    <Card>
      <div style={columnStyle}>
        <SegmentedControl
          legend={t(locale, 'events.target.title')}
          onValueChange={setMode}
          options={[
            { value: 'everyone', label: t(locale, 'events.target.everyone') },
            { value: 'chosen', label: t(locale, 'events.target.chosen') },
          ]}
          value={mode}
        />

        {/* The two chips the canvas draws that no target type can express. Said out loud
            rather than dropped, so the disagreement is visible to whoever drew them. */}
        <p style={hintStyle}>{t(locale, 'events.target.byBeltOrAgeUnsupported')}</p>

        {mode === 'chosen' ? (
          <>
            <p style={hintStyle}>{t(locale, 'events.target.sweepHint')}</p>

            <fieldset style={listStyle}>
              <legend style={legendStyle}>{t(locale, 'events.target.classes')}</legend>
              {classes.length === 0 ? (
                <p style={hintStyle}>{t(locale, 'events.target.classesEmpty')}</p>
              ) : (
                classes.map((row) => (
                  <Checkbox
                    block
                    checked={has({ target_type: 'class', target_id: row.id })}
                    key={row.id}
                    label={row.name}
                    onChange={() =>
                      toggle({
                        target_type: 'class',
                        target_id: row.id,
                        display_name: row.name,
                      })
                    }
                  />
                ))
              )}
            </fieldset>

            <fieldset style={listStyle}>
              <legend style={legendStyle}>{t(locale, 'events.target.groups')}</legend>
              {groups.length === 0 ? (
                <p style={hintStyle}>{t(locale, 'events.target.groupsEmpty')}</p>
              ) : (
                groups.map((row) => (
                  <Checkbox
                    block
                    checked={has({ target_type: 'group', target_id: row.id })}
                    key={row.id}
                    label={row.name}
                    onChange={() =>
                      toggle({
                        target_type: 'group',
                        target_id: row.id,
                        display_name: row.name,
                      })
                    }
                  />
                ))
              )}
            </fieldset>

            <TextField
              hint={t(locale, 'events.target.studentSearchHint')}
              label={t(locale, 'events.target.studentSearch')}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              value={query}
            />
            {current && found.length === 0 ? (
              <p style={hintStyle}>{t(locale, 'events.target.studentNoResults')}</p>
            ) : null}
            {found.length > 0 ? (
              <ul style={chipRowStyle}>
                {found.map((student) => (
                  <li key={student.id}>
                    <Button
                      disabled={has({ target_type: 'student', target_id: student.id })}
                      onClick={() =>
                        toggle({
                          target_type: 'student',
                          target_id: student.id,
                          display_name: student.name,
                        })
                      }
                      variant="secondary"
                    >
                      {student.name}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {chosenStudents.length > 0 ? (
              <>
                <p style={legendStyle}>{t(locale, 'events.target.chosenStudents')}</p>
                <ul style={chipRowStyle}>
                  {chosenStudents.map((target) => (
                    <li key={targetKey(target)} style={chipStyle}>
                      <span>{target.display_name}</span>
                      <Button
                        // The name is in the accessible name, not only in the row: a list of
                        // buttons all called "הסרה" is a list a screen reader cannot choose from.
                        aria-label={`${t(locale, 'events.target.remove')} ${target.display_name ?? ''}`}
                        onClick={() => toggle(target)}
                        variant="ghost"
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}

        {/* Never an error that blocks the save — a draft with no audience yet is an
            ordinary half-built event. It is a warning because PUBLISHING it is what
            reaches nobody, and nothing else on the screen would say so. */}
        {reachesNobody(value) ? (
          <p style={{ ...hintStyle, color: 'var(--pending)' }}>
            {t(locale, 'events.target.required')}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
