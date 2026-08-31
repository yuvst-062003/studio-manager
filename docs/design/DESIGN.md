# Gladiator — the outward surface

The design system for the **parent app**: a dense, logged-in, Hebrew right-to-left mobile
app at 390×844, installable as a PWA.

It is the companion to the public landing page's system (*Bushido Junior*). The landing and
this app are the same person at two moments — before they join, and every week after — so
the brand is carried across unchanged. What is re-specified is the **register**: the
landing is one page with a 48px display headline and hero sections; this is eighteen
screens with a debt banner, an agenda, a tab bar and a signature pad.

Three bands. The first is carried, the second is untouchable, the third is rebuilt for an
app.

---

## Band 1 · Brand — carried from the landing unchanged

| Role | Light | Dark |
|---|---|---|
| Primary | `#003874` | `#aac7ff` |
| Primary, strong | `#1a4f95` | `#0e2a52` |
| On primary | `#ffffff` | `#ffffff` |
| Page ground | `#fcf9f8` | `#141519` |
| Ground, lowered | `#f6f3f2` | `#1b1d22` |
| Card | `#ffffff` | `#202329` |
| Ink | `#1c1b1b` | `#e8e6e3` |
| Ink, secondary | `#424751` | `#b0b4bd` |
| Hairline | `#c3c6d2` | `#3a3f4a` |
| Hairline, strong | `#737782` | `#6a707c` |

The surface ladder runs `#fcf9f8` → `#f6f3f2` → `#ffffff`: the page is warm off-white, a
lowered band is warmer still, and a **card is pure white** — elevation is lightness. In
dark it inverts and a raised surface goes lighter, never darker.

**The crimson `#ba1a1a` does not cross.** It is a brand colour on a marketing page. In this
app red means a family owes money, and that is band 2's job.

## Band 2 · Semantic — never overridable, and the brand never enters it

| Role | Light | Dark |
|---|---|---|
| Debt | `#b3261e` | `#ff8a7d` |
| Debt tint | `#faefec` | `#2e2521` |
| Paid / attended | `#1f6b3f` | `#4a9b5e` |
| Awaiting an answer | `#8a5a00` | `#e5b44f` |
| Cancelled | `#6f6b62` | `#a8a49a` |
| Cancelled tint | `#f3f2ef` | `#292825` |
| Danger | `#b3261e` | `#ff8a7d` |
| Danger tint | `#faf1ee` | `#2c2420` |
| Focus ring | `#2f6fa8` | `#6aa9e0` |

These nine are the same on every surface in the product, outward and inward. A club that
brands itself red still gets a working debt banner, because the debt colour is not a brand
colour and cannot be reached by one.

**Never colour alone.** Every status carries a word as well as a hue.

## Band 3 · Register — re-specified for an app, not a page

### Type

The family is **Rubik**, and this is not negotiable by the brand. Rubik is the one family
covering Hebrew, Latin and Cyrillic together; the landing's Stitch design named Hanken
Grotesk and Work Sans, neither of which has a Hebrew glyph, and the landing consequently
ships in Rubik too. A brand may set a colour here. It may not set a typeface the audience
cannot read.

| Step | Size | Use |
|---|---|---|
| Display | 24px | One per screen. The page title. |
| Title | 15px | Card and section headings. |
| Body | 14px | The default. |
| Label | 13px | Control labels, chips, row secondaries. |
| Caption | 12px | Meta lines, timestamps, day letters. |
| Micro | 11px | Badges only. |

**There is no 48px anything.** A screen carrying a debt banner, a seven-day strip, an
agenda and a fixed tab bar has no room for a hero. Sizes are declared in `rem` against a
16px root so a reader who has enlarged their browser text is enlarged with it.

### Space and shape

Spacing `4 / 8 / 12 / 16 / 20 / 24 / 32`. Radii: small `6px`, medium `9px`, card `11px`,
large `14px`, pill `999px`.

**The button is squared — 2px** — carried from the landing, where it is the strongest
single piece of the brand's shape language. Cards keep the app's own softer radius; a
squared card at this density reads as a table, not a list.

### Density and reach

* **Every tap target is at least 44×44.** A trailing action in a header is a control sized
  like one, never a caption-sized link.
* Rows are a primary fact and a secondary fact, separated **by layout or by a chip** —
  never by whitespace that no element supplies.
* Cards and rows. No hero sections, no testimonial blocks, no pricing cards, no soft
  neomorphism, no drop shadows doing the work a hairline should do.

### Direction

**Right to left.** Every row reads from the right edge. Logical properties only —
`margin-inline-start`, never `margin-left` — so the same stylesheet serves the Russian and
English locales without a mirrored fork.

Dates and times are the exception and run left to right inside the RTL page: `18:00` is an
hour then a minute in every locale this product speaks. A time range reads **low value
first** — `16:30–17:30`.

### Money

The currency is **`₪`, never `$`**. An amount is its own element, never a string glued to
its symbol — it is stored in agorot as an integer and rendered by one component, so a
number and its currency cannot drift apart or wrap apart.

---

## What must hold, whatever a screen looks like

* **WCAG 2.0 AA / IS 5568** — 4.5:1 for text, 3:1 for controls and graphics, an accessible
  name on every control, a visible focus ring.
* **No icon-only control** without a visible or assistive label.
* **Never colour alone.**
* **Nothing about a child's health is ever logged**, rendered into a URL, or put in an
  audit diff.
* Light and dark are both first-class. Every colour above has a value in each.
