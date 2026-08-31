# Design prompts — the parent app's remaining screens

Ten prompts, one per screen or action still to redesign. Paste one into Stitch (or Claude
Design) per session.

**Why they read the way they do.** Four rules were learned the expensive way on
2026-09-01, and every prompt below follows them:

1. **Describe the situation, never the elements.** A prompt that lists "top: logo, middle:
   button, bottom: language" gets that layout back, which is the layout you already have.
2. **No pixel sizes and no component names.** Sizes produce a copy of the current screen.
3. **Name every piece of real data, and forbid the rest.** Left open, it invents prices,
   testimonials and coaches that no endpoint serves — three separate passes had to reject
   exactly that.
4. **Say what is wrong now.** The generator cannot see the screen it is replacing.

**Paste this line with every prompt:**

> Hebrew, right to left, phone. Money is `₪`. A time range reads low value first, like
> `16:30–17:30`. Show me something I have not seen — not the layout described above as the
> current one.

---

## 1 · Consent — the two documents

> The screen a parent meets before anything else: the club needs their agreement to the
> terms of use and the privacy policy before it may hold a record about their child.
>
> The material is two documents, the version each was published at, and the fact that a
> parent has agreed or has not. Nothing else exists — no account, no name, no progress
> through a wizard.
>
> Today both documents are printed in full, one after the other, so the screen is roughly
> four phone-heights of legal prose with the two agreement boxes and the way forward at the
> very bottom. Almost nobody reaches them having read anything.
>
> The club's decision: a parent should be able to read either document if they want to, and
> agree without scrolling through both. What has to survive is that the agreement is real —
> the version is recorded, and a parent who agreed to an older wording is asked again.

## 2 · Registration — the form that repeats

> A parent enrolling their children fills a registration form. A family with three children
> fills it three times.
>
> Of what it asks, only two things actually differ per child: that child's national ID
> number and their school class. Everything else is the family's — the address, the city,
> the home phone, the mobile, the email, the signing parent's own ID and year of immigration,
> the other parent's name, ID and mobile, and who besides a parent may collect a child.
>
> Today all of it is asked again for every child, under headings that put five household
> facts inside a card titled "the student".
>
> Design the arrangement that asks the household once and each child only for what is theirs.
> A second and third child should be confirming, not retyping. Nothing may be dropped — the
> club needs every field it collects today.

## 3 · Health — the declaration, per child

> Every child needs a signed health declaration before stepping onto the mat, and it is the
> one form the club cannot do without.
>
> It asks around fourteen yes/no questions in groups — medical background, heart and
> exertion, orthopaedic history — plus a few optional free-text notes, a health-fund name, an
> emergency phone, one declaration sentence the parent confirms, and a signature drawn with a
> finger. A shortcut already exists for a healthy child: one tap answers the medical
> background section.
>
> Today it is one long scroll per child, and a family with three children meets it three
> times with no sense of where they are in that sequence.
>
> Design it for the three-child case: the parent should always know which child they are on
> and how many are left, and answering for a healthy child should be short. The declaration
> sentence a parent confirms is derived from their own answers and cannot be chosen — a
> family that reported asthma must not be able to declare no limitations.

## 4 · Club terms — asked once

> The club's own regulations and payment terms, agreed once by the signing parent — not once
> per child. That part is already right and must stay right.
>
> The material is the club's regulation text, its payment terms, a version, and one
> agreement.
>
> Today it is a wall of text with the agreement at the bottom, and it arrives in the middle
> of a sequence a parent is already tired of.
>
> Design it so the agreement is reachable without reading everything, while the text stays
> available to anyone who wants it, and so it is obvious this one is asked only once.

## 5 · Payment setup — how the money will move

> The last step before a family reaches the app. The club already knows which children are
> enrolled, what each costs and what the first charge is. This screen asks only how the money
> will move.
>
> The ways are: a card, paid now, over a chosen number of months and a chosen number of
> instalments; a standing bank order, which the club sets up through a link and marks as paid
> by hand when it arrives; cash, paid to the coach; and cheques, handed over in person. It is
> chosen per child, and then confirmed as one summary.
>
> Today it is a plain list of choices per child followed by a summary, and it is the last
> thing between a parent and the app they were invited to.
>
> Design it so choosing for three children is quick and the consequences of each way are
> obvious before it is picked. Two of the four ways mean "tell the manager and pay in person"
> — that should not look like a failure to complete something.

## 6 · Student card — one child, everything

> Everything the club knows about one child, on the screen a parent opens from their name.
>
> The material: the child's name and status, their groups and training days, their current
> belt and the belts before it, their attendance — how many sessions they attended, how many
> they were reported absent from in advance, how many are still unmarked — the money owed for
> this child, their training plan, and whether their health declaration is signed and until
> when.
>
> Today these arrive as five separate blocks stacked down the page, each built by a different
> part of the system and each looking like its own screen, so the card reads as five things
> rather than one child.
>
> Design it as one card about one person. Decide what a parent opening it actually wants
> first, and let everything else be reachable rather than immediately visible.

## 7 · Payments — what is owed and how to pay it

> The screen a parent opens when they owe money or want to check that they do not.
>
> The material: open charges, each with the month it belongs to and the child it is for; the
> total; the four ways to pay described in prompt 5; and a history of what has already been
> paid, with the method each was paid by. Card payments produce a receipt. Cash, cheques and
> standing orders are recorded by the club by hand and produce none.
>
> Today the ways to pay are two stacked segmented pickers — a row of month counts above a row
> of instalment counts — and the history sits behind a link. There is also a warning that
> matters more than it looks: a family already paying by standing order can pay twice by
> accident, because the club cannot see the bank's side.
>
> Design it so the amount owed and the way to clear it are one movement, so a paid-by-hand
> record never looks like it comes with a receipt, and so the double-payment warning is
> impossible to walk past.

## 8 · Calendar — a month at a time

> A parent looking at a month of training for one child or for all of them.
>
> The material: the days of a month; which days had a session; and for each of those, one of
> five outcomes — attended, did not attend, told the club in advance, still to come, or
> nobody marked the register. Plus a per-month summary of how many sessions there were, how
> many are still planned, and the attendance percentage. From here a parent can also report
> that a child will miss a coming session.
>
> Today the month arrow, the month-or-week switch and the absence link are crammed into one
> band above the grid, the grid cells are not pressable, and the five outcomes are told apart
> only by colour.
>
> Design it so a parent can move through months easily, tell the five outcomes apart without
> relying on colour, and reach a specific day. Every child's calendar can also be shown at
> once, which means one day may carry more than one outcome.

## 9 · Inbox — what the club has said

> Announcements from the club to the families. It is one-way: a parent reads, and cannot
> reply here.
>
> The material: each announcement's title, its body, when it was published, and whether this
> parent has read it. Some carry an action — sign a declaration, join the club — and those
> are the ones that matter.
>
> Today read and unread are stored but barely shown, so an inbox with four unread notices
> looks the same as an empty one; the tab's badge is the only signal a parent gets.
>
> Design it so the difference between something that needs doing, something new, and
> something already read is obvious at a glance. Decide whether "read" is even the right
> axis — the alternative is done versus outstanding, which is what a parent actually cares
> about.

## 10 · Profile — the parent's own screen

> The fourth tab, and the only screen in the app that is about the parent rather than their
> children.
>
> The material: the guardian's own name, email and phone; the language; the light or dark
> setting; whether notifications are on; how they currently pay; a link to what the club
> holds about them and to delete it; the club's address and contact; and their children, each
> of which can be left.
>
> Today the screen is titled "students", lists the children, and the only thing a parent can
> do to each of them is remove them from the club. Almost nothing above is on it.
>
> Design the screen a parent opens to change something about themselves. The destructive
> action must exist and must be hard to hit by accident — it is currently the most prominent
> control on the page.
