/**
 * `t()` returns the raw string; the `{{count}}` convention is filled here.
 *
 * This is the shared home going forward — new callers import `fill` from `@studio/core`.
 * Two private copies of this exact function still exist, in
 * `features/schedule/client.ts` and `features/rollover/client.ts`, and were deliberately
 * left in place rather than re-pointed to this one: collapsing them touches files other
 * lanes were mid-editing at the time this was extracted, so that cleanup belongs in a
 * change that owns those files, not this one.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole,
  )
}
