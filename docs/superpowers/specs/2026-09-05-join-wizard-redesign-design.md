# The join wizard redesign

**Date:** 2026-09-05
**Source design:** `~/Desktop/מועדון-ג'ודו-גלדיאטור` — a Vite + React 19 prototype, 4,795 lines
**Replaces:** `web/apps/parent/src/features/onboarding/` — the current four-step `JoinFlow`
**Status:** design agreed, not started

---

## 0 · What this document is

A screen-by-screen description of the rebuilt join wizard: every element, every string,
every rule about when a thing appears and what happens when it is pressed. It is written
so that the wizard can be built without opening the prototype, and so that a reviewer can
tell whether the built thing matches what was agreed.

It is not an architecture document. Where it touches the backend it says what the frontend
needs and why, and names the file that has to change.

### The decisions this rests on

All twelve are settled. Each one changes the shape of the work, so they are recorded here
rather than buried in the section that depends on them.

| Question | Decision |
|---|---|
| **Scope** | The join wizard only. The four-tab parent app redesign is a separate spec. |
| **Styling** | Bring Tailwind CSS and `lucide-react` into `web/apps/parent`. Port the prototype's classes as written, colour codes included. The parent app will carry a second styling system that the staff and manager apps do not share. This is accepted. |
| **Step shape** | Follow the prototype. The health declaration moves *inside* the per-child form. A family completes one child entirely — details, group, plan, health, signature — before starting the next. |
| **Manager review gate** | In scope, frontend and backend both. A health answer of "yes" marks the child as awaiting manager review, charges them nothing, and excludes them from the payment total. |
| **Where review is cleared** | The manager dashboard's existing alert centre, **plus a push notification** so a Friday-evening registration is not left until Sunday. The transport already exists. |
| **Charge after approval** | The full month, not prorated from the approval date — these holds are expected to close fast. Revisit if they stop closing fast. |
| **Address and city** | On the **student**, in part 1, not on the guardian. Both are hard-required by the server and the prototype asks for neither. |
| **Student sign-in** | A signed-in student sees what a guardian sees for that student. One rule for minors and adults alike. |
| **Emergency phone** | Family-level with a per-child override, the pattern `other_parent` and `pickup_contacts` already use. The only genuinely new field in the wizard. |
| **Draft privacy** | The draft keeps every field, including health, but is stamped and expires after 24 hours, clears on sign-out, and clears on abandon rather than only on save. |
| **Club content** | The FAQ, step 4's events and the WhatsApp link stay hardcoded for now. Generalising them into studio settings is a filed follow-up, not this spec. |
| **Group and plan** | Two independent questions. The group is **which age band** the child trains with — one base group, two sessions a week, the same for all five. The plan is **how often** they train on top of that base: ₪300 the base only, ₪400 one extra bookable session a week, ₪550 no weekly limit plus the Saturday private lesson. A plan exceeding the base group's two sessions is the product, not a mismatch. |

### Decisions recorded for the parent-app spec, not this one

Taken in the same conversation, noted here so they are not lost: the bottom tab bar keeps
four tabs with no side drawer; tab 2 becomes the club shop; money lives inside Profile;
events get no dedicated surface and appear in Home alongside every other session.

---

## 1 · What exists today

`web/apps/parent/src/features/onboarding/` is 7,976 lines across 25 files. The current
wizard has **the same four steps** as the prototype, arranged differently:

```
welcome (agreements)  →  family (all students)  →  health (all students)  →  payment  →  done
```

The prototype's arrangement:

```
step 1 agreements  →  step 2 students, each one carrying its own
                      details · group · plan · health · signature
                                     →  step 3 payment  →  step 4 done
```

The difference is where health and plan selection live. Today they are top-level steps
asked once across the whole family. In the prototype they are part of each child's own
form. For a family with three children, today's flow asks for three names, then three
health declarations, then one payment; the new flow asks everything about child one,
then everything about child two, then payment.

### What carries over unchanged

- **Nothing is written until the final button.** `JoinFlow.tsx` records this as decision B2:
  steps 1–3 touch local state and `localStorage` only, and a single `submitRegistration`
  posts consent, club terms, the parent, the students, the enrolments, the plans, the first
  charge and every health declaration in one transaction. The redesign keeps this exactly.
- **The four doors.** `doorSteps.ts` builds one wizard from four step lists rather than four
  branches. Door A is the anonymous public trial at `/t/<slug>`, door B the shared join link
  at `/join/<token>`, door C the manager's invite at `/?invite=<token>`, door D `#/add-child`
  from inside the app. §12 below says what each door does with the new shape.
- **The sign-in wall above the wizard.** `JoinShell` in `App.tsx` reads the session once and
  shows its own wall. By the time the wizard mounts, the family is signed in. Door A is the
  exception and stays anonymous.
- **Draft storage.** `joinDraftStorage.ts`, `familyDraft.ts` and `healthDraft.ts` already
  mirror wizard state into `localStorage`. The new per-child form extends this rather than
  replacing it, and adds an expiry the current storage has no concept of — see §5.7.

### What is deleted

`JoinHealthStep.tsx` (341 lines) and its 433-line test file. The health step stops being a
top-level screen; its content moves into part 4 of the per-child form. `HealthReviewPopup.tsx`
survives and is reused there.

---

## 2 · The new shape at a glance

Four steps. A fixed header sits above steps 1–3 and disappears on step 4, which takes over
the full screen.

| Step | Title in the header | Progress | Screen |
|---|---|---|---|
| 1 | הסכמים ותנאי הצטרפות | 33% | Agreements |
| 2 | רישום מתאמנים לעונה | 67% | Trainee list, with the nested student form |
| 3 | תשלום וסיכום הצטרפות | 100% | Payment |
| 4 | ברוכים הבאים למשפחה | — | Done |

Layout is a single column, `max-width: 480px`, centred, right-to-left. Page background
`#faf8ff`, body text `#161b28`.

### The header

Fixed to the top, `#faf8ff` at 95% opacity with a backdrop blur and a hairline bottom border.
Four rows stacked:

1. **Top bar.** A back arrow on the leading edge (absent on step 1, where a 8px spacer holds
   the position), the club logo at 36px, then two lines of text — the club name at 11px
   semibold `#444650` over the step title at 16px bold `#161b28`, truncating. A 32px round
   navy avatar sits on the trailing edge.
2. **Step label and percentage.** `שלב 2 מתוך 3: פרטי מתאמנים` in bold `#001849` on the
   leading edge; on the trailing edge the word `הושלמו:` followed by the percentage in a
   `#e9edff` pill.
3. **Three step pills**, an equal-width grid. The current step is solid `#001849` with white
   text and a soft ring; a completed step is `#e9edff`-free — emerald 50 background, emerald
   800 text, emerald 200 border — and shows a check mark in place of its number; a future
   step is `#f2f3ff` with `#757681` text. Every pill is clickable and jumps to that step.
4. **A progress bar** across the full width, 8px tall, `#dee2f4` track, filled with a
   gradient from `#0056c5` through `#2563eb` to `#0d2c6c`, animating over 500ms.

> **Remove before shipping.** The prototype's header carries a fourth row labelled
> `מעבר מהיר:` with four buttons — `מסך 1` through `מסך 4` — that jump to any step without
> validation. It is a design-review affordance, not a product feature. It must not ship.

---

## 3 · Step 1 · Agreements

The screen a family sees first. Its job is to get one informed confirmation covering three
documents, and to answer the questions that otherwise arrive by phone.

### 3.1 Club emblem block

Centred. The club emblem at 144×144, `object-contain`, with a soft drop shadow and a
`scale(1.05)` hover. Below it a pill — `#001849` at 5% opacity, crossed-swords icon in
`#0056c5`, the text `עונת האימונים תשפ״ה` at 12px semibold. Then the heading
`ברוכים הבאים למועדון גלדיאטור` at 24px bold (26px from the `sm` breakpoint), and beneath it,
at 14px `#444650` in a 340px column:

> לפני שנתחיל בתהליך ההצטרפות, יש לעיין ולאשר את מסמכי המועדון

The emblem and the club name come from the studio, not from a constant. `JoinFlow` already
reads `logo_url` and `studio_name` from `OnboardingInfoOut`; the season label needs a new
field — see §11.

### 3.2 The three document cards

A stack of three identical rows, each a full-width white card with a 12px radius, a hairline
`#c5c6d2` border at 30% opacity, and a 1% scale-down on press.

| Icon | Label | Opens |
|---|---|---|
| Document | תנאי שימוש | Terms of use, 8 sections |
| Shield | מדיניות פרטיות | Privacy policy, 12 sections |
| Credit card | תקנות ותנאי תשלום | Payment rules, 3 paragraphs |

Each row: on the leading edge a 40px `#e9edff` tile holding the icon in `#0056c5`, which
inverts to a `#0056c5` tile with a white icon on hover, then the label at 15px bold `#0056c5`.
On the trailing edge the words `צפייה במסמך` at 11px and a chevron that slides 4px on hover.

Pressing a row opens a modal carrying that document's title, icon and body. The privacy
policy's twelve sections are the longest and the modal must scroll.

The document text in the prototype (`data/constants.ts`, `LEGAL_DOCS`) is well written and
accurate to this product — it describes the tenancy separation, the encryption of medical
answers, the append-only audit log, and the fact that a coach sees flags rather than answers.
It should be adopted as the real text, but it belongs in the backend beside
`CLUB_TERMS_VERSION` and `POLICY_VERSION`, not in a frontend constant, because a change to
either version has to re-prompt every family. `JoinWelcomeStep.tsx` already reads
`club_terms_version` from the API and shows documents in popups; that mechanism stays and
its content is replaced.

### 3.3 The FAQ

**Changed from the prototype.** The prototype puts the FAQ on the page as an inline accordion
with its first item pre-opened. It becomes **a single row that opens a popup**, the same
pattern the three documents above use.

#### The row

**Directly below the three document rows**, as a fourth row in the same stack, above the
confirmation card. One full-width card styled exactly like the three in §3.2 — white, 12px
radius, hairline `#c5c6d2` border at 30% opacity, 1% scale-down on press. On the leading edge a
40px `#e9edff` tile holding a help icon in `#0056c5`, inverting to a `#0056c5` tile with a white
icon on hover. Beside it two lines rather than one:

- `שאלות נפוצות של הורים` at 15px bold `#0056c5`
- `מידע חשוב על ציוד, חליפות, מבנה האימונים ונהלים` at 11px `#444650`

On the trailing edge, `5 שאלות` at 11px semibold and a chevron that slides 4px on hover.

> **It is a fourth row, but not a fourth document.** The checkbox below reads
> `קראתי ואני מאשר/ת` and then names its three documents explicitly, so the label itself says
> what is being agreed to. Two things keep the FAQ row visibly apart from the three above it:
> its trailing edge says `5 שאלות` where theirs say `צפייה במסמך`, and its icon is a question
> mark where theirs are a document, a shield and a card. Keep both — they are what stop a
> reader counting four documents.

#### The popup

The same modal chrome the document popups use, so all four behave identically — backdrop at
60% with a small blur, bottom-anchored and sliding up on a phone with a 24px top radius,
centred with a 16px radius from the `sm` breakpoint, 94% maximum height, body scrolling between
a fixed header and the backdrop.

**Header.** A 40px `#e9edff` tile with the help icon in `#0056c5`, then the title
`שאלות נפוצות של הורים` at 18px bold over the subtitle at 12px `#444650`. A 36px round close
button on the trailing edge.

**Body — the five questions as a list.** All five collapsed on open, so the reader sees the
whole list at once and opens the one they want. Opening one closes the others.

| Category badge | Question |
|---|---|
| ציוד ולבוש | מה צריך להביא לאימון הראשון, ואיזה ציוד נדרש? |
| נוכחות הורים | האם ההורים יכולים לצפות במהלך האימון? |
| בטיחות ומזרונים | כיצד נשמרת בטיחות הילדים במהלך האימונים? |
| נוהל היעדרויות | מה קורה אם הילד/ה מחמיץ אימון בגלל מחלה או אירוע? |
| התאמה וביטולים | האם יש תקופת הסתגלות ומהי מדיניות הביטולים? |

Each row keeps the prototype's styling: a 28px icon tile — `#f2f3ff` with a `#0056c5` icon when
closed, solid `#0056c5` with a white icon when open — the category as a small `#e9edff` badge in
`#001849` at 10.5px bold, and the question at 13.5px bold `#161b28`. A chevron in a 24px circle
on the trailing edge rotates 180° when open and takes an `#e9edff` background. The open row's
card gains a `#0056c5` border at 30% and a soft ring.

The answer sits in a `#faf8ff` panel with an `#e9edff` border at 60%, 13px `#444650` at relaxed
line height, fading in over 200ms.

**Accessibility.** The popup carries `role="dialog"` and `aria-modal`, traps focus, closes on
Escape and on backdrop press, restores focus to the row that opened it, and locks background
scroll — the same treatment §14.3 requires of every other modal. Each question keeps its
`aria-expanded` and `aria-controls` pairing.

**Decision: hardcode these five for now.** They are Gladiator's own answers and they ship as
literals, behind the i18n layer like every other string. The follow-up — moving them, step 4's
events and the WhatsApp link into studio settings — is filed in §16 and must happen before a
second studio onboards, or that studio's families read another club's answers.

### 3.4 The confirmation card

A white card, 12px radius, `#e9edff` border, medium shadow, holding two things.

A single checkbox, drawn as a 24px rounded square — `#e3e7fa` with a `#c5c6d2` border when
unchecked, solid `#0056c5` with a white check when checked, scaling to 105% on hover of the
whole label. The label, 13px medium, at 15px line height:

> קראתי ואני מאשר/ת: תנאי שימוש, מדיניות פרטיות ותקנות ותנאי תשלום

Below it the primary action, full width, 48px tall, 12px radius. Disabled it is `#dee2f4`
with `#757681` text and `cursor: not-allowed`. Enabled it is `#001849`, hovering to `#0056c5`,
white text at 15px bold, with the word `המשך` and a leading arrow. It scales to 98% on press.

**The button is disabled until the checkbox is ticked.** One checkbox covers all three
documents. This is deliberate and matches what the current `JoinWelcomeStep` does.

---

## 4 · Step 2 · The trainee list

The screen that holds the family. Its own content is thin; the work happens in the form it
opens.

### 4.1 Season introduction

A pill at 12px semibold on `#e3e7fa` with a pulsing `#0056c5` dot and the season text, and on
the trailing edge the club name with a crossed-swords icon. Below, the heading
`רישום מתאמנים וחניכים` at 22px bold, and:

> הזינו את פרטי התלמידים להרשמה למועדון. ניתן לרשום אחים ומתאמנים נוספים במשפחה בהליך מרוכז אחד.

### 4.2 The registered list

A header row: `מתאמנים שנרשמו` at 16px bold with a `#dae1ff` count pill, and on the trailing
edge `מוכן לשלב הבא` in `#0056c5` with a check icon.

Then one card per child. White, 12px radius, `#dee2f4` border, lifting to a medium shadow on
hover.

**The card's top half.** A 48px `#e3e7fa` tile with a crossed-swords icon and a small
`#0056c5` badge on its lower-leading corner. Beside it the child's name at 17px bold, then
two badges: the belt in `#e9edff`/`#0056c5`, and either the age — `קטין (גיל 11)` or
`בוגר (גיל 19)` in `#d9e2ff` — **or**, when the child is awaiting review, an amber badge
reading `ממתין למענה מנהל (ללא חיוב)` with a clock icon. The age badge and the review badge
are mutually exclusive; the review badge wins.

Under the name, a wrapping metadata row at 12px `#444650`, bullet-separated: grade with a
school icon, birthdate as `DD/MM/YYYY` with a calendar icon, `ת״ז` and the national id with a
card icon, and the student's own email in `#0056c5` and left-to-right, when present.

When the child is awaiting review, an amber strip follows:

> סומן מענה "לא" / קיימת מגבלה רפואית • החניך לא יחויב במסך התשלומים

**The card's actions.** Two 32px icon buttons on the trailing edge — a pencil that reopens
the form with this child loaded, and a bin. The bin refuses when only one child remains,
with the message `חייב להישאר לפחות מתאמן אחד רשום להמשך תהליך ההצטרפות.` The prototype
raises this through `alert()`; it must become an inline message or a toast.

**The card's footer ribbon.** For a minor, a `#f2f3ff` panel in two columns: the guardian's
name and phone with a people icon, and the pickup arrangement with a shield icon — either
`הורים בלבד` or the named authorised adult. For an adult member, a single row instead:
`מתאמן בגיר עצמאי (ללא פרטי הורה או הסדרי איסוף)` with an `18+` marker.

### 4.3 The saved-draft card

Shown only when a half-finished child form exists in `localStorage` and the form itself is
closed. A gradient card from emerald 50 to `#e9edff` with an emerald 300 border:

> **קיימת טיוטה שמורה שלא הושלמה**
> חניך: *«name»* • שלב *«n»* מתוך 5 (נשמר אוטומטית)

Two actions: `המשך מילוי`, a solid `#0056c5` button that reopens the form at the saved
sub-step, and `מחק טיוטה` in `#ba1a1a`, which clears it.

### 4.4 The add button

A full-width dashed-border button in `#0056c5` with a `#d9e2ff` circle holding a plus that
scales on hover. Its label depends on the draft:

- No draft: `+ רישום תלמיד / ילד נוסף במשפחה`
- Draft present: `המשך עריכת טופס החניך («name»)`, and the button takes a
  `#f4f7ff` background with a solid `#0056c5` border.

### 4.5 The sticky footer

Fixed to the bottom, `#faf8ff` at 95% with a blur, a `#dee2f4` top border and a soft upward
shadow. Two buttons in a 480px row: `חזרה` on the leading edge, 48px tall, `#e9edff` with
`#001849` text; and the primary filling the rest — `המשך לשלב 3: תשלום וסיכום` on `#001849`.

The page reserves 112px of bottom padding so the last card clears the footer.

---

## 5 · Step 2's nested student form

The centre of the redesign, and the largest single piece of work. The prototype puts it in
`StudentModalSheet.tsx` at 2,151 lines. It should be built as one directory of small
components, not one file.

### 5.1 Chrome

A full-screen overlay, black at 60% with a small backdrop blur. On a phone the sheet is
anchored to the bottom with a 24px top radius and slides up over 200ms; from the `sm`
breakpoint it centres with a 16px radius. Maximum width 490px, maximum height 94% of the
viewport, and it is a flex column so the body scrolls between a fixed header and a sticky
footer. Pressing the backdrop closes it. A 48×6px `#dee2f4` grab handle shows on phones only.

**Header.** A 40px `#0d2c6c` tile with a person icon, then two lines — the title, which is
`רישום פרטי חניך חדש` when adding and `עריכת פרטי התלמיד` when editing, over the current
sub-step's own label at 12px. On the trailing edge, the autosave chip and a 36px round close
button.

The autosave chip appears only when adding, never when editing, and only once a meaningful
draft exists. It is emerald 50 with an emerald 200 border, a pulsing emerald dot, the text
`נשמר אוטומטית` (shortened to `נשמר` on narrow screens) and an `איפוס` link that clears the
draft and resets every field. On each save it flashes to emerald 100 with an emerald ring.

**The five-part navigator.** A `#f2f3ff` band holding an equal five-column grid. Each tab is
an icon over a label:

| # | Icon | Label |
|---|---|---|
| 1 | Person | 1. פרטים |
| 2 | Crossed swords | 2. קבוצה |
| 3 | Credit card | 3. תשלום |
| 4 | Heart pulse | 4. בריאות |
| 5 | Pen | 5. חתימה |

Current is `#0d2c6c` with white text; a visited part is `#0056c5` at 15% opacity with
`#0056c5` text; an unvisited part is white with `#444650` text. A part that was attempted and
failed validation carries a 8px red dot with a white ring on its top trailing corner.

**Tab behaviour.** Moving *backwards* is always allowed. Moving *forwards* runs the current
part's validation first and is refused if it fails.

**Footer.** Sticky to the bottom of the scrolling body, white, with an `#e9edff` top border.
From part 2 onward a `הקודם` button appears on the leading edge. The primary button fills the
remaining width and carries the next part's label; on part 5 it becomes a submit button in
`#0056c5` reading `שמירת פרטי החניך וסיום` with a check icon. A `ביטול` button closes the
sheet on the trailing edge.

Next-button labels, in order:

1. `המשך לשלב 2: קבוצת אימון`
2. `המשך לשלב 3: מסלול תשלום`
3. `המשך לשלב 4: הצהרת בריאות`
4. `המשך לשלב 5: חירום וחתימה`
5. `שמירת פרטי החניך וסיום`

**The failure banner.** When validation refuses, a red panel appears above the footer:

> **ישנם שדות חובה שלא מולאו כראוי בשלב זה**
> אנא מלאו את השדות המסומנים במסגרת אדומה כדי להמשיך בתהליך הרישום.

### 5.2 Part 1 · Student and guardian details

Opens with a `#f2f3ff` band reading `פרטי החניך/ה` with a person icon.

**The student.** Full name (`לדוגמה: נועם כהן`), national id (`9 ספרות`), birthdate,
**address**, **city**, grade, belt, and an optional email (`student@example.com`).

Grade is a select with thirteen options: `גן חובה / טרום חובה`, `כיתה א׳` through `כיתה ט׳`,
`תיכון`, `בוגרים`. Belt is a select with eight: `חגורה לבנה`, `חגורה לבנה-צהובה`,
`חגורה צהובה`, `חגורה כתומה`, `חגורה ירוקה`, `חגורה כחולה`, `חגורה חומה`, `חגורה שחורה`.

> **Address and city are on the student, not the guardian.** Decided. `save_registration`
> hard-requires both (`REQUIRED_REGISTRATION_FIELDS`), and **the prototype's form asks for
> neither** — as drawn, every family would complete four steps, sign, and then meet
> `RegistrationIncompleteError(["address", "city"])`. That is the dead-end the repo's own
> refusal rule exists to prevent, arrived at from the worst direction. Putting them on the
> child rather than the family also lets separated parents register children at two addresses,
> which a family-level field cannot express.

**Which of these are required is the server's answer, not the form's.**
`required_registration_fields()` returns `(national_id, address, city, grade)` for a minor and
`(national_id, address, city)` for a student who is their own guardian — `grade` is a school
class and a grown adult has no answer for it. The form must read that list rather than hardcode
one, because the write path and the gate have to agree; the repo's own note says a save that
succeeds against a status still demanding a grade leaves the family behind the gate with
nothing left to fill in.

The prototype's grade select offers `בוגרים` as a value, which stores a non-answer as though it
were one. Drop it — an adult is not asked.

The national id is validated with `features/health/nationalId.ts`, client-side **and** again on
the server. The prototype counts digits only, and a mistyped id looks exactly like a real one.

**Minor or adult is derived from the birthdate, not asked.** Under 18 is a minor. This
controls whether the guardian block is required at all, and whose name appears on the
signature line in part 5.

**The guardian**, shown only for a minor: name, national id, mobile (`050-0000000`,
left-to-right), email. Then a pickup toggle — `הורים בלבד` by default; turning it off reveals
two more fields, the authorised adult's name (`שם מלא של המלווה המורשה`) and phone.

Every field is 44px tall with a 12px radius, `#f2f3ff` background and a transparent border,
turning white with a `#0056c5` border on focus. In error it becomes a 2px red 500 border on a
red 50 tint, with the label turning red 700 bold, a `שדה חובה` badge appearing beside the
label, and the message below in red 600 at 11.5px with an alert icon, sliding down over 150ms.

### 5.3 Part 2 · Training group

Header: a `#dae1ff` tile with crossed swords, `בחירת קבוצת אימון` at 17px bold, and a
subtitle naming the branch and its coaches.

One selectable card per group. Selected takes a 2px `#0056c5` border and a medium shadow;
unselected has a hairline `#c5c6d2` border that turns `#0056c5` on hover. Each card carries a
24px radio circle that fills `#0056c5` with a white check when chosen, and:

- the group name at 15px bold
- a `#e9edff` badge with its track — `מסלול בסיס • 2 אימונים בשבוע`
- a `#dae1ff` badge with the session length — `45 דק׳ לאימון`
- a `#d9e2ff` badge with the weekly schedule and a calendar icon —
  `שלישי 17:00–17:45 | שישי 14:00–14:45`
- a metadata line: `מאמנים: …` and the location

Below the list, an `#e9edff` confirmation strip: `קבוצה שנבחרה:` followed by the chosen
group's name in a white pill.

**This needs API work.** The current wizard receives groups as `{id, name, weekdays}`
(`JoinFlow.tsx`). The card needs the schedule as readable text, the coaches, the location, the
age band and the session length. See §11.

**One group per child, as the prototype has it.** The five groups are the club's **base
groups**, one per age band, and every one of them is the same shape: two sessions a week,
Tuesday and Friday. The prototype's data says so on every row — `trainingsPerWeek: 2` and
`מסלול בסיס • 2 אימונים בשבוע`.

**This question is "which age band", not "how often".** How often the child trains is part 3's
question, and the two are independent — see §5.4. There is no second group for a family to
pick here, so the card set is single-select and stays that way.

`Enrollment` remains a link table and `_sync_enrollments` still takes a list; the wizard sends
a list of one. Nothing in the model changes.

### 5.4 Part 3 · Payment plan

Header: a `#0056c5`-tinted tile with a card icon, `בחירת מסלול תשלום ומנוי` at 17px bold, and
the subtitle `בחרו את תנאי המנוי המועדפים עליכם • ללא תשלום כעת`.

Three plan cards, 16px radius:

| Plan | Sessions | Price | Notes |
|---|---|---|---|
| מסלול יסוד | 2 אימונים בשבוע | ₪300 / חודש | — |
| מסלול לוחם | 3 אימונים בשבוע | ₪400 / חודש | Recommended |
| מסלול גלדיאטור | אימונים ללא הגבלה + נבחרת | ₪550 / חודש | — |

The price is 28px bold `#001849` with `/ חודש` beside it at 12px. Three feature lines follow
under a hairline, each with a `#0056c5` check icon. At the foot of the card a band reads
`בחר מסלול` when unselected and `מסלול נבחר ✓` in solid `#0056c5` when selected.

The recommended plan is drawn differently: a red `#ba1a1a` ribbon sits above its top edge
reading `🔥 מסלול מתקדם • מומלץ`, and when selected the whole card inverts to `#001849` with
white text.

### What the plan actually buys

**The plan is how often the child trains; the group is who they train with.** The two are
independent questions and the wizard asks them separately, which is why they are separate parts.

`app/models/training_plan.py` states the club's model exactly:

> The club sells 300 / 400 / 550 ₪. Base training on Tuesday and Friday is included in every
> plan and is never marked; 400 buys one extra session a week, which the student **must mark**,
> after which the app stops letting them mark more; 550 removes the weekly limit and opens the
> Saturday private lesson.

So the base group's two sessions are included in all three plans. `מסלול לוחם` adds one bookable
session a week on top; `מסלול גלדיאטור` removes the cap and opens the Saturday private lesson.
**A plan exceeding the base group's two sessions is the product, not a mismatch.**

Booking that extra session — and being stopped at the cap — is a parent-app feature. **The
wizard only sets `price_plan_id`** and never touches bookings.

**Prices come from the studio's price plans**, not from a constant. `Enrollment`'s docstring is
explicit that price lives on the student (`student.price_plan_id`), not the enrolment. The plan
chosen here sets that field.

`add_child`'s decision-14 refusal (`onboarding.py:298`) fires only when
`requested_plan.sessions_per_week < volume` — a plan covering *less* than the chosen group. With
a two-session base group and plans of two, three and unlimited, it cannot fire from this screen.
It stays as the guard it was written to be, against a stale or crafted `price_plan_id`.

### 5.5 Part 4 · Health declaration

The part that carries the new capability. It opens with a `#0d2c6c` panel in white text:

> **הצהרת בריאות וכשירות גופנית**
> האם החניך/ה כשיר/ה ובריא/ה לפעילות ספורטיבית ומאמץ גופני ללא הגבלות רפואיות?

Two buttons side by side:

- `כן, כשיר/ה ובריא/ה` — when chosen, solid `#0056c5` with a white ring
- `לא, קיימת מגבלה (מנהל)` — when chosen, solid `#ba1a1a` with a white ring

**The healthy preset sets every question to "no" at once.** Choosing "no" clears them all to
unanswered, forcing each to be answered individually. A confirmation strip follows the choice:

- Healthy: `כשיר/ה לחלוטין – כל סעיפי הבריאות סומנו במענה "לא" (ללא מחלות ומגבלות). חיוב כרגיל.`
- Limited: `סומן מענה "לא" / קיימות מגבלות – נדרש מענה ובדיקת מנהל. אנא סמנו "כן" או "לא" עבור כל סעיף.`

Then the questions, in three `#f2f3ff` cards. The prototype hard-codes thirteen:

**1. רקע רפואי ומחלות כרוניות** — chronic illness, asthma or breathing difficulty, known
allergy, regular medication, epilepsy or seizures, diabetes.
**2. לב ומאמץ גופני** — heart disease or defect, chest pain under exertion, fainting or
dizziness under exertion, sudden death in the family under 50.
**3. שלד, שרירים וניתוחים** — fractures, dislocations or recurring joint injury; surgery or
hospitalisation in the last two years; any other health or physical limitation.

Each question is a row with the text on the leading edge and two radio labels on the trailing
edge: `לא`, which fills `#0056c5` when chosen, and `כן`, which fills `#ba1a1a`. **Answering
"yes" to any question flips the top preset to "limited" automatically.**

Finally a free-text box, `הערות בריאות מיוחדות (אופציונלי):`, placeholder
`הנחיות לצוות האימון, רגישויות או דגשים מיוחדים...`.

> **The questions must not be hard-coded.** `HealthFormTemplate` holds a per-studio JSONB
> schema with a version, and `HealthDeclaration` stores `template_id` and `template_version`
> against every signed declaration. A hard-coded list would break every studio but this one and
> would silently invalidate the version trail. **Render the studio's template through this
> three-card grouping.** The template schema needs a group label per question so the cards can
> be built; if it has none, add one. `healthClient.ts` already exposes `TemplateQuestion`,
> `TemplateSchema` and an `isVisible` helper for conditional questions — reuse them, and keep
> conditional follow-up fields working, which the prototype has no concept of.

### 5.6 Part 5 · Emergency contact and signature

Opens with a `#f2f3ff` band reading `פרטי חירום וקופת חולים` with a shield icon and a
`שלב סופי` badge.

Two fields side by side from the `sm` breakpoint: an emergency phone, required, left-to-right,
placeholder `050-0000000`; and a health fund select, required, with `כללית`, `מכבי`,
`מאוחדת`, `לאומית`.

> **The emergency phone is family-level with a per-child override.** Decided. Asked once and
> applied to every child, with a way to give one child a different contact. The prototype asks
> it inside each child's form, so a family with three children types the same number three
> times and gets three places for it to drift out of date. This is the pattern `other_parent`
> and `pickup_contacts` already use in `register()` — per-child values falling back to the
> family-wide ones (F7) — so it costs no new shape, only the same one applied again.
>
> It is also the **only genuinely new field** in this wizard. `national_id`, `grade` and the
> student's own `email` all already exist; see §10.

**The legal declaration.** A `#f2f3ff` card headed `הצהרה משפטית ומחויבות` with a shield icon:

> אני מצהיר/ה בזאת כי כל הפרטים שנמסרו לעיל נכונים, מדויקים ומלאים, וכי אין כל מניעה רפואית או בריאותית להשתתפות באימוני המועדון ובפעילות הגופנית במסגרתו.

Below it a required checkbox on a white row:

> קראתי את ההצהרה ואני מאשר/ת את תנאי הרישום והתקנון *

Failing it turns the whole card red 50 with a red 400 border.

**The signature pad.** A label that reads `חתימה דיגיטלית של ההורה / אפוטרופוס` for a minor
and `חתימה דיגיטלית של המתאמן הבגיר` for an adult, with a `נקה חתימה` link and a rotate icon
on the trailing edge. The pad itself is a 112px-tall white box with a dashed `#c5c6d2` border,
turning solid red 500 with a ring when required and empty.

Before anything is drawn, a placeholder shows the signer's name in a serif italic at 18px
followed by `(חתימה דיגיטלית)`, and under it `חתמו כאן בעזרת העכבר או מגע באצבע`. A note sits
in the lower trailing corner: `פס חתימה מאושר • עונת תשפ״ה`.

Drawing uses a canvas with both mouse and touch handlers, 2.5px round-capped strokes in
`#001849`, sized to its parent on mount. `web/apps/parent/src/features/health/SignaturePad.tsx`
already exists and should be used rather than reimplemented; the visual treatment above is
what changes.

### 5.7 Draft persistence

Every field, plus the current sub-step number, is written to `localStorage` on each keystroke.
The first write after opening is silent; every later one flashes the autosave chip and shows a
small toast.

**Editing an existing child never writes a draft.** Only the add path does. This matters:
otherwise reopening a saved child would overwrite the half-finished draft of a different one.

Saving clears the draft. Cancelling leaves it, which is what makes the resume card in §4.3
work.

The current `joinDraftStorage.ts` stores one draft for the whole wizard. This form needs a
second key holding the in-progress child.

### The draft's lifetime

**Decision: the draft keeps every field, health answers and national ID numbers included, but
it expires.** The resume feature is worth keeping whole; the exposure is bounded by making the
draft short-lived rather than by hollowing it out.

Four rules, all of which must be built and tested — the prototype has only the last one:

1. **Stamped on write.** Every draft carries the time it was last written.
2. **Expired on read.** A draft older than 24 hours is deleted rather than restored, and the
   resume card in §4.3 does not appear. The family starts clean.
3. **Cleared on sign-out.** `App.tsx` already calls `clearAllJoinDrafts()`; that call must reach
   the new key.
4. **Cleared on abandon, not only on save.** The prototype clears only when a child is saved, so
   a form that is started and quit persists indefinitely. Closing the sheet without saving must
   still leave the draft (that is what makes resume work), but leaving the wizard entirely —
   navigating away, or completing the registration — must clear it.

Why this matters more than an ordinary draft: `localStorage` is plaintext, has no expiry of its
own, survives sign-out, is readable by any script on the origin, and the parent app is an
installed progressive web app on what is often a shared family device. The same answers sit in
the database behind `EncryptedJSON` with keys held outside it, an append-only audit log and a
manager-only read. The privacy policy the family accepts on step 1 says exactly that. A draft
that outlives the session makes that sentence untrue, which is the reason for rule 2.

### 5.8 Validation

Errors surface when a field has been blurred, or when the part has been attempted and refused.
Not before — a form that turns red while the first field is still being typed is hostile.

| Field | Rule | Message |
|---|---|---|
| Full name | Required, ≥ 2 characters | `שדה חובה: נא להזין שם מלא של החניך/ה` · `שם מלא חייב להכיל לפחות 2 אותיות` |
| National id | Required, 8–9 digits | `שדה חובה: נא להזין מספר תעודת זהות` · `נא להזין תעודת זהות תקינה בת 8-9 ספרות` |
| Birthdate | Required, not in the future | `שדה חובה: נא לבחור תאריך לידה` · `תאריך לידה אינו תקין` |
| Grade | Required | `שדה חובה: נא לבחור כיתה או מסגרת לימודים` |
| Student email | Optional; if present, valid | `כתובת דוא״ל אינה תקינה` |
| Guardian name | Required for a minor, ≥ 2 characters | `שדה חובה: נא להזין שם הורה / אפוטרופוס` |
| Guardian id | Required for a minor, 8–9 digits | `תעודת זהות הורה אינה תקינה (8-9 ספרות)` |
| Guardian phone | Required for a minor, ≥ 9 digits | `מספר טלפון אינו תקין (לפחות 9 ספרות)` |
| Guardian email | Required for a minor, valid | `שדה חובה: נא להזין כתובת דוא״ל של ההורה` |
| Health preset | Must be chosen | `נא לסמן האם החניך כשיר לפעילות ספורטיבית או קיימת מגבלה` |
| Health answers | All answered when the preset is "limited" | `נא לסמן מענה "כן" או "לא" עבור כל שאלות הרקע הרפואי` |
| Emergency phone | Required, ≥ 9 digits | `שדה חובה: נא להזין מספר טלפון חירום נוסף` |
| Declaration checkbox | Required | `חובה לאשר את הצהרת הבריאות והתקנון להשלמת הרישום` |

Parts 2 and 3 have no validation — both always carry a default selection.

**Two gaps in the prototype to close.** The signature is styled as required and has an error
message, but no rule ever produces it, so a child can be saved unsigned. Add it. And the
national id check counts digits without running the Israeli check-digit algorithm — the repo
already has `features/health/nationalId.ts`; use it.

**Submitting runs parts 1, 4 and 5 in order** and jumps to the first that fails.

---

## 6 · Step 3 · Payment

Two sub-views behind one screen.

### 6.1 The family summary strip

Always visible at the top. A `#f2f3ff` card with a `#dee2f4` border: a people icon, the count
`3 מתאמנים רשומים למשפחה`, and beneath it a truncating list naming each child with their plan
and price — or, for a child awaiting review, `«name» (ממתין למענה מנהל - ₪0)`.

On the trailing edge, a solid `#001849` pill with the monthly total, and beneath it, when any
child is under review, `(1 בהמתנה למנהל - ₪0)` in amber 700.

**The total counts only chargeable children.**

### 6.2 The review banner

Shown when any child is awaiting review. Amber 50 with an amber 300 border and a clock icon:

> **שימו לב: «names» מסומן/ת להמתנה למענה מנהל**
> עקב הצהרת הבריאות (סומן מענה "לא" / קיימת מגבלה), חניך זה אינו מחויב כעת בתשלום (₪0). הרישום ייקלט ויועבר ישירות לבדיקת מנהל המועדון.

### 6.3 Sub-view A · The question

A white card, centred, with a 48px `#e9edff` circle holding a help icon:

> **האם הסדרתם כבר את התשלום מול המאמן?**
> בחרו באפשרות המתאימה כדי שנוכל להמשיך להסדרת הרישום בצורה המדויקת ביותר.

Two choice cards, each with an icon tile, a title, a radio dot, and a subtitle. Selected takes
an `#e9edff` background with a 2px `#001849` border.

| Choice | Subtitle | Effect |
|---|---|---|
| לא, מעוניין להסדיר כעת באפליקציה | כסף (מזומן), צ'קים, הוראת קבע או אשראי. | Advances to sub-view B |
| כן, התשלום כבר הוסדר מראש | דיווח פרטי התשלום למאמן לצורך מעקב תוקף המנוי במערכת. | Opens the confirmation dialog immediately |

**The "already arranged" dialog.** A centred white card, 24px radius, with a `#0056c5` check
circle:

> **הדיווח נקלט בהצלחה!**
> **הודעה נשלחה למאמן המועדון** — דיווח התשלום עבור המתאמנים … הועבר לאישור המאמן, ופרטי הרישום אומתו במערכת.
> ✓ פרטי מתאמנים מאומתים   ✓ תוקף המנוי עודכן
> כל הפרטים עודכנו. כעת תוכלו לעבור לשלב הסיום להשלמת הרישום.

Its button, `סיום ומעבר לשלב 4`, closes it and advances.

> **This dialog currently lies.** It reports success before anything is written — the whole
> wizard writes at step 4. It must either be reworded to describe an intention rather than a
> completed fact, or moved behind the real submit. The second is correct: a family told
> "a message was sent to the coach" when no message exists is exactly the failure the repo's
> own verification notes warn about.

### 6.4 Sub-view B · Per-child methods

A header row with a `שלב 3 מתוך 4` badge, the title `סיכום ואופן תשלום`, and a
`חזרה לבחירה` link back to sub-view A.

One card per child. A numbered `#001849` circle, the name at 16px bold, a group badge, the
monthly price, and on the trailing edge the amount over the method in words.

Below, a four-column selector. The chosen method is solid `#001849` with white text; the rest
are `#e9edff`.

| Button | Icon | Maps to |
|---|---|---|
| אשראי | Credit card | A uPay payment order |
| מזומן | Banknote | `payment_promise.method = 'cash'` |
| צ'קים | Receipt | `payment_promise.method = 'cheque'` |
| הו״ק | Repeat | `payment_promise.method = 'standing_order'` |

**These four map exactly onto what already exists.** `app/models/payment_promise.py` constrains
`method` to `('cash', 'cheque', 'standing_order')` and describes precisely this conversation —
the parent saying "I'm bringing cash" or "I'm bringing cheques", which a manager later confirms.
The standing order is consistent with the project rule that recurring payments cannot be created
programmatically and are marked paid manually.

A child awaiting review renders differently: an amber-bordered card on an amber 50 tint, the
review badge beside the name, the plan price struck through, `₪0` in emerald 700 beneath it,
`לא יחויב כעת` under that, no method selector at all, and an explanatory panel:

> **חניך זה אינו מחויב בתשלום כעת:** עקב סימון "לא" בהצהרת הבריאות / קיומה של מגבלה רפואית, הרישום יועבר ישירות למנהל המועדון למענה ובדיקה. פרטי התשלום יוסדרו בנפרד רק לאחר קבלת אישור רפואי ומענה מהמנהל.

### 6.5 The breakdown card

Headed `פירוט סה״כ לתשלום` with `ביטוח שנתי כלול` on the trailing edge. Up to four rows,
each shown only when it applies:

- Children awaiting review, on an amber tint, ending `ללא חיוב (₪0)`
- `לתשלום מיידי באפליקציה (uPay)` / `בכרטיס אשראי מאובטח` — the credit sum in `#0056c5`
- `לתשלום ישירות למאמן` / `באימון הקרוב` — the promise sum in `#001849`
- When every child is under review: `כל החניכים בהרשמה זו ממתינים למענה ובדיקת מנהל – אין סכום לתשלום במסך זה (₪0 לחיוב).`

When any amount is owed to the coach, a `#0056c5`-tinted note follows:

> יש למסור את התשלום ישירות למאמן באימון הקרוב. תוקף המנוי יעודכן מיד עם השלמת הדיווח.

### 6.6 The footer

Fixed, with the primary button's label computed from the state:

| State | Label |
|---|---|
| Sub-view A, "pay now" selected | `המשך לתשלום` |
| Sub-view A, "already arranged" | `דיווח הסדרה מראש` |
| Sub-view B, nothing chargeable | `אישור ושליחה לבדיקת מנהל (₪0 לחיוב) ✓` |
| Sub-view B, a credit sum exists | `מעבר לתשלום באשראי (₪«sum»)` |
| Sub-view B, no credit sum | `אישור וסיום הרשמה ✓` |

Under it, centred at 11px with a lock icon:
`עסקה מאובטחת ע״פ תקן PCI-DSS • מועדון ג'ודו גלדיאטור`

**This button is the single write point.** Everything the wizard has collected posts here, in
one transaction, through the existing `register` service. `PaymentSetup.tsx` and
`billingClient.ts` already handle the uPay hand-off and the "nothing to pay" case.

---

## 7 · Step 4 · Done

A full-bleed dark screen — `#02102f`, white text — with the header hidden and the content in a
480px column. Confetti fires once on mount.

**Top badges.** On the leading edge a white 10% pill with a pulsing emerald dot:
`שלב 4 מתוך 4: ברוכים הבאים למשפחה`. On the trailing edge a `#0056c5` pill: `100% הושלם 🥳`.

**Emblem.** The club's white-on-transparent logo at 144px, falling back to the standard emblem
with a white glow filter if it fails to load. Below it a `#001849` pill with a `#0056c5` border:
`🥋 IPPON! אושר בהצלחה`.

**Title.** `ברוכים הבאים למשפחת גלדיאטור!` at 26px black, on two lines. The line beneath it
changes with the outcome:

- Normal: `ההרשמה נקלטה בהצלחה. כרטיסי החניכים מוכנים ולוח האימונים לשנת תשפ״ה מעודכן לעלייה על המזרון!`
- Any child under review: `ההרשמה נקלטה בהצלחה. עבור חניכים הממתינים למענה מנהל, ניצור קשר בהקדם לאחר בדיקת הצהרת הבריאות, ויתר כרטיסי החניכים מוכנים לעלייה על המזרון!`

**The review notice**, when it applies — amber 500 at 20% with an amber 400 border:

> **הודעה חשובה: ממתין למענה ובדיקת מנהל**
> בהתאם להצהרת הבריאות שנמסרה (סומן מענה "לא" / קיימת מגבלה), רישום החניך הועבר לבדיקת מנהל המועדון ולא חויב בתשלום כעת (₪0). הנהלת המועדון תיצור עמכם קשר להסדרת האישור הרפואי.

**The registration code.** A `#0d2157` card at 80% with a blur: `מספר אישור הרשמה` over the
code itself at 22px black in gold `#ffd700`, monospaced, with a copy button that turns into a
green check for two seconds.

> The prototype hard-codes `GLD-2024-8841`. This must be the real reference the submit returns.
> If no such reference exists, the card is removed rather than faked.

**The trainee list.** A `#091b48` card listing each child as a pressable row: a `#001849` tile
with the initials in gold, the name, the grade, the group and belt beneath. On the trailing
edge either an emerald `תשלום אושר` badge or an amber `ממתין למענה מנהל` badge with a clock.
Pressing a row opens the digital athlete card.

**Upcoming events.** A second `#091b48` card headed `📅 אירועים קרובים בלוח השנה`, each event a
row with a `#0056c5` date tile, the title, the day and time and location, and an audience badge.

> Hardcoded for now, by decision. Reading them from the events service is the filed follow-up
> in §16. When it happens, hide the card when there are none rather than showing an empty one.

**The parents' WhatsApp group.** A dark teal card with an emerald circle:
`קבוצת וואטסאפ הורים` / `עדכונים בזמן אמת וקשר עם המאמן`, and a `+ הצטרפות` button opening the
club's invite link in a new tab. The link is hardcoded for now, by decision; when it moves to
studio settings (§16) the card hides for a studio that has not supplied one.

**Actions.** A `#0056c5` primary reading `מעבר לאזור האישי באפליקציה`, and below it a quiet
link, `חזרה לתחילת תהליך הרישום`.

> That link resets the whole wizard. It is a prototype affordance and must not ship — a family
> that has just registered has nothing to restart, and pressing it after a real submit would be
> alarming. The existing `JoinDoneScreen.tsx` behaviour, which enters the app, is correct.

---

## 8 · The manager review gate

The one genuinely new capability. It does not exist anywhere in the backend today —
`requires_manager_review`, `needs_review`, `manager_review` and `pending_review` return nothing
across `app/`.

### 8.1 The rule

A child is awaiting review when **any** of these is true:

1. The health preset was set to "limited", or
2. any health question was answered "yes", or
3. the free-text medical notes field is non-empty.

The third condition is the prototype's and it is too broad. "Wears glasses during fitness
training" would suspend a registration and stop a charge. **Condition 3 should be dropped**, or
narrowed to a deliberate "this needs the manager's attention" checkbox beside the notes field.

### 8.2 What it changes for the family

- Step 2's card shows an amber `ממתין למענה מנהל (ללא חיוב)` badge in place of the age badge.
- Step 3 shows the child at `₪0`, struck through, with no payment method selector.
- The child is excluded from every total.
- Step 4 explains that the club will make contact.

### 8.3 What it needs from the backend

**The status already exists, and the rest of the codebase already honours it.** `Enrollment`
constrains `status` to `('pending', 'active', 'frozen', 'ended')`. `pending` has never been
written — `app/services/people/onboarding.py` writes the literal `"active"` at lines 246, 275
and 368 — but every reader was built expecting it.

There are 17 reads of `Enrollment.status` in `app/`. Fourteen filter `== "active"` outright,
including all three in `app/services/billing/run.py`, so the **monthly** billing run already
skips a pending child without any change. The other three go through constants that are all
`("active",)` and each carries the reasoning in a comment:

| Constant | Its own note |
|---|---|
| `roster.py:47` | a `pending` enrollment is a registration request nobody has approved yet, and a coach marking a child the club has not accepted is a record of a decision that was never made |
| `at_risk.py:76` | a `pending` or `frozen` enrollment is not a child anyone expects on a mat |
| `announcements.py:51` | the club's internal notices are not for a family it has not accepted yet |

So a pending child is already absent from the roster, the at-risk worker, announcements,
belts, bookings, events and every billing query. **Nothing downstream needs changing** — the
work below is the whole of it.

The work is:

1. **`register()` decides the status per child** rather than hard-coding `active`. A child whose
   declaration trips the rule gets `pending`.
2. **The first charge is skipped for a pending child.** `charge_first_month` fires at line 316
   unconditionally; it must not fire for a child awaiting review. The function already returns a
   tally, and `register` already returns the number of charges created, so the count stays honest.
3. **A reason is recorded.** Where it lives needs a decision — a column on `Enrollment`, or a row
   in an existing review table. It must never carry the health answers themselves. The project
   rule is explicit: health declarations contain personal data about minors and their contents are
   never logged, and `audit_log.diff` must not hold them. A reason code, not a sentence quoting
   the answers.
4. **A manager sees and clears the queue in the dashboard's alert centre.** Decided. A pending
   review becomes a row type on the alert centre screen the manager dashboard already has,
   carrying the child's name, the reason code and two actions — approve, which activates the
   enrolment and raises the charge, or contact. Reusing that surface means the review arrives
   somewhere managers already look; a new screen would compete with it for the same attention.
   The alert centre's existing count and ordering rules apply.
5. **Clearing review activates the enrolment and raises the charge — the full month.** Decided.
   The charge is not prorated from the approval date; the family owes the month they registered
   in. The reasoning is that these holds close fast, so the gap between registering and being
   approved is small enough that prorating it costs more in reconciliation than it returns to
   the family. `charge_first_month` still takes an `on` date, so this is a choice of argument,
   not a missing mechanism.

   **This makes review latency a billing fairness question.** A hold that closes in a day is
   fair; one that sits over a long weekend charges a family for days their child was not allowed
   to train. That is the reason for the push notification above, and it is worth watching once
   real holds exist — if they stop closing quickly, this decision should be revisited.

6. **The manager is pushed, not left to notice.** A pending review sends a push notification as
   well as appearing in the alert centre. The transport exists: Web Push with VAPID shipped
   2026-09-02, `app/services/comms/push.py`'s `WebPushSender` signs for real, and
   `app/services/ops/checks.py` already carries a `comms.push_transport` signal that catches a
   regression back to the recording fallback. Without this the family is told
   `הנהלת המועדון תיצור עמכם קשר` and a registration arriving on Friday evening waits until
   Sunday for anyone to see it.

### 8.4 What a coach sees

Nothing new. `HealthDeclaration.derived_flags` is booleans only and that is what reaches the mat.
The review status is a billing and enrolment state, not a medical disclosure.

---

## 9 · Styling

**Decision: Tailwind and `lucide-react` come into `web/apps/parent`, and the prototype's classes
are ported as written.**

### 9.1 What to install

`tailwindcss@4`, `@tailwindcss/vite`, `lucide-react`. The prototype uses Tailwind v4's CSS-first
configuration — `@import "tailwindcss"` with no config file — and the Rubik font.

### 9.2 Scoping

The parent app is one of three in an npm workspace sharing `web/packages/ui`. Tailwind's
generated utilities must not leak into components that `@studio/ui` styles, and `@studio/ui`'s
resets must not fight Tailwind's. Confine Tailwind's stylesheet to the onboarding route's own
entry, and keep the wizard's markup free of `@studio/ui` primitives so the two systems never
style the same element.

### 9.3 The palette

Every colour, taken from the prototype:

| Token | Value | Used for |
|---|---|---|
| Page background | `#faf8ff` | Steps 1–3 |
| Primary | `#001849` | Buttons, selected states, headings |
| Primary hover | `#0056c5` | Hover, links, accents |
| Deep | `#0d2c6c` | Modal headers, the health panel |
| Body text | `#161b28` | — |
| Muted text | `#444650` | Subtitles, metadata |
| Faint text | `#757681` | Placeholders, disabled |
| Surface tint | `#f2f3ff` | Field backgrounds, inner cards |
| Surface tint 2 | `#e9edff` | Icon tiles, secondary buttons |
| Border | `#dee2f4` | Card borders, dividers |
| Border strong | `#c5c6d2` | Input borders |
| Selected tint | `#dae1ff` / `#d9e2ff` | Count pills, badges |
| Danger | `#ba1a1a` | Errors, the "limited" health choice |
| Danger tint | `#ffdad6` | Destructive hover |
| Done screen | `#02102f`, `#091b48`, `#0d2157`, `#0e2766` | Step 4 |
| Done accent | `#ffd700` | The registration code |

Emerald, amber and red are used at Tailwind's own scale values.

### 9.4 What must not regress

The parent app has right-to-left and accessibility guarantees that `@studio/ui` currently
provides and Tailwind does not. Porting the markup means porting the responsibility:

- Logical properties, not physical ones. The prototype uses `right`/`left` in several places
  (`absolute top-1 right-1`, `mr-1`) which will sit on the wrong side if the locale flips to
  English or Russian.
- Focus rings on every interactive element. The prototype uses `focus:outline-hidden` widely and
  replaces it with a border colour change, which is not a visible focus indicator for a keyboard
  user.
- The prototype attaches `onClick` to `<div>` for the group cards, the plan cards and the payment
  choice cards. These must be real buttons or radio inputs.
- Contrast: `#757681` on `#faf8ff` is close to the 4.5:1 threshold and should be checked.
- `.claude/rules/ui-rtl-a11y.md` governs all of the above.

---

## 10 · Field mapping

What the prototype collects, against what the API takes today.

**Almost nothing here is new.** `register()` already carries `national_id`, `grade`, `address`,
`city`, `phone_home`, `aliyah_year`, the second parent and the pickup contacts through
`AgreementService.save_registration`, and `features/health/RegistrationStep.tsx` already asks
for them. Exactly one field in this wizard has no home today.

| Prototype field | Repo equivalent | Status |
|---|---|---|
| `fullName` | `first_name` + `last_name` | Needs splitting |
| `idNumber` | `Person.national_id_encrypted` | **Exists, encrypted at rest.** Validate with `nationalId.ts`, both sides |
| `birthDate` | `birthdate` | Exists |
| `email` (student) | `Person.email` | **Exists.** An access field — see below |
| `grade` | the registration agreement's `grade` | **Exists**, and is required only for a minor |
| — | `address`, `city` | **Required by the server and missing from the prototype.** See §5.2 |
| `belt` | `current_belt` | Exists via `belts` |
| `isMinor` | derived from `birthdate` | Derived, never stored |
| `parentName/Id/Phone/Email` | the parent `Person` | Exists, `parentId` included |
| `parentOnlyPickup`, `extraPickup*` | `pickup_contacts` | Exists, per child (F7) |
| `groupKey` | `group_ids: [uuid]` | Exists. The wizard sends a list of one |
| `planKey` | `price_plan_id` | Exists |
| `monthlyFee` | from the price plan | Derived, never sent |
| `paymentMethod` | uPay order or `payment_promise.method` | Exists |
| `emergencyPhone` | — | **New — the only one.** Family-level with a per-child override |
| `hmo` | `health_fund` | Exists |
| `healthAnswers` | `health.answers` against the template | Exists — **use the template** |
| `medicalNotes` | `special_notes` | Exists |
| `signatureData` | `signature_image_base64` | Exists |
| `requiresManagerReview` | `Enrollment.status = 'pending'` | **New behaviour on an existing column** |

Optional fields the current registration step asks for and the prototype drops: `phone_home`,
`aliyah_year`, and the second parent. None is required, so dropping them is a choice rather than
a defect — but it is a choice, and the club's paper form asks for them.

### The student's own email is a sign-in, not a contact

`Person.email` exists on every person including a student's, `Person.auth_identity_id` is
**nullable per person**, and `ix_person_studio_id_email` exists because an invitation is matched
to a pre-created Person by verified email. So the mechanism for a student to sign in as
themselves is already built.

Two shapes it serves:

- **An adult member with no guardian.** `register()`'s `self: bool` child already models this —
  one human in both roles, and `REQUIRED_REGISTRATION_FIELDS_SELF` already drops the school
  class for them.
- **A minor whose guardian also has access.** Collecting both addresses means both can reach the
  app; the guardian's is the one that must always be present.

**Decision: a signed-in student sees what a guardian sees for that student.** One rule, minor or
adult, and the least code. Two consequences to build deliberately rather than discover: a
signed-in teenager can read the family's balance and their own health declaration, and a child
under 13 cannot hold a Google account without a family link, so this field will simply be empty
for young children. It is optional, which is why that is fine.

### The group card's extra data

`OnboardingInfoOut` returns `{id, name, weekdays}` per group. The new card needs the readable
schedule, the coaches, the location, the age band and the session length. Add them to that
response rather than fetching separately — the wizard reads it once and must work for door A
with no session at all.

### The season label

`עונת האימונים תשפ״ה` appears in the header, on step 1, on step 2 and on the signature pad. It
is currently a literal. It belongs on the studio.

---

## 11 · The four doors

`doorSteps.ts` builds one wizard from four step lists. The new per-child form changes what each
door's list means.

| Door | Route | Change |
|---|---|---|
| **A** — public trial | `/t/<slug>` | Anonymous, and has no payment step. The per-child form runs **parts 1, 2, 4 and 5** — no plan. `TrialBookingFlow.tsx` orchestrates it separately and must be updated to open the same form component with part 3 suppressed. |
| **B** — shared join link | `/join/<token>` | Full flow, opens at step 1. Unchanged in shape. |
| **C** — manager invite | `/?invite=<token>` | Full flow with one child's row pre-filled. The pre-filled data now lands *inside* the per-child form rather than on the family step, so the form must accept partial initial data and open at part 1 with fields already populated. |
| **D** — add a child | `#/add-child` | The agreements step is skipped when consents are current. Step 2 opens with the existing family listed and the form already open for the new child. |

`startingStep()` keeps working unchanged: it only ever decides whether to skip the first step.

**A door D subtlety.** The step-2 list must show existing children as read-only context, not as
editable cards — a parent adding a fourth child should not be able to delete the other three from
this screen. The prototype has no concept of a pre-existing family.

---

## 12 · Copy and translation

Every Hebrew string above must go into `web/packages/i18n/he/`, mirrored in `en/` and `ru/`.

The namespaces are `common`, `schedule`, `people`, `health`, `attendance`, `billing`, `events`,
`comms` and `reports`. The wizard's strings split across `people` (the family and student form),
`health` (the declaration, the review gate) and `billing` (step 3). `web/packages/i18n/index.ts`
is authored once and must not be edited.

No string is inlined in a component. The prototype inlines all of them; that is the single
largest mechanical task in the port, and it is also the moment to notice that the Russian and
English versions do not exist yet for any of this text.

---

## 13 · Tests

The current onboarding directory carries 2,860 lines of tests against 5,100 lines of source.
That ratio should hold.

**What has to be covered:**

- Each of the five parts refuses to advance when its own validation fails, and the failed part's
  tab shows its red dot.
- Backwards navigation never validates; forwards navigation always does.
- The healthy preset sets every answer to "no"; answering any question "yes" flips the preset
  back to "limited".
- The review rule: a "yes" anywhere produces `pending`, no charge, `₪0` on step 3, the badge on
  step 2, and the notice on step 4.
- A draft survives closing the sheet and is offered on the list screen at the right sub-step.
- Editing a child never writes a draft.
- The last child cannot be deleted.
- Minor and adult produce different required-field sets and different signature labels.
- Step 1's four popups — three documents and the FAQ — all open, trap focus, close on Escape and
  on backdrop press, and restore focus to the row that opened them. The FAQ opens with all five
  questions collapsed, and opening one closes the others.
- The agreement checkbox gates the primary button **and** forward navigation by step pill. The
  prototype's pills bypass it entirely (§14.2), so this needs a test of its own rather than a
  test of the button alone.
- **The seam, not just the components.** A field added to the student form must be asserted all
  the way through `form → wizard state → submit payload`. The repo's own verification notes
  record a hard gate that shipped never firing because a test constructed the component's props
  by hand.
- Nothing is written before the final button. The existing `JoinFlow.test.tsx` asserts this;
  the assertion must survive the restructure.
- All four doors reach the right first step and the right part list.

---

## 14 · Defects in the prototype that must not be ported

Found by reading the prototype against this repo's own rules. Each one is working code that
looks correct, which is exactly why they survive a port. Ordered by consequence.

### 14.1 Safety, legal and privacy

**The health declaration arrives pre-answered, and the legal attestation is pre-ticked.**
`StudentModalSheet.tsx:81–102` — `isHealthyPreset` defaults to `true`, all thirteen answers
default to `'no'`, and `termsApproved` defaults to `true`. A family can complete the entire
safety-critical declaration and its legal attestation by pressing Next five times without
reading a word. The club's own terms text says a missing or wrong answer is a safety risk to
the child, and `ConsentRecord` models consent as an explicit grant — a pre-ticked box is not
one. **Every one of these defaults to unanswered.** The health preset starts as `null`, every
question starts empty, and the attestation checkbox starts clear.

**Fake identity data is pre-filled and passes validation.** Guardian name `יוסף לוי`, national
id `028194857`, phone `052-1234567`, email `yosef.levy@example.com`, emergency phone
`050-9876543`, birthdate `2016-08-20`, grade `grade_2`, belt `white`. All valid-looking, all
accepted by the validation rules. **Every field starts empty.** The only acceptable pre-fill is
door C's manager-supplied data, which is real.

**The athlete card prints the minor's full national id** (`AthleteCardModal.tsx:77`), and
encodes its last four digits into the card's own number: `GLD-2024-{idNumber.slice(-4)}`. This
is a card designed to be shown at tournaments. **Remove the id from the card, and derive the
card number from the registration reference rather than from an identity document.** This repo
has already shipped an internal identifier printed as a user-facing answer once; that is
recorded in the verification notes.

**Nothing requires a signature.** The pad is styled required and `getFieldError('signature')`
is called, but no rule ever returns an error for it — so a declaration submits unsigned. The
pad also pre-renders the signer's name in cursive italic before anything is drawn, so an
unsigned pad reads as signed. **Add the rule, and remove the cursive placeholder** — a prompt
to sign, not a rendering of the name.

### 14.2 Correctness

| Defect | Location | Fix |
|---|---|---|
| The age badge renders `קטין (גיל  (בן 11))`. `calculateAge` returns `" (בן 11)"` and the caller wraps it in `(גיל …)` again | `Step2Trainees.tsx:68,149` | Return the number; format at the call site |
| **The step pills bypass the agreement gate.** `onNavigateStep` has no guard, so a family reaches step 2 without ticking the box that disabled the button | `Header.tsx`, `App.tsx` | Forward navigation validates the current step, exactly as the sub-step tabs already do |
| Step 1's tick and step 3's payment methods are `useState` in components that unmount. Both are lost on back-navigation and on refresh, while `currentStep` *is* persisted — so a refresh returns to step 3 with every method reset | `Step1Terms`, `Step3Payment` | Lift both into the wizard's persisted state |
| Group labels are a hardcoded two-way guess, `groupKey === 'group4' ? 'נבחרת' : 'צעירים'`, so groups 1, 2, 3 and 5 all display as "צעירים גלדיאטור" | `Step3`, `Step4`, `AthleteCardModal` | Read the group's real name |
| Choosing "limited" then answering all thirteen "no" still flags the child, because `hasMedicalLimitation` short-circuits on `isHealthyPreset === false`. No visible reason, and no way back except re-clicking the preset, which wipes the answers | `StudentModalSheet` | Derive the flag from the answers alone; let the preset be a shortcut for filling them, not a separate input |
| Step 4's primary button, `מעבר לאזור האישי באפליקציה`, opens a modal for `trainees[0]` instead of entering the app | `Step4Complete` | Enter the app, as `JoinDoneScreen` already does |
| Enter in any part-1 text field fires the form's `onSubmit`, jumping validation to parts 4 and 5 | `StudentModalSheet` | Enter advances one part, or does nothing |
| Backdrop click discards the sheet with no confirmation. In **edit** mode no draft is written, so every edit is lost silently | `StudentModalSheet` | Confirm before discarding when the form is dirty |
| The clipboard copy flips to its success check regardless of whether `writeText` resolved | `Step4Complete` | Await it, and handle rejection |
| `medicalNotes` being non-empty triggers manager review, so "wears glasses during fitness training" suspends a registration and stops a charge | `StudentModalSheet` | Drop this condition; see §8.1 |

### 14.3 Accessibility and right-to-left

The parent app's guarantees here come from `@studio/ui` today. Porting the markup means porting
the responsibility. `.claude/rules/ui-rtl-a11y.md` governs all of it.

- **Modals** have no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler, no
  focus restore and no background scroll lock. This applies to `DocumentModal`,
  `StudentModalSheet` and `AthleteCardModal`.
- **The group, plan and payment choice cards are `<div onClick>`** — unreachable by keyboard and
  invisible to a screen reader as controls. They become buttons, or radio inputs in a fieldset,
  which is what they are.
- **`focus:outline-hidden` is used throughout**, replaced only by a border-colour change. That
  is not a visible focus indicator.
- **Physical properties** — `right-1`, `left-4`, `mr-1` — will sit on the wrong side when the
  locale is English or Russian. Logical properties only.
- **Confetti and the pulsing dots** ignore `prefers-reduced-motion`.
- **Hebrew gender:** `בן` is used for girls too.

### 14.4 Model conflicts, carried from earlier sections

Restated here so the list is one list: the thirteen hardcoded health questions versus
`HealthFormTemplate` (§5.5), shekels as integers versus the repo's agorot (§10), and one
agreement tick producing what must be two `ConsentRecord` rows with independent versions —
club terms and privacy policy move separately, and `JoinWelcomeStep` already reads
`club_terms_version` for this reason.

---

## 15 · Build order

1. **Tailwind and the icon set into the parent app**, scoped, with the palette and Rubik in place.
   Nothing visual yet — prove the two styling systems coexist.
2. **The wizard chrome** — the header, the three step pills, the progress bar. Delete the
   quick-jump row and put the validation guard on the pills (§14.2).
3. **Step 1**, with the documents read from the API, the agreement tick in persisted wizard
   state, and **four popups sharing one modal component** — three documents and the FAQ. Build
   the modal once, with the §14.3 accessibility work in it, and give it two body shapes:
   sectioned prose for a document, a collapsible list for the FAQ.
4. **The per-child form's chrome** — the sheet, the five tabs, the footer, the validation banner,
   and the modal accessibility work from §14.3 done once here.
5. **Parts 1 and 5** — the fields with the real validation, every default empty, the existing
   `SignaturePad`, and the signature rule that the prototype is missing.
6. **Parts 2 and 3** — after the API returns the richer group data and the studio's price plans.
7. **Part 4** — the template-driven questions in the three-card grouping, with the preset as a
   shortcut rather than a separate input.
8. **Step 2's list**, the cards, the draft resume, delete and edit — with the draft's four
   lifetime rules (§5.7) built and tested.
9. **The review gate, backend** — status, charge suppression, the reason code, and the alert
   centre row.
10. **The review gate, frontend** — the badges and the zeroed totals, once the backend can
    honour them.
11. **Step 3**, with the four methods wired to uPay and `payment_promise`, and the "already
    arranged" dialog moved behind the real submit.
12. **Step 4**, with the real reference and no restart link.
13. **Doors A, C and D.**
14. **Translation into English and Russian.**

Steps 9 and 10 are smaller than they look. Every reader of `Enrollment.status` already excludes
`pending` by design (§8.3), so the backend work is four things — write the status, skip the
first charge, record a reason code, raise the alert centre row and its push — with nothing
downstream to change.

The alert centre row is the only part with real unknowns, because it is the only part on a
surface this spec has not described. If it slips, the honest fallback is to ship the wizard
without the gate rather than to show a family a promise the product cannot keep.

---

## 16 · Risks and open questions

**Closed by decision** (recorded in §0): where a manager clears a review — the dashboard alert
centre; what the draft holds and for how long — everything, expiring after 24 hours; where club
content lives — hardcoded for now; groups per child — one.

**Still open:**

1. **Review latency, once real holds exist.** The full-month charge is fair only while holds
   close quickly, which is the assumption it was decided on. Worth measuring rather than
   assuming: if approvals start taking days, families are paying for days their child could not
   train, and the proration decision should reopen.
3. **Two styling systems in one app.** Accepted, but the onboarding route and the rest of the
   parent app will drift visually. A follow-up decision will eventually be needed about which one
   wins.
4. **Club content generalisation.** The FAQ, step 4's events and the WhatsApp link are hardcoded
   by decision. **This must be resolved before a second studio onboards**, or that studio's
   families read Gladiator's answers and join Gladiator's WhatsApp group.
5. **Three prototype affordances must not ship**: the header's quick-jump row (§2), the "already
   arranged" dialog's false success message (§6.3), and step 4's restart link (§7).
