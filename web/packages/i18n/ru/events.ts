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
  'rsvp.title': 'Подтверждение участия',
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
  'belt.title': 'Система поясов',
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
}
