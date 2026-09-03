import { useState } from 'react'
import { useModalDialog } from '../useModalDialog'

/**
 * One row action. `destructive` is a placement instruction, not a style the caller
 * chooses freely — `RowActions` always renders the destructive action(s) last, behind a
 * separator, regardless of where they sit in `actions` (B4.4: "the last item, separated,
 * and keeps its `--danger` colour there — where it has distance").
 */
export type RowAction = {
  id: string
  label: string
  onSelect: () => void
  destructive?: boolean
}

/**
 * The `⋯` overflow menu B1, B3 and B4 all need — one control per row instead of two or
 * three ghost buttons stacked into a 140px-tall row.
 *
 * Both the trigger's accessible name and every item's label are **props from the
 * caller** — `schedule.groups.rowActions`, `common.staff.rowActions`,
 * `attendance.report.rowActions` and the item strings all come from i18n keys a screen
 * owns. This primitive inlines none of them.
 *
 * Reuses `useModalDialog` (`AccessibilityMenu`'s own pattern): focus moves into the menu
 * on open, Tab is trapped inside it, Escape closes it, and focus returns to the trigger —
 * the same guarantee a screen reader and a keyboard user get from any other popup in this
 * repo, rather than a second focus implementation.
 */
export function RowActions({
  triggerLabel,
  actions,
}: {
  /**
   * The trigger's accessible name. `t()` performs no interpolation — the caller fills
   * the name with `@studio/core`'s `fill()`, e.g.
   * `fill(t(locale, 'schedule.groups.rowActions'), { name })`.
   */
  triggerLabel: string
  actions: RowAction[]
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useModalDialog(open, () => setOpen(false))

  const regular = actions.filter((action) => !action.destructive)
  const destructive = actions.filter((action) => action.destructive)

  function select(action: RowAction) {
    setOpen(false)
    action.onSelect()
  }

  function renderItem(action: RowAction) {
    return (
      <button
        className="studio-row-actions__item"
        data-destructive={action.destructive ? 'true' : undefined}
        key={action.id}
        onClick={() => select(action)}
        role="menuitem"
        type="button"
      >
        {action.label}
      </button>
    )
  }

  return (
    <div className="studio-row-actions">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className="studio-row-actions__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {/* Three dots, drawn — never an emoji (repo rule). currentColor, like every other
         * icon in this file set, so it never carries its own colour decision. */}
        <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
          <circle cx="5" cy="12" fill="currentColor" r="1.8" />
          <circle cx="12" cy="12" fill="currentColor" r="1.8" />
          <circle cx="19" cy="12" fill="currentColor" r="1.8" />
        </svg>
      </button>

      {open ? (
        <div
          aria-label={triggerLabel}
          className="studio-row-actions__menu"
          ref={menuRef}
          role="menu"
          tabIndex={-1}
        >
          {regular.map(renderItem)}
          {destructive.length > 0 ? (
            <>
              <div className="studio-row-actions__separator" role="separator" />
              {destructive.map(renderItem)}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
