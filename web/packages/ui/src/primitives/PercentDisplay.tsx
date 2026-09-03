/**
 * A percentage, as an isolated left-to-right digit run — the same rule `MoneyDisplay` and
 * `RangeText` both follow.
 *
 * §3.3 of the completion findings register: the collections KPI card put `MoneyDisplay`
 * (already correctly isolated) directly beside an un-isolated `{{percent}}%` note with no
 * separator, and the bidi algorithm reordered the two adjacent digit runs into `0%₪0`
 * rather than the intended `₪0 · 0%`. `MoneyDisplay`'s own `<bdi>` only isolates ITS run;
 * it says nothing about a neighbour that has none of its own.
 */
export function PercentDisplay({ value, label }: { value: number; label?: string }) {
  return (
    <span aria-label={label} className="studio-percent">
      <bdi dir="ltr">{value}%</bdi>
    </span>
  )
}
