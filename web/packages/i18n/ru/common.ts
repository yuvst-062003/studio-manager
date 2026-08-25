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
  'theme.legend': 'Тема',
  'theme.state.light': 'Сейчас: светлая',
  'theme.state.dark': 'Сейчас: тёмная',
  'displayMode.standalone': 'Установлено на главный экран',
  'displayMode.browser': 'Работает в браузере',
  'storage.persisted': 'Постоянное хранилище разрешено',
  'storage.notPersisted': 'Постоянное хранилище не разрешено',
  'storage.unsupported': 'Постоянное хранилище не поддерживается в этом браузере',
  // §19.4 — the dev bar. Developer-only UI, but UI: these go through i18n like
  // everything else, because the persona labels are the product's own role names.
  'dev.title': 'РАЗРАБОТКА',
  'dev.actingAs': 'действует как',
  'dev.noPersona': 'нет активной роли',
  // The shell and the nav drawer.
  'nav.menu': 'меню',
  'nav.closeMenu': 'закрыть меню',
  'nav.studioSwitcher': 'студия',
  'nav.demoStudio': 'демо',
  'nav.today': 'сегодня',
  'nav.schedule': 'расписание',
  'nav.students': 'ученики',
  'nav.attendance': 'посещаемость',
  'nav.announcements': 'объявления',
  'nav.payments': 'платежи',
  'nav.myChildren': 'мои дети',
  'nav.settings': 'настройки',
  'nav.signOut': 'выйти',
  // §19.4's persona switcher.
  'dev.persona.label': 'действует как',
  'dev.persona.placeholder': 'выберите роль',
  'dev.persona.owner': 'владелец',
  'dev.persona.manager': 'менеджер',
  'dev.persona.lead': 'главный тренер',
  'dev.persona.assistant': 'помощник тренера',
  'dev.persona.parent3': 'родитель (3 ребёнка)',
  'dev.persona.parent1': 'родитель (один ребёнок)',
  'dev.persona.trial': 'родитель (пробное)',
  'dev.persona.both': 'родитель + тренер',
  'dev.persona.none': 'без прав',
  // §19.3 — 'There is no student persona, because students have no login in v1, and
  // the dev bar says so explicitly, so the gap is visible rather than confusing.'
  'dev.noStudentPersona': 'нет роли ученика — у учеников нет входа в версии 1',
  'dev.tool.offline': 'офлайн',
  'dev.tool.slow': 'медленно',
  'dev.tool.timeTravel': 'путешествие во времени',
  'dev.tool.runJob': 'запустить задачу',
  'dev.tool.simulateIpn': 'симуляция IPN',
  'dev.tool.resetDemo': 'сброс демо-данных',
  'dev.pendingIn': 'появится в ',
  'dev.timeTravel.plusMonth': '+1 месяц',
  'dev.timeTravel.now': 'вернуться к текущему времени',
  'dev.ipn.success': 'успех',
  'dev.ipn.amount_mismatch': 'несовпадение суммы',
  'dev.ipn.forged_ref': 'поддельный идентификатор',
  'dev.ipn.duplicate': 'дубликат',
  'dev.ipn.orderRef': 'идентификатор заказа',
  'dev.noticeIcon': 'внимание',
}
