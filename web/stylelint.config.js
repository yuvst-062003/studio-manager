// D10 — physical CSS properties are banned in favour of their logical equivalents.
//
// This is the CSS half of the rule; web/eslint.config.js is the JS half. They are two
// separate mechanisms because ESLint's `no-restricted-syntax` reads JS object properties
// and cannot see a stylesheet at all — verified in M0.3 by planting `margin-left` in
// tokens.css and watching `lane-check.sh core` stay green at exit 0.
//
// A JS config rather than the previous .stylelintrc.json purely so `message` can be a
// FUNCTION. The ESLint half already names the specific replacement for each property,
// because "don't use marginLeft" without "use marginInlineStart" gets worked around
// rather than fixed. JSON can only carry one message for the whole list.

const REPLACEMENT = {
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  'border-top-left-radius': 'border-start-start-radius',
  'border-top-right-radius': 'border-start-end-radius',
  'border-bottom-left-radius': 'border-end-start-radius',
  'border-bottom-right-radius': 'border-end-end-radius',
  left: 'inset-inline-start',
  right: 'inset-inline-end',
  // `inset: 0` is genuinely direction-safe, but `inset: 0 auto 0 0` is not, and no
  // linter can read a reviewer's intent from the shorthand. The pair says what it means.
  inset: 'inset-block and inset-inline',
  // clear only exists to undo a float, and float is itself banned below.
  clear: 'flex or grid',
}

const logicalFor = (property) => {
  const direct = REPLACEMENT[property.toLowerCase()]
  if (direct) return direct
  const longhand = /^border-(left|right)-(.+)$/.exec(property.toLowerCase())
  if (longhand) return `border-inline-${longhand[1] === 'left' ? 'start' : 'end'}-${longhand[2]}`
  return 'the -inline-start / -inline-end equivalent'
}

export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/node_modules/**', '**/dist/**', '**/dev-dist/**'],
  rules: {
    'property-disallowed-list': [
      [
        ...Object.keys(REPLACEMENT),
        // The longhands. Only the `border-left` / `border-right` shorthands were listed
        // before, so `border-left-width` was invisible.
        /^border-(left|right)-/,
      ],
      {
        message: (property) =>
          `D10: ${property} is banned — use ${logicalFor(property)}. ` +
          'The UI is genuinely bidirectional (SPEC §9), and an RTL bug of this kind is ' +
          'nearly invisible to an LTR reader.',
      },
    ],
    'declaration-property-value-disallowed-list': [
      {
        'text-align': ['left', 'right'],
        float: ['left', 'right'],
      },
      {
        // stylelint calls this as (property, value) — verified by probe, not assumed.
        message: (property, value) =>
          property === 'float'
            ? `D10: float: ${value} has no logical form — use flex or grid.`
            : `D10: ${property}: ${value} is banned — use the flow-relative value, start or end.`,
      },
    ],
    'custom-property-pattern': null,
    'import-notation': null,
    'selector-class-pattern': null,
  },
}
