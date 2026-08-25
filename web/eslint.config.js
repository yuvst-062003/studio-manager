import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// D10 — physical properties are banned in favour of their logical equivalents.
// RTL bugs of this kind are nearly invisible to an LTR reader, so they survive
// review and surface in front of Hebrew-speaking users. The message names the
// replacement: "don't use marginLeft" without "use marginInlineStart" gets
// worked around rather than fixed.
const PHYSICAL = {
  marginLeft: 'marginInlineStart',
  marginRight: 'marginInlineEnd',
  paddingLeft: 'paddingInlineStart',
  paddingRight: 'paddingInlineEnd',
  borderLeft: 'borderInlineStart',
  borderRight: 'borderInlineEnd',
  borderLeftWidth: 'borderInlineStartWidth',
  borderRightWidth: 'borderInlineEndWidth',
  borderLeftColor: 'borderInlineStartColor',
  borderRightColor: 'borderInlineEndColor',
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
}

const physicalPropertySyntax = Object.entries(PHYSICAL).map(([bad, good]) => ({
  selector: `Property[key.name="${bad}"]`,
  message: `D10: ${bad} is banned — use ${good}. The UI is genuinely bidirectional (SPEC §9).`,
}))

// G4 — no user-facing string is ever inlined in a component. Scoped to apps
// because packages/ui primitives take their text as props.
const inlineStringSyntax = {
  selector: 'JSXText[value=/[A-Za-z\\u0590-\\u05FF]{2,}/]',
  message: 'G4: no user-facing string is inlined in a component. Use t() from @studio/i18n.',
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/*.gen.ts',
      '**/schema.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off', // TypeScript already checks this, and knows the DOM lib.
      'no-restricted-syntax': ['error', ...physicalPropertySyntax],
    },
  },
  {
    // Build-time node scripts. Browser globals too: Playwright page.evaluate()
    // callbacks are browser code that lexically lives inside a node script.
    // D10 does not apply — these emit assets, they do not author styles.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['apps/*/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...physicalPropertySyntax, inlineStringSyntax],
    },
  },
  {
    // G4 reaches the dev bar too. It lives in packages/ui because all three apps mount
    // it, but unlike every primitive beside it, it is a feature that carries its own
    // copy rather than taking text as props — and its persona labels are the product's
    // own role names, so inline Hebrew here would be a second set that drifts from
    // `people`'s the day M1 lands. Extended rather than exempted: an ESLint hole in
    // developer-only code is a precedent a later lane can cite.
    //
    // Test files are excluded from that extension. A dev-bar `.test.tsx` fixture string
    // (a stub tool's stand-in label, asserted with getByText) is never shipped, never
    // reaches a translator, and never needs locale parity — G4 has nothing to protect
    // there. Forcing it through t() anyway does not add a real translation; it launders
    // a bare literal through an expression container so the JSXText selector stops
    // seeing it, which is worse: it plants a pattern someone will copy onto real copy
    // in a file G4 *does* need to police. The exclusion is scoped to this one block —
    // `apps/*/src/**/*.tsx` still covers app test files, unchanged.
    files: ['packages/ui/src/dev-bar/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...physicalPropertySyntax, inlineStringSyntax],
    },
  },
)
