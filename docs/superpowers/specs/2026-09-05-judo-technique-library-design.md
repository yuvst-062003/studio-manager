# The judo technique library

A reference library of judo's 100 techniques inside the parent app, so a student can look
up a throw they were taught and study it between sessions.

Everything in the app until now answers a question the **parent** has — when is the lesson,
what do I owe, what did the club say, is the paperwork done. This is the first screen that
belongs to the **child**. That is the reason it exists and the thing to protect when
deciding what goes on it.

---

## 1 · Scope

**In:** the library — browse and search all 100 techniques, and a detail screen per
technique carrying the official Kodokan video and a link into the IJF's own page.

**Added after the first review:** "my techniques" — a child's own saved list, judo's
*tokui-waza* — and two video controls, slow motion and a remembered start point. §10 says
how and why they are stored the way they are.

**Out, deliberately:**

- The **tab wiring**. A parallel session owns `web/apps/parent/src/App.tsx`; two sessions
  editing the shell is how a branch spends its afternoon on a merge. The feature exports
  everything the wiring needs (§6) and touches no shared file.
  **Landed 2026-09-06** in the commit that merged the two branches — §6 below records
  what that merge made stale.
- **Belt-test classification** — which techniques a studio requires for each grade. Wanted
  next, and it is the part that is genuinely per-studio. §7 says what this design leaves
  ready for it.
- The **staff app**, coaches marking a technique as shown, and Hebrew prose descriptions.

## 2 · What the sources permit

This was researched rather than assumed, because the obvious approach — scrape
judo.ijf.org — is the one that is not available.

`judo.ijf.org/robots.txt` carries an explicit machine-readable policy:

```
User-agent: *
Content-Signal: search=yes, ai-train=no, use=reference
Allow: /
```

Crawling is permitted. Indexing with **hyperlinks and short excerpts** is permitted. AI
training is refused. Consumption is permitted as **reference** — cite and link, do not
reproduce. It is backed by an express EU DSM Article 4 reservation and an "all rights
reserved" footer. There is no API and `/sitemap.xml` is a 404.

**Conclusion: link to the IJF, never copy them.** Their written descriptions are the good
ones and they are precisely what `use=reference` reserves.

Two sources carry us instead:

- **[Kodokan Global](https://kdkjd.org/技/柔道-技名称一覧/)** — the sport's governing body and
  the authority on technique naming, above the IJF. 100 techniques: 68 nage-waza (te 16,
  koshi 10, ashi 21, ma-sutemi 5, yoko-sutemi 16) and 32 katame-waza (osaekomi, shime,
  kansetsu), with both Gokyo classifications — 1895's 42 and 1920's 40. **Every technique
  links to a demonstration on the official Kodokan YouTube channel**, verified by pulling
  the links out of the page's HTML.
- **[Wikipedia's list of judo techniques](https://en.wikipedia.org/wiki/List_of_judo_techniques)**
  — CC BY-SA 4.0, used to cross-check names and catch anything the Kodokan omits.

**We store facts only** — names, kanji, classification, Gokyo group, a YouTube id. Facts
carry no copyright, so no share-alike attaches and nothing is republished. Video is
**embedded**, which is YouTube's intended use: we host nothing and the Kodokan keeps its
views.

### The description text, and where it comes from

Hebrew Wikipedia has **no** technique articles — its entire judo category is 12 entries
about the sport, the IJF and Jigoro Kano. English Wikipedia is half-present and shallow: of
eight techniques sampled, four had no article and the rest ran 300–500 characters restating
the classification badge we already display.

The Kodokan's page, however, carries an **official English definition for every one of the
100**, from their *Kodokan Definitions of Judo Techniques* (2022).

Those definitions are the Kodokan's copyrighted prose and are **not shipped**. A Hebrew
translation of one would still be that one. What ships is a Hebrew sentence describing the
**movement** each definition defines — the movement is a fact, the wording is ours. The
seeder writes the English out to `.source-definitions.json`, which is git-ignored working
material for whoever writes the Hebrew, and never reaches the bundle.

The Hebrew itself lives in `data/hebrew.json`, hand-authored and merged rather than
generated, so re-running the seeder cannot destroy work no scraper can redo.

## 3 · Data

**A checked-in dataset, not a database table.** 100 rows of global reference data that
changes once a decade does not earn a migration, a router, a service, a schema and a
regenerated client. It also has to work offline: this is an installed PWA and a child opens
it in a dojo with bad signal.

**It lives in the feature, not in `web/packages/`.** A new workspace package would need a
`paths` entry in `web/tsconfig.json` and an `npm install` that rewrites
`package-lock.json` — two shared files, while another session is working in this repo.
`workspaceAliases()` derives itself from each package's manifest, so promoting this to
`@studio/judo` later is a file move plus a manifest, and belongs in the same commit that
wires the tab. The data sits at
`web/apps/parent/src/features/techniques/data/techniques.json` (~15KB in the bundle).

```ts
type Technique = {
  slug: string            // 'seoi-nage' — stable key, used in the route
  nameRomaji: string      // 'Seoi-nage'
  nameHebrew: string      // 'סאוי נגה' — see below
  nameKanji: string       // '背負投'
  meaning: string         // 'זריקה מעל הכתף' — the literal name, a fact, short
  category: 'nage-waza' | 'katame-waza'
  subcategory: 'te' | 'koshi' | 'ashi' | 'ma-sutemi' | 'yoko-sutemi'
              | 'osaekomi' | 'shime' | 'kansetsu'
  gokyoGroup: 1 | 2 | 3 | 4 | 5 | null
  youtubeId: string | null
  ijfSlug: string | null  // null unless the URL was verified at seed time
  orderIndex: number      // the Kodokan's own order within the subcategory
  descriptionHe: string   // empty for now
}
```

`nameHebrew` is load-bearing, not decoration. **A ten-year-old in a Hebrew club will not
type `Seoi-nage` in Latin script.** Without a Hebrew transliteration the search field is
ornamental. It is a name, not prose, so it raises no licensing question.

### The seed script

`scripts/fetch-judo-techniques.py` — run by a person, never by the app. It reads the
Kodokan list, extracts name, kanji, category and YouTube id per technique, cross-checks
against the Wikipedia list, and writes the JSON. Output is committed, so there is no
runtime dependency on anyone's uptime.

**It requests every IJF URL and stores `ijfSlug` only on a 200.** The slug is derivable
from the romaji, and deriving it without checking is how a child taps "3D animation" and
gets a blank frame with nothing to read — the failure CLAUDE.md's *refuse rather than
accept* rule already names.

## 4 · Screens

The design language is settled and is followed, not reinvented: **hairline-separated rows
on a plain ground**, the dense-ledger idiom `StudentCard` establishes and which explicitly
rejects stacked cards. Tokens only, no new colours.

**No belt-colour coding.** Belt colour is per-studio data, not brand (decision D3). Tinting
techniques by belt would collide with the belt system and pre-empt §7.

### 4.1 The library

`PageHeader` → search field → `SegmentedControl` (**נגה-וואזה** | **קטאמה-וואזה**, the same
primitive the calendar uses) → a `SectionHeader` per sub-family with its techniques beneath.

Search matches romaji, Hebrew and kanji at once. No result gets the `EmptyState` primitive.

Each technique is a full-width row and **the row is the control** — no trailing button,
per `DetailRow`'s established rule. Minimum 44px tall.

```
┌──────────────────────────────────────────────┐
│ ‹   Seoi-nage                            ①   │
│     סאוי נגה · 背負投                          │
├──────────────────────────────────────────────┤
│ ‹   O-soto-gari                          ①   │
│     או סוטו גארי · 大外刈                      │
└──────────────────────────────────────────────┘
```

The romaji leads because it **is** the name — what the coach calls out, what is written on
the video, what is on the dojo poster. Hebrew and kanji sit muted beneath. Both are wrapped
in `<bdi>`, the way `StudentCard` wraps names, so Latin and kanji do not scramble the RTL
line.

The Gokyo badge carries its **numeral**, never a bare tint — Part 4's *never colour alone*.

### 4.2 The detail screen

Name and kanji, classification chips, and then **the video immediately, at full content
width.** Not metadata first: a child opened this to watch something. Below it, `DetailRow`s
for category, sub-family, Gokyo group and the name's literal meaning. Then the IJF button.

### 4.3 The IJF sheet

A **full-screen sheet, not an inline frame** — because it is someone else's page and
should be framed as somewhere else, with their name on it. (An earlier draft justified
this by claiming their page would look broken at phone width. Driving it proved otherwise:
it is responsive and lays out cleanly at 390px. The decision stands on the honest reason.)

Verified end to end rather than assumed: the frame loads `judo.ijf.org` at 200 with their
CSS, fonts and scripts, and their 3D animation streams inside it as blob-backed partial
content. **Their page keeps its own header and menu**, so a child can navigate from the
technique deeper into the IJF's site without leaving the sheet — acceptable, and noted
here because the button that opened it does not say so.

Framing is available: they send no `X-Frame-Options` and no `Content-Security-Policy`.
Their CORS header is empty, so a browser `fetch` is blocked — server-side reads work, which
is what the seed script does.

The sheet carries its own bar: the technique name, a close control, a visible
**"התוכן מאתר judo.ijf.org"** attribution, and an open-in-browser escape. When it cannot
load — offline, or their site down — the `LoadFailed` primitive with a real way out, never
a blank frame.

## 5 · Strings

All three locales live in `features/techniques/strings.ts`, in `Bundle` shape.

`web/packages/i18n/index.ts` is **not edited**, and neither is `types.ts` — a namespace has
to be listed in both, and CLAUDE.md says a lane never edits either. They are the shared
registries that serialise parallel work, and another session is in this repo. Promoting the
bundles is three file moves and six lines in those two registries, in the same commit that
wires the tab.

No string is inlined in a component, which is the rule that actually matters.

**Done (2026-09-06).** `techniques` is the tenth namespace: `packages/i18n/{he,en,ru}/
techniques.ts`, registered in `types.ts` and `index.ts`, and every call site now reads
`t(locale, 'techniques.…')` rather than the feature's own `s()`. `strings.ts` is gone;
`format.ts` keeps `fill`/`fillGroup`, which are formatting and not translation. Two guards
came with it: `apps/parent/src/i18nKeys.test.ts` now checks the keys the screens build from
the dataset's unions (`techniques.family.${sub}`, `techniques.category.${cat}`), and
`web/scripts/i18n-parity.mjs techniques` passes with `en` complete.

## 6 · The fifth tab, as designed and as landed

**As designed.** The bottom bar had four slots and the owner decided the library gets a
fifth — בית · תשלומים · הודעות · **טכניקות** · פרופיל, displacing nothing. `features/
techniques/index.ts` exported `TechniquesScreen`, `TechniqueDetail`, `matchTechniquesPath`
and a ready-made `techniquesTab(locale, active)`, so the wiring commit would be one import,
one array entry and one route branch.

**As landed (2026-09-06).** Three of those four assumptions had expired by the time the
branches met, because the parallel session did not just own the shell — it replaced it.
`@studio/ui`'s `TabBar` and the seven-entry drawer above it are both gone (§4 of the
parent-app redesign: *"Four tabs, no side menu"*), and `ParentTabBar` is a Tailwind port
that builds its own items from records keyed by tab.

| Written here | What actually happened |
|---|---|
| a fifth entry in `App.tsx`'s inline `TabBar` array | five one-line rows in `ParentTabBar`'s records, and `'techniques'` in its `ParentTab` union |
| an entry in `NAV` so the drawer reaches it | **there is no drawer.** The bar is the only home |
| `techniquesTab(locale, active)`, ready to drop in | deleted — it built an item for a `TabBar` this app no longer mounts |
| a `techniques` icon added to `packages/ui`'s `Icon.tsx` | **not moved.** `Icon` takes `size` and `style` and no `className`, and the new bar styles its glyphs entirely by className (`stroke-[2.4]` and a fill on the active tab). An icon moved there could not be styled by the only caller it would have, in a package staff and dashboard also load. It stays in `features/techniques/icon.tsx` and now takes the props a `lucide-react` glyph takes |

What survived intact: `matchTechniquesPath` still decides what each hash MEANS. `App.tsx`
names both hashes itself before calling it, because `routes.reachable.test.ts` reads the
route table out of that file by looking for `hash === '#/…'` and `hash.startsWith('#/…/')`
— a route parsed entirely behind a helper is a route that guard cannot arm on, which is the
defect it exists to catch. Both routes are now guarded and both pass.

**The label at 360px, which this section asked for and which was the real risk.** Measured
in the running app with all five tabs: בית 24px · חנות המועדון 60px · עדכונים 36px ·
טכניקות 39px · פרופיל 30px — 190px of the 312px between the bar's own padding. Every label
on one line, none clipped, no sideways page scroll, light and dark.
`docs/screenshots/technique-library/step-5/`. Nothing needed shortening.

**One thing that look found and this feature did not cause:** at both 360px and 390px the
accessibility FAB sits directly on top of the בית tab — `elementFromPoint` at the centre of
that tab returns the FAB, so Home is untappable from the bar. It is unchanged by the fifth
slot (`justify-between` pins the first item to the bar's inline start whether there are four
items or five; measured at x=312 w=24 either way), so it predates this and belongs to
whoever owns the shell.

## 7 · What this leaves ready for belt classification

The next feature maps a studio's `BeltRank` rows to required techniques. This design leaves
it three things: a stable `slug` per technique to key against, a dataset both the frontend
and a Python service can read from one file, and an untinted library so belt colour still
means only what `BeltBar` says it means.

That mapping is per-studio, so it is a real tenant-scoped table with `TenantMixin` — unlike
this dataset, which is global and correctly has no `studio_id`.

## 8 · Testing

- The dataset: every record complete, categories and subcategories in range, `youtubeId`
  well-formed, slugs unique, and the count matching the Kodokan's 100.
- The screens: search filters across all three name forms, sub-family grouping, the empty
  state, and `<bdi>` around Latin and kanji inside the RTL line.
- **The seam**, per CLAUDE.md: one test running dataset → library → detail that asserts a
  real technique's `youtubeId` reaches the iframe `src`. Not hand-built props — that is the
  test that catches a field silently dropped in between.
- `LoadFailed` renders, with its escape, when the IJF frame fails.

## 9 · Review loop

Rendered in a standalone harness — `techniques-preview.html` / `techniques-preview.tsx`,
following the `wizard-preview` precedent: a design-review harness, not a shipped entry.
Screenshots land in `docs/screenshots/technique-library/step-N/`.

Looking at step 1 caught two defects no test would have: the search field printed
`חיפוש טכניקה` twice, once as its label and once as its own placeholder, and the two
segment labels crowded each other at 390px. Both are fixed; the placeholder now shows the
three scripts the box accepts.


## 10 · My techniques, slow motion, and where the video starts

Three additions from the first review, and one decision joins them: **all of it is
`localStorage`, per device, and none of it is a server table.**

A favourite is a preference, not a record the club needs. A table would mean a migration,
an endpoint, a tenant column and a regenerated client for something whose entire value is
that it is instant and private to the child. `shelf.ts` is the only module that touches
the key, so moving it behind an API later changes one file. Every read and write is
guarded — `localStorage` does not merely come back empty in a private window or with site
data blocked, the accessor itself throws, and an uncaught throw would take the whole
library down over a saved star.

**My techniques** (`shelf.title`) sits at the top of the library and is **not filtered by
the category switch**. The list is the child's; hiding the holds in it because they were
looking at throws would make the shelf appear to have lost something.

**Saving takes one tap, from the list.** The first cut put the star on the detail screen
only, reasoning from `DetailRow`'s rule that a row which goes somewhere carries no separate
control. That read the rule too widely: it is about rows whose only job IS navigation, and
a row you can save from is a different thing. Three taps to save something you already
recognised was the wrong trade.

So each row carries a **+** — a tick once saved — and the row is a **container** whose
children are the link and the button as *siblings*. Never a `<button>` inside an `<a>`,
which is what the original worry was actually about and which is unreachable by keyboard
and ambiguous to a screen reader. A test asserts the nesting never comes back. Each
button's accessible name carries the technique's name, because a hundred rows offering
"add" is a hundred identical controls to a screen-reader user. The detail screen keeps its
own full-width control.

**Slow motion and the start point** go through YouTube's `postMessage` interface with
`enablejsapi=1`, not through their IFrame API script — loading `youtube.com/iframe_api`
would put a third-party script on a page children use, and the two commands needed here
are three lines. The speed does not survive the reload that changing the start point
causes, so it is re-applied on every frame load rather than only when the control is used.

**The start point is the child's, not ours.** These films open with a title card and a bow
and the technique begins later, but nobody has annotated where — so rather than invent
timestamps, the person watching sets their own. That is better than a curated one anyway:
the moment worth re-watching differs between the child learning the entry and the child
fixing their finish. `Start here` stays **disabled until the player has reported a
position**, rather than saving a zero that would look like the control did nothing.
