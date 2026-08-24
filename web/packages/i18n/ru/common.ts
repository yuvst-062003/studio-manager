import type { Bundle } from '../types'

/**
 * Partial by design. SPEC §15 item 9 (ru translation source) is outstanding;
 * missing keys fall back to Hebrew and are reported per-locale (SPEC §9).
 */
export const common: Bundle = {
  hello: 'Привет',
  'hello.title': 'Основа работает',
  'theme.light': 'Светлая',
  'theme.dark': 'Тёмная',
  'theme.system': 'Системная',
}
