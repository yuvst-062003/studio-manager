// Owner request 2026-08-30 — the CSV import over the same POST /students the form uses.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ImportStudentsPanel, parseStudentsCsv } from './ImportStudentsPanel'
import type { DashboardPeopleClient } from './peopleClient'

const CSV = [
  'parent_first,parent_last,email,phone,child_first,child_last,birthdate',
  'רות,כהן,ruth@example.com,050-1234567,דנה,כהן,2018-04-12',
  'רות,כהן,ruth@example.com,050-1234567,יוסי,כהן,2020-01-03',
].join('\n')

function clientWith(createStudent: unknown) {
  return { createStudent } as unknown as DashboardPeopleClient
}

describe('parseStudentsCsv', () => {
  it('parses the template shape, quoted commas included', () => {
    const parsed = parseStudentsCsv(
      'parent_first,parent_last,email,phone,child_first,child_last,birthdate\n' +
        '"כהן, רות",כהן,r@x.com,050,דנה,כהן,2018-04-12',
    )
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) expect(parsed.rows[0]!.parent_first).toBe('כהן, רות')
  })

  it('refuses a wrong header outright — mis-mapped columns are worse than a refusal', () => {
    expect(parseStudentsCsv('a,b,c\n1,2,3')).toEqual({ ok: false, error: 'bad_header' })
  })

  it('refuses an empty file', () => {
    expect(parseStudentsCsv('\n\n')).toEqual({ ok: false, error: 'empty' })
  })
})

describe('ImportStudentsPanel', () => {
  it('previews the rows and imports them one by one through POST /students', async () => {
    const createStudent = vi.fn<DashboardPeopleClient['createStudent']>(
      async () => new Response('{}', { status: 201 }),
    )
    render(<ImportStudentsPanel locale="he" client={clientWith(createStudent)} />)
    const file = new File([CSV], 'students.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByTestId('import-file'), file)
    expect(await screen.findByTestId('import-preview')).toBeInTheDocument()
    expect(screen.getAllByTestId(/import-row-/)).toHaveLength(2)
    await userEvent.click(screen.getByTestId('import-run'))
    await waitFor(() =>
      expect(screen.getByTestId('import-state-1')).toHaveTextContent(
        t('he', 'people.import.row.created'),
      ),
    )
    expect(createStudent).toHaveBeenCalledTimes(2)
    expect(createStudent.mock.calls[0]![0]).toMatchObject({
      first_name: 'דנה',
      guardian: { email: 'ruth@example.com' },
    })
  })

  it('marks a refused row failed and keeps going', async () => {
    const createStudent = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 422 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    render(<ImportStudentsPanel locale="he" client={clientWith(createStudent)} />)
    await userEvent.upload(
      screen.getByTestId('import-file'),
      new File([CSV], 'students.csv', { type: 'text/csv' }),
    )
    await userEvent.click(await screen.findByTestId('import-run'))
    await waitFor(() =>
      expect(screen.getByTestId('import-state-0')).toHaveTextContent(
        t('he', 'people.import.row.failed'),
      ),
    )
    expect(screen.getByTestId('import-state-1')).toHaveTextContent(
      t('he', 'people.import.row.created'),
    )
  })

  it('says the header is wrong instead of guessing at columns', async () => {
    render(<ImportStudentsPanel locale="he" client={clientWith(vi.fn())} />)
    await userEvent.upload(
      screen.getByTestId('import-file'),
      new File(['x,y\n1,2'], 'bad.csv', { type: 'text/csv' }),
    )
    expect(await screen.findByTestId('import-parse-error')).toHaveTextContent(
      t('he', 'people.import.badHeader'),
    )
  })
})
