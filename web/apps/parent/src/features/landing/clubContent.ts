// TEMPORARY, by explicit decision (2026-08-30): the user chose to hardcode the Gladiator
// club's marketing content — transcribed verbatim from the approved Stitch screens
// ("דף נחיתה סופי") — rather than wait for it to become club-editable data. This module
// is the stand-in for fields `studio.settings.landing` does not carry yet: pricing plans,
// the coach, testimonials, and the designed week timetable.
//
// The shape to grow into: extend `settings.landing` (and `PublicLandingOut`) with these
// fields, seed Gladiator's row from this file, then delete it. Until then, a slug with no
// entry here gets the data-driven page — the schedule derives from the API's groups and
// the content-only sections stay off — so no other club ever shows Gladiator's coach.
//
// Hebrew lives here deliberately: this is CLUB DATA in the club's own voice, exactly like
// `headline` and `about` from `studio.settings` — not chrome, which stays in i18n.

/** Legend categories — Stitch's five, with the cell tints keyed by class in landing.css. */
export type SlotCategory = 'judo' | 'team' | 'crossfit' | 'girls' | 'personal'

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

export type ClubContent = {
  /** Bundled brand asset, used ONLY when the club has uploaded no logo of its own —
   *  `landing.logo_url` always wins. Staging carries no uploaded logo, and a landing page
   *  with no mark on it is not something to hand a manager. */
  logoUrl?: string
  seasonBadge: string
  hero: { prefix: string; middle: string; accent: string; lead: string }
  coach: {
    headingTop: string
    headingBottom: string
    name: string
    title: string
    bio: string
    credentials: { icon: 'experience' | 'education'; title: string; text: string }[]
  }
  scheduleLead: string
  /** Sunday-first weekday → its slots, matching `people.weekdays.*`. */
  schedule: { day: number; slots: ContentSlot[] }[]
  categoryNames: Record<SlotCategory, string>
  plansTitle: string
  plansLead: string
  perMonth: string
  plans: ClubPlan[]
  voicesTitle: string
  voices: { quote: string; name: string; role?: string }[]
  navItems: { href: string; label: string }[]
  copyright: string
}

const GLADIATOR: ClubContent = {
  // `public/clubs/` — served from the app's own origin, so it needs no object store and
  // no upload. Replaced the moment the club uploads a logo through the הגדרות panel.
  logoUrl: '/clubs/gladiator-logo.png',
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
        icon: 'experience',
        title: '20 שנות ניסיון',
        text: 'שני עשורים של הדרכה ועיצוב דורות של חניכים על המזרן ובחיים.',
      },
      {
        icon: 'education',
        title: 'גישה חינוכית',
        text: 'בוגר וינגייט המשלב פסיכולוגיית ספורט בכל אימון.',
      },
    ],
  },
  scheduleLead: 'לוח הזמנים המלא של מועדון גלדיאטור. בחרו את הקבוצה המתאימה לכם.',
  schedule: [
    {
      day: 0,
      slots: [
        { time: ['16:00', '17:00'], title: "אימון ג'ודו", note: 'גילאי 8-12', category: 'judo' },
        { time: ['17:00', '18:30'], title: "אימון ג'ודו נבחרת", category: 'team' },
      ],
    },
    {
      day: 1,
      slots: [
        { time: ['16:00', '17:00'], title: "אימון קרוספיט לג'ודו", category: 'crossfit' },
      ],
    },
    {
      day: 2,
      slots: [
        { time: ['16:00', '17:00'], title: "אימון ג'ודו קבוצה 4", note: 'גילאי 10-12', category: 'judo' },
        { time: ['17:00', '17:45'], title: "אימון ג'ודו קבוצה 1", note: 'גילאי 4-6', category: 'judo' },
        { time: ['17:45', '18:30'], title: "אימון ג'ודו קבוצה 2", note: 'גילאי 7-9', category: 'judo' },
        { time: ['18:30', '19:30'], title: "אימון ג'ודו קבוצה 3", note: 'גילאי 9-10', category: 'judo' },
        { time: ['19:30', '21:00'], title: "אימון ג'ודו קבוצה 5", note: 'נערים, נוער ובוגרים', category: 'judo' },
      ],
    },
    {
      day: 3,
      slots: [
        { time: ['16:00', '17:00'], title: "נבחרת ג'ודו בנות", category: 'girls' },
        { time: ['17:00', '18:00'], title: "אימון קרוספיט לג'ודו", category: 'crossfit' },
      ],
    },
    {
      day: 4,
      slots: [{ time: ['16:00', '17:00'], title: "אימון ג'ודו נבחרת", category: 'team' }],
    },
    {
      day: 5,
      slots: [
        { time: ['14:00', '14:45'], title: "אימון ג'ודו קבוצה 1", note: 'גילאי 4-6', category: 'judo' },
        { time: ['14:45', '15:30'], title: "אימון ג'ודו קבוצה 2", note: 'גילאי 7-9', category: 'judo' },
        { time: ['15:30', '16:30'], title: "אימון ג'ודו קבוצה 3", note: 'גילאי 9-10', category: 'judo' },
        { time: ['16:30', '17:30'], title: "אימון ג'ודו קבוצה 4", note: 'גילאי 10-12', category: 'judo' },
        { time: ['17:30', '19:00'], title: "אימון ג'ודו קבוצה 5", note: 'נערים, נוער ובוגרים', category: 'judo' },
      ],
    },
    {
      day: 6,
      slots: [{ time: ['11:00', '12:30'], title: 'אימון טכניקה אישי', category: 'personal' }],
    },
  ],
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
      priceAgorot: 30000,
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
      priceAgorot: 40000,
      features: [
        'כל מה שכלול במסלול יסוד',
        'אימונים מתקדמים ופיתוח טכניקה',
        'העמקת ערכי הבושידו והכבוד',
      ],
      cta: 'הצטרף עכשיו',
      highlighted: true,
      badge: 'מסלול מתקדם',
    },
    {
      name: 'מסלול גלדיאטור',
      cadence: 'אימונים ללא הגבלה + נבחרת',
      priceAgorot: 55000,
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
  navItems: [
    { href: '#landing-about', label: 'אודות' },
    { href: '#landing-schedule', label: 'מערכת שעות' },
    { href: '#landing-plans', label: 'מסלולים' },
    { href: '#landing-voices', label: 'המלצות' },
  ],
  copyright: "© 2026 מועדון הג'ודו גלדיאטור. כל הזכויות שמורות.",
}

const CONTENT: Record<string, ClubContent> = { gladiator: GLADIATOR }

export function clubContentFor(slug: string): ClubContent | null {
  return CONTENT[slug] ?? null
}
