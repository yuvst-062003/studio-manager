/** The library's strings, in the three locales the app ships.
 *
 * **Why these are here and not in `web/packages/i18n/`.** A namespace has to be listed in
 * `packages/i18n/types.ts` and imported in `packages/i18n/index.ts`, and CLAUDE.md says a
 * lane never edits either — they are the shared registries that serialise parallel work,
 * and another session is in this repo now. The bundles below are already in `Bundle`
 * shape, so promoting them is three file moves and six lines in those two registries,
 * belonging in the same commit that wires the tab.
 *
 * Nothing is inlined in a component, which is the rule that actually matters.
 */
import type { Bundle, Locale } from '@studio/i18n'

const he: Bundle = {
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

const en: Bundle = {
  'title': 'Judo techniques',
  'search.placeholder': 'Search for a technique',
  'search.example': 'seoi · סאוי · 背負',
  'search.empty.title': 'No technique by that name',
  'search.empty.hint': 'Search in Hebrew, English or Japanese — seoi, סאוי or 背負',
  'search.elsewhere.title': 'Nothing in this category',
  'search.elsewhere.hint': 'There are matches in the other one',
  'category.nage-waza': 'Nage-waza · throws',
  'category.nage-waza.short': 'Throws',
  'category.katame-waza.short': 'Holds',
  'category.katame-waza': 'Katame-waza · holds',
  'family.te': 'Te-waza · hand techniques',
  'family.koshi': 'Koshi-waza · hip techniques',
  'family.ashi': 'Ashi-waza · foot and leg techniques',
  'family.ma-sutemi': 'Ma-sutemi-waza · sacrifice throws to the back',
  'family.yoko-sutemi': 'Yoko-sutemi-waza · sacrifice throws to the side',
  'family.osaekomi': 'Osaekomi-waza · holds',
  'family.shime': 'Shime-waza · strangles',
  'family.kansetsu': 'Kansetsu-waza · joint locks',
  'gokyo.group': 'Gokyo {{group}}',
  'gokyo.none': 'Outside the Gokyo',
  'detail.category': 'Category',
  'detail.subcategory': 'Sub-family',
  'detail.gokyo': 'Gokyo',
  'detail.gokyo.value': 'Group {{group}}',
  'detail.gokyo.outside': 'Not among the forty',
  'detail.meaning': 'What the name means',
  'detail.back': 'Back to the list',
  'shelf.title': 'My techniques',
  'shelf.hint': 'The ones you saved — your tokui-waza',
  'shelf.add': 'Add to my techniques',
  'shelf.add.named': 'Add {{name}} to my techniques',
  'shelf.remove.named': 'Remove {{name}} from my techniques',
  'shelf.remove': 'Remove from my techniques',
  'shelf.saved': 'In my techniques',
  'video.speed': 'Speed',
  'video.startsAt': 'Starts at',
  'video.startsAtBeginning': 'Starts from the beginning',
  'video.startHere': 'Start here',
  'video.startReset': 'Reset',
  'video.title': 'Official demonstration — Kodokan',
  'video.missing': 'The Kodokan has no video for this technique',
  'video.offline': 'Watching the video needs a connection',
  'ijf.open': 'Watch the 3D animation',
  'ijf.heading': '3D animation',
  'ijf.attribution': 'Content from judo.ijf.org',
  'ijf.close': 'Close',
  'ijf.external': 'Open in the browser',
  'ijf.failed': 'We could not load the page',
  'ijf.failed.hint': 'You can open it directly in the browser',
}

const ru: Bundle = {
  'title': 'Приёмы дзюдо',
  'search.placeholder': 'Поиск приёма',
  'search.example': 'seoi · סאוי · 背負',
  'search.empty.title': 'Приём с таким названием не найден',
  'search.empty.hint': 'Можно искать на иврите, английском или японском — seoi, סאוי или 背負',
  'search.elsewhere.title': 'В этой категории ничего нет',
  'search.elsewhere.hint': 'Совпадения есть в другой',
  'category.nage-waza': 'Нагэ-вадза · броски',
  'category.nage-waza.short': 'Броски',
  'category.katame-waza.short': 'Захваты',
  'category.katame-waza': 'Катамэ-вадза · захваты',
  'family.te': 'Тэ-вадза · броски руками',
  'family.koshi': 'Коси-вадза · броски бедром',
  'family.ashi': 'Аси-вадза · броски ногами',
  'family.ma-sutemi': 'Ма-сутэми-вадза · броски с падением назад',
  'family.yoko-sutemi': 'Ёко-сутэми-вадза · броски с падением на бок',
  'family.osaekomi': 'Осаэкоми-вадза · удержания',
  'family.shime': 'Симэ-вадза · удушающие',
  'family.kansetsu': 'Кансэцу-вадза · болевые',
  'gokyo.group': 'Гокё {{group}}',
  'gokyo.none': 'Вне Гокё',
  'detail.category': 'Категория',
  'detail.subcategory': 'Подгруппа',
  'detail.gokyo': 'Гокё',
  'detail.gokyo.value': 'Группа {{group}}',
  'detail.gokyo.outside': 'Не входит в сорок',
  'detail.meaning': 'Значение названия',
  'detail.back': 'Назад к списку',
  'shelf.title': 'Мои приёмы',
  'shelf.hint': 'Сохранённые вами — ваши токуй-вадза',
  'shelf.add': 'Добавить к моим приёмам',
  'shelf.add.named': 'Добавить {{name}} к моим приёмам',
  'shelf.remove.named': 'Убрать {{name}} из моих приёмов',
  'shelf.remove': 'Убрать из моих приёмов',
  'shelf.saved': 'В моих приёмах',
  'video.speed': 'Скорость',
  'video.startsAt': 'Начало с',
  'video.startsAtBeginning': 'С начала',
  'video.startHere': 'Начинать отсюда',
  'video.startReset': 'Сброс',
  'video.title': 'Официальный показ — Кодокан',
  'video.missing': 'У Кодокана нет видео для этого приёма',
  'video.offline': 'Для просмотра видео нужен интернет',
  'ijf.open': 'Смотреть 3D-анимацию',
  'ijf.heading': '3D-анимация',
  'ijf.attribution': 'Материал с сайта judo.ijf.org',
  'ijf.close': 'Закрыть',
  'ijf.external': 'Открыть в браузере',
  'ijf.failed': 'Не удалось загрузить страницу',
  'ijf.failed.hint': 'Его можно открыть прямо в браузере',
}

const BUNDLES: Record<Locale, Bundle> = { he, en, ru }

/** Hebrew is the reference locale, so a gap in `en` or `ru` falls back to it rather than
 *  rendering a raw key — the same rule `t()` applies for the registered namespaces. */
export function s(locale: Locale, key: string): string {
  return BUNDLES[locale][key] ?? he[key] ?? key
}

/** `t()` performs no interpolation either; the caller fills the slot. */
export function fill(template: string, slots: Record<string, string | number>): string {
  return Object.entries(slots).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  )
}

export function fillGroup(template: string, group: number): string {
  return fill(template, { group })
}

export const bundles = BUNDLES
