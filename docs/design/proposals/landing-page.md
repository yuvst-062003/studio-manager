# The public landing page — the Stitch brief

**Stage: implemented as designed, 2026-08-30 (second pass).** The first pass followed
this file's precedence rule — Stitch wins on composition only, tokens non-negotiable —
and the user rejected the result: *"the design is completely different from the one of
Stitch."* The user then decided, explicitly: **full Stitch look** (the navy `#003874`,
the crimson `#ba1a1a`, the type scale, the colored timetable — carried as scoped `--gl-`
variables in `landing.css`, with a dark equivalent), and **hardcode the content for now**
(prices, the coach, testimonials — transcribed verbatim into
`apps/parent/src/features/landing/clubContent.ts`, keyed by slug so only Gladiator shows
it; the debt note there names the path to club-editable `settings.landing` fields). RTL,
accessibility, i18n-for-chrome and RangeText/MoneyDisplay for every range and amount
remain non-negotiable; the rest of this file's precedence rule is superseded by that
decision.

The screens implemented: the pair titled **דף נחיתה סופי** (desktop + mobile) from the
Stitch project *Children's Judo Club Landing* (`projects/17357394349581128197`), with the
later mobile refinement **לו"ז בדפדוף אופקי** for the phone's schedule pager.

Original precedence rule (first pass, superseded): tokens, RTL and accessibility are
non-negotiable · the existing artboards win on domain correctness · Stitch wins on
composition and hierarchy only · anything requiring data that does not exist is cut.

`Appendix A` in `parent-app-shell.md` named its regions in reading order. That is the
composition, which is the one thing Stitch is for. This one names the material and asks
for the arrangement.

## The prompt

> Design the public page of a children's judo club. **Hebrew, right-to-left.** Phone and
> wide screen.
>
> It is the first thing someone outside the club sees. It exists to get them to book a
> trial lesson.
>
> Material: photos of the classes and the room · the instructor · the club's credentials ·
> the groups, with their days, hours and ages · the belt system · what parents say · the
> price.
>
> Give me the arrangement, three different ways. Don't write my copy.
>
> Palette — ground `#f7f5f1` · surface `#fffefb` · ink `#17150f` · secondary `#55524a` ·
> muted `#6f6b62` · hairline `#e6e1d6` · accent `#1f6b3f`. Dark: `#141311` · `#1e1d1a` ·
> `#fffefb` · `#a8a49a` · `#8f8b82` · `#3a3833` · `#4a9b5e`.
>
> `₪` not `$`. Ranges low first — `16:30–17:30`. Don't mirror photos to get RTL.

The three rules are there because the two previous generations both produced `$14,250-`
and reversed every time range — what `MoneyDisplay` and `RangeText` exist to prevent.

## Provenance

| Input | What it contributed | What was rejected |
| --- | --- | --- |
| `PublicLanding.tsx` (shipped, 2026-08-30) | Everything domain: the picker as the booking's centre of gravity, the ONE call to action naming the chosen group, the sign-in wall in front of booking never reading, the mobile sticky bar, the club's copy vs translated chrome split, the belt ladder in the hero, trial steps, the location card, the inverted bands, the kanji ornament, tokens throughout | The 13c two-column layout with the sticky offer column — composition, which Stitch now owns |
| **Google Stitch** | **The arrangement.** The sticky header (brand · section anchors · one way in) · the statement hero with a primary/secondary CTA pair · the club's words beside its photos as the second act · **the week-grid schedule** (columns per day at a desk, a horizontal snap pager in the hand, each slot bookable) placed before the conversion point · the conversion point after the schedule · the footer's link row | **Pricing tiers** (₪300/400/550 — `PublicLandingOut` serves no prices, and its docstring rules the narrowness is the contract) · **testimonials** ("what parents say" — no data) · **the named coach with credential cards** (לביא תמיר, דאן 3 — no coach fields; the club's `about` text takes the slot instead) · the season badge (no data) · the group-category colour legend (groups carry no category or colour; the accent bar stays token-drawn, per L2) · the hero's big-logo showpiece (the logo already lives in the header; the kanji stays the one ornament) · Stitch's palette and all of its markup (tokens are non-negotiable; the output is a sketch of an arrangement, never a source of markup) · time **ranges** `16:00-17:00` (the contract serves start times only, so ranges would be invented data) |

Adjudication notes from the first pass (kept for the record; the table above describes
that pass, not what shipped):

* The 2026-08-29 rule "the page **leads** with the picker" was itself a composition call,
  so Stitch's later arrangement won; the second pass went further and removed the page
  picker entirely — every call to action opens the booking dialog, whose own group select
  is where the choice lives, and `?book=` still resumes the flow.
* A group's `training_times` are not paired with weekdays in the public contract, so the
  data-driven schedule (any club without designed content) shows the same start times in
  each of a group's day columns. Widening `PublicGroupOut` was considered and rejected:
  its docstring says the narrowness is the contract.

What the second pass changed, in domain terms:

* **Kept**: sign-in fronts booking never reading; the flow opens closed; `?book=` resume;
  the phone's sticky bar; the location card with map/navigate/WhatsApp (Stitch's footer
  only waved at "צור קשר"); club copy as data, chrome as i18n; ranges through RangeText;
  money through MoneyDisplay (agorot).
* **Dropped**: the belt ladder (not in the final Stitch screens), the on-page group
  picker and its named CTA, the kanji ornament and tatami ground (replaced by Stitch's
  zen-dot ground), the photo strip on the designed page (the first photo becomes the
  coach portrait; the data-driven page keeps the strip).
* **Debt**: `clubContent.ts` — Gladiator's marketing content hardcoded until
  `settings.landing` grows plans/coach/testimonials/timetable fields and a dashboard
  editor. The season badge year is content that ages.
