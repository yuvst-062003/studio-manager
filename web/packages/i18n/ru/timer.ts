import type { Bundle } from '../types'

/**
 * Mirror of `he/timer.ts`. `ru` is `report` in the parity policy until SPEC §15 item 9's
 * native-speaker review; the keys are complete, so the gate flips to `strict` by changing
 * one word rather than by writing a namespace.
 */
export const timer: Bundle = {
  'title': 'Таймер тренировок',

  'presets.tabata.name': 'Классическая табата (20/10)',
  'presets.tabata.description': '8 раундов • пиковая интенсивность',
  'presets.randori.name': 'Рандори дзюдо (4 мин / 1 мин)',
  'presets.randori.description': '5 схваток • имитация соревнования',
  'presets.warmup.name': 'Разминка',
  'presets.warmup.description': '8 раундов (45/15) • суставы, гибкость и пульс',
  'presets.randoriSession.name': 'Сессия рандори',
  'presets.randoriSession.description': '6 схваток (3 мин / 45 с) • 2 цикла для команды',
  'presets.hiit.name': 'Взрывная сила (45/15)',
  'presets.hiit.description': '6 раундов • 2 сета',
  'presets.uchikomi.name': 'Утикоми (30/30)',
  'presets.uchikomi.description': '10 раундов • отработка быстрых входов',
  'presets.save': 'Сохранить шаблон',
  'presets.deleteAria': 'Удалить шаблон «{{name}}»',

  'total.label': 'Всего времени:',
  'total.remainingLabel': 'Осталось всего времени',

  'sound.toggleAria': 'Включить/выключить звуковой отсчёт',
  'sound.enabledLabel': '3 сигнала включены',
  'sound.mutedLabel': 'Выключено',

  'phase.prep': 'ПРИГОТОВЬТЕСЬ',
  'phase.work': 'РАБОТА',
  'phase.rest': 'ОТДЫХ',
  'phase.setRest': 'Отдых между сетами',
  'phase.finished': 'Тренировка завершена!',

  'pips.label': 'Отсчёт:',
  'pips.audioOn': '(звуковой сигнал)',
  'pips.audioOff': '(без звука)',

  'next.work': 'Далее: работа ({{time}})',
  'next.rest': 'Далее: отдых ({{time}})',
  'next.round': 'Далее: раунд {{round}} ({{time}})',

  'roundLabel': 'Раунд / интервал',
  'setLabel': 'Сет',

  'actions.reset': 'Сбросить таймер',
  'actions.skip': 'Перейти к следующему раунду',
  'actions.start': 'Начать тренировку',
  'actions.resume': 'Продолжить',
  'actions.pause': 'Пауза',

  'adjust.heading': 'Время и раунды',
  'adjust.workLabel': 'Время работы',
  'adjust.restLabel': 'Время отдыха',
  'adjust.roundsLabel': 'Число раундов',
  'adjust.roundsUnit': 'интервалы',
  'adjust.setsLabel': 'Сеты',
  'adjust.setsUnit': 'сетов',
  'adjust.secondsUnit': 'секунды',
  'adjust.prepLabel': 'Время подготовки',
  'adjust.prepHint': 'Перед началом сета',
  'adjust.setRestLabel': 'Отдых между сетами',
  'adjust.setRestHint': 'Вода и восстановление',
  'adjust.decreaseAria': 'Уменьшить: {{label}}',
  'adjust.increaseAria': 'Увеличить: {{label}}',

  'tip.heading': 'Совет тренера на татами:',
  'tip.body':
    'Держите 100% интенсивность в раунде работы. На счёте из 3 сигналов будьте готовы мгновенно смениться, не теряя темп.',

  'modal.heading': 'Сохранить новый шаблон тренировки',
  'modal.subheading': 'Быстрый доступ к этой схеме интервалов в будущем',
  'modal.close': 'Закрыть',
  'modal.summaryHeading': 'Параметры, которые сохранит шаблон:',
  'modal.workShort': 'Работа',
  'modal.restShort': 'Отдых',
  'modal.roundsShort': 'Раунды',
  'modal.setsLabel': 'Сеты:',
  'modal.nameLabel': 'Название шаблона (например: Сессия рандори, Разминка)',
  'modal.namePlaceholder': 'Введите название шаблона...',
  'modal.suggestionsLabel': 'Быстрые варианты:',
  'modal.suggestion.randoriSquad': 'Командное рандори',
  'modal.suggestion.warmupStretch': 'Разминка и растяжка',
  'modal.suggestion.groundwork': 'Работа в партере (не-ваза)',
  'modal.suggestion.uchikomiEntries': 'Утикоми — быстрые входы',
  'modal.suggestion.fitnessEndurance': 'Тренировка на выносливость',
  'modal.cancel': 'Отмена',
  'modal.confirm': 'Сохранить шаблон',

  'toast.presetLoaded': 'Шаблон «{{name}}» загружен!',
  'toast.presetSaved': 'Новый шаблон «{{name}}» сохранён!',
  'toast.presetDeleted': 'Шаблон удалён',
}
