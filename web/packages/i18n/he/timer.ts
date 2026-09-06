import type { Bundle } from '../types'

/**
 * Owned by the staff app's five-tab redesign (2026-09-06). `title` was added by
 * checkpoint 1; every other key below lands with checkpoint 9, the timer tab itself —
 * §4.5 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md.
 *
 * Ported from `~/Downloads/staff-app/src/components/TimerView.tsx`'s own Hebrew, including
 * the six built-in presets' names and descriptions (`presets.*`) verbatim — "domain content...
 * the part of this screen that took a judo coach to write rather than a designer".
 *
 * Two deliberate departures from the prototype's copy, both cosmetic:
 *  - the rest/set-rest phase titles drop the prototype's trailing 🎵, which only made
 *    sense beside the music player (§9 — not built, entirely simulated in the source);
 *  - `toast.presetDeleted` drops the prototype's "התבנית הותאמה ונמחקה" (its own copy reads
 *    as a leftover fragment — "adjusted and deleted" — rather than a real sentence) for a
 *    plain "נמחקה".
 *
 * `{{name}}`, `{{time}}`, `{{round}}` and `{{label}}` are interpolated locally by
 * `features/timer/i18nInterpolate.ts` — this namespace has no count to plural on, so it
 * does not go through `@studio/i18n`'s `plural()`.
 */
export const timer: Bundle = {
  'title': 'טיימר אימונים',

  // The six built-ins — ported as written.
  'presets.tabata.name': 'טאבטה קלאסי (20/10)',
  'presets.tabata.description': '8 סבבים • עצימות שיא',
  'presets.randori.name': "רנדורי ג'ודו (4 דק'/1 דק')",
  'presets.randori.description': '5 קרבות • הדמיית תחרות',
  'presets.warmup.name': 'שגרת חימום (Warm-up routine)',
  'presets.warmup.description': '8 סבבים (45/15) • מפרקים, גמישות ודופק',
  'presets.randoriSession.name': 'סשן רנדורי (Randori session)',
  'presets.randoriSession.description': "6 קרבות (3 דק'/45 ש') • 2 מחזורים לנבחרת",
  'presets.hiit.name': 'כוח מתפרץ (45/15)',
  'presets.hiit.description': '6 סבבים • 2 סטים',
  'presets.uchikomi.name': "אוצ'יקומי (30/30)",
  'presets.uchikomi.description': '10 סבבים • תרגול כניסות מהיר',
  'presets.save': 'שמור תבנית',
  'presets.deleteAria': 'מחק תבנית "{{name}}"',

  'total.label': 'זמן כולל:',
  'total.remainingLabel': 'זמן כולל שנותר',

  'sound.toggleAria': 'הפעל/השתק צפצופי ספירה לאחור',
  'sound.enabledLabel': '3 צפצופים פעיל',
  'sound.mutedLabel': 'מושתק',

  'phase.prep': 'היכונו (GET READY)',
  'phase.work': 'עבודה (WORK)',
  'phase.rest': 'מנוחה (REST)',
  'phase.setRest': 'מנוחה בין סטים',
  'phase.finished': 'האימון הושלם!',

  'pips.label': 'ספירה:',
  'pips.audioOn': '(התראת צפצוף)',
  'pips.audioOff': '(מושתק)',

  'next.work': 'הבא: עבודה ({{time}})',
  'next.rest': 'הבא: מנוחה ({{time}})',
  'next.round': 'הבא: סבב {{round}} ({{time}})',

  'roundLabel': 'סבב / אינטרוול',
  'setLabel': 'סט / מערכה',

  'actions.reset': 'איפוס טיימר',
  'actions.skip': 'דלג לסבב הבא',
  'actions.start': 'התחל אימון',
  'actions.resume': 'המשך',
  'actions.pause': 'השהה',

  'adjust.heading': 'הגדרת זמנים וסבבים',
  'adjust.workLabel': 'זמן עבודה',
  'adjust.restLabel': 'זמן מנוחה',
  'adjust.roundsLabel': 'מספר סבבים',
  'adjust.roundsUnit': 'אינטרוולים',
  'adjust.setsLabel': 'סטים / מחזורים',
  'adjust.setsUnit': 'מחזורים',
  'adjust.secondsUnit': 'שניות',
  'adjust.prepLabel': 'זמן הכנה (Prep)',
  'adjust.prepHint': 'לפני תחילת הסט',
  'adjust.setRestLabel': 'מנוחה בין סטים',
  'adjust.setRestHint': 'התרעננות ומים',
  'adjust.decreaseAria': 'הפחת {{label}}',
  'adjust.increaseAria': 'הוסף {{label}}',

  'tip.heading': 'דגש מאמן על המזרן:',
  'tip.body':
    'שמרו על עצימות של 100% בסבב העבודה. בספירת 3 הצפצופים היערכו מראש להחלפה מיידית ללא איבוד קצב.',

  'modal.heading': 'שמירת תבנית אימון חדשה',
  'modal.subheading': 'מעבר מהיר לתצורת אינטרוולים זו בעתיד',
  'modal.close': 'סגור',
  'modal.summaryHeading': 'פרמטרים שיישמרו בתבנית:',
  'modal.workShort': 'עבודה',
  'modal.restShort': 'מנוחה',
  'modal.roundsShort': 'סבבים',
  'modal.setsLabel': 'סטים:',
  'modal.nameLabel': 'שם התבנית (למשל: סשן רנדורי, שגרת חימום)',
  'modal.namePlaceholder': 'הכנס שם תבנית...',
  'modal.suggestionsLabel': 'הצעות מהירות לבחירה:',
  'modal.suggestion.randoriSquad': 'סשן רנדורי נבחרת',
  'modal.suggestion.warmupStretch': 'שגרת חימום ומתיחות',
  'modal.suggestion.groundwork': 'עבודת קרקע נו-וואזה',
  'modal.suggestion.uchikomiEntries': "אוצ'יקומי כניסות מהירות",
  'modal.suggestion.fitnessEndurance': 'אימון כושר וסיבולת',
  'modal.cancel': 'ביטול',
  'modal.confirm': 'שמור תבנית',

  'toast.presetLoaded': 'תבנית "{{name}}" נטענה בהצלחה!',
  'toast.presetSaved': 'תבנית חדשה "{{name}}" נשמרה בהצלחה!',
  'toast.presetDeleted': 'התבנית נמחקה',
}
