# The parent app — what a parent sees, screen by screen

Not an architecture document. This describes the app the way the person holding the phone
meets it: every screen, everything on it, every button, and what happens when it is pressed.
Hebrew labels are quoted exactly as they appear, so a design can be matched to the running
app without opening it.

**Who it is for.** A parent with one or more children in a judo club. Hebrew, right to left,
on a phone, installed to the home screen. Also usable by an adult who trains themselves.

**What it exists to answer.** Four questions, and everything else is secondary:
*when is the next lesson · do I owe money · what did the club tell me · is my child's
paperwork done.*

**What it is not.** There is no chat with the coach. There is no feed, no likes, no photos
of other people's children, no leaderboard. The club talks, the parent answers a small
number of specific questions, and that is the whole conversation.

---

## Part 1 · Getting in

### Four different ways a family arrives

| | How they arrive | What they see first |
|---|---|---|
| **A** | A link in the club's Instagram bio, or a QR code on a flyer | The club's public page, and a free trial lesson to book. No account needed to read it. |
| **B** | A WhatsApp link the club sent — "join here" | A sign-in wall carrying the club's own logo, then a four-step registration |
| **C** | An invitation the manager generated for a family already in the club's records | The same four-step registration, with the child's name already filled in |
| **D** | Already inside the app, adding a second child | The same four-step registration again |

### A · The club's public page

A full marketing page a stranger can read without signing in. Sticky header with the club's
logo and in-page links, then, in order and only where the club has supplied the content:

- **Hero** — the club's headline, a lead line, and the offer: **"אימון ניסיון חינם"**
  (free trial lesson) with **"למידה נוספת"** beside it. **"הצטרפו עכשיו"** in the header.
- **Coach / about** — **"על המועדון"**
- **Gallery** — the club's own photographs
- **Weekly schedule** — **"מערכת אימונים שבועית"**, each group with its age range
  (**"גילאים"**)
- **Plans** — what training costs
- **Voices** — what other families say
- **What a trial lesson is like** — **"איך נראה שיעור ניסיון"**
- **Where** — **"איפה מתאמנים"**, an embedded map, **"ניווט"**, **"וואטסאפ"**
- **Footer** — **"שיעור הניסיון הראשון חינם"**

Booking a trial opens a short form: **"מי מגיע לשיעור?"** — full name, birthdate, then the
group, then the time. A group the child is too young or too old for says
**"הקבוצה מיועדת לגילאים אחרים"** rather than accepting them. **"הוספת ילד נוסף"** repeats
it for a sibling. Then **"פרטי יצירת קשר"** — first name, surname, phone, email.

Sign-in is required to **book**, never to **read**.

**After booking** — **"נשמר מקום ל{names}"**, then **"מה עכשיו?"**: the health declaration
is signed, **"הגיעו עשר דקות לפני, בבגדים נוחים"**, **"התקנת האפליקציה"**, and
**"צריכים לשנות את המועד? שלחו לנו הודעה"** with a WhatsApp button.

### Signing in

Google only. **"התחברות עם Google"**, under the wordmark, with
**"בלי סיסמאות. הגישה נקבעת לפי החשבון שאיתו הוזמנתם"** and links to the terms and the
privacy policy. The language picker floats over this screen — **the language is chosen
before signing in**, because a Russian-speaking parent cannot read a Hebrew consent screen.

If the account matches nobody in the club's records: **"לא מצאנו אותך"**, with a
**"יש לי קוד הזמנה"** field to type an invitation code, and a way to sign out. That refusal
happens *before* the app's furniture is drawn — no tab bar, no drawer, nothing to explore.

### The four-step registration (doors B, C and D)

A progress rail across the top: **"שלב 2 מתוך 4"**. **"חזרה"** at each step.

**Step 1 — "הצטרפות" · agreements.** **"לפני שנתחיל"** — *"so that we can keep information
about your children, we need your agreement to three documents."* Three cards, each with a
one-line summary, a version number, and **"קריאת המסמך המלא"**: terms of use, privacy
policy, and the club's own rules and payment terms (**"פעם אחת, עבור כל המשפחה"** — asked
once for the whole family). One checkbox agrees to all three.

**Step 2 — "הרשמת משפחה" · the family.** The household is asked **once**: identity number,
address, town, phone, home phone, year of immigration if relevant, and the other parent's
details. Then each child individually — full name, birthdate, school class, identity
number, groups, and a plan. **"אותם פרטים כמו הקודם"** copies the previous child's details.
**"אני מתאמנ/ת גם"** adds the signing parent as a student. Per child, the family chooses
**"הצטרפות למועדון"** or **"שיעור ניסיון חינם"**. **"מורשי איסוף"** lists other adults
allowed to collect the child, with **"הוספת מורשה איסוף"**. **"הוספת תלמיד"** adds another.

**Step 3 — "הצהרות בריאות" · health, one per child.** Opens with a single question —
**"יש משהו שכדאי שנדע?"** with **"אין מגבלות ידועות"** and **"יש משהו שצריך לדעת"**. Only
the second opens the full question list. A confirmation checkbox, a finger signature, then
**"חתימה והמשך"**. With more than one child there is a queue — **"תור הצהרות הבריאות"**.

**Step 4 — "תשלומים" · how the money moves.** **"בחרו אמצעי תשלום אחד למשפחה"**, then a
summary where any single child can be changed. Card payment shows a total and
**"לתשלום בכרטיס"**; a standing order gives **a separate link per child**, because a
standing order is signed for a fixed amount; cash and cheques simply notify the manager —
**"הודענו למנהל. הוא יסמן כשהכסף יגיע."** If nothing is owed: **"אין תשלומים פתוחים."**

**Done — "כל הילדים רשומים"**, with anything still to hand over in person
(**"יש למסור למאמן בתחילת האימון הקרוב"**) and **"כניסה לאפליקציה"**.

### The two walls that stand in front of the app

A family that arrived some other way meets these on first launch, in this order, and
**nothing else is reachable until both are cleared** — not even the tab bar, which is hidden
while they stand.

1. **"אישורים"** — terms of use and privacy policy, each with a summary, a version and
   **"קריאת המסמך המלא"**. Both boxes must be ticked. **"אישור והמשך"**.
2. **"נדרשת הצהרת בריאות"** — *"to continue, fill in the child's health declaration."* Per
   child. Questions answered yes/no, with **"אין בעיות בריאות ידועות"** to answer them all
   at once, a confirmation clause, and a signature drawn with a finger
   (**"חתמו באצבע במסגרת"**, **"ניקוי החתימה"**). **"שליחת ההצהרה"**. A child still on a
   trial is held to the short form only.

Then one screen that **nags but does not block** — the payment step above. A family can
press **"אחר כך"** and use the app.

---

## Part 2 · What is always on screen

### The bar along the bottom — four tabs

| Tab | Label | Goes to |
|---|---|---|
| Home | בית | The next lesson and the week |
| Payments | תשלומים | What is owed |
| Messages | הודעות | The club's updates — **carries a number badge** |
| Profile | פרופיל | Settings |

The badge counts **what still needs the parent to do something**, not what is unread. A
message asking for money stays counted until the money arrives; a message that asks for
nothing clears when it is read.

### The menu drawer — **"תפריט"**

The club's name at the top, a switcher if the family belongs to more than one club, then:
my children · **"לוח הילד"** · תשלומים · עדכוני מועדון · אירועים · **"חנות המועדון"** ·
add a child. Below that, a count of children and of missing declarations, a link to
**"פרטיות ומידע אישי"**, then language, theme (**"בהיר / כהה / מערכת"**, each stating the
current one) and **"התנתקות"**.

Signing out deletes any half-finished registration saved on the device — it holds children's
identity numbers and health answers, and must not survive into whoever signs in next.

### Things that float over everything

- **Accessibility menu** — **"תפריט נגישות"**, on every screen including the public page:
  text size, high contrast, reduced motion, underlined links, a reset, and an accessibility
  statement. The statement says outright that the signature must be drawn by finger or
  mouse, and that a parent who cannot draw one should telephone the club, which will
  complete the declaration for them.
- **New version toast** — **"גרסה חדשה זמינה"** with **"רענון"** / **"אחר כך"**.
- **Install nudge** — **"התקינו את האפליקציה — התראות ועבודה גם בלי אינטרנט"**, with
  **"להתקנה"** and **"לא עכשיו"**. It opens a walkthrough: on iPhone, tap share, scroll to
  "add to home screen", tap add — with a screenshot. **This matters more than it looks.**
  On an iPhone, notifications exist *only* for an installed app, and the club is not
  permitted to fall back to email or SMS. A parent who never installs can be reached only by
  telephone.
- **Notifications-off banner** — **"התראות כבויות"** / *"you will not be told when a lesson
  is cancelled"*, with **"פתיחת ההגדרות"**.

---

## Part 3 · The screens

### Home

The screen that answers "when is the next lesson", in this order:

1. **A debt strip**, only when money is owed — a warning icon, the amount in red,
   **"חוב פתוח"**, and **"לתשלום"**. A strip and not a card: three other places already show
   this number, and here its job is to be noticed, not to be the biggest thing on screen.
   When nothing is owed, a quiet line instead: **"אין התראות פתוחות."**
2. **The next lesson, at full size** — **"השיעור הבא"**, with the two-way answer the coach
   is waiting for: **"מגיע/ה"** and **"לא מגיע/ה"**, under **"מה לעדכן למאמן?"**. Once
   answered it says **"עדכנתם שמגיע/ה"** and **"אפשר לשנות עד תחילת השיעור"**. After the
   lesson has begun the buttons are gone and it says **"השיעור כבר התחיל"**. Offline it
   refuses honestly — **"דיווח היעדרות דורש חיבור לאינטרנט"** — rather than queueing
   something the coach will never see.
3. **The children** — a row of chips, **"הכל"** plus one per child, filtering what is below.
   Each child's chip leads to **"כרטיס חניך"**, their card.
4. **"בהמשך השבוע"** — the rest of the week as compact rows, day letter on the leading edge,
   with **"דיווח היעדרות"** as a real control in the section header.

With no children yet: **"עדיין אין ילדים משויכים לחשבון הזה"** /
**"מנהל הסטודיו משייך ילד לחשבון בעת ההרשמה"**.

**A family still on a trial sees a different home** — **"השיעור הראשון"**: a countdown
(**"היום"**, **"מחר"**, **"עוד 3 ימים"**), **"הוספה ליומן"**, **"איך מגיעים"**,
**"מה להביא"** (*comfortable clothes and a water bottle, arrive ten minutes early*), and
after the lesson **"איך היה?"** leading to **"הצטרפות למועדון"**.

### Calendar — **"לוח הילד"**

Day, week or month (**"יום / שבוע / חודש"**), **"היום"** to return, and a filter for
**"כל הילדים"** or one. A summary line: attendance rate, sessions held, sessions planned.
Two lists below — **"שיעורים קרובים"** and **"שיעורים שהיו"** — with a legend.

Tapping a day opens **"מגיעים לשיעור?"**: **"מגיעים"** / **"לא מגיעים"**, an optional
reason, **"שליחה"**. It confirms in words — **"רשמנו שאתם מגיעים"** or
**"הודענו למועדון שלא תגיעו"** — and refuses plainly when it is too late.

Underneath, **"סנכרון ליומן"**: add to Google Calendar, add to Apple Calendar, or copy the
link. It warns that **Google refreshes up to a day late, but cancellations are always sent
as a notification**. **"החלפת הקישור"** invalidates the old one, with a warning that any
already-synced calendar will stop updating.

### Reporting an absence — **"דיווח היעדרות"**

**"עד תחילת השיעור"**. Which child, which lesson, an optional reason
(**"סיבה — לא חובה"**), **"שליחת הדיווח"**. Confirms with **"הדיווח נשלח"**.

This screen **will not work offline and says so** — *"the report will not be saved offline.
Try again when you have a connection."* A queued absence is worse than none: the coach marks
the register from what they can see.

### A child's card — **"כרטיס חניך"**

Everything about one child on one screen, as a list of labelled rows rather than a dashboard:

- The child's name, their belt colour beside it, and their current status
- **"חגורה"** — the current belt, leading to the full progression
- **"תאריך לידה"**
- **"קבוצות"** — which groups, which days, and **"מסלול"** leading to the training plan
- **"נוכחות"** — present / absent / notified in advance / unmarked, **"ב־62 הימים האחרונים"**
- **"בריאות"** — the declaration's state and **"תקפה עד"**
- **"חוב"** — what is owed for this child and **"לתשלום עד"**
- **"הורים"** — who the club has on file
- **"חברות"** — when the membership began, and any freeze

### Payments — **"תשלומים"**

**"חובות פתוחים"** with **"סה״כ חוב"**, then **"איך תרצה לשלם?"**:

- **"כרטיס אשראי"** — the oldest charges are selected first, across every child the parent
  pays for. **"בחר חודשים"** pays ahead. A split into equal instalments
  (**"{n} תשלומים שווים"**). **"לתשלום"** opens the card form in an overlay.
- **"הוראת קבע"** — a link per child. It states plainly that
  **"תשלום בהוראת קבע נרשם על ידי המועדון לאחר קבלתו"**, and that the standing order itself
  is set up on the payment company's site. If one is already active it warns:
  **"רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים"**.
- **Cash or cheque** — recorded as a request the manager confirms. A second request is
  refused while one is pending.

A charge already inside an open payment is labelled **"החיוב כלול בתשלום שכבר נפתח"** rather
than offered twice. Paying ahead shows **"שולם מראש"** and how many months it covers.

**After paying**, the return screen says **"התקבל, מאמת תשלום…"** and — importantly —
**"אפשר לסגור את החלון — האישור יגיע גם אם תצאו מהעמוד"**. Then שולם, נכשל, פג תוקף, or
**"סכום לא תואם"** when the amount received differs from the amount expected.

**History — "תשלומים שבוצעו"**: **"שולם השנה"**, **"יתרה פתוחה"**, a filter by type, and
per row **"שליחת קבלה במייל"** — with the honest note that a computer-issued receipt exists
for card payments only.

### The training plan — **"המסלול שלי"**

Per child. What the monthly price buys, what is **"תמיד כלול"**, and this week's optional
extra session: **"האימון הנוסף שלי השבוע"** with **"סימון הגעה"** / **"ביטול הסימון"** and
**"אפשר לבחור אימון אחד. מתאפס בכל יום ראשון."**

**"מעבר למסלול"** offers an upgrade. Confirming asks **"איך תרצו לשלם?"** —
**"אשלם דרך האפליקציה"** or **"כבר שילמתי"**, the second telling the manager, who confirms.
A pending claim shows **"הדיווח על התשלום ממתין לאישור המנהל"**; a rejected one says so and
offers to send again. A scheduled change shows **"ייכנס לתוקף ב־{date}"** with
**"ביטול השינוי"**.

### The club shop — **"חנות המועדון"**

Items the club sells. **"בחירת מידה"**, **"כמות"**, an optional note, a total,
**"לתשלום"**. It says outright that there is no stock tracking —
**"אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד"** — so an order is a charge, not a
reservation. Afterwards: *"the order has been created — you can pay now by card or in
cash"*, with **"למסך התשלומים"**.

### Messages — **"עדכוני מועדון"**

**One way.** The club writes; the parent reads and acts. There is no reply box, because
there is no two-way chat in this product.

The screen leads with **"דברים שממתינים לכם"** — a queue of what still needs an answer,
oldest first, with a count (**"3 מתוך 7"**) and **"ממתין לך"** / **"טופל"** per item. Each
carries the button for the thing it is asking for: **"מילוי הצהרה"**, **"חידוש ההצהרה"**,
**"למסך התשלומים"**, **"מענה להזמנה"**, **"הצטרפות למועדון"**. Below the queue, everything
else under **"עדכונים"**, with **"חדש"** on the unread.

First visit asks permission before the browser does: **"שנודיע לכם?"** /
**"נודיע לך אם שיעור מתבטל"** — **"כן, הודיעו לי"** or **"לא עכשיו"**.

### Events and competitions — **"אירועים ותחרויות"**

A list, per child. Each shows the cost (**"עלות"**), the closing date
(**"ההרשמה נסגרת בתאריך"**), and where the answer stands: **"ממתין לתשובתכם"**,
**"אישרתם השתתפות"**, **"סימנתם שלא תגיעו"**, or **"ממתין לאישור הורה"**.

Opening one gives **"מגיע"** / **"לא מגיע"**, with **"שינוי התשובה"** afterwards until the
deadline. Two warnings appear before the answer, not after:
**"אישור השתתפות יוצר חיוב להורה המשלם"**, and where a signature is needed,
**"ההשתתפות תיחשב מאושרת רק לאחר חתימת ההורה"** with **"אישור וחתימה"**. There is also
**"הוספת האירוע ליומן"**.

Each answer is **per child** — a family with two children at one competition gives two
answers.

### Belt progress — **"התקדמות חגורה"**

Per child, per discipline. The ladder of belts with the ones awarded so far
(**"הדרגות שהוענקו עד היום"**), **"היסטוריית דרגות"** with the date each was awarded, and
an eligibility note: **"הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה"**. Before a first belt:
**"טרם הוענקה דרגה"**.

### Profile — **"פרופיל"**

A settings list. Each row states its current value and leads to where it is changed.

- **"החשבון שלי"** — name, email, phone, editable in place with **"שמירה"** / **"ביטול"**
- **"האפליקציה"** — language, theme, and **"התראות"** with
  **"עדכונים על ביטולי שיעורים"** and a state of **"פעילות"** / **"כבויות"**
- **"תשלומים"** — **"אמצעי התשלום שלי"**
- **"הילדים שלי"** — the list, with **"עזיבת המועדון נעשית מתוך כרטיס החניך"**
- **"המועדון"** — address and phone
- **"פרטיות"** — leading to **"בקשת ייצוא מידע"**

There is deliberately **no delete-my-account button** here, and no settings gear on home —
the profile tab is the one door to this room.

### Privacy — **"פרטיות ומידע אישי"**

*"The information held about you and your children, and what can be done with it."*

- **"בקשת ייצוא מידע"** — everything held about the children, in one file.
  **"ההכנה עשויה להימשך מספר דקות"**
- **"בקשת מחיקת מידע"** — states exactly what goes (name, birthdate, phone, email, photo;
  health declarations and signatures destroyed) and exactly what stays (billing and payment
  records, as the law requires, without a name), that **"הפעולה אינה הפיכה"**, and asks
  again before doing it
- **"פרסום תמונות"** — may the club publish photographs of your children?
  **"מותר לפרסם"** / **"אין לפרסם"**, changeable at any time, and **no answer is recorded as
  no**
- **"הבקשות שלכם"** — every request, its date and its state
- **"הסכמות"** and **"הנוסח שאישרתם"** — what was agreed, and the exact wording agreed to

### Getting there — **"הוראות הגעה"**

The club's address with **"פתיחה במפות"** and **"התקשרות למועדון"**. Where the club has not
entered an address: *"the club has not entered an address yet — telephone to ask."*

### A trial family joining — **"הצטרפות למועדון"**

For a family whose trial went well. **"מצטרפים בשביל"** (which child),
**"באילו קבוצות להתאמן"** — the group they trialled in is marked **"התאמנתם כאן"** —
then **"מה קורה עכשיו"**: join the chosen groups, sign a full health declaration, choose a
payment method. **"מצטרפים"**.

### Adding a child

The full four-step registration again. The agreements step is **skipped, not absent** — the
family has already agreed — and it reappears only if the club's terms or privacy policy have
been rewritten since.

---

## Part 4 · Rules the whole app keeps

- **Money is `₪`, always.** Amounts never wrap apart from their symbol.
- **A time range reads low value first** — `16:30–17:30` — and runs left to right inside the
  right-to-left page, in every language.
- **Never colour alone.** Every status carries a word as well as a hue, so a colour-blind
  parent reads the same thing everyone else does.
- **Every tap target is at least 44×44.** A trailing action is a control, never a caption.
- **Three languages** — Hebrew, English, Russian — chosen before signing in, and the page's
  direction follows the choice.
- **Light and dark**, plus a system option.
- **It refuses rather than pretends.** Offline absence reporting, a passed deadline, a
  standing order that only the club can confirm, a receipt that exists for card payments
  only — each says so at the moment it matters, rather than accepting and failing later.
- **Nothing is asked twice.** The household is asked once; a second child confirms rather
  than retypes; the club's terms are agreed once for the family.

---

## Part 5 · What a parent cannot do, and what is still missing

**Deliberately absent:**

- **No chat with the coach or the office.** The club sends; the parent answers specific
  questions. A "message the coach" affordance is drawn on two designs and is not built.
- **No delete-my-account button on the profile screen.** The server routine that would carry
  it out is not built, so a control there would fail every time it was pressed — an honestly
  absent control beats one that reliably fails.
- **No automated recurring billing.** Standing orders cannot be created by our payment
  provider programmatically; the club marks them paid by hand.
- **No stock in the shop.** Ordering creates a charge, not a reservation.

**Genuinely missing, and a parent would notice:**

1. **Leaving the club cannot actually be done.** The profile screen says
   *"leaving the club is done from the child's card"* — and no section of the child's card
   offers it. The screen that has the control was built and is not reachable from anywhere.
2. **The health declaration's expiry contradicts itself.** One screen says the declaration
   is valid indefinitely; five others print a validity date and promise an annual renewal
   reminder.
3. **A sibling discount, a scholarship rate and belt-gated group eligibility** appear in
   designs and exist nowhere in the product.
4. **The profile screen has an empty extension point** — a place designed for another
   section to appear, which nothing fills.

---

## Where the rest of the design material lives

| | |
|---|---|
| [DESIGN.md](DESIGN.md) | The visual system — colours, Rubik, type scale, spacing, the RTL and money rules |
| [canvas/INVENTORY.md](canvas/INVENTORY.md) | All 61 drawn screens; 20 of them are this app's |
| [specs/](specs/) | One spec per drawn screen — regions, states, strings, findings |
| [proposals/parent-app-shell.md](proposals/parent-app-shell.md) | The redesign in progress: two screens decided and built, eight still open |
| [prompts/parent-screens.md](prompts/parent-screens.md) | Ten paste-ready prompts for the screens still to redesign |
