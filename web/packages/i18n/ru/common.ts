import type { Bundle } from '../types'

/**
 * SPEC §15 item 9 (the ru translation source) is settled: machine-translated UI strings,
 * reviewed by a native speaker before launch. Until that review, `i18n-parity.mjs` keeps
 * `ru` on *report* rather than *strict* — see web/scripts/i18n-parity.mjs POLICY.
 *
 * The `fontProof` values are deliberately identical across locales: they are script
 * samples proving Rubik covers Hebrew, Latin and Cyrillic (D6), not translatable copy.
 */
export const common: Bundle = {
  hello: 'Привет',
  'appName.staff': 'Студия — Персонал',
  'appName.parent': 'Студия — Родители',
  'appName.dashboard': 'Студия — Управление',
  'hello.title': 'Основа работает',
  'hello.fontProof.hebrew': 'אבגד הוזח',
  'hello.fontProof.latin': 'ABCD efgh',
  'hello.fontProof.cyrillic': 'АБВГ абвг',
  'hello.fontProof.digits': '0123',
  'hello.direction': 'Направление письма',
  'hello.theme': 'Тема',
  'theme.light': 'Светлая',
  'theme.dark': 'Тёмная',
  'theme.system': 'Системная',
  'displayMode.standalone': 'Установлено на главный экран',
  'displayMode.browser': 'Работает в браузере',
  'storage.persisted': 'Постоянное хранилище разрешено',
  'storage.notPersisted': 'Постоянное хранилище не разрешено',
  'storage.unsupported': 'Постоянное хранилище не поддерживается в этом браузере',
}
