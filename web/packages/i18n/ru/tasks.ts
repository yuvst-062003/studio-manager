import type { Bundle } from '../types'

/** Mirror of `he/tasks.ts`. `ru` is `report` — see `web/scripts/i18n-parity.mjs`. */
export const tasks: Bundle = {
  'title': 'Задачи',
  'empty': 'Нет открытых задач',
  'emptyHint': 'Список обновляется автоматически в зависимости от того, что происходит в клубе',

  'openCount': '{{count}} открытых задач',
  'openCount.one': 'Одна открытая задача',

  'filter.groupLabel': 'Фильтр задач',
  'filter.all': 'Все',
  'filter.urgent': 'Срочно',
  'filter.followUp': 'Наблюдение',

  'closeSession.scope': 'Моя тренировка',
  'closeSession.badge': 'Срочно',
  'closeSession.title': 'Закрыть открытую тренировку',
  'closeSession.alert':
    'Тренировка закончилась, а посещаемость ещё не отмечена. Откройте список и отметьте всех.',
  'closeSession.action': 'Открыть посещаемость',

  'healthForm.badge': 'Мед. справка',
  'healthForm.subtitle': 'Отсутствует медицинская декларация',
  'healthForm.alert':
    'Для этого ученика нет медицинской декларации. Свяжитесь с родителями и попросите заполнить её.',
  'healthForm.action': 'Связаться с родителем',
  'healthForm.message':
    'Здравствуйте, это напоминание из клуба дзюдо о необходимости заполнить медицинскую декларацию для {{name}} перед следующей тренировкой. Спасибо!',

  'callParent.scope': 'Наблюдение за учеником',
  'callParent.badge': 'Звонок родителю',
  'callParent.title': 'Позвонить родителю — {{name}}',
  'callParent.missedCount': '{{count}} пропусков подряд',
  'callParent.missedCount.one': 'Один пропуск подряд',
  'callParent.alert':
    'Ученик пропустил три тренировки подряд. Рекомендуется тёплый звонок семье, чтобы узнать, всё ли в порядке.',
  'callParent.action': 'Связаться',
  'callParent.message':
    'Здравствуйте, мы заметили, что {{name}} пропустил(а) несколько тренировок подряд. Хотели узнать, всё ли в порядке.',
  'callParent.tick': 'Отметить как выполнено',

  // Counterpart of he/tasks.ts's bringItem block.
  'bringItem.scope': 'Магазин клуба',
  'bringItem.badge': 'Принести',
  'bringItem.title': '{{name}} — {{item}}',
  'bringItem.subtitle': 'Заказано и оплачено, ожидает выдачи',
  'bringItem.alert': 'Семья заказала это в магазине клуба и оплатила. Принесите на тренировку и выдайте — новый счёт при этом не создаётся.',
  'bringItem.action': 'Открыть выдачу',
  'cash.scope': 'Финансы',
  'cash.badge': 'Ожидает подтверждения',
  'cash.title': 'Платежи наличными ожидают подтверждения',
  'cash.count': '{{count}} платежей ожидают',
  'cash.count.one': 'Один платёж ожидает',
  'cash.alert':
    'Поступили обещания оплаты наличными или чеком, которые ещё не подтверждены. Просмотрите список и подтвердите или отклоните каждый.',
  'cash.action': 'Открыть платежи',

  'healthReview.scope': 'Одобрение менеджера',
  'healthReview.badge': 'Ожидает проверки',
  'healthReview.action': 'Открыть карточку ученика',

  'birthday.sectionTitle': 'Дни рождения на этой неделе',
  'birthday.sectionHint': 'Напоминание поддержать личную связь и поздравить на татами',
  'birthday.countBadge': '{{count}} учеников',
  'birthday.countBadge.one': 'Один ученик',
  'birthday.noGroup': 'Без группы',
  'birthday.turningAge': 'Исполняется {{age}}',
  'birthday.today': 'Сегодня!',
  'birthday.inDays': 'Через {{count}} дней',
  'birthday.inDays.one': 'Завтра',
  'birthday.greetAction': 'Поздравить в WhatsApp',
  'birthday.greetAgain': 'Поздравить снова',
  'birthday.tickLabel': 'Отметить, что вы поздравили {{name}}',
  'birthday.tickLabelUndo': 'Отменить отметку поздравления для {{name}}',
  'birthday.greetedHint': 'Вы отметили, что поздравили',
  'birthday.greetingMessage':
    'Привет, {{name}}! С днём рождения — сегодня тебе исполняется {{age}}! Желаем отличного года труда, постоянства и здоровья на татами. Мы гордимся тобой!',
}
