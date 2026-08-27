// §5.4b — the member onboarding flow (docs/onboarding-link-spec.md), the screen a parent
// lands on from the club's WhatsApp blast.
//
// The flow in the spec's own order: sign in (the identity is created NOW, §5.2's rules,
// through the same SignIn everyone uses) → parent details with the provider email shown
// READ-ONLY → the children, each with a group multi-select labeled by training days —
// parents know their group by its days, not by its database name → one submission. The
// gates then do the paperwork: the children land with health_status = 'missing', so
// §6.1's existing gate takes over with zero new machinery here.
//
// The form displays NO existing data whatsoever — no roster, no names, no counts. The
// group list with schedules is already public (§5.4a's landing page shows the same).
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, useSession } from '@studio/core'
import { Alert, Button, Card, Checkbox, EmptyState, SignIn, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type JoinGroup = { id: string; name: string; weekdays: number[] }
type JoinInfo = { studio_name: string; groups: JoinGroup[]; email: string | null }

type ChildDraft = {
  key: string
  firstName: string
  lastName: string
  birthdate: string
  groupIds: string[]
  selfStudent: boolean
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
  padding: 'var(--space-4)',
}

function emptyChild(): ChildDraft {
  return {
    key: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    birthdate: '',
    groupIds: [],
    selfStudent: false,
  }
}

function weekdaysLabel(locale: Locale, weekdays: number[]): string {
  return weekdays.map((day) => t(locale, `schedule.weekday.${day}`)).join('·')
}

export function JoinFlow({ locale, token }: { locale: Locale; token: string }) {
  const session = useSession()
  const [info, setInfo] = useState<JoinInfo | null | 'invalid'>(null)
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [phone, setPhone] = useState('')
  const [children, setChildren] = useState<ChildDraft[]>([emptyChild()])
  const [inFlight, setInFlight] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/public/onboarding/${token}`)
      .then(async (response) => {
        if (!alive) return
        if (!response.ok) {
          setInfo('invalid')
          return
        }
        setInfo((await response.json()) as JoinInfo)
      })
      .catch(() => alive && setInfo('invalid'))
    return () => {
      alive = false
    }
    // Re-read once a sign-in lands, so the read-only email fills in.
  }, [token, session.status])

  const canSubmit = useMemo(
    () =>
      parentFirst.trim() !== '' &&
      parentLast.trim() !== '' &&
      children.length > 0 &&
      children.every(
        (child) =>
          child.groupIds.length > 0 &&
          (child.selfStudent || (child.firstName.trim() !== '' && child.lastName.trim() !== '')),
      ),
    [parentFirst, parentLast, children],
  )

  if (info === null) return null
  if (info === 'invalid') {
    // Expired, revoked and never-existed all read identically — the server's rule,
    // repeated by the screen.
    return (
      <div style={pageStyle} data-testid="join-invalid">
        <EmptyState
          title={t(locale, 'people.join.expired')}
          description={t(locale, 'people.join.expiredHint')}
        />
      </div>
    )
  }

  if (done) {
    return (
      <div style={pageStyle} data-testid="join-done">
        <Alert tone="paid" iconLabel={t(locale, 'people.join.title')}>
          {t(locale, 'people.join.done')}
        </Alert>
        <Button onClick={() => globalThis.location.assign('/')}>
          {t(locale, 'people.join.toApp')}
        </Button>
      </div>
    )
  }

  if (session.status !== 'signed-in') {
    return (
      <div style={pageStyle} data-testid="join-signin">
        <div className="studio-page-header">
          <h1>{info.studio_name}</h1>
        </div>
        <p style={{ margin: 0 }}>{t(locale, 'people.join.title')}</p>
        <SignIn locale={locale} app="parent" returnPath={`/join/${token}`} />
      </div>
    )
  }

  async function submit() {
    if (inFlight || !canSubmit) return
    setInFlight(true)
    setFailed(null)
    try {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: parentFirst.trim(),
          last_name: parentLast.trim(),
          phone: phone.trim() || null,
          children: children.map((child) => ({
            first_name: child.selfStudent ? parentFirst.trim() : child.firstName.trim(),
            last_name: child.selfStudent ? parentLast.trim() : child.lastName.trim(),
            birthdate: child.birthdate || null,
            group_ids: child.groupIds,
            self_student: child.selfStudent,
          })),
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setDone(true)
    } catch {
      setFailed(t(locale, 'common.error.generic'))
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div style={pageStyle} data-testid="join-form">
      <div className="studio-page-header">
        <h1>{info.studio_name}</h1>
      </div>
      <p style={{ margin: 0 }}>{t(locale, 'people.join.title')}</p>

      <Card>
        <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.parentDetails')}</h2>
        <TextField
          label={t(locale, 'people.join.firstName')}
          value={parentFirst}
          onChange={(event) => setParentFirst(event.target.value)}
        />
        <TextField
          label={t(locale, 'people.join.lastName')}
          value={parentLast}
          onChange={(event) => setParentLast(event.target.value)}
        />
        <TextField
          label={t(locale, 'people.join.phone')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        {info.email ? (
          // READ-ONLY by design: a typed email is unverified and can be wrong; the
          // verified one already exists on the identity that just signed in.
          <p data-testid="join-email" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t(locale, 'people.join.email')}: <bdi>{info.email}</bdi>
          </p>
        ) : null}
      </Card>

      {children.map((child, index) => (
        <Card key={child.key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
            <h2 style={{ margin: 0, marginInlineEnd: 'auto' }}>
              {t(locale, 'people.join.child')} {children.length > 1 ? index + 1 : ''}
            </h2>
            {children.length > 1 ? (
              <Button variant="ghost" onClick={() => setChildren((rows) => rows.filter((row) => row.key !== child.key))}>
                {t(locale, 'people.join.removeChild')}
              </Button>
            ) : null}
          </div>
          <Checkbox
            label={t(locale, 'people.join.selfStudent')}
            checked={child.selfStudent}
            onChange={(event) =>
              setChildren((rows) =>
                rows.map((row) =>
                  row.key === child.key ? { ...row, selfStudent: event.target.checked } : row,
                ),
              )
            }
          />
          {!child.selfStudent ? (
            <>
              <TextField
                label={t(locale, 'people.join.firstName')}
                value={child.firstName}
                onChange={(event) =>
                  setChildren((rows) =>
                    rows.map((row) =>
                      row.key === child.key ? { ...row, firstName: event.target.value } : row,
                    ),
                  )
                }
              />
              <TextField
                label={t(locale, 'people.join.lastName')}
                value={child.lastName}
                onChange={(event) =>
                  setChildren((rows) =>
                    rows.map((row) =>
                      row.key === child.key ? { ...row, lastName: event.target.value } : row,
                    ),
                  )
                }
              />
              <TextField
                label={t(locale, 'people.join.birthdate')}
                type="date"
                value={child.birthdate}
                onChange={(event) =>
                  setChildren((rows) =>
                    rows.map((row) =>
                      row.key === child.key ? { ...row, birthdate: event.target.value } : row,
                    ),
                  )
                }
              />
            </>
          ) : null}
          <h3>{t(locale, 'people.join.groups')}</h3>
          {info.groups.map((group) => (
            <Checkbox
              key={group.id}
              label={`${group.name} · ${weekdaysLabel(locale, group.weekdays)}`}
              checked={child.groupIds.includes(group.id)}
              onChange={(event) =>
                setChildren((rows) =>
                  rows.map((row) =>
                    row.key === child.key
                      ? {
                          ...row,
                          groupIds: event.target.checked
                            ? [...row.groupIds, group.id]
                            : row.groupIds.filter((id) => id !== group.id),
                        }
                      : row,
                  ),
                )
              }
            />
          ))}
        </Card>
      ))}

      <Button variant="secondary" onClick={() => setChildren((rows) => [...rows, emptyChild()])}>
        {t(locale, 'people.join.addChild')}
      </Button>

      {failed ? (
        <Alert tone="danger" live iconLabel={t(locale, 'people.join.title')}>
          {failed}
        </Alert>
      ) : null}
      <Button
        variant="primary"
        data-testid="join-submit"
        disabled={!canSubmit || inFlight}
        onClick={() => void submit()}
      >
        {t(locale, 'people.join.submit')}
      </Button>
    </div>
  )
}

/** `/join/<token>` → the token, or null. A real path, not a hash: the URL lives in a
 *  WhatsApp message and must survive being tapped cold. */
export function matchJoinPath(pathname: string): string | null {
  const match = /^\/join\/([A-Za-z0-9_-]{16,})$/.exec(pathname)
  return match ? (match[1] ?? null) : null
}
