/** Slot filling for this feature's strings.
 *
 * `t()` performs no interpolation — `people.document.missingCount` is filled with a
 * `.replace()` at its own call site, and this is the same thing named. It stayed behind
 * when the bundles were promoted into `@studio/i18n/{he,en,ru}/techniques.ts`, because it
 * is a formatting helper rather than a string: nothing here is translated.
 */
export function fill(template: string, slots: Record<string, string | number>): string {
  return Object.entries(slots).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  )
}

export function fillGroup(template: string, group: number): string {
  return fill(template, { group })
}
