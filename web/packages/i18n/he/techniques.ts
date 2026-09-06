import type { Bundle } from '../types'

/**
 * The judo technique library (spec `docs/superpowers/specs/2026-09-05-judo-technique-
 * library-design.md`). Hebrew is the reference locale — `en` and `ru` mirror these keys
 * and `web/scripts/i18n-parity.mjs techniques` fails on a gap in `en`.
 *
 * Written first as `apps/parent/src/features/techniques/strings.ts`, deliberately: this
 * package's `types.ts` and `index.ts` are the registries that serialise parallel work, and
 * a second session owned the shell while the feature was built. Promoted here by the
 * commit that wired the tab, which is the commit that could edit them.
 *
 * `{{group}}` and `{{name}}` are filled by the caller — `fill()` in the feature's own
 * `format.ts`, the same way `people.document.missingCount` is filled at its call site.
 */
export const techniques: Bundle = {
  'title': 'טכניקות ג׳ודו',
  'search.placeholder': 'חיפוש טכניקה',
  'search.example': 'סאוי · seoi · 背負',
  'search.empty.title': 'לא מצאנו טכניקה בשם הזה',
  'search.empty.hint': 'אפשר לחפש בעברית, באנגלית או ביפנית — למשל סאוי, seoi או 背負',
  'search.elsewhere.title': 'אין התאמה בקטגוריה הזו',
  'search.elsewhere.hint': 'יש תוצאות בקטגוריה השנייה',
  'category.nage-waza': 'נגה־וואזה · זריקות',
  'category.nage-waza.short': 'זריקות',
  'category.katame-waza.short': 'אחיזות',
  'category.katame-waza': 'קטאמה־וואזה · אחיזות',
  'family.te': 'טה־וואזה · טכניקות יד',
  'family.koshi': 'קושי־וואזה · טכניקות ירך',
  'family.ashi': 'אשי־וואזה · טכניקות רגל',
  'family.ma-sutemi': 'מה־סוטמי־וואזה · זריקות הקרבה לאחור',
  'family.yoko-sutemi': 'יוקו־סוטמי־וואזה · זריקות הקרבה לצד',
  'family.osaekomi': 'אוסאקומי־וואזה · אחיזות קרקע',
  'family.shime': 'שימה־וואזה · חניקות',
  'family.kansetsu': 'קאנסטסו־וואזה · מנופי מפרק',
  'gokyo.group': 'גוקיו {{group}}',
  'gokyo.none': 'מחוץ לגוקיו',
  'detail.category': 'קטגוריה',
  'detail.subcategory': 'תת־קטגוריה',
  'detail.gokyo': 'גוקיו',
  'detail.gokyo.value': 'קבוצה {{group}}',
  'detail.gokyo.outside': 'לא נכללת בארבעים',
  'detail.meaning': 'משמעות השם',
  'detail.back': 'חזרה לרשימה',
  'shelf.title': 'הטכניקות שלי',
  'shelf.hint': 'הטכניקות שסימנתם — טוקוי־וואזה',
  'shelf.add': 'הוספה לטכניקות שלי',
  'shelf.add.named': 'הוספת {{name}} לטכניקות שלי',
  'shelf.remove.named': 'הסרת {{name}} מהטכניקות שלי',
  'shelf.remove': 'הסרה מהטכניקות שלי',
  'shelf.saved': 'בטכניקות שלי',
  'video.speed': 'מהירות',
  'video.startsAt': 'מתחיל מ־',
  'video.startsAtBeginning': 'מתחיל מההתחלה',
  'video.startHere': 'להתחיל כאן',
  'video.startReset': 'איפוס',
  'video.title': 'הדגמה רשמית — קודוקאן',
  'video.missing': 'לקודוקאן אין סרטון לטכניקה הזו',
  'video.offline': 'צפייה בסרטון דורשת חיבור לאינטרנט',
  'ijf.open': 'צפייה באנימציית תלת־ממד',
  'ijf.heading': 'אנימציית תלת־ממד',
  'ijf.attribution': 'התוכן מאתר judo.ijf.org',
  'ijf.close': 'סגירה',
  'ijf.external': 'פתיחה בדפדפן',
  'ijf.failed': 'לא הצלחנו לטעון את העמוד',
  'ijf.failed.hint': 'אפשר לפתוח אותו ישירות בדפדפן',
}
