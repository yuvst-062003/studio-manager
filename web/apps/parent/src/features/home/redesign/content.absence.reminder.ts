// The reminder sheet's strings. Pre-i18n and temporary, like every other `content*.ts` in
// this redesign — build-order step 6 moves them into `web/packages/i18n/he/schedule.ts` and
// writes the en and ru mirrors.
//
// The prototype carries all three languages inline in `REMINDER_OPTIONS`
// (`labelHe` / `labelEn` / `labelRu`) and picks with a ternary at the call site. That is the
// arrangement §Conventions exists to prevent — a second string table the i18n module cannot
// see — so only the Hebrew is here and the mirrors are written where every other mirror
// lives.

export const REMINDER = {
  title: 'תזכורת ביומן האישי',
  close: 'סגירה',
  legend: 'מתי להזכיר?',
  save: 'הוספה ליומן',
  /** Says what the button actually does. The prototype's modal implies the club is storing
   *  the reminder; nothing of the sort happens — a file is saved to this device, and the
   *  club never learns of it. */
  hint: 'התזכורת נשמרת ביומן של המכשיר הזה בלבד. המועדון לא מקבל אותה, והיא לא תעבור למכשיר אחר.',

  options: {
    '15min': '15 דקות לפני (התארגנות מהירה)',
    '30min': '30 דקות לפני (יציאה מהבית — מומלץ)',
    '1hour': 'שעה לפני (הכנת תיק ובקבוק)',
    '2hours': 'שעתיים לפני',
    '1day': 'יום לפני',
  },

  /** Field labels inside the .ics description. */
  icsChild: 'חניך/ה:',
  icsGroup: 'קבוצה:',
  icsCoach: 'מאמן/ת:',
  icsWhere: 'מיקום:',
} as const
