import type { Bundle } from '../types'

/**
 * Mirror of `he/events.ts`, belts included under `belt.*`. `ru` is `report` in the parity
 * policy until SPEC §15 item 9's native-speaker review (HB-ru-review); the keys are complete
 * so the gate flips to `strict` by changing one word rather than by writing a namespace.
 */
export const events: Bundle = {
  // -- the events list (dashboard 7a, staff 9i, parent 12h) ----------------------
  'title': 'Мероприятия и соревнования',
  'list.empty': 'Мероприятий не запланировано',
  'list.upcoming': 'Предстоящие',
  'list.past': 'Прошедшие',
  'list.mine': 'Мои мероприятия',
  'create': 'Новое мероприятие',

  // -- an event's type and status ------------------------------------------------
  'type.competition': 'Соревнование',
  'type.belt_exam': 'Экзамен на пояс',
  'type.seminar': 'Семинар',
  'type.joint_training': 'Совместная тренировка',
  'type.trip': 'Поездка',
  'type.other': 'Другое',
  'status.draft': 'Черновик',
  'status.published': 'Опубликовано',
  'status.cancelled': 'Отменено',
  'status.completed': 'Завершено',
  'status.draftHint': 'Черновик не показывается родителям',
  'publish': 'Опубликовать',
  'published': 'Мероприятие опубликовано',
  'cancel': 'Отменить мероприятие',
  'cancelReason': 'Причина отмены',

  // -- creating an event (dashboard 7b) ------------------------------------------
  'form.title': 'Новое мероприятие',
  'form.name': 'Название',
  'form.description': 'Описание',
  'form.type': 'Тип мероприятия',
  'form.startsAt': 'Начало',
  'form.endsAt': 'Окончание',
  'form.endBeforeStart': 'Окончание должно быть позже начала',
  'form.location': 'Место',
  'form.locationExternal': 'Внешняя площадка',
  'form.locationExternalHint': 'Для зала или места, не входящего в площадки клуба',
  'form.rsvpDeadline': 'Запись до',
  'form.save': 'Сохранить',
  'form.saveDraft': 'Сохранить как черновик',

  // -- who it is for (§5.8's targeting) ------------------------------------------
  'target.title': 'Аудитория',
  'target.studio': 'Весь клуб',
  'target.class': 'Секция',
  'target.group': 'Группа',
  'target.student': 'Выбранные ученики',
  'target.add': 'Добавить аудиторию',
  'target.empty': 'Аудитория не выбрана',
  'target.composeHint': 'Несколько аудиторий можно объединить',

  // -- the fee --------------------------------------------------------------------
  'fee.label': 'Стоимость',
  'fee.free': 'Бесплатно',
  'fee.perStudent': 'за ученика',
  'fee.chargeOnConfirm': 'Подтверждение участия создаёт начисление плательщику',

  // -- consent (§5.8) -------------------------------------------------------------
  'consent.required': 'Нужно согласие родителя',
  'consent.text': 'Текст согласия',
  'consent.textRequired': 'Мероприятие с согласием обязано содержать его текст',
  'consent.sign': 'Согласиться и подписать',
  'consent.signed': 'Согласие подписано',
  'consent.pending': 'Ожидает согласия родителя',
  'consent.blocksConfirmation': 'Участие считается подтверждённым только после подписи родителя',

  // -- RSVP (parent 7d, dashboard 7c) ---------------------------------------------
  'rsvp.closesOn': 'Регистрация закрывается',
  'rsvp.title': 'Подтверждение участия',
  'invites.notSent': 'Приглашения ещё не отправлены',
  'invites.send': 'Отправить',
  'consent.allSigned': 'Все согласия подписаны',
  'consent.count': 'Согласия: {{signed}}/{{total}}',
  'rsvp.yes': 'Придёт',
  'rsvp.no': 'Не придёт',
  'rsvp.pending': 'Ответа пока нет',
  'rsvp.answered': 'Ответ сохранён',
  'rsvp.deadlinePassed': 'Срок записи истёк',
  'rsvp.change': 'Изменить ответ',

  // -- the event page's counters (dashboard 7c ▲ D9.2) -----------------------------
  'counts.registered': 'Записались',
  'counts.pending': 'Без ответа',
  'counts.declined': 'Не придут',
  'counts.paid': 'Оплатили',
  'remindNonResponders': 'Напомнить не ответившим',
  'nonRespondersReminded': 'Напоминание отправлено тем, кто не ответил',
  'reminderSent': 'Напоминание отправлено',
  'roster.empty': 'К мероприятию не привязан ни один ученик',

  'addToCalendar': 'Добавить в календарь',
  'attendance.take': 'Отметить посещаемость на мероприятии',

  // -- belt exams (§5.9; staff 9d, dashboard 4d, 6b) -------------------------------
  'exam.title': 'Экзамен на пояс',
  'exam.plural': 'Экзамены на пояс',
  'exam.candidates': 'Кандидаты',
  'exam.nominate': 'Назначить кандидатов',
  'exam.eligibility': 'Допуск',
  'exam.eligibleHint': 'Допуск считается по текущей степени и сроку её ношения',
  'exam.notEligible': 'Пока не допущен',
  'exam.result.pass': 'Сдал',
  'exam.result.fail': 'Не сдал',
  'exam.result.pending': 'Ещё не экзаменовался',
  'exam.note': 'Примечание экзаменатора',
  'exam.record': 'Записать результаты',
  'exam.recorded': 'Результаты записаны',
  'exam.passPromotesHint': 'Результат «сдал» присваивает следующую степень и обновляет карточку ученика',
  'exam.empty': 'Экзамены не запланированы',

  // -- the belt system (dashboard 5b, wizard 5d) ----------------------------------
  'belt.progressLink': 'Полный прогресс',
  'belt.noneYet': 'Истории поясов пока нет',
  'belt.noneYetHint': 'Когда пояс будет присвоен, прогресс появится здесь',
  'belt.title': 'Система поясов',
  // 2c's ledger row label — the object, not the screen that manages it (2026-09-01).
  'belt.one': 'Пояс',
  'belt.alreadySeeded': 'У этого класса уже есть лестница поясов ({{count}} ступеней)',
  'belt.alreadySeededHint': 'Полное редактирование на экране поясов. Можно перейти к следующему шагу',
  'belt.continue': 'Перейти к следующему шагу',
  'belt.seedFailed': 'Не удалось добавить лестницу. Попробуйте ещё раз',
  'belt.noClasses': 'Пока нет секций — лестница поясов открывается на секции.',
  'belt.openLadder': 'Открыть лестницу поясов',
  'belt.rank': 'Степень',
  'belt.rankPlural': 'Степени',
  'belt.add': 'Новая степень',
  'belt.name': 'Название степени',
  'belt.kyu': 'Кю',
  'belt.kyuOptional': 'Не каждый клуб использует кю',
  'belt.order': 'Порядок',
  'belt.orderHint': 'Порядок определяет следующую степень',
  'belt.color': 'Цвет',
  'belt.secondaryColor': 'Второй цвет',
  'belt.biColor': 'Двухцветный пояс',
  'belt.perClassHint': 'Система поясов задаётся отдельно для каждой секции',
  'belt.empty': 'Система поясов не задана',
  'belt.seedDefault': 'Загрузить систему поясов по умолчанию',

  // -- a student's belt (parent 12d, dashboard 4d) --------------------------------
  'belt.current': 'Текущая степень',
  'belt.next': 'Следующая степень',
  'belt.none': 'Степень ещё не присвоена',
  'belt.progress': 'Прогресс по поясам',
  'belt.history': 'История степеней',
  'belt.awardedOn': 'Присвоена',
  'belt.awardedBy': 'Присвоил',
  'belt.awardNote': 'Примечание',
  'belt.award': 'Присвоить степень',
  'belt.awarded': 'Степень присвоена',
  'belt.awardOutsideExam': 'Присвоить без экзамена',
  'belt.groupPromote': 'Групповое присвоение',
  'belt.groupPromoteHint': 'Присвоить всем сдавшим, одним действием',

  // -- 7a / 9i / 12h — list chrome the audits found missing ------------------------
  'list.loading': 'Загрузка…',
  'list.subtitle': 'Разовые события — вне недельного расписания',
  'list.filterAll': 'Все',
  'list.needsAttention': 'Требуют внимания',
  'status.draftWhy': 'Черновик — ещё не завершён',

  // -- 7c / 9i — aggregates. The rsvp.* keys above are per-student and singular -------
  'counts.confirmed': 'Подтвердили',
  'counts.awaitingConsent': 'Без согласия родителя',
  'counts.attended': 'Пришли',

  // -- 7c — the participants table (D9.2 — six columns, none of them weight) ---------
  'roster.title': 'Список участников',
  'roster.columnConsent': 'Подписанное согласие родителя',
  'roster.columnPayment': 'Оплата',
  'roster.notApplicable': 'Не применимо',
  'roster.sendConsentForm': 'Отправить бланк',

  // -- 7b findings 2 and 8 — a required field with no input, on a form that never errors
  'form.required': 'Обязательное поле',
  'form.blank': 'Новое событие',
  'form.errorTitle': 'Не удалось сохранить',
  'form.saved': 'Событие сохранено',
  'form.edit': 'Редактировать событие',

  // -- 7d / 12h finding 7 — the parent's screen speaks in the second person -----------
  'rsvp.awaitingYourAnswer': 'Ждём вашего ответа',
  'rsvp.youConfirmed': 'Вы подтвердили участие',
  'rsvp.youDeclined': 'Вы отметили, что не придёте',

  // -- 9d / 4d / 6b — the exam --------------------------------------------------------
  'exam.new': 'Новый экзамен на пояс',
  'exam.save': 'Сохранить результаты',
  'exam.tenureAtRank': 'Стаж в степени',
  'exam.readiness': 'Готовность',
  'exam.ready': 'Соответствует условиям',
  'exam.confirmPromotion': 'Подтвердить присвоение',
  'exam.promoted': 'Степени присвоены',

  // -- 5b / 5d — the belt system ------------------------------------------------------
  'form.cancel': 'Отмена',
  'belt.delete': 'Удалить степень',
  'belt.edit': 'Редактировать степень',
  'belt.save': 'Сохранить степень',
  'belt.preview': 'Предпросмотр',
  'belt.moveUp': 'Выше в порядке',
  'belt.moveDown': 'Ниже в порядке',
  'belt.deleteHeld': 'Нельзя удалить степень, присвоенную ученикам',
  'belt.holders': 'Учеников в степени',
  'belt.noClassYet': 'Система поясов задаётся после создания секций',
  'belt.presetTitle': 'Какая система поясов принята у вас?',
  // `5d`'s two-column shape: the choices beside a live preview of the ladder.
  'belt.presetHint': 'Добавить, удалить и переупорядочить можно позже. Промежуточные пояса обычно двухцветные.',
  'belt.presetPreview': 'Степени, которые будут созданы',
  'belt.presetPreviewEmpty': 'Выберите систему, чтобы увидеть степени',
  'belt.presetAndMore': 'и ещё {{count}} степеней',
  'belt.presetCreate': 'Создать {{count}} степеней',
  'belt.presetManual': 'Настроить вручную',
  'belt.presetScratch': 'Задать вручную',
  'belt.presetRankCount': 'степеней в наборе',

  // -- 12d ------------------------------------------------------------------------------
  'belt.ordinalOfTotal': 'Степень из',
  'belt.progressCaption': 'Присвоенные степени на сегодня',

  // -- 7b — кто приглашён (§5.8, на экране создания события) ---------------------------
  'target.everyone': 'Весь клуб',
  'target.chosen': 'Выбранные аудитории',
  'target.classes': 'Секции',
  'target.groups': 'Группы',
  'target.classesEmpty': 'Секций пока нет',
  'target.groupsEmpty': 'Групп пока нет',
  'target.sweepHint': 'Секция или группа приглашает своих активных учеников в момент публикации',
  'target.studentSearch': 'Добавить ученика по имени',
  'target.studentSearchHint': 'Ученик, выбранный по имени, приглашён, даже если его группа не выбрана',
  'target.studentNoResults': 'Ученик с таким именем не найден',
  'target.chosenStudents': 'Ученики, выбранные по имени',
  'target.remove': 'Убрать',
  'target.none': 'Аудитория не выбрана',
  'target.required': 'Без аудитории событие будет опубликовано и не дойдёт ни до кого',
  'target.byBeltOrAgeUnsupported': 'Фильтр по поясу или возрасту отсутствует — аудитория это клуб, секция, группа или ученик',

  // -- 7b — сведения для родителей --------------------------------------------------------
  'parentDetails.title': 'Сведения для родителей',
  'parentDetails.field': 'Что взять с собой и что нужно знать родителям',
  'parentDetails.hint': 'Этот текст видит родитель в приглашении — что взять, место встречи, время выезда и возвращения',

  // -- 7b — предпросмотр ------------------------------------------------------------------
  'preview.title': 'Предпросмотр — приложение родителя',
  'preview.hint': 'Так приглашение увидит родитель. Кнопки здесь не работают',
  'preview.untitled': 'Без названия',
  'preview.noDate': 'Дата ещё не назначена',
  'preview.audience': 'Получат',
  'form.locationClub': 'Зал клуба',
}
