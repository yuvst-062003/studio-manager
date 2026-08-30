import type { Bundle } from '../types'

/**
 * Mirror of `he/comms.ts`. `ru` is `report` in the parity policy until SPEC §15 item 9's
 * native-speaker review (HB-ru-review); the keys are complete so the gate flips to
 * `strict` by changing one word rather than by writing a namespace.
 */
export const comms: Bundle = {
  // -- the parent inbox (parent 2b ▲ D9.1 — inbox only) --------------------------
  'inbox.fillDeclaration': 'Заполнить декларацию',
  'inbox.later': 'Позже',
  'inbox.title': 'Новости клуба',
  'inbox.empty': 'Обновлений нет',
  'inbox.emptyHint': 'Сообщения от клуба появятся здесь',
  'inbox.unread': 'Непрочитанные',
  'inbox.markRead': 'Отметить прочитанным',
  'inbox.markAllRead': 'Отметить все прочитанными',
  'inbox.new': 'Новое',
  'inbox.older': 'Ранее',

  // -- publishing (dashboard 4f) --------------------------------------------------
  'announcement.title': 'Сообщения',
  'announcement.create': 'Новое сообщение',
  'announcement.subject': 'Заголовок',
  'announcement.body': 'Текст сообщения',
  'announcement.empty': 'Сообщений пока не было',
  'announcement.publish': 'Отправить',
  'announcement.published': 'Сообщение отправлено',
  'announcement.schedule': 'Запланировать',
  'announcement.scheduledFor': 'Будет отправлено',
  'announcement.draft': 'Черновик',
  'announcement.cancelSchedule': 'Отменить планирование',
  'announcement.delete': 'Удалить сообщение',

  // -- who it goes to -------------------------------------------------------------
  'audience.title': 'Аудитория',
  'audience.studio': 'Весь клуб',
  'audience.class': 'Секция',
  'audience.group': 'Группа',
  'audience.recipients': 'Получат семей: {{count}}',
  'audience.none': 'Аудитория не выбрана',
  'audience.limitedToOwnGroups': 'Можно отправлять группам, которые вы тренируете',

  'preview.title': 'Предпросмотр',
  'preview.asParent': 'Как увидит родитель',
  'preview.pushLine': 'Так уведомление выглядит на экране блокировки',

  // -- §5.11's delivery report ------------------------------------------------------
  'delivery.title': 'Отчёт о доставке',
  'delivery.sent': 'Отправлено семьям: {{count}}',
  'delivery.received': 'Получили: {{count}}',
  'delivery.missed': 'Не получили: {{count}}',
  'delivery.inFlight': 'Сообщение ещё отправляется',
  'delivery.allReceived': 'Сообщение получили все семьи',
  'delivery.reason.no_token': 'Приложение не установлено',
  'delivery.reason.denied': 'Уведомления отключены',
  'delivery.reason.failed': 'Отправка не удалась',
  'delivery.copyNumbers': 'Скопировать номера',
  'delivery.numbersCopied': 'Номера скопированы',
  'delivery.resend': 'Отправить ещё раз',
  'delivery.shareToWhatsapp': 'Отправить также в WhatsApp',

  // -- the push-disabled banner (§5.11) ---------------------------------------------
  'pushDisabled.title': 'Уведомления отключены',
  'pushDisabled.body': 'Вы не узнаете об отменённых занятиях',
  'pushDisabled.openSettings': 'Открыть настройки',
  'pushDisabled.iosNeedsInstall':
    'На iPhone добавьте приложение на домашний экран, чтобы получать уведомления',
  'pushEnabled.confirmation': 'Уведомления включены',
  'push.enable': 'Включить уведомления',

  // -- notification preferences (§5.11) ---------------------------------------------
  'preferences.title': 'Настройки уведомлений',
  'preferences.subtitle': 'Каждый тип можно отключить отдельно',
  'preferences.on': 'Включено',
  'preferences.off': 'Отключено',
  'preferences.alwaysOn': 'Это уведомление отправляется всегда',
  'preferences.kind.session_cancelled': 'Отмена или перенос занятия',
  'preferences.kind.coach_substituted': 'Замена тренера',
  'preferences.kind.announcement': 'Сообщения клуба',
  'preferences.kind.event': 'Мероприятия и соревнования',
  'preferences.kind.payment': 'Платежи и начисления',
  'preferences.kind.belt': 'Пояса и экзамены',
  'preferences.kind.attendance': 'Посещаемость',
  'preferences.kind.health': 'Медицинские декларации',

  // -- §5.12's calendar feed ---------------------------------------------------------
  'calendar.title': 'Синхронизация с календарём',
  'calendar.subtitle': 'Занятия и мероприятия появятся в вашем календаре',
  'calendar.addGoogle': 'Добавить в Google Календарь',
  'calendar.addApple': 'Добавить в Apple Календарь',
  'calendar.copyLink': 'Скопировать ссылку',
  'calendar.linkCopied': 'Ссылка скопирована',
  'calendar.rotate': 'Заменить ссылку',
  'calendar.rotated': 'Ссылка заменена — прежняя больше не работает',
  'calendar.rotateWarning': 'Замена ссылки отключает все уже синхронизированные календари',
  'calendar.lastRotated': 'Заменена',
  'calendar.rotateKeep': 'Оставить текущую ссылку',
  'calendar.refreshDelay':
    'Google Календарь может отставать до суток. Отмены всегда приходят уведомлением',
  'calendar.addSingleEvent': 'Добавить мероприятие в календарь',

  // -- §6.5's value pre-prompt, and the iOS path with no prompt at all ---------------
  'push.prePrompt.title': 'Сообщать вам?',
  'push.prePrompt.body': 'Мы сообщим, если занятие отменят',
  'push.prePrompt.accept': 'Да, сообщайте',
  'push.prePrompt.decline': 'Не сейчас',
  'push.iosTabHasNoApi':
    'Чтобы получать уведомления на iPhone, добавьте приложение на главный экран',
  'push.registered': 'Устройство будет получать уведомления',

  // -- §6.5's install-state list, beside the delivery report -------------------------
  'install.title': 'Кто может получать уведомления',
  'install.installed': '{{count}} установили приложение',
  'install.notInstalled': '{{count}} не установили',
  'install.callThem': 'С этими семьями можно связаться только по телефону',
  'install.emptyGood': 'Все семьи установили приложение',
  'install.platform.ios': 'iPhone',
  'install.platform.android': 'Android',
  'install.platform.web': 'Браузер',

  // -- §5.14's at-risk alert ---------------------------------------------------------
  'atRisk.title': 'Ученики в зоне риска',
  'atRisk.body': '{{name}} пропустил(а) {{count}} занятия подряд',
  'atRisk.contactParent': 'Позвонить родителю',
  'atRisk.noPhone': 'Нет номера телефона',
  'atRisk.empty': 'Нет учеников в зоне риска',

  'calendar.coachSubtitle': 'Занятия, которые вы ведёте, появятся в вашем календаре',
  'inbox.joinClub': 'Вступить в клуб',
}
