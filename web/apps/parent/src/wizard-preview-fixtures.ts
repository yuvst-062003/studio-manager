// PREVIEW ONLY — throwaway. Stands in for what the API will return: the studio's groups,
// its price plans and its health form template. Deleted with the preview harness once the
// wizard reads the real endpoints.
import type { TemplateSchema } from './features/health/healthClient'
import type { WizardGroup, WizardPlan } from './features/onboarding/wizard/types'

export const GROUPS: readonly WizardGroup[] = [
  { id: 'group1', name: 'קבוצה 1 (גילאי 4–6)', trackLabel: 'מסלול בסיס • 2 אימונים בשבוע', durationMin: 45, scheduleLabel: 'שלישי 17:00 | שישי 14:00', coachesLabel: 'לביא תמיר ויובל סטולין', locationLabel: 'גלדיאטור נתניה' },
  { id: 'group2', name: 'קבוצה 2 (גילאי 7–9)', trackLabel: 'מסלול בסיס • 2 אימונים בשבוע', durationMin: 45, scheduleLabel: 'שלישי 17:45 | שישי 14:45', coachesLabel: 'לביא תמיר ויובל סטולין', locationLabel: 'גלדיאטור נתניה' },
  { id: 'group3', name: 'קבוצה 3 (גילאי 9–10)', trackLabel: 'מסלול בסיס • 2 אימונים בשבוע', durationMin: 60, scheduleLabel: 'שלישי 18:30 | שישי 15:30', coachesLabel: 'לביא תמיר ויובל סטולין', locationLabel: 'גלדיאטור נתניה' },
  { id: 'group4', name: 'קבוצה 4 (גילאי 10–12)', trackLabel: 'מסלול בסיס • 2 אימונים בשבוע', durationMin: 60, scheduleLabel: 'שלישי 16:00 | שישי 16:30', coachesLabel: 'לביא תמיר ויובל סטולין', locationLabel: 'גלדיאטור נתניה' },
  { id: 'group5', name: 'קבוצה 5 (נערים, נוער ובוגרים)', trackLabel: 'מסלול בסיס • 2 אימונים בשבוע', durationMin: 90, scheduleLabel: 'שלישי 19:30 | שישי 17:30', coachesLabel: 'לביא תמיר ויובל סטולין', locationLabel: 'גלדיאטור נתניה' },
]

export const PLANS: readonly WizardPlan[] = [
  {
    id: 'basic',
    title: 'מסלול יסוד',
    subtitle: '2 אימונים בשבוע',
    pricePerMonthAgorot: 30000,
    features: [
      'אימוני הבסיס — שלישי ושישי',
      'יסודות הג׳ודו ומיומנויות תנועה',
      'סביבה חינוכית תומכת ומעצימה',
    ],
  },
  {
    id: 'warrior',
    title: 'מסלול לוחם',
    subtitle: '3 אימונים בשבוע',
    pricePerMonthAgorot: 40000,
    isRecommended: true,
    badge: '🔥 מסלול מתקדם • מומלץ',
    features: [
      'כל מה שכלול במסלול יסוד',
      'אימון נוסף אחד בשבוע לבחירתכם',
      'העמקת ערכי הבושידו והכבוד',
    ],
  },
  {
    id: 'gladiator',
    title: 'מסלול גלדיאטור',
    subtitle: 'ללא הגבלה + נבחרת',
    pricePerMonthAgorot: 55000,
    features: [
      'אימונים ללא הגבלה שבועית',
      'שיעור פרטי בשבת',
      'ליווי צמוד למיצוי הפוטנציאל',
    ],
  },
]

export const HEALTH_SCHEMA: TemplateSchema = {
  title: 'הצהרת בריאות',
  version: 1,
  sections: [
    {
      id: 'chronic',
      title: 'רקע רפואי ומחלות כרוניות',
      questions: [
        { id: 'med_chronic', type: 'boolean', label: 'האם קיימת מחלה כרונית?', flag: true },
        { id: 'med_asthma', type: 'boolean', label: 'האם יש אסתמה או קשיי נשימה?', flag: true },
        { id: 'med_allergy', type: 'boolean', label: 'האם יש אלרגיה ידועה (מזון, תרופות)?', flag: true },
        { id: 'med_meds', type: 'boolean', label: 'האם נוטל/ת תרופות באופן קבוע?' },
        { id: 'med_epilepsy', type: 'boolean', label: 'האם יש אפילפסיה או פרכוסים?', flag: true },
        { id: 'med_diabetes', type: 'boolean', label: 'האם יש סוכרת?', flag: true },
      ],
    },
    {
      id: 'cardiac',
      title: 'לב ומאמץ גופני',
      questions: [
        { id: 'med_heart', type: 'boolean', label: 'האם ידוע על מחלת לב או מום לבבי?', flag: true },
        { id: 'med_chest', type: 'boolean', label: 'האם הופיעו כאבים בחזה במהלך מאמץ?' },
        { id: 'med_faint', type: 'boolean', label: 'האם הייתה התעלפות או סחרחורת במאמץ?' },
        { id: 'med_sudden_death', type: 'boolean', label: 'האם היה במשפחה מוות פתאומי מתחת לגיל 50?' },
      ],
    },
    {
      id: 'ortho',
      title: 'שלד, שרירים וניתוחים',
      questions: [
        { id: 'med_ortho', type: 'boolean', label: 'האם היו שברים, פריקות או פציעות מפרקים חוזרות?' },
        { id: 'med_surgery', type: 'boolean', label: 'האם עבר/ה ניתוח או אשפוז בשנתיים האחרונות?' },
        { id: 'med_other', type: 'boolean', label: 'האם קיימת מגבלה בריאותית או פיזית אחרת?', flag: true },
      ],
    },
  ],
}
