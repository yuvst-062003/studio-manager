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
  'period.nextMonth': 'Следующий месяц',
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
  'financial.notYetDue': 'Срок оплаты не наступил',
  'financial.studentsBilled': 'Выставлено ученикам',
  'financial.collectionRate': 'Процент сбора',
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
  // ==================================================================================
  // §6.1 step 5's BLOCKING gate. **The policy and terms below are an UNREVIEWED DRAFT** —
  // see the long note in `he/reports.ts`.
  // ==================================================================================
  'privacy.draft.badge': 'Черновик',
  'privacy.draft.notice':
    'Текст ниже написан командой разработки и не проверен юристом. Он достоверно описывает то, что система действительно делает, но не является юридической консультацией и, вероятно, изменится. Согласия, данные на этот текст, помечены текущей версией, и их можно найти снова.',
  'privacy.doc.version': 'Версия текста',

  // -- условия использования ----------------------------------------------------------
  'privacy.terms.title': 'Условия использования',
  'privacy.terms.s1.title': 'Что это за сервис',
  'privacy.terms.s1.body':
    'Приложение работает для клуба, в котором занимаются ваши дети, и служит для записи, расписания, посещаемости, платежей, медицинских деклараций и сообщений от клуба.',
  'privacy.terms.s2.title': 'Кто может им пользоваться',
  'privacy.terms.s2.body':
    'Учётная запись предназначена для опекуна записанного ученика или для совершеннолетнего ученика. Вход выполняется через аккаунт Google или Apple; мы не создаём и не храним пароль.',
  'privacy.terms.s3.title': 'Ваша ответственность',
  'privacy.terms.s3.body':
    'Данные, которые вы предоставляете, — и прежде всего медицинская декларация — должны быть верными и актуальными. Тренер в зале видит только медицинские отметки, и они выводятся из ваших ответов. Пропущенный или неверный ответ — это риск для безопасности ребёнка.',
  'privacy.terms.s4.title': 'Платежи',
  'privacy.terms.s4.body':
    'Цены и правила возврата устанавливает клуб. Платежи картой обрабатывает поставщик эквайринга uPay; мы не храним данные карты. Постоянное поручение нельзя оформить через приложение, а полученный так платёж клуб отмечает вручную.',
  'privacy.terms.s5.title': 'Добросовестное использование',
  'privacy.terms.s5.body':
    'Не пользуйтесь чужой учётной записью, не пытайтесь получить доступ к чужим данным и не копируйте сведения о других учениках и их семьях.',
  'privacy.terms.s6.title': 'Доступность и изменения',
  'privacy.terms.s6.body':
    'Сервис предоставляется как есть, без обещания непрерывной доступности. Существенное изменение условий покажет их снова и попросит согласие заново: согласие на одну версию не является согласием на следующую.',
  'privacy.terms.s7.title': 'Закрытие учётной записи',
  'privacy.terms.s7.body':
    'Вы можете в любой момент попросить закрыть учётную запись и удалить данные на этом экране. Записи, которые закон требует хранить, — прежде всего финансовые — сохраняются и после этого, без имени.',
  'privacy.terms.s8.title': 'Применимое право',
  'privacy.terms.s8.body': 'К настоящим условиям применяется израильское право.',

  // -- политика конфиденциальности -----------------------------------------------------
  'privacy.policy.title': 'Политика конфиденциальности',
  'privacy.policy.s1.title': 'Кто отвечает за данные',
  'privacy.policy.s1.body':
    'Клуб, в котором занимаются ваши дети, является владельцем базы данных и отвечает за неё. Контакты клуба указаны на экране профиля, и любой вопрос о приватности адресуется клубу.',
  'privacy.policy.s2.title': 'Какие данные собираются',
  'privacy.policy.s2.body':
    'Данные ученика и опекуна — имя, дата рождения, телефон и электронная почта; принадлежность к группе и расписанию; записи о посещаемости и пропусках; начисления и платежи; медицинская декларация и подпись под ней; отправленные вам сообщения; и технический журнал действий в системе.',
  'privacy.policy.s3.title': 'Обязательно или добровольно',
  'privacy.policy.s3.body':
    'Предоставление данных ученика и опекуна и заполнение медицинской декларации — условие участия в тренировках: без них клуб не может записать ребёнка и не может обеспечить его безопасность в зале. Согласие на публикацию фотографий полностью добровольно: отказ не влияет на участие и не записывается как согласие.',
  'privacy.policy.s4.title': 'Для чего используются данные',
  'privacy.policy.s4.body':
    'Ведение записи и посещаемости, сбор оплаты, безопасность на тренировке, сообщения клуба вам и операционные отчёты для самого клуба. Мы не продаём данные и не используем их для рекламы.',
  'privacy.policy.s5.title': 'Медицинские данные',
  'privacy.policy.s5.body':
    'Медицинская декларация — чувствительные данные по закону, поэтому она собирается только с явного согласия опекуна. Ответы и подпись зашифрованы в базе данных, а ключи шифрования хранятся вне её. Открыть полную декларацию может только управляющий, и каждое такое открытие записывается в журнал, который нельзя изменить. Тренер видит только отметки — например, астма или аллергия — и никогда текст ответов.',
  'privacy.policy.s6.title': 'Кому передаются данные',
  'privacy.policy.s6.body':
    'Поставщику эквайринга uPay — только для проведения платежа; поставщику инфраструктуры и хранения, на котором работает сервис; и выбранному вами поставщику входа, Google или Apple, который подтверждает вашу личность. Данные одного клуба недоступны из другого клуба. Никому другому мы данные не передаём без вашего согласия, кроме случаев, когда этого требует закон.',
  'privacy.policy.s7.title': 'Сколько данные хранятся',
  'privacy.policy.s7.body':
    'Пока ученик записан в клуб, и после этого столько, сколько нужно для управления клубом. Финансовые записи хранятся около семи лет, как требует налоговое законодательство, поэтому запрос на удаление стирает идентифицирующие данные и оставляет финансовую запись без имени. Автоматическое удаление после периода неактивности запланировано и сегодня не работает: пока оно не включено, данные удаляются только по запросу.',
  'privacy.policy.s8.title': 'Ваши права',
  'privacy.policy.s8.body':
    'Ознакомиться с данными о вас и ваших детях; исправить неверные сведения; удалить данные в предусмотренных законом случаях; возразить против обработки и ограничить её; отозвать согласие в любой момент; и получить данные структурированным, машиночитаемым файлом. Этот экран открывает запрос, а отвечает на него клуб.',
  'privacy.policy.s9.title': 'Отзыв согласия',
  'privacy.policy.s9.body':
    'Отзыв записывается новой записью и не стирает предыдущее согласие — так сохраняется документальное подтверждение того, на что и когда согласились. Отзыв согласия на эту политику вернёт экран согласий и остановит пользование приложением, потому что без него нет основания продолжать обработку данных.',
  'privacy.policy.s10.title': 'Защита данных',
  'privacy.policy.s10.body':
    'Полное разделение между клубами на уровне базы данных; права по ролям; шифрование медицинских ответов и подписей; журнал действий, в который система может только добавлять записи, но не изменять и не удалять их; и фиксация каждого открытия медицинской декларации.',
  'privacy.policy.s11.title': 'Несовершеннолетние',
  'privacy.policy.s11.body':
    'Несовершеннолетний не обладает дееспособностью дать согласие самостоятельно, поэтому согласие здесь даёт опекун. Опекун вправе реализовать от имени ребёнка любое из перечисленных выше прав.',
  'privacy.policy.s12.title': 'Изменения и обращения',
  'privacy.policy.s12.body':
    'Изменение текста будет показано вам и потребует согласия заново. Вопрос о приватности сначала адресуется клубу; если ответа нет, можно обратиться в Управление по защите приватности при Министерстве юстиции.',

  // -- §6.1 step 5's gate ------------------------------------------------------------
  'privacy.gate.title': 'Согласия',
  'privacy.gate.body':
    'Прежде чем пользоваться приложением, нужно принять условия использования и политику конфиденциальности. Оба согласия обязательны, и каждое сохраняется с датой и версией, которую вы приняли.',
  'privacy.gate.acceptTerms': 'Я прочитал(а) и принимаю условия использования',
  'privacy.gate.acceptPrivacy': 'Я прочитал(а) и принимаю политику конфиденциальности',
  'privacy.gate.termsSummary':
    'Что клуб может делать в приложении, за что отвечаете вы и что можно запросить у нас в любой момент.',
  'privacy.gate.privacySummary':
    'Какие данные хранятся, кто в клубе их видит, как долго они хранятся и как удаляются.',
  'privacy.gate.readFull': 'Прочитать документ полностью',
  'privacy.gate.closeFull': 'Назад',
  'privacy.gate.submit': 'Принять и продолжить',
  'privacy.gate.working': 'Сохраняем…',
  'privacy.gate.mustAccept': 'Отметьте оба пункта, чтобы продолжить',
  'privacy.gate.failed': 'Не удалось сохранить согласие. Попробуйте ещё раз.',
  'privacy.gate.show': 'Показать полный текст',
  'privacy.gate.hide': 'Скрыть текст',

  'privacy.title': 'Приватность и личные данные',
  'privacy.screen.subtitle': 'Какие данные о вас и ваших детях хранятся и что с ними можно сделать',
  'privacy.screen.back': 'Назад',
  'privacy.screen.loadFailed': 'Не удалось загрузить данные. Попробуйте ещё раз.',
  'privacy.screen.documents': 'Текст, который вы приняли',
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
  // The status the worker actually produces today (HB-privacy-worker-unbuilt).
  'privacy.export.failedReason': 'Причина сбоя',
  'privacy.export.failedHelp':
    'Подготовка файла сейчас недоступна. Ваш запрос записан и не отменён — обратитесь в клуб, и вам передадут данные.',
  'privacy.export.none': 'Вы не запрашивали выгрузку',

  // -- §11.4's erasure request, and the honest status of it ---------------------------
  'privacy.delete.title': 'Запрос на удаление данных',
  'privacy.delete.request': 'Запросить удаление',
  'privacy.delete.confirmTitle': 'Удалить данные?',
  'privacy.delete.confirmBody':
    'Действие необратимо. Идентифицирующие данные будут стёрты, медицинские декларации и подписи уничтожены, доступ к приложению прекратится.',
  'privacy.delete.confirm': 'Да, удалить',
  'privacy.delete.cancel': 'Отмена',
  'privacy.delete.requested': 'Запрос на удаление записан',
  'privacy.delete.status.pending': 'В очереди',
  'privacy.delete.status.running': 'Выполняется',
  'privacy.delete.status.completed': 'Выполнено',
  'privacy.delete.status.failed': 'Удаление не удалось',
  // The most important line on the screen — see the note in `he/reports.ts`.
  'privacy.delete.failedHelp':
    'Удаление не выполнялось, и ничего не удалено. Запрос записан и остаётся открытым — обратитесь в клуб, чтобы его завершить.',
  'privacy.delete.none': 'Вы не запрашивали удаление',

  // -- the request list both screens read --------------------------------------------
  'privacy.requests.title': 'Ваши запросы',
  'privacy.requests.operatorTitle': 'Запросы о приватности в клубе',
  'privacy.requests.operatorSubtitle': 'Запрошенные выгрузки и удаления и что с ними стало',
  'privacy.requests.empty': 'Запросов нет',
  'privacy.requests.requestedAt': 'Записан',
  'privacy.requests.subject': 'Субъект запроса',
  'privacy.requests.kind.export': 'Выгрузка данных',
  'privacy.requests.kind.deletion': 'Удаление данных',
  'privacy.requests.needsAttention': 'Запросы, завершившиеся сбоем',

  // -- §6.1 step 7's photo consent, off the blocking gate on purpose ------------------
  'privacy.photo.title': 'Публикация фотографий',
  'privacy.photo.body':
    'Может ли клуб публиковать фотографии ваших детей с тренировок и соревнований? Ответ можно изменить в любой момент, а отсутствие ответа сохраняется как отсутствие согласия.',
  'privacy.photo.allow': 'Публиковать можно',
  'privacy.photo.disallow': 'Публиковать нельзя',

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

  // Send-monthly (feature pass 2026-08-27) — emails the report, so a confirm stands
  // between the button and real inboxes.
  'send.button': 'Отправить месячный отчёт на почту',
  'send.title': 'Отправить месячный отчёт?',
  'send.body': 'Отчёт за {{month}} будет отправлен на ваш адрес электронной почты.',
  'send.confirm': 'Отправить',
  'send.cancel': 'Отмена',
  'send.done': 'Отчёт отправлен на почту',

  // -- artboard `4g`'s own strings; see he/reports.ts for what each finding settles ----
  'period.month': 'Месяц',
  'period.season': 'Сезон',
  'period.year': 'Год',
  'period.seasonMissing': 'Активный сезон не задан',

  'overview.churn': 'Ежемесячный отток',
  'overview.avgMonthlyRevenue': 'Средний доход за месяц',
  'overview.avgAttendance': 'Средняя посещаемость',
  'overview.noValue': 'Нет данных',

  'delta.sincePeriodStart': 'с начала периода',
  'delta.vsPrevious': 'к предыдущему периоду',
  'delta.perStudent': 'на ученика',
  'delta.noChange': 'Без изменений',
  'delta.noComparison': 'Нет предыдущего периода для сравнения',

  'attendance.decidedCount': 'из {{count}} учтённых отметок',
  'attendance.unmarkedCount': '{{count}} отметок не проставлены',
  'attendance.noData': 'Нет данных о посещаемости за период',

  'financial.collectedVsDebt': 'Доход и задолженность',
  'financial.billed': 'Начислено',
  'financial.outstanding': 'Остаток долга',
  'financial.chartBasis': 'Высота столбца — вся сумма начислений за месяц',
  'financial.chartLabel': 'Доход и задолженность по месяцам',
  'financial.monthSummary': 'Итоги начислений за {{month}}',

  'retention.title': 'Удержание по стажу',
  'retention.basis': 'Из тех, кто достиг этого стажа, — сколько дошли до его конца',
  'retention.bucket.m0_3': 'До 3 месяцев',
  'retention.bucket.m3_6': '3–6 месяцев',
  'retention.bucket.m6_12': '6–12 месяцев',
  'retention.bucket.m12_plus': 'Больше года',
  'retention.cohort': 'Выборка: {{count}}',
  'retention.noCohort': 'Пока недостаточно стажа',
  'retention.weakest': 'Самый слабый интервал',
  'retention.insightEarly':
    'Большинство уходов приходится на первые три месяца — там и стоит вести наблюдение.',
  'retention.undatedDepartures': '{{count}} уходов без даты не учитываются',

  'belts.title': 'Присвоения поясов за период',
  'belts.chartLabel': 'Присвоения поясов по степеням',
  'belts.promotions': '{{count}} присвоений',
  'belts.empty': 'За период пояса не присваивались',

  'export.failed': 'Экспорт не удался. Попробуйте ещё раз.',
  'export.nothing': 'Нечего экспортировать',

}
