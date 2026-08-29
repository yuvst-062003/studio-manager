// The bottom tab bar every phone artboard draws (parent 1a/1b, staff 9a/1c/1d) and
// neither shipped app had: four icon+label destinations, active in ink, on a hairline-
// topped surface. Links, not buttons — they are navigation, they survive the back button,
// and the app's routing philosophy is real hrefs throughout.
//
// Fixed to the viewport bottom with safe-area padding; the shell adds matching block-end
// padding to <main> so content never hides beneath it (`.studio-shell--tabbed`).
import type { ReactNode } from 'react'

export type TabBarItem = {
  key: string
  label: string
  /** Omit for an action item (e.g. staff's עוד opening the drawer) — renders a button. */
  href?: string
  icon: ReactNode
  active?: boolean
  onSelect?: () => void
  /**
   * An unread count. Parent `2a` §7 — "four tabs, with an unread badge on messages".
   *
   * `0` renders nothing: an empty inbox is not a notification, and a badge showing zero is
   * a permanent mark that stops meaning anything. Counts above 99 render `99+` so a parent
   * back from a month away does not widen the bar; the exact number is not the point past
   * that, and the tab has four slots to share.
   */
  badge?: number
}

/** The badge's own text, and the suffix that goes in the accessible name. */
function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function TabBar({ items, label }: { items: TabBarItem[]; label: string }) {
  return (
    <nav aria-label={label} className="studio-tabbar" data-testid="tab-bar">
      <ul className="studio-tabbar__list">
        {items.map((item) => (
          <li key={item.key} className="studio-tabbar__slot">
            {item.href ? (
              <a
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                // The count belongs in the NAME, not only in the mark: a screen reader
                // should say "הודעות 4", and a bare numeral beside a word is not a count
                // of anything a listener can identify.
                aria-label={item.badge ? `${item.label} ${badgeLabel(item.badge)}` : undefined}
                data-testid={`tab-${item.key}`}
                className={
                  item.active ? 'studio-tabbar__item studio-tabbar__item--active' : 'studio-tabbar__item'
                }
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? (
                  <span aria-hidden="true" className="studio-tabbar__badge" data-testid={`tab-${item.key}-badge`}>
                    {badgeLabel(item.badge)}
                  </span>
                ) : null}
              </a>
            ) : (
              <button
                type="button"
                onClick={item.onSelect}
                data-testid={`tab-${item.key}`}
                className="studio-tabbar__item"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
