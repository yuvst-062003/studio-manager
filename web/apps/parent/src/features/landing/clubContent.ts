// TEMPORARY, by explicit decision (2026-08-30): the user chose to hardcode the Gladiator
// club's marketing content — transcribed verbatim from the approved Stitch screens
// ("דף נחיתה סופי") — rather than wait for it to become club-editable data. This module
// is the stand-in for fields `studio.settings.landing` does not carry yet: pricing plans,
// the coach, testimonials, and the designed week timetable.
//
// The shape to grow into: extend `settings.landing` (and `PublicLandingOut`) with these
// fields PER LOCALE, seed Gladiator's row from this file, then delete it. Until then, a
// slug with no entry here gets the data-driven page — the schedule derives from the API's
// groups and the content-only sections stay off — so no other club ever shows Gladiator's
// coach.
//
// **Three locales, 2026-08-31.** The first version kept Hebrew only, on the reasoning that
// this is CLUB DATA in the club's own voice rather than chrome. That was wrong in front of
// a user: §6.1 puts the language choice before login precisely so a Russian- or
// English-speaking parent can read the offer, and choosing English translated the frame
// and left every word of the content in Hebrew — laid out left-to-right, which reads as
// broken rather than as untranslated. The en/ru copy here is a TRANSLATION of the club's
// approved Hebrew, not separately approved marketing: it is the club's voice at one
// remove, and worth their review — the testimonials especially, which are real people's
// words.
//
// The split below is deliberate. Everything locale-INVARIANT — the timetable's hours, the
// prices, the section anchors, the category of each slot — is written ONCE, and only the
// words are per-locale. Three parallel copies of the whole structure would let a price or
// an hour drift between languages, and nothing would catch it.
import type { Locale } from '@studio/i18n'

/** Legend categories — Stitch's five, with the cell tints keyed by class in landing.css. */
export type SlotCategory = 'judo' | 'team' | 'crossfit' | 'girls' | 'personal'

/** The distinct lesson names on the timetable. Keys, not words: the same session appears
 *  on several days, and a typo'd repeat would be a different lesson in one language. */
type SlotTitleKey =
  | 'judo'
  | 'squad'
  | 'crossfit'
  | 'girlsSquad'
  | 'personal'
  | 'group1'
  | 'group2'
  | 'group3'
  | 'group4'
  | 'group5'

/** The age bands under a slot title, keyed for the same reason. */
type SlotNoteKey = 'age4_6' | 'age7_9' | 'age8_12' | 'age9_10' | 'age10_12' | 'teensAndAdults'

export type ContentSlot = {
  /** `[from, to]`, rendered through RangeText — never a pre-joined string. */
  time: [string, string]
  title: string
  note?: string
  category: SlotCategory
}

export type ClubPlan = {
  name: string
  cadence: string
  /** Agorot, like every stored amount (G2). ₪300 is 30000. */
  priceAgorot: number
  features: string[]
  cta: string
  highlighted?: boolean
  badge?: string
}

/** What the page renders — one locale's worth, already resolved. */
export type ClubContent = {
  /** Bundled brand asset, used ONLY when the club has uploaded no logo of its own —
   *  `landing.logo_url` always wins. Staging carries no uploaded logo, and a landing page
   *  with no mark on it is not something to hand a manager. */
  logoUrl?: string
  /** The club's name as this locale writes it. `studio.name` is one `String(200)` column
   *  with no locale, so an English reader saw "מועדון גלדיאטור" in the header, the footer
   *  and every photo's alt text. The ADDRESS is deliberately NOT translated the same way
   *  (decision 2026-08-31): it is one line of Hebrew that Israeli map providers resolve,
   *  and the navigate button builds its query from it. */
  displayName: string
  seasonBadge: string
  hero: { prefix: string; middle: string; accent: string; lead: string }
  coach: {
    headingTop: string
    headingBottom: string
    name: string
    title: string
    bio: string
    /** A card each. `figure` marks the one that leads with a number — it renders as the
     *  accent card, which is what keeps a row of three from reading as three identical
     *  rectangles now that the icons are gone. */
    credentials: readonly { title: string; text: string; figure?: string }[]
  }
  scheduleLead: string
  /** Sunday-first weekday → its slots, matching `people.weekdays.*`. */
  schedule: { day: number; slots: ContentSlot[] }[]
  categoryNames: Record<SlotCategory, string>
  plansTitle: string
  plansLead: string
  perMonth: string
  plans: ClubPlan[]
  galleryTitle: string
  galleryLead: string
  /** The club's own photographs. `focus` is an `object-position` for the tiles whose
   *  square crop would otherwise cut a face off. */
  gallery: { src: string; alt: string; focus?: string }[]
  voicesTitle: string
  voices: { quote: string; name: string; role?: string }[]
  navItems: { href: string; label: string }[]
  /** "What a trial lesson looks like". The API carries `trial_steps`, but only in the
   *  language the manager typed them in — so the designed page prefers these. */
  steps: string[]
  copyright: string
}

// ---------------------------------------------------------------------------
// Locale-invariant: hours, prices, anchors, categories. Written once.
// ---------------------------------------------------------------------------

type SlotSpec = {
  time: [string, string]
  title: SlotTitleKey
  note?: SlotNoteKey
  category: SlotCategory
}

const SCHEDULE: { day: number; slots: SlotSpec[] }[] = [
  {
    day: 0,
    slots: [
      { time: ['16:00', '17:00'], title: 'judo', note: 'age8_12', category: 'judo' },
      { time: ['17:00', '18:30'], title: 'squad', category: 'team' },
    ],
  },
  {
    day: 1,
    slots: [{ time: ['16:00', '17:00'], title: 'crossfit', category: 'crossfit' }],
  },
  {
    day: 2,
    slots: [
      { time: ['16:00', '17:00'], title: 'group4', note: 'age10_12', category: 'judo' },
      { time: ['17:00', '17:45'], title: 'group1', note: 'age4_6', category: 'judo' },
      { time: ['17:45', '18:30'], title: 'group2', note: 'age7_9', category: 'judo' },
      { time: ['18:30', '19:30'], title: 'group3', note: 'age9_10', category: 'judo' },
      { time: ['19:30', '21:00'], title: 'group5', note: 'teensAndAdults', category: 'judo' },
    ],
  },
  {
    day: 3,
    slots: [
      { time: ['16:00', '17:00'], title: 'girlsSquad', category: 'girls' },
      { time: ['17:00', '18:00'], title: 'crossfit', category: 'crossfit' },
    ],
  },
  {
    day: 4,
    slots: [{ time: ['16:00', '17:00'], title: 'squad', category: 'team' }],
  },
  {
    day: 5,
    slots: [
      { time: ['14:00', '14:45'], title: 'group1', note: 'age4_6', category: 'judo' },
      { time: ['14:45', '15:30'], title: 'group2', note: 'age7_9', category: 'judo' },
      { time: ['15:30', '16:30'], title: 'group3', note: 'age9_10', category: 'judo' },
      { time: ['16:30', '17:30'], title: 'group4', note: 'age10_12', category: 'judo' },
      { time: ['17:30', '19:00'], title: 'group5', note: 'teensAndAdults', category: 'judo' },
    ],
  },
  {
    day: 6,
    slots: [{ time: ['11:00', '12:30'], title: 'personal', category: 'personal' }],
  },
]

/** Agorot (G2). ₪300 is 30000. One list, so no language can quote a different price. */
const PRICES_AGOROT = [30000, 40000, 55000] as const

const LOGO_URL = '/clubs/gladiator-logo.png'

/** The club's photographs, in render order — the first is the wide lead tile. Same
 *  reasoning as LOGO_URL: served by this app, so no object store and no upload. A club
 *  that uploads its own strip through the הגדרות panel still gets that one; this is the
 *  designed page's own set. `focus` only appears where a centred square crop would take
 *  a head off. */
const GALLERY: Quintet<{ src: string; focus?: string }> = [
  { src: '/clubs/gladiator-team.jpg' },
  { src: '/clubs/gladiator-medals.jpg' },
  // Portrait: centred, the square would cut the coach's head and the children's faces.
  { src: '/clubs/gladiator-certificates.jpg', focus: 'center 20%' },
  { src: '/clubs/gladiator-celebration.jpg' },
  { src: '/clubs/gladiator-podium.jpg' },
]

/** Fixed arities, so a translation that drops a plan or a nav entry fails to COMPILE
 *  rather than rendering a short page in one language only. */
type Trio<T> = readonly [T, T, T]
type Quartet<T> = readonly [T, T, T, T]
type Quintet<T> = readonly [T, T, T, T, T]

// ---------------------------------------------------------------------------
// Per-locale words.
// ---------------------------------------------------------------------------

type ClubCopy = {
  displayName: string
  seasonBadge: string
  hero: { prefix: string; middle: string; accent: string; lead: string }
  coach: {
    headingTop: string
    headingBottom: string
    name: string
    title: string
    bio: string
    credentials: Trio<{ title: string; text: string; figure?: string }>
  }
  scheduleLead: string
  slotTitles: Record<SlotTitleKey, string>
  slotNotes: Record<SlotNoteKey, string>
  categoryNames: Record<SlotCategory, string>
  plansTitle: string
  plansLead: string
  perMonth: string
  plans: Trio<{ name: string; cadence: string; features: string[]; cta: string; badge?: string }>
  galleryTitle: string
  galleryLead: string
  /** One per `GALLERY` entry, in the same order — the alt text IS the caption here, so a
   *  screen reader and a broken connection both get the club, not a filename. */
  galleryAlts: Quintet<string>
  voicesTitle: string
  voices: { quote: string; name: string; role?: string }[]
  navLabels: Quartet<string>
  steps: string[]
  copyright: string
}

/** The approved Stitch copy, verbatim. The other two locales are translations OF THIS. */
const HE: ClubCopy = {
  // Matches `studio.name`, so the Hebrew page is unchanged by this override.
  displayName: 'מועדון גלדיאטור',
  // The Stitch screen said 2024-2025; the season is data that ages, which is exactly why
  // this belongs in settings. Updated to the season starting now.
  seasonBadge: 'עונת 2026-2027 החלה',
  hero: {
    prefix: "ג'ודו:",
    middle: 'דרך חיים של',
    accent: 'כבוד ומשמעת',
    lead:
      "מועדון הג'ודו המוביל לילדים ונוער. אימונים בעצימות גבוהה, בניית אופי, והכנה לחיים מנצחים ברוח המסורת היפנית.",
  },
  coach: {
    headingTop: 'מנהיגות',
    headingBottom: "מתוך הדוג'ו",
    name: 'סנסאי לביא תמיר',
    title: 'מאמן ראשי • דאן 3',
    bio:
      "לביא תמיר - אלוף ישראל לשעבר בג'ודו שלוש שנים ברציפות, שלישי בעולם, ושני באירופה בהיאבקות (Belt Wrestling). מאמן מוסמך בעל ניסיון של מעל 20 שנה בחינוך וקידום ספורטאים למצוינות, ערכים ומשמעת עצמית.",
    credentials: [
      {
        title: '20 שנות ניסיון',
        text: 'שני עשורים של הדרכה ועיצוב דורות של חניכים על המזרן ובחיים.',
      },
      {
        title: 'גישה חינוכית',
        text: 'בוגר וינגייט המשלב פסיכולוגיית ספורט בכל אימון.',
      },
      {
        figure: '1000+',
        title: 'חניכים עברו במועדון',
        text: 'דורות של ילדים ובני נוער יצאו מהמזרן הזה לתחרויות, לנבחרות ולחיים.',
      },
    ],
  },
  scheduleLead: 'לוח הזמנים המלא של מועדון גלדיאטור. בחרו את הקבוצה המתאימה לכם.',
  slotTitles: {
    judo: "אימון ג'ודו",
    squad: "אימון ג'ודו נבחרת",
    crossfit: "אימון קרוספיט לג'ודו",
    girlsSquad: "נבחרת ג'ודו בנות",
    personal: 'אימון טכניקה אישי',
    group1: "אימון ג'ודו קבוצה 1",
    group2: "אימון ג'ודו קבוצה 2",
    group3: "אימון ג'ודו קבוצה 3",
    group4: "אימון ג'ודו קבוצה 4",
    group5: "אימון ג'ודו קבוצה 5",
  },
  slotNotes: {
    age4_6: 'גילאי 4-6',
    age7_9: 'גילאי 7-9',
    age8_12: 'גילאי 8-12',
    age9_10: 'גילאי 9-10',
    age10_12: 'גילאי 10-12',
    teensAndAdults: 'נערים, נוער ובוגרים',
  },
  categoryNames: {
    judo: "קבוצות ג'ודו",
    team: 'נבחרת',
    crossfit: "קרוספיט לג'ודו",
    girls: 'קבוצת בנות',
    personal: 'אימון אישי',
  },
  plansTitle: 'מסלולי אימון',
  plansLead: 'השקעה בעתיד, בביטחון העצמי ובמשמעת של ילדכם. בחרו את המסלול המתאים לכם.',
  perMonth: '/ חודש',
  plans: [
    {
      name: 'מסלול יסוד',
      cadence: '2 אימונים בשבוע',
      features: [
        "יסודות הג'ודו ומיומנויות תנועה",
        'פיתוח משמעת וביטחון עצמי',
        'סביבה חינוכית תומכת ומעצימה',
      ],
      cta: 'בחר מסלול',
    },
    {
      name: 'מסלול לוחם',
      cadence: '3 אימונים בשבוע',
      features: [
        'כל מה שכלול במסלול יסוד',
        'אימונים מתקדמים ופיתוח טכניקה',
        'העמקת ערכי הבושידו והכבוד',
      ],
      cta: 'הצטרף עכשיו',
      badge: 'מסלול מתקדם',
    },
    {
      name: 'מסלול גלדיאטור',
      cadence: 'אימונים ללא הגבלה + נבחרת',
      features: [
        'גישה לכל האימונים במערכת',
        'פיתוח מצוינות אישית וקבוצתית',
        'ליווי צמוד למיצוי הפוטנציאל המקסימלי',
      ],
      cta: 'בחר מסלול',
    },
  ],
  voicesTitle: "קולות מהדוג'ו",
  voices: [
    {
      quote:
        'מאז שהבן שלי הצטרף לגלדיאטור, הביטחון העצמי שלו זינק. הוא למד להתמודד עם הפסדים בכבוד ולשאוף תמיד להשתפר. סנסאי לביא תמיר הוא מודל לחיקוי אמיתי.',
      name: 'אמא של יונתן',
    },
    {
      quote:
        'אימונים קשים אבל מספקים בטירוף. האווירה פה היא של משפחה אחת גדולה שדוחפת אותך להיות הגרסה הכי טובה של עצמך, על המזרן ומחוצה לו.',
      name: 'דניאל, בן 15',
      role: 'נבחרת גלדיאטור',
    },
  ],
  galleryTitle: 'רגעים מהמועדון',
  galleryLead: 'תחרויות, טקסים וחגיגות סוף עונה — המועדון כפי שהוא נראה מבפנים.',
  galleryAlts: [
    "נבחרת הבוגרים של המועדון עם המדליות מפסטיבל הג'ודו באילת",
    "קבוצת הצעירים בדוג'ו עם המדליות והגביעים של סוף העונה",
    'שני חניכים עם המאמן ותעודות ההשתתפות בטורניר',
    'חגיגת סוף שנה במועדון, חניכים והורים מרימים כוסית',
    'קבוצת חניכים עם המאמנים והמדליות בתחרות',
  ],
  navLabels: ['אודות', 'מערכת שעות', 'מסלולים', 'המלצות'],
  steps: [
    'נרשמים לשיעור ניסיון דרך הטופס',
    'מגיעים עם בגדים נוחים ובקבוק מים',
    'עולים למזרן ומצטרפים לאימון',
    'בסוף האימון מדברים עם המאמן על ההמשך',
  ],
  copyright: "© 2026 מועדון הג'ודו גלדיאטור. כל הזכויות שמורות.",
}

const EN: ClubCopy = {
  // The crest already reads "GLADIATOR TEAM" in Latin, so this is the club's own mark
  // rather than an invention.
  displayName: 'Gladiator Judo Club',
  seasonBadge: 'The 2026–2027 season has begun',
  hero: {
    prefix: 'Judo:',
    middle: 'a way of life built on',
    accent: 'respect and discipline',
    lead:
      'The leading judo club for children and teenagers. High-intensity training, character building, and preparation for a winning life in the spirit of the Japanese tradition.',
  },
  coach: {
    headingTop: 'Leadership',
    headingBottom: 'from inside the dojo',
    name: 'Sensei Lavi Tamir',
    title: 'Head coach • 3rd dan',
    bio:
      'Lavi Tamir — three consecutive years Israeli judo champion, third in the world and second in Europe in belt wrestling. A certified coach with more than 20 years of experience in education and in bringing athletes to excellence, values and self-discipline.',
    credentials: [
      {
        title: '20 years of experience',
        text: 'Two decades of coaching, shaping generations of students on the mat and in life.',
      },
      {
        title: 'An educational approach',
        text: 'A Wingate graduate who brings sport psychology into every session.',
      },
      {
        figure: '1000+',
        title: 'Students have trained here',
        text: 'Generations of children and teenagers left this mat for competitions, for squads and for life.',
      },
    ],
  },
  scheduleLead: 'The full Gladiator club timetable. Choose the group that suits you.',
  slotTitles: {
    judo: 'Judo training',
    squad: 'Squad judo training',
    crossfit: 'CrossFit for judo',
    girlsSquad: 'Girls’ judo squad',
    personal: 'Private technique session',
    group1: 'Judo — group 1',
    group2: 'Judo — group 2',
    group3: 'Judo — group 3',
    group4: 'Judo — group 4',
    group5: 'Judo — group 5',
  },
  slotNotes: {
    age4_6: 'Ages 4–6',
    age7_9: 'Ages 7–9',
    age8_12: 'Ages 8–12',
    age9_10: 'Ages 9–10',
    age10_12: 'Ages 10–12',
    teensAndAdults: 'Teens, youth and adults',
  },
  categoryNames: {
    judo: 'Judo groups',
    team: 'Squad',
    crossfit: 'CrossFit for judo',
    girls: 'Girls’ group',
    personal: 'Private session',
  },
  plansTitle: 'Training plans',
  plansLead:
    'An investment in your child’s future, confidence and discipline. Choose the plan that suits you.',
  perMonth: '/ month',
  plans: [
    {
      name: 'Foundation plan',
      cadence: '2 sessions a week',
      features: [
        'Judo fundamentals and movement skills',
        'Building discipline and self-confidence',
        'A supportive, empowering learning environment',
      ],
      cta: 'Choose plan',
    },
    {
      name: 'Fighter plan',
      cadence: '3 sessions a week',
      features: [
        'Everything in the Foundation plan',
        'Advanced training and technique work',
        'A deeper grounding in bushido and respect',
      ],
      cta: 'Join now',
      badge: 'Advanced plan',
    },
    {
      name: 'Gladiator plan',
      cadence: 'Unlimited training + squad',
      features: [
        'Access to every session on the timetable',
        'Developing personal and team excellence',
        'Close guidance to reach full potential',
      ],
      cta: 'Choose plan',
    },
  ],
  voicesTitle: 'Voices from the dojo',
  voices: [
    {
      quote:
        'Since my son joined Gladiator his confidence has soared. He has learned to take a loss with dignity and to always aim to improve. Sensei Lavi Tamir is a true role model.',
      name: 'Yonatan’s mother',
    },
    {
      quote:
        'The training is hard but incredibly rewarding. The atmosphere here is one big family that pushes you to be the best version of yourself, on the mat and off it.',
      name: 'Daniel, 15',
      role: 'Gladiator squad',
    },
  ],
  galleryTitle: 'Moments from the club',
  galleryLead: 'Competitions, ceremonies and end-of-season celebrations — the club as it looks from the inside.',
  galleryAlts: [
    "The club's senior squad with their medals from the Eilat judo festival",
    "The youngest group in the dojo with the season's medals and cups",
    'Two students with their coach and their tournament participation certificates',
    'The club’s end-of-year celebration, students and parents raising a glass',
    'A group of students with their coaches and their medals at a competition',
  ],
  navLabels: ['About', 'Timetable', 'Plans', 'Testimonials'],
  steps: [
    'Book a trial session through the form',
    'Come in comfortable clothes, with a water bottle',
    'Step onto the mat and join the session',
    'Afterwards, talk with the coach about what comes next',
  ],
  copyright: '© 2026 Gladiator Judo Club. All rights reserved.',
}

const RU: ClubCopy = {
  displayName: 'Клуб дзюдо «Гладиатор»',
  seasonBadge: 'Сезон 2026–2027 начался',
  hero: {
    prefix: 'Дзюдо:',
    middle: 'образ жизни, основанный на',
    accent: 'уважении и дисциплине',
    lead:
      'Ведущий клуб дзюдо для детей и подростков. Интенсивные тренировки, формирование характера и подготовка к успешной жизни в духе японской традиции.',
  },
  coach: {
    headingTop: 'Лидерство',
    headingBottom: 'изнутри додзё',
    name: 'Сэнсэй Лави Тамир',
    title: 'Главный тренер • 3-й дан',
    bio:
      'Лави Тамир — трёхкратный подряд чемпион Израиля по дзюдо, третье место в мире и второе в Европе по поясной борьбе. Сертифицированный тренер с более чем 20-летним опытом в образовании и в подготовке спортсменов к мастерству, ценностям и самодисциплине.',
    credentials: [
      {
        title: '20 лет опыта',
        text: 'Два десятилетия тренерской работы, воспитавшей поколения учеников на татами и в жизни.',
      },
      {
        title: 'Педагогический подход',
        text: 'Выпускник института Вингейт, применяющий спортивную психологию на каждой тренировке.',
      },
      {
        figure: '1000+',
        title: 'Учеников прошли через клуб',
        text: 'Поколения детей и подростков ушли с этого татами на соревнования, в сборные и в жизнь.',
      },
    ],
  },
  scheduleLead: 'Полное расписание клуба «Гладиатор». Выберите подходящую вам группу.',
  slotTitles: {
    judo: 'Тренировка по дзюдо',
    squad: 'Тренировка сборной по дзюдо',
    crossfit: 'Кроссфит для дзюдо',
    girlsSquad: 'Женская сборная по дзюдо',
    personal: 'Индивидуальная техника',
    group1: 'Дзюдо — группа 1',
    group2: 'Дзюдо — группа 2',
    group3: 'Дзюдо — группа 3',
    group4: 'Дзюдо — группа 4',
    group5: 'Дзюдо — группа 5',
  },
  slotNotes: {
    age4_6: 'Возраст 4–6',
    age7_9: 'Возраст 7–9',
    age8_12: 'Возраст 8–12',
    age9_10: 'Возраст 9–10',
    age10_12: 'Возраст 10–12',
    teensAndAdults: 'Подростки, юноши и взрослые',
  },
  categoryNames: {
    judo: 'Группы дзюдо',
    team: 'Сборная',
    crossfit: 'Кроссфит для дзюдо',
    girls: 'Женская группа',
    personal: 'Индивидуальная тренировка',
  },
  plansTitle: 'Тарифы тренировок',
  plansLead:
    'Инвестиция в будущее, уверенность и дисциплину вашего ребёнка. Выберите подходящий тариф.',
  perMonth: '/ месяц',
  plans: [
    {
      name: 'Базовый тариф',
      cadence: '2 тренировки в неделю',
      features: [
        'Основы дзюдо и двигательные навыки',
        'Развитие дисциплины и уверенности в себе',
        'Поддерживающая и вдохновляющая среда',
      ],
      cta: 'Выбрать тариф',
    },
    {
      name: 'Тариф «Боец»',
      cadence: '3 тренировки в неделю',
      features: [
        'Всё, что входит в базовый тариф',
        'Продвинутые тренировки и работа над техникой',
        'Углублённое изучение ценностей бусидо и уважения',
      ],
      cta: 'Присоединиться',
      badge: 'Продвинутый тариф',
    },
    {
      name: 'Тариф «Гладиатор»',
      cadence: 'Безлимитные тренировки + сборная',
      features: [
        'Доступ ко всем тренировкам расписания',
        'Развитие личного и командного мастерства',
        'Индивидуальное сопровождение для раскрытия потенциала',
      ],
      cta: 'Выбрать тариф',
    },
  ],
  voicesTitle: 'Голоса из додзё',
  voices: [
    {
      quote:
        'С тех пор как мой сын пришёл в «Гладиатор», его уверенность взлетела. Он научился достойно принимать поражения и всегда стремиться стать лучше. Сэнсэй Лави Тамир — настоящий пример для подражания.',
      name: 'Мама Йонатана',
    },
    {
      quote:
        'Тренировки тяжёлые, но приносят огромное удовлетворение. Здесь атмосфера одной большой семьи, которая подталкивает тебя стать лучшей версией себя — на татами и вне его.',
      name: 'Даниэль, 15 лет',
      role: 'Сборная «Гладиатор»',
    },
  ],
  galleryTitle: 'Моменты из клуба',
  galleryLead: 'Соревнования, церемонии и праздники конца сезона — клуб таким, какой он изнутри.',
  galleryAlts: [
    'Взрослая команда клуба с медалями фестиваля дзюдо в Эйлате',
    'Младшая группа в додзё с медалями и кубками конца сезона',
    'Двое учеников с тренером и грамотами участника турнира',
    'Праздник конца года в клубе: ученики и родители поднимают бокалы',
    'Группа учеников с тренерами и медалями на соревновании',
  ],
  navLabels: ['О клубе', 'Расписание', 'Тарифы', 'Отзывы'],
  steps: [
    'Записываетесь на пробную тренировку через форму',
    'Приходите в удобной одежде и с бутылкой воды',
    'Выходите на татами и присоединяетесь к тренировке',
    'После тренировки говорите с тренером о дальнейших шагах',
  ],
  copyright: '© 2026 Клуб дзюдо «Гладиатор». Все права защищены.',
}

const COPY: Record<Locale, ClubCopy> = { he: HE, en: EN, ru: RU }

/** Join one locale's words to the shared skeleton. Every pairing below is written out
 *  rather than looked up by index: which plan is highlighted, and which anchor each nav
 *  label points at, are facts worth reading in the source. */
function resolve(copy: ClubCopy): ClubContent {
  const [foundation, fighter, gladiator] = copy.plans
  const [priceFoundation, priceFighter, priceGladiator] = PRICES_AGOROT
  const [navAbout, navSchedule, navPlans, navVoices] = copy.navLabels
  const [team, medals, certificates, celebration, podium] = GALLERY
  const [altTeam, altMedals, altCertificates, altCelebration, altPodium] = copy.galleryAlts
  return {
    // `public/clubs/` — served from the app's own origin, so it needs no object store and
    // no upload. Replaced the moment the club uploads a logo through the הגדרות panel.
    logoUrl: LOGO_URL,
    displayName: copy.displayName,
    seasonBadge: copy.seasonBadge,
    hero: copy.hero,
    coach: copy.coach,
    scheduleLead: copy.scheduleLead,
    schedule: SCHEDULE.map(({ day, slots }) => ({
      day,
      slots: slots.map((slot) => ({
        time: slot.time,
        title: copy.slotTitles[slot.title],
        ...(slot.note ? { note: copy.slotNotes[slot.note] } : {}),
        category: slot.category,
      })),
    })),
    categoryNames: copy.categoryNames,
    plansTitle: copy.plansTitle,
    plansLead: copy.plansLead,
    perMonth: copy.perMonth,
    plans: [
      { ...foundation, priceAgorot: priceFoundation, highlighted: false },
      { ...fighter, priceAgorot: priceFighter, highlighted: true },
      { ...gladiator, priceAgorot: priceGladiator, highlighted: false },
    ],
    galleryTitle: copy.galleryTitle,
    galleryLead: copy.galleryLead,
    gallery: [
      { ...team, alt: altTeam },
      { ...medals, alt: altMedals },
      { ...certificates, alt: altCertificates },
      { ...celebration, alt: altCelebration },
      { ...podium, alt: altPodium },
    ],
    voicesTitle: copy.voicesTitle,
    voices: copy.voices,
    navItems: [
      { href: '#landing-about', label: navAbout },
      { href: '#landing-schedule', label: navSchedule },
      { href: '#landing-plans', label: navPlans },
      { href: '#landing-voices', label: navVoices },
    ],
    steps: copy.steps,
    copyright: copy.copyright,
  }
}

const SLUGS = new Set(['gladiator'])

export function clubContentFor(slug: string, locale: Locale): ClubContent | null {
  return SLUGS.has(slug) ? resolve(COPY[locale]) : null
}
