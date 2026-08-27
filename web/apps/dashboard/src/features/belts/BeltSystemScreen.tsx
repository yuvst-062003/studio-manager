// Artboard 5b — מערכת חגורות, where the belt system is defined.
//
// **This artboard governs `BeltBar`'s API and D7's scope more than any other**, because
// everywhere else in the product renders `belt_rank.color_hex` and here it is set. The one
// rule that matters: every swatch is a `BeltBar`, and `BeltBar` rings unconditionally. The
// canvas rings two of six by eye, in a translucent tint; D7 is not a judgement about which
// belts would otherwise vanish, and D12 adds two more that fail on the dark ground.
//
// **The picker is bounded, and that is what makes it legitimate.** D1 forbids a studio
// choosing an arbitrary brand colour because an arbitrary hex can fail a contrast check. A
// belt colour is per-class data (D3), and a bounded palette keeps it auditable — so the
// control is a radio grid over `BELT_PALETTE` and there is deliberately no hex field.
//
// **Reordering is buttons, not drag.** There is no drag primitive in `@studio/ui` and no
// shared drag utility, and a primitive is not a lane's to add. The write is the same
// either way: the whole finished order, because a pairwise swap through
// `uq_belt_rank_class_order` has to pass through a colliding intermediate state.
//
// **No tenure or attendance column.** The canvas gives the table both; neither has a
// `belt_rank` column to be stored in, and §5.9 computes eligibility from the current rank
// and the time held in it. A per-rank threshold is a model change, not a UI one.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BeltBar, Button, Card, EmptyState, LoadFailed, Radio, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BELT_PALETTE } from './client'
import type { BeltRankIn, DashboardBeltsClient, LadderRankOut } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }

const tableStyle: CSSProperties = { borderCollapse: 'collapse', inlineSize: '100%' }

const cellStyle: CSSProperties = {
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textAlign: 'start',
}

const headStyle: CSSProperties = {
  ...cellStyle,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const errorStyle: CSSProperties = { ...hintStyle, color: 'var(--danger)' }

const paletteStyle: CSSProperties = {
  border: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  margin: 0,
  padding: 0,
}

const editorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const rowActionsStyle: CSSProperties = { display: 'flex', gap: 'var(--space-1)' }

type Draft = {
  name: string
  kyu: string
  colorHex: string
  secondaryColorHex: string | null
}

const BLANK: Draft = { name: '', kyu: '', colorHex: BELT_PALETTE[0]!, secondaryColorHex: null }

/** The list with one rank moved. Exported so the reorder rule is testable on its own. */
export function moved(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

export function BeltSystemScreen({
  classId,
  client,
  locale,
}: {
  classId: string
  client: DashboardBeltsClient
  locale: Locale
}) {
  const [ladder, setLadder] = useState<LadderRankOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    client
      .ladder(classId)
      .then((page) => {
        if (!live) return
        setLadder(page.items)
        setLoaded(true)
      })
      // F1a — a failed load must not masquerade as loaded-and-empty.
      .catch(() => live && setLoadFailed(true))
    return () => {
      live = false
    }
  }, [client, classId, reloadKey, attempt])

  const reload = () => setReloadKey((key) => key + 1)

  const remove = async (row: LadderRankOut) => {
    // 5b finding 7 — the canvas draws a delete icon with no confirmation on a row that
    // shows a student count. The count is the data to refuse with, and refusing here means
    // the 409 the server would send never has to be explained after the fact.
    if (row.holders > 0) {
      setRefusal(t(locale, 'events.belt.deleteHeld'))
      return
    }
    setRefusal(null)
    await client.deleteRank(row.id)
    reload()
  }

  const move = async (row: LadderRankOut, delta: -1 | 1) => {
    await client.reorder(
      classId,
      moved(
        ladder.map((rank) => rank.id),
        row.id,
        delta,
      ),
    )
    reload()
  }

  const save = async () => {
    if (!draft) return
    const body: BeltRankIn = {
      class_id: classId,
      name: draft.name.trim(),
      kyu: draft.kyu ? Number(draft.kyu) : null,
      // Appended to the end. `5b` reorders afterwards, and picking a position at creation
      // is what makes `uq_belt_rank_class_order` fire on an ordinary add.
      order_index: ladder.length,
      color_hex: draft.colorHex,
      secondary_color_hex: draft.secondaryColorHex,
    }
    await client.createRank(body)
    setDraft(null)
    reload()
  }

  if (loadFailed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <div style={pageStyle}>
      <header>
        <h2 style={{ margin: 0 }}>{t(locale, 'events.belt.title')}</h2>
        {/* `belt.perClassHint` says the system is defined per class, and the canvas has no
            class selector — the screen is scoped by the class it is opened for. */}
        <p style={hintStyle}>{t(locale, 'events.belt.perClassHint')}</p>
      </header>

      {/* `role="alert"` because this appears AFTER load, in response to a press: without it
          a screen-reader user presses save, nothing is announced, and the only signal that
          the write was refused is that the text above turned red — SC 1.4.1 and 4.1.3 in one
          line. Every other error in the tree already does this; this one was missed. */}
      {refusal ? (
        <p role="alert" style={errorStyle}>
          {refusal}
        </p>
      ) : null}

      {loaded && ladder.length === 0 ? (
        <EmptyState title={t(locale, 'events.belt.empty')} />
      ) : (
        <Card>
          <table style={tableStyle}>
            <caption style={hintStyle}>{t(locale, 'events.belt.rankPlural')}</caption>
            <thead>
              <tr>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.color')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.name')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.kyu')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.holders')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.order')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((row, index) => (
                <tr key={row.id}>
                  <td style={cellStyle}>
                    {/* One BeltBar per rank — never a hand-built swatch. The ring is its
                        guarantee and it has no prop that turns it off. */}
                    <BeltBar
                      colorHex={row.color_hex}
                      label={row.name}
                      secondaryColorHex={row.secondary_color_hex ?? undefined}
                    />
                  </td>
                  <th scope="row" style={cellStyle}>
                    {row.name}
                  </th>
                  <td style={cellStyle}>{row.kyu ?? '—'}</td>
                  <td style={cellStyle}>{row.holders}</td>
                  <td style={cellStyle}>
                    <span style={rowActionsStyle}>
                      {index > 0 ? (
                        <Button onClick={() => void move(row, -1)} variant="ghost">
                          {t(locale, 'events.belt.moveUp')}
                        </Button>
                      ) : null}
                      {index < ladder.length - 1 ? (
                        <Button onClick={() => void move(row, 1)} variant="ghost">
                          {t(locale, 'events.belt.moveDown')}
                        </Button>
                      ) : null}
                      <Button onClick={() => void remove(row)} variant="destructive">
                        {t(locale, 'events.belt.delete')}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {draft === null ? (
        <p style={{ margin: 0 }}>
          <Button onClick={() => setDraft(BLANK)} variant="primary">
            {t(locale, 'events.belt.add')}
          </Button>
        </p>
      ) : (
        <Card>
          <div style={editorStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'events.belt.edit')}</h3>
            <TextField
              label={t(locale, 'events.belt.name')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              value={draft.name}
            />
            <TextField
              hint={t(locale, 'events.belt.kyuOptional')}
              inputMode="numeric"
              label={t(locale, 'events.belt.kyu')}
              onChange={(e) => setDraft({ ...draft, kyu: e.target.value })}
              value={draft.kyu}
            />

            {/* The bounded picker. Semantically a radio group; visually nothing like one. */}
            <fieldset role="radiogroup" style={paletteStyle}>
              <legend style={hintStyle}>{t(locale, 'events.belt.color')}</legend>
              {BELT_PALETTE.map((hex) => (
                <Radio
                  checked={draft.colorHex === hex}
                  key={hex}
                  label={hex}
                  name="belt-colour"
                  onChange={() => setDraft({ ...draft, colorHex: hex })}
                  value={hex}
                />
              ))}
            </fieldset>

            <p style={hintStyle}>{t(locale, 'events.belt.preview')}</p>
            <BeltBar
              colorHex={draft.colorHex}
              label={draft.name || t(locale, 'events.belt.rank')}
              secondaryColorHex={draft.secondaryColorHex ?? undefined}
            />

            <span style={rowActionsStyle}>
              <Button onClick={() => void save()} variant="primary">
                {t(locale, 'events.belt.save')}
              </Button>
              <Button onClick={() => setDraft(null)} variant="secondary">
                {t(locale, 'events.form.cancel')}
              </Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
