import type { Bundle } from '../types'

/**
 * Mirror of `he/reports.ts`, privacy included under `privacy.*`. `ru` is `report` in the
 * parity policy until SPEC §15 item 9's native-speaker review (HB-ru-review); the keys are
 * complete so the gate flips to `strict` by changing one word.
 */
export const reports: Bundle = {
  // -- the reports screen (dashboard 4g) -----------------------------------------
  'title': 'Отчёты',
  'empty': 'Нет данных за выбранный период',
  'period': 'Период',
  'period.thisMonth': 'Текущий месяц',
  'period.lastMonth': 'Прошлый месяц',
  'period.last12Months': 'Последние 12 месяцев',
  'period.custom': 'Свой диапазон',
  'export': 'Экспорт',
  'export.csv': 'Экспорт в CSV',
  'export.xlsx': 'Экспорт в Excel',
  'export.ready': 'Файл готов',

  // -- studio overview (§5.14) -----------------------------------------------------
  'overview.title': 'Обзор',
  'overview.activeStudents': 'Активные ученики',
  'overview.activeGroups': 'Активные группы',
  'overview.sessionsThisWeek': 'Занятий на этой неделе',
  'overview.attendanceToday': 'Посещаемость сегодня',
  'overview.openRegistrations': 'Открытые заявки на запись',
  'overview.outstandingDebt': 'Открытая задолженность',

  // -- financial (§5.14) ------------------------------------------------------------
  'financial.title': 'Финансовый отчёт',
  'financial.collectedVsExpected': 'Собрано и ожидалось',
  'financial.collected': 'Собрано',
  'financial.expected': 'Ожидалось',
  'financial.trend12m': 'Динамика за 12 месяцев',
  'financial.debtByPayer': 'Задолженность по плательщикам',
  'financial.byMethod': 'Платежи по способу оплаты',
  'financial.chargesCreated': 'Создано начислений',
  'financial.chargesSettled': 'Оплачено начислений',
  'financial.chargesVoided': 'Аннулировано начислений',
  'financial.chargesWrittenOff': 'Списано начислений',
  'financial.unreconciled': 'Платежи без привязки',
  'financial.pendingOrders': 'Заказы в ожидании более 24 часов',

  // -- funnel (§5.14, from student_status_history) -----------------------------------
  'funnel.title': 'Воронка записи',
  'funnel.enquiries': 'Обращения',
  'funnel.trialsBooked': 'Записались на пробное',
  'funnel.trialsAttended': 'Пришли на пробное',
  'funnel.converted': 'Записались в клуб',
  'funnel.conversionRate': 'Конверсия',
  'funnel.daysToConvert': 'Среднее число дней до записи',
  'funnel.bySource': 'По источнику',
  'funnel.trialsThisWeek': 'Пробные на этой неделе',
  'funnel.notFollowedUp': 'Без обратной связи',

  // -- operational (§5.14) ------------------------------------------------------------
  'operational.title': 'Операционный отчёт',
  'operational.attendanceRate': 'Посещаемость',
  'operational.byGroup': 'По группам',
  'operational.byStudent': 'По ученикам',
  'operational.sessionsHeld': 'Проведено занятий из запланированных',
  'attendance.unmarkedExcluded': 'Неотмеченные занятия не считаются пропусками',
  'operational.newEnrollments': 'Новые записи',
  'operational.dropouts': 'Ушли',
  'operational.netChange': 'Чистое изменение',
  'operational.missingHealth': 'Нет медицинской декларации',
  'operational.coachSessionCounts': 'Занятия по тренерам',

  // -- at risk (§5.14) ------------------------------------------------------------------
  'atRisk.title': 'Ученики в зоне риска',
  'atRisk.subtitle': 'Три и более пропуска подряд',
  'atRisk.consecutiveAbsences': 'Пропусков подряд: {{count}}',
  'atRisk.contactParent': 'Связаться с родителем',
  'atRisk.empty': 'Учеников в зоне риска нет',
  'atRisk.contacted': 'Связались',

  // -- §11.3's data export ------------------------------------------------------------
  'privacy.title': 'Приватность и личные данные',
  'privacy.export.title': 'Запрос на выгрузку данных',
  'privacy.export.description': 'Все данные о ваших детях, одним файлом',
  'privacy.export.request': 'Запросить выгрузку',
  'privacy.export.requested': 'Запрос принят',
  'privacy.export.status.pending': 'В очереди',
  'privacy.export.status.running': 'Готовится',
  'privacy.export.status.completed': 'Готово к скачиванию',
  'privacy.export.status.failed': 'Подготовка не удалась',
  'privacy.export.status.expired': 'Срок ссылки истёк',
  'privacy.export.download': 'Скачать файл',
  'privacy.export.linkExpires': 'Ссылка доступна ограниченное время',
  'privacy.export.requestAgain': 'Запросить снова',
  'privacy.export.preparingHint': 'Подготовка может занять несколько минут',

  // -- §11.4's anonymization -----------------------------------------------------------
  'privacy.anonymize.title': 'Удаление личных данных',
  'privacy.anonymize.action': 'Удалить данные',
  'privacy.anonymize.confirm': 'Подтвердить удаление',
  'privacy.anonymize.done': 'Данные удалены',
  'privacy.anonymize.whatHappens': 'Имя, дата рождения, телефон, почта и фото будут удалены. Медицинские декларации и подписи уничтожаются',
  'privacy.anonymize.whatRemains': 'Записи о начислениях и платежах сохраняются по требованию закона, без имени',
  'privacy.anonymize.irreversible': 'Действие необратимо',

  // -- §11.5's retention ----------------------------------------------------------------
  'privacy.retention.title': 'Хранение данных',
  'privacy.retention.setting': 'Удалять автоматически через',
  'privacy.retention.months': '{{count}} мес.',
  'privacy.retention.preview': 'Что будет удалено при следующем запуске',
  'privacy.retention.previewCount': 'Ушедших учеников: {{count}}',
  'privacy.retention.exempt': 'Исключить из удаления',
  'privacy.retention.exempted': 'Исключён',
  'privacy.retention.empty': 'Нет записей для удаления',

  // -- §11.6's consent -------------------------------------------------------------------
  'privacy.consent.title': 'Согласия',
  'privacy.consent.version': 'Версия',
  'privacy.consent.givenAt': 'Дано',
  'privacy.consent.revoke': 'Отозвать согласие',
  'privacy.consent.revokedRecorded': 'Отзыв согласия записан',
  'privacy.consent.type.terms': 'Условия использования',
  'privacy.consent.type.privacy_policy': 'Политика конфиденциальности',
  'privacy.consent.type.photo': 'Публикация фотографий',
  'privacy.consent.type.medical_flags': 'Передача медицинских отметок тренерам',
  'privacy.consent.type.event': 'Участие в мероприятии',
  'privacy.photo.allowed': 'Фотографии публиковать можно',
  'privacy.photo.notAllowed': 'Фотографии публиковать нельзя',
  'privacy.photo.notRecorded': 'Согласие не зафиксировано',
}
