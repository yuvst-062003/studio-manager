import { BeltBar } from './BeltBar'
import { StatusChip } from './StatusChip'
import type { ChipStatus } from './StatusChip'

/**
 * Artboard 4h, card שורת חניך. The first composite, and the row three later lanes build
 * on: the 1c/9f roster, the 2c student card and the 3b students table. Composing BeltBar
 * and StatusChip here rather than redrawing them is what carries D7's ring into all three
 * without any of those lanes having to remember it.
 *
 * A <button> when selectable, never a div with onClick: 4h's row opens a student card,
 * and a div is unreachable by keyboard and invisible to assistive tech.
 *
 * <bdi> on the name and the group: this row is Hebrew on 4h, but M3 fills it with Latin
 * group names and phone numbers, and mixed-direction text reorders without isolation
 * (SPEC §9).
 */
export function StudentRow({
  name,
  groupLabel,
  belt,
  status,
  onSelect,
}: {
  name: string
  groupLabel: string
  belt: { colorHex: string; label: string; secondaryColorHex?: string }
  status?: { status: ChipStatus; label: string }
  onSelect?: () => void
}) {
  const content = (
    <>
      <BeltBar
        colorHex={belt.colorHex}
        label={belt.label}
        secondaryColorHex={belt.secondaryColorHex}
      />
      <span className="studio-row__text">
        <bdi className="studio-row__name">{name}</bdi>
        <bdi className="studio-row__group">{groupLabel}</bdi>
      </span>
      {status ? <StatusChip label={status.label} status={status.status} /> : null}
    </>
  )

  return onSelect ? (
    <button className="studio-row" onClick={onSelect} type="button">
      {content}
    </button>
  ) : (
    <div className="studio-row">{content}</div>
  )
}
