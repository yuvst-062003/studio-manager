import type { Bundle } from '../types'

/** Mirror of `he/timer.ts`. `en` is `strict` — see that file's own header for what each
 *  key is and the two places this port's copy deliberately differs from the prototype's. */
export const timer: Bundle = {
  'title': 'Training timer',

  'presets.tabata.name': 'Classic Tabata (20/10)',
  'presets.tabata.description': '8 rounds • peak intensity',
  'presets.randori.name': 'Judo randori (4 min / 1 min)',
  'presets.randori.description': '5 bouts • competition simulation',
  'presets.warmup.name': 'Warm-up routine',
  'presets.warmup.description': '8 rounds (45/15) • joints, flexibility and heart rate',
  'presets.randoriSession.name': 'Randori session',
  'presets.randoriSession.description': '6 bouts (3 min / 45s) • 2 cycles for the squad',
  'presets.hiit.name': 'Explosive power (45/15)',
  'presets.hiit.description': '6 rounds • 2 sets',
  'presets.uchikomi.name': 'Uchikomi (30/30)',
  'presets.uchikomi.description': '10 rounds • fast entries drill',
  'presets.save': 'Save preset',
  'presets.deleteAria': 'Delete preset "{{name}}"',

  'total.label': 'Total time:',
  'total.remainingLabel': 'Total time remaining',

  'sound.toggleAria': 'Turn countdown beeps on/off',
  'sound.enabledLabel': '3 beeps on',
  'sound.mutedLabel': 'Muted',

  'phase.prep': 'GET READY',
  'phase.work': 'WORK',
  'phase.rest': 'REST',
  'phase.setRest': 'Rest between sets',
  'phase.finished': 'Workout complete!',

  'pips.label': 'Countdown:',
  'pips.audioOn': '(beep alert)',
  'pips.audioOff': '(muted)',

  'next.work': 'Next: work ({{time}})',
  'next.rest': 'Next: rest ({{time}})',
  'next.round': 'Next: round {{round}} ({{time}})',

  'roundLabel': 'Round / interval',
  'setLabel': 'Set',

  'actions.reset': 'Reset timer',
  'actions.skip': 'Skip to next round',
  'actions.start': 'Start workout',
  'actions.resume': 'Resume',
  'actions.pause': 'Pause',

  'adjust.heading': 'Times and rounds',
  'adjust.workLabel': 'Work time',
  'adjust.restLabel': 'Rest time',
  'adjust.roundsLabel': 'Number of rounds',
  'adjust.roundsUnit': 'intervals',
  'adjust.setsLabel': 'Sets',
  'adjust.setsUnit': 'sets',
  'adjust.secondsUnit': 'seconds',
  'adjust.prepLabel': 'Prep time',
  'adjust.prepHint': 'Before the set starts',
  'adjust.setRestLabel': 'Rest between sets',
  'adjust.setRestHint': 'Water and recovery',
  'adjust.decreaseAria': 'Decrease {{label}}',
  'adjust.increaseAria': 'Increase {{label}}',

  'tip.heading': "Coach's tip on the mat:",
  'tip.body':
    'Keep 100% intensity through the work round. On the 3-beep count, get ready to switch immediately without losing the pace.',

  'modal.heading': 'Save a new workout preset',
  'modal.subheading': 'Jump back to this interval setup any time',
  'modal.close': 'Close',
  'modal.summaryHeading': 'Parameters this preset will save:',
  'modal.workShort': 'Work',
  'modal.restShort': 'Rest',
  'modal.roundsShort': 'Rounds',
  'modal.setsLabel': 'Sets:',
  'modal.nameLabel': 'Preset name (e.g. Randori session, Warm-up routine)',
  'modal.namePlaceholder': 'Enter a preset name...',
  'modal.suggestionsLabel': 'Quick suggestions:',
  'modal.suggestion.randoriSquad': 'Squad randori session',
  'modal.suggestion.warmupStretch': 'Warm-up and stretching',
  'modal.suggestion.groundwork': 'Ne-waza groundwork',
  'modal.suggestion.uchikomiEntries': 'Uchikomi fast entries',
  'modal.suggestion.fitnessEndurance': 'Fitness and endurance training',
  'modal.cancel': 'Cancel',
  'modal.confirm': 'Save preset',

  'toast.presetLoaded': 'Preset "{{name}}" loaded!',
  'toast.presetSaved': 'New preset "{{name}}" saved!',
  'toast.presetDeleted': 'Preset deleted',
}
