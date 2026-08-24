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
    files: ['apps/*/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...physicalPropertySyntax, inlineStringSyntax],
    },
  },
)
