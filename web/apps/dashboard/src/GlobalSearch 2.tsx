// F9 — the one search box, in the shell, on every screen. In a club-management tool
// this is arguably the most-used control there is, and the dashboard shipped without
// any search at all.
//
// Keyboard: `/` focuses it from anywhere (unless something editable already has focus),
// ArrowDown/ArrowUp walk the results, Escape clears. Results are real links — Tab works
// too, and open-in-new-tab keeps working.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type SearchOut = {
  students: { id: string; name: string; status: string }[]
  guardians: { person_id: string; name: string; student_id: string }[]
  groups: { id: string; name: string }[]
  staff: { person_id: string; name: string }[]
}

const EMPTY: SearchOut = { students: [], guardians: [], groups: [], staff: [] }

const boxStyle: CSSProperties = { position: 'relative', maxInlineSize: '24rem' }

const resultsStyle: CSSProperties = {
  position: 'absolute',
  insetBlockStart: '100%',
  insetInlineStart: 0,
  insetInlineEnd: 0,
  background: 'var(--ground)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2)',
  zIndex: 20,
  maxBlockSize: '60vh',
  overflowY: 'auto',
}

const kindStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-caption)',
  color: 'var(--text-muted)',
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

export function GlobalSearch({ locale }: { locale: Locale }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchOut>(EMPTY)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) return
    let live = true
    const handle = setTimeout(() => {
      void apiFetch(`/api/v1/search?q=${encodeURIComponent(query.trim())}`)
        .then(async (response) => (response.ok ? ((await response.json()) as SearchOut) : EMPTY))
        .then((body) => {
          if (!live) return
          setResults(body)
          setOpen(true)
        })
        .catch(() => undefined)
    }, 250)
    return () => {
      live = false
      clearTimeout(handle)
    }
  }, [query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const moveFocus = (delta: 1 | -1) => {
    const links = [...(panelRef.current?.querySelectorAll('a') ?? [])]
    if (links.length === 0) return
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    const next = links[(index + delta + links.length) % links.length]
    next?.focus()
  }

  const total =
    results.students.length +
    results.guardians.length +
    results.groups.length +
    results.staff.length

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          moveFocus(1)
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          moveFocus(-1)
        }
      }}
      style={boxStyle}
    >
      <input
        aria-label={t(locale, 'common.search.label')}
        data-testid="global-search"
        onChange={(event) => {
          const value = event.target.value
          setQuery(value)
          // The reset lives in the handler, not the effect — an effect that sets state
          // synchronously is the cascade the lint rule points at.
          if (value.trim().length < 2) {
            setResults(EMPTY)
            setOpen(false)
          }
        }}
        placeholder={t(locale, 'common.search.placeholder')}
        ref={inputRef}
        type="search"
        value={query}
      />
      {open ? (
        <div data-testid="global-search-results" ref={panelRef} style={resultsStyle}>
          {total === 0 ? (
            <p style={kindStyle}>{t(locale, 'common.search.noResults')}</p>
          ) : null}
          {results.students.length > 0 ? (
            <>
              <p style={kindStyle}>{t(locale, 'people.student.plural')}</p>
              <ul style={listStyle}>
                {results.students.map((row) => (
                  <li key={row.id}>
                    <a
                      data-testid={`search-student-${row.id}`}
                      href={`#/students/${row.id}`}
                      onClick={close}
                    >
                      <bdi>{row.name}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {results.guardians.length > 0 ? (
            <>
              <p style={kindStyle}>{t(locale, 'common.search.guardians')}</p>
              <ul style={listStyle}>
                {results.guardians.map((row) => (
                  <li key={`${row.person_id}-${row.student_id}`}>
                    {/* A guardian's record IS their child's card — the product has no
                        guardian page, and the card lists the guardians. */}
                    <a href={`#/students/${row.student_id}`} onClick={close}>
                      <bdi>{row.name}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {results.groups.length > 0 ? (
            <>
              <p style={kindStyle}>{t(locale, 'schedule.groups.title')}</p>
              <ul style={listStyle}>
                {results.groups.map((row) => (
                  <li key={row.id}>
                    <a href={`#/groups/${row.id}`} onClick={close}>
                      <bdi>{row.name}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {results.staff.length > 0 ? (
            <>
              <p style={kindStyle}>{t(locale, 'common.staff.title')}</p>
              <ul style={listStyle}>
                {results.staff.map((row) => (
                  <li key={row.person_id}>
                    <a href="#/staff" onClick={close}>
                      <bdi>{row.name}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
