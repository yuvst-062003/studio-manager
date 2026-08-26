// 4e, mounted (design pass 2026-08-27). `DocumentsScreen` and `TemplateEditor` were
// built and unit-tested in W3 and imported by nothing — a manager had no way to see who
// still owes a declaration, which is the screen §5.5's chase loop lives on. One state
// bit decides which of the pair renders; the editor's own back affordance is a Button
// here so the pair stays two dumb screens.
import { useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DocumentsScreen } from './DocumentsScreen'
import { TemplateEditor } from './TemplateEditor'
import { makeHealthClient } from './healthClient'

export function DocumentsSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeHealthClient(apiFetch), [])
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            {t(locale, 'health.documents.backToList')}
          </Button>
        </div>
        <TemplateEditor locale={locale} client={client} />
      </div>
    )
  }
  return <DocumentsScreen locale={locale} client={client} onEditTemplate={() => setEditing(true)} />
}
