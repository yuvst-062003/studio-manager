// `@studio/i18n`'s `t()` does plain lookup with no substitution; `plural()` interpolates
// but is keyed on a count and a `Intl.PluralRules` category, which is the wrong tool for
// "load {{name}}" or "next: work ({{time}})" — none of this screen's templated strings
// pluralize on anything. This is the same `{{name}}` reduce `translatePlural` already does
// internally, exposed here for the templates that have no count to plural on.
export function interpolate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template,
  )
}
