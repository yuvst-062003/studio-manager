# Legal, Consumer and Accessibility Compliance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the legal, consumer-protection and accessibility gaps on the public landing page and the three PWAs, so that what the product publishes is true, what it collects is disclosed, what it sells is cancellable, and what it renders is reachable by someone using a keyboard or a screen reader.

**Architecture:** Nothing new is invented. The existing `PolicyDocument` component and its `reports.privacy.*` i18n keys grow from two documents to five; the existing consent ledger gates the new text through one `POLICY_VERSION` bump; the existing contrast tooling is pointed at the one stylesheet it never covered; and the compliance rules that can be checked mechanically become tests that fail the build rather than notes somebody has to remember.

**Tech Stack:** React 19 + TypeScript + Vite (three apps, npm workspaces), FastAPI + SQLAlchemy + Alembic, Vitest, pytest, ESLint, the `@studio/i18n` three-locale bundle.

**Spec:** `docs/superpowers/specs/2026-09-08-legal-and-accessibility-audit.md` — read it first. It carries the findings each task acts on, the statute behind each one, and the five owner decisions.

---

## Global Constraints

- **Three locales, always.** Every user-facing string is added to `he/`, `en/` **and** `ru/` in the same commit. `he` is the reference locale; `en` and `ru` are translations of it. A key present in one bundle and missing from another fails the i18n tests.
- **Never inline a user-facing string in a component.** It goes in `web/packages/i18n/<locale>/<namespace>.ts`.
- **`web/packages/i18n/index.ts` and `types.ts` are never edited.** The namespace list is fixed at twelve. Legal document copy goes in `reports.ts` (where `privacy.*` already lives), landing copy in `people.ts`, accessibility copy in `common.ts`.
- **One `POLICY_VERSION` bump for the whole plan.** `app/services/privacy/policy.py` currently holds `POLICY_VERSION = 2`. Tasks 6, 7 and 8 change the reviewed legal text; Task 9 raises the version to `3` **once**, after all three have landed and been reviewed together. Raising it re-gates every family, who must accept again.
- **Never edit `app/main.py` or `app/models/__init__.py` to register anything.** Both mount by discovery.
- **Lanes never run `alembic revision`.** Task 11 needs a table; its migration lands in the wave's contract commit on `main`.
- **All money in agorot, integers.** All timestamps stored UTC, rendered Asia/Jerusalem via `app.core.clock.now()` — the only clock.
- **Logical CSS properties only** (`margin-inline`, `padding-block`, `inset-inline-start`). Every screen renders right-to-left in Hebrew.
- **Python tooling is `.venv/bin/` prefixed.** A bare `pytest` or `python3` resolves to an old 3.8 interpreter.
- **Run only the suites the change can reach.** Never re-run a suite that already passed.
- **Placeholders are forbidden in shipped legal text.** Any string in this plan written as `«…»` is an owner decision from spec §7 and **must not be invented by the implementer** — stop and ask.

### The five blocking decisions

| ID | Question | Blocks |
|---|---|---|
| D1 | Who is the legal operator — company, licensed dealer, or the club alone? | Tasks 6, 10 |
| D2 | Name, phone and email of the accessibility coordinator | Task 14 |
| D3 | The club's refund and cancellation terms above the statutory floor. **Partly answered 2026-09-08:** the club refunds cash and card by hand (the coach does it), and a standing order is cancelled by the family at their own bank. Still open: the pro-rata rule, the notice period, and the statutory figures. | Tasks 8, 11, 12 |
| D4 | Are the two testimonials real, with signed originals? | Task 1 (proceeds either way) |
| D5 | Rights and guardian consent for each gallery photograph | Not tasked — owner action |

Tasks 1–5, 13 and 15–21 need **no decision** and can start immediately.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `web/apps/parent/src/features/legal/route.ts` | Match `/legal/<doc>` to a `PolicyDoc`. One regex, no router. |
| `web/apps/parent/src/features/legal/LegalShell.tsx` | The public, signed-out legal screen for the parent app. |
| `web/apps/parent/src/features/legal/LegalFooter.tsx` | The shared footer block: legal links plus business details. |
| `web/apps/parent/src/features/legal/index.ts` | The feature's public surface. |
| `web/apps/parent/src/features/billing/CancellationScreen.tsx` | The consumer-facing cancellation route. |
| `web/apps/parent/src/features/billing/cancellationClient.ts` | Its one API call. |
| `app/services/billing/cancellation.py` | Records a cancellation request and its effective date. |
| `app/routers/cancellations.py` | `POST /api/v1/me/cancellation-requests`, `GET` the same. Mounted by discovery. |
| `app/schemas/cancellation.py` | Request and response models. |
| `app/models/cancellation.py` | `CancellationRequest`, `TenantMixin`. Mounted by discovery. |
| `app/core/security_headers.py` | The response-header middleware. |
| `web/apps/parent/src/features/landing/landing.contrast.test.ts` | Brings `landing.css` under the contrast gate. |
| `web/no-trackers.test.ts` | Fails the build if an analytics or advertising SDK appears. |
| `NOTICES` | Third-party licence texts (Rubik under SIL OFL, lucide-react under ISC). |
| `docs/compliance/database-definitions.md` | The database definitions document. |
| `docs/compliance/information-security-procedure.md` | The written security procedure. |
| `docs/compliance/incident-response.md` | Breach handling and Registrar notification. |
| `docs/compliance/processors.md` | The processor register and the state of each agreement. |
| `docs/compliance/retention-schedule.md` | What is kept, for how long, and why. |

**Modified files**

| Path | Change |
|---|---|
| `web/packages/ui/src/legal/PolicyDocument.tsx` | `PolicyDoc` grows from 2 documents to 5. |
| `web/packages/i18n/{he,en,ru}/reports.ts` | Operator and liability sections; a cookie section; a refund document. |
| `web/packages/i18n/{he,en,ru}/people.ts` | Landing footer legal links and business details. |
| `web/packages/i18n/{he,en,ru}/common.ts` | The rewritten accessibility statement; the skip link. |
| `web/packages/i18n/{he,en,ru}/billing.ts` | Cancellation screen copy. |
| `web/apps/parent/src/App.tsx` | Route `/legal/<doc>` before the session hook; mount the skip link. |
| `web/apps/parent/src/features/landing/PublicLanding.tsx` | Remove testimonials; footer becomes `LegalFooter`; fix gallery alt. |
| `web/apps/parent/src/features/landing/clubContent.ts` | Remove `voices`, the superlative and the `1000+` figure. |
| `web/apps/parent/src/features/landing/landing.css` | A `prefers-reduced-motion` block; the voices rules removed. |
| `app/services/privacy/policy.py` | `POLICY_VERSION` 2 → 3, with the reason in the docstring. |
| `web/eslint.config.js` | Add `eslint-plugin-jsx-a11y`. |
| `web/package.json` | The `eslint-plugin-jsx-a11y` dev dependency. |
| `app/core/config.py` | The allowed origins the CSP needs. |

---

## Phase 1 — Copy that comes down

No legal input needed, no policy version bump, and the largest risk reduction per minute of work in the plan. Do this first.

### Task 1: Remove the testimonials from the landing page

Spec §4.1. Two testimonials transcribed from an AI-generated design mockup, one attributed to a 15-year-old. They come down until the club produces signed originals (decision D4). Removing them also removes the `המלצות` nav anchor, which would otherwise scroll to nothing.

**Files:**
- Modify: `web/apps/parent/src/features/landing/clubContent.ts` — `ClubCopy`, `ClubContent`, `HE`, `EN`, `RU`
- Modify: `web/apps/parent/src/features/landing/PublicLanding.tsx:567-596`
- Modify: `web/apps/parent/src/features/landing/landing.css` — the `.gl-voice*` rules
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ClubContent` no longer has `voicesTitle` or `voices`; `ClubCopy.navLabels` becomes `Trio<string>` instead of `Quartet<string>`. Task 4 builds the new footer on the same file.

- [ ] **Step 1: Write the failing test**

In `PublicLanding.test.tsx`, inside the Gladiator-content describe block:

```tsx
it('publishes no testimonial, because none has a signed original on file', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  await screen.findByTestId('landing-hero')
  expect(screen.queryByTestId('landing-voices')).toBeNull()
  // The nav must not offer an anchor to a section that no longer exists.
  const nav = screen.getByRole('navigation', { name: t('he', 'people.landing.siteNav') })
  expect(within(nav).queryByText('המלצות')).toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL — `landing-voices` is found.

- [ ] **Step 3: Delete the content**

In `clubContent.ts`: remove `voicesTitle` and `voices` from both `ClubCopy` and `ClubContent`; delete the `voicesTitle`/`voices` entries from `HE`, `EN` and `RU`; change `navLabels` to `Trio<string>` and drop the fourth label (`'המלצות'` / `'Testimonials'` / `'Отзывы'`) from all three; drop the matching entry from the `navItems` construction; delete `voicesTitle`/`voices` from the object `clubContentFor` returns.

Leave a note where the section was, so the next reader knows this was a decision and not an oversight:

```ts
// Testimonials were removed on 2026-09-08 (legal audit §4.1). The two quotes here came
// from the Stitch design mockup, which writes plausible testimonials because the layout
// needs them — not from anyone who said those words. They come back only with signed
// originals on file, and the minor's quote needs guardian consent as well.
```

- [ ] **Step 4: Delete the markup and the styles**

In `PublicLanding.tsx`, delete the whole `landing-voices` section (the `<section className="gl-section gl-section--zen" aria-labelledby="landing-voices">` block, lines 567-596) and the `gl-voice-mark` / `gl-voice-initial` spans inside it. In `landing.css`, delete every `.gl-voice*` rule.

- [ ] **Step 5: Run the test and the typecheck**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
cd web && npm run typecheck
```

Expected: PASS, and no type error — the `Quartet`→`Trio` change proves every locale dropped its fourth label.

- [ ] **Step 6: Commit**

```bash
git add web/apps/parent/src/features/landing/clubContent.ts \
        web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/apps/parent/src/features/landing/landing.css \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "fix(landing): no testimonial ships without a signed original"
```

---

### Task 2: Remove the claims that cannot be substantiated

Spec §4.1. "The leading judo club" is a factual claim dressed as a puff, and "1000+" is a specific number nobody has counted. The coach's competitive record stays — it is a claim about a real person that the person can document — but the plan records that the club must hold the documents.

**Files:**
- Modify: `web/apps/parent/src/features/landing/clubContent.ts` — `hero.lead` and `coach.credentials[2]` in `HE`, `EN`, `RU`
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ClubCopy`.
- Produces: `credentials` entries no longer carry `figure`; the `figure?: string` field stays on the type because the card style it selects is still wanted if a real number ever arrives.

- [ ] **Step 1: Write the failing test**

```tsx
it('makes no superlative or head-count claim it cannot substantiate', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  const hero = await screen.findByTestId('landing-hero')
  expect(hero.textContent).not.toContain('המוביל')
  const coach = screen.getByTestId('landing-coach')
  expect(coach.textContent).not.toContain('1000')
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL on `המוביל`.

- [ ] **Step 3: Rewrite the two claims in all three locales**

`HE.hero.lead`:

```ts
    lead:
      "מועדון ג'ודו לילדים ולנוער. אימונים בעצימות גבוהה, בניית אופי, והכנה לחיים מנצחים ברוח המסורת היפנית.",
```

`HE.coach.credentials[2]` — the `figure` key is removed entirely, and the number becomes a description:

```ts
      {
        title: 'דורות של חניכים',
        text: 'ילדים ובני נוער יצאו מהמזרן הזה לתחרויות, לנבחרות ולחיים.',
      },
```

`EN.hero.lead`: `'A judo club for children and teenagers. High-intensity training, character building, and preparation for a winning life in the spirit of the Japanese tradition.'`

`EN.coach.credentials[2]`: `{ title: 'Generations of students', text: 'Children and teenagers left this mat for competitions, for squads and for life.' }`

`RU` — translate the same two, dropping `figure` there too.

Add the note above `credentials`:

```ts
// 2026-09-08, legal audit §4.1: "1000+" and "the leading club" were removed. A specific
// number invites a specific challenge, and a superlative is a factual claim wearing a
// puff's clothing. The coach's competitive record stays — it is documentable — but the
// club must hold the documents; see decision D4 in the audit.
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/landing/clubContent.ts \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "fix(landing): drop the superlative and the head-count nobody counted"
```

---

## Phase 2 — Make the legal documents reachable

### Task 3: A public `/legal/<doc>` route in the parent app

Spec §1 finding 2. The staff app already solved this — `LegalScreen.tsx`'s header says it plainly: *"a legal link that cannot be read without an account is not a legal link."* The parent app's `#/privacy` sits behind `session.status === 'signed-in'`, so the one app a stranger actually reaches has no readable policy. This route resolves **before** any session hook, exactly as `LandingShell` does, so an anonymous visit takes no `401` on `/auth/refresh`.

**Files:**
- Create: `web/apps/parent/src/features/legal/route.ts`
- Create: `web/apps/parent/src/features/legal/LegalShell.tsx`
- Create: `web/apps/parent/src/features/legal/index.ts`
- Modify: `web/apps/parent/src/App.tsx:161-168`
- Test: `web/apps/parent/src/features/legal/LegalShell.test.tsx`

**Interfaces:**
- Consumes: `PolicyDocument` and `PolicyDoc` from `@studio/ui`; `apiFetch` from `@studio/core`.
- Produces: `matchLegalPath(pathname: string): { doc: PolicyDoc } | null` and `LegalShell({ doc }: { doc: PolicyDoc })`. Task 4 links to these URLs; Task 5 widens `PolicyDoc` and this route picks the new documents up for free.

- [ ] **Step 1: Write the failing test**

`web/apps/parent/src/features/legal/LegalShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { LegalShell } from './LegalShell'
import { matchLegalPath } from './route'

describe('matchLegalPath', () => {
  it('matches each document and nothing else', () => {
    expect(matchLegalPath('/legal/terms')).toEqual({ doc: 'terms' })
    expect(matchLegalPath('/legal/policy')).toEqual({ doc: 'policy' })
    expect(matchLegalPath('/legal/')).toBeNull()
    expect(matchLegalPath('/legal/../admin')).toBeNull()
    expect(matchLegalPath('/t/gladiator')).toBeNull()
  })
})

describe('LegalShell', () => {
  it('renders the document with no account and asks for no session', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<LegalShell doc="terms" />)
    expect(await screen.findByText(t('he', 'reports.privacy.terms.title'))).toBeTruthy()
    // The whole point of the route: no /auth/refresh on a page a stranger reads.
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('/auth/refresh')
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/legal/LegalShell.test.tsx --reporter=dot
```

Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route matcher**

`web/apps/parent/src/features/legal/route.ts`:

```ts
// The legal documents at a real path, readable with no account.
//
// The staff app's LegalScreen already made this argument: a legal link that cannot be
// read without an account is not a legal link. The parent app's `#/privacy` sits behind
// the sign-in gate, and the parent app is the one a stranger reaches from the landing
// page — so these get their own public path, resolved in App.tsx BEFORE `useSession()`
// can fire a refresh at somebody who has no session.
//
// The same narrow character class `matchLandingPath` uses, and for the same reason: the
// captured segment selects a document, and anything that could carry a `/` or a `.`
// would be a path the caller did not intend.
import type { PolicyDoc } from '@studio/ui'

const LEGAL = /^\/legal\/([a-z-]{1,24})\/?$/

const DOCS: readonly PolicyDoc[] = ['terms', 'policy']

export function matchLegalPath(pathname: string): { doc: PolicyDoc } | null {
  const segment = LEGAL.exec(pathname)?.[1]
  if (!segment) return null
  const doc = DOCS.find((known) => known === segment)
  return doc ? { doc } : null
}
```

- [ ] **Step 4: Write the shell**

`web/apps/parent/src/features/legal/LegalShell.tsx`:

```tsx
// The parent app's public legal screen — the counterpart of the staff app's LegalScreen,
// and deliberately the same component underneath. `PolicyDocument` from @studio/ui renders
// the same `reports.privacy.*` keys in both apps, so the text a family reads before signing
// up and the text a coach reads at the sign-in footer cannot drift apart.
//
// The draft banner comes from `GET /privacy/policy`, which is public for exactly this
// reason. A reader who arrives before the request lands gets the document without the
// banner — never a claim that the text is final.
import { useEffect, useState } from 'react'
import type { components } from '@studio/api-client'
import { apiFetch } from '@studio/core'
import { AccessibilityMenu, PolicyDocument, ThemeProvider, useDocumentLocale } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { LanguagePicker } from '../../LanguagePicker'

type Policy = components['schemas']['PolicyOut']

export function LegalShell({ doc }: { doc: PolicyDoc }) {
  const [locale, setLocale] = useState<Locale>('he')
  const [policy, setPolicy] = useState<Policy | null>(null)
  useDocumentLocale(locale)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/privacy/policy')
      .then(async (response) => {
        if (!alive || !response.ok) return
        setPolicy((await response.json()) as Policy)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      <main
        data-testid="legal-shell"
        style={{ maxInlineSize: '760px', marginInline: 'auto', padding: 'var(--space-4)' }}
      >
        <LanguagePicker locale={locale} onChoose={setLocale} />
        <a href="/" data-testid="legal-back">
          {t(locale, 'common.back')}
        </a>
        <PolicyDocument
          locale={locale}
          doc={doc}
          isDraft={policy?.is_draft ?? false}
          versionLabel={policy?.version_label ?? ''}
        />
      </main>
    </ThemeProvider>
  )
}
```

Check `PolicyDocument`'s prop names against `web/packages/ui/src/legal/PolicyDocument.tsx` before writing this — match them exactly rather than the names above, and match the way `LegalScreen.tsx` already calls it.

`web/apps/parent/src/features/legal/index.ts`:

```ts
export { LegalShell } from './LegalShell'
export { matchLegalPath } from './route'
```

- [ ] **Step 5: Wire the route in before the session hook**

In `web/apps/parent/src/App.tsx`, extend the top-level matcher. It must sit **with** the other public paths, above `AuthedApp`:

```tsx
export default function App() {
  const path = globalThis.location?.pathname ?? '/'
  const landingRoute = matchLandingPath(path)
  const joinToken = matchJoinPath(path)
  // Public for the same reason the landing page is: read before session, so an anonymous
  // reader of the terms never takes a 401 on a screen that asks nothing of them.
  const legalRoute = matchLegalPath(path)
  if (landingRoute) return <LandingShell slug={landingRoute.slug} />
  if (joinToken) return <JoinShell token={joinToken} />
  if (legalRoute) return <LegalShell doc={legalRoute.doc} />
  return <AuthedApp />
}
```

- [ ] **Step 6: Run the tests and the typecheck**

```bash
npx vitest run web/apps/parent/src/features/legal/LegalShell.test.tsx --reporter=dot
cd web && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/apps/parent/src/features/legal/ web/apps/parent/src/App.tsx
git commit -m "feat(legal): the terms and the privacy policy are readable without an account"
```

---

### Task 4: Legal links in the landing footer

Spec §1 finding 2. The landing footer today carries a brand, anchors, a phone and a copyright line, and links to nothing legal — on the one page that advertises prices and takes a booking. The block is extracted into its own component because Task 10 adds business details to the same place, and because the accessibility statement link must reach every page.

**Files:**
- Create: `web/apps/parent/src/features/legal/LegalFooter.tsx`
- Modify: `web/apps/parent/src/features/legal/index.ts`
- Modify: `web/apps/parent/src/features/landing/PublicLanding.tsx:648-676`
- Modify: `web/packages/i18n/{he,en,ru}/people.ts`
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

**Interfaces:**
- Consumes: `matchLegalPath`'s URL shape from Task 3.
- Produces: `LegalFooter({ locale }: { locale: Locale })`, rendering links to `/legal/terms` and `/legal/policy` and an accessibility-statement opener. Task 10 adds a `business` prop to it; Task 14 supplies the statement it opens.

- [ ] **Step 1: Write the failing test**

```tsx
it('links a stranger to the terms, the privacy policy and the accessibility statement', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  const footer = await screen.findByTestId('landing-footer')
  expect(within(footer).getByRole('link', { name: t('he', 'people.landing.legalTerms') }))
    .toHaveAttribute('href', '/legal/terms')
  expect(within(footer).getByRole('link', { name: t('he', 'people.landing.legalPrivacy') }))
    .toHaveAttribute('href', '/legal/policy')
  expect(within(footer).getByTestId('legal-a11y-statement')).toBeTruthy()
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL — no such link.

- [ ] **Step 3: Add the keys to all three locales**

`web/packages/i18n/he/people.ts`:

```ts
  'landing.legalTitle': 'מידע משפטי',
  'landing.legalTerms': 'תנאי שימוש',
  'landing.legalPrivacy': 'מדיניות פרטיות',
  'landing.legalCookies': 'עוגיות ואחסון מקומי',
  'landing.legalRefunds': 'ביטול והחזרים',
  'landing.legalAccessibility': 'הצהרת נגישות',
```

`en/people.ts`: `'Legal'`, `'Terms of service'`, `'Privacy policy'`, `'Cookies and local storage'`, `'Cancellation and refunds'`, `'Accessibility statement'`.

`ru/people.ts`: `'Правовая информация'`, `'Условия использования'`, `'Политика конфиденциальности'`, `'Файлы cookie и локальное хранилище'`, `'Отмена и возврат средств'`, `'Заявление о доступности'`.

The `legalCookies` and `legalRefunds` keys are added now and linked in Task 8, so the copy lands in one review rather than three.

- [ ] **Step 4: Write the footer component**

`web/apps/parent/src/features/legal/LegalFooter.tsx`:

```tsx
// The legal block every public surface carries. Extracted from PublicLanding's footer on
// 2026-09-08 (legal audit §1) because the landing page linked to nothing legal at all —
// on the one page that advertises a price and takes a booking.
//
// A real <a href>, never a button that pushes a hash: these links go in a footer somebody
// right-clicks, copies and sends to a lawyer.
//
// The accessibility statement is `AccessibilityMenu`'s own — rendering a second copy here
// would be two statements of one fact, and the one that goes stale is always the copy.
import { AccessibilityMenu } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const LINKS = [
  { href: '/legal/terms', key: 'people.landing.legalTerms' },
  { href: '/legal/policy', key: 'people.landing.legalPrivacy' },
] as const

export function LegalFooter({ locale }: { locale: Locale }) {
  return (
    <nav className="gl-footer-legal" aria-label={t(locale, 'people.landing.legalTitle')}>
      {LINKS.map(({ href, key }) => (
        <a key={href} className="gl-footer-navlink" href={href}>
          {t(locale, key)}
        </a>
      ))}
      <AccessibilityMenu
        locale={locale}
        renderTrigger={(open) => (
          <button
            type="button"
            className="gl-footer-navlink"
            data-testid="legal-a11y-statement"
            onClick={open}
          >
            {t(locale, 'people.landing.legalAccessibility')}
          </button>
        )}
      />
    </nav>
  )
}
```

`renderTrigger` is the escape hatch `AccessibilityMenu` already exposes — check its signature in `web/packages/ui/src/primitives/AccessibilityMenu.tsx:76` and match it exactly; `AccountScreen.tsx:448` is a working caller to copy from.

- [ ] **Step 5: Mount it and style it**

In `PublicLanding.tsx`, inside `<footer className="gl-footer">`, above the copyright line:

```tsx
          <LegalFooter locale={locale} />
```

In `landing.css`, beside `.gl-footer-nav`:

```css
.gl-footer-legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-block-start: var(--space-3);
}
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/apps/parent/src/features/legal/ \
        web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/apps/parent/src/features/landing/landing.css \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "feat(landing): the shop window links to the terms, the policy and the a11y statement"
```

---

## Phase 3 — The legal documents

**Read this before starting Phase 3.** Tasks 6, 7 and 8 change reviewed legal text. Land all three, have them reviewed **together**, then run Task 9 once. Do not bump `POLICY_VERSION` between them — each bump re-gates every family.

### Task 5: Widen `PolicyDocument` from two documents to five

**Files:**
- Modify: `web/packages/ui/src/legal/PolicyDocument.tsx`
- Modify: `web/apps/parent/src/features/legal/route.ts` — the `DOCS` list
- Test: `web/packages/ui/src/legal/PolicyDocument.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type PolicyDoc = 'terms' | 'policy' | 'cookies' | 'refunds'` and a `SECTIONS` record keyed by it. Tasks 7 and 8 fill the new documents' keys; Task 3's route serves them at `/legal/cookies` and `/legal/refunds` with no further change.

- [ ] **Step 1: Write the failing test**

```tsx
it.each(['terms', 'policy', 'cookies', 'refunds'] as const)(
  'renders every section of %s with no missing key',
  (doc) => {
    render(<PolicyDocument locale="he" doc={doc} isDraft={false} versionLabel="3.0" />)
    expect(screen.getByText(t('he', `reports.privacy.${doc}.title`))).toBeTruthy()
    // A missing key renders as the key itself — the one failure mode that looks like text.
    expect(screen.queryByText(/^reports\.privacy\./)).toBeNull()
  },
)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
```

Expected: FAIL — `'cookies'` is not assignable to `PolicyDoc`.

- [ ] **Step 3: Widen the type and the section table**

Replace the two `const` arrays with one record, so a document and its section count are declared in one place:

```tsx
/** Which of the documents to render. */
export type PolicyDoc = 'terms' | 'policy' | 'cookies' | 'refunds'

/** The section numbers each document carries. Adding one is adding two keys per locale.
 *  `cookies` and `refunds` joined on 2026-09-08 (legal audit §3 and §4.2). */
const SECTIONS: Record<PolicyDoc, readonly number[]> = {
  terms: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  policy: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  cookies: [1, 2, 3, 4],
  refunds: [1, 2, 3, 4, 5],
}
```

`terms` grows to 9 for Task 6's liability section and `policy` to 13 for Task 7's cookie section. Update `Sections`' `prefix` prop type to `PolicyDoc` and have `PolicyDocument` read `SECTIONS[doc]`.

- [ ] **Step 4: Add the two documents to the route's allow-list**

In `web/apps/parent/src/features/legal/route.ts`:

```ts
const DOCS: readonly PolicyDoc[] = ['terms', 'policy', 'cookies', 'refunds']
```

- [ ] **Step 5: Run the test**

It will still fail — the new keys do not exist yet. That is expected and is what Tasks 6–8 deliver. Confirm the failure is *"missing i18n key"* and not *"type error"*:

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
cd web && npm run typecheck
```

Expected: typecheck PASS, test FAIL on missing keys only.

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/legal/PolicyDocument.tsx \
        web/packages/ui/src/legal/PolicyDocument.test.tsx \
        web/apps/parent/src/features/legal/route.ts
git commit -m "refactor(legal): PolicyDocument carries four documents, not two"
```

---

### Task 6: Name the operator, and limit liability (BLOCKED on D1)

Spec §1 finding 1 — the highest-value item in the plan. `privacy.terms.s1.body` says the app "is operated for the club", naming nobody. A contract with no named party and no liability cap, for a product that holds minors' medical data and gates who steps onto a mat.

**Do not invent the entity.** Every `«…»` below is decision D1. If it is unanswered, stop.

**Files:**
- Modify: `web/packages/i18n/{he,en,ru}/reports.ts`
- Test: `web/packages/ui/src/legal/PolicyDocument.test.tsx`

**Interfaces:**
- Consumes: Task 5's `SECTIONS.terms` of length 9.
- Produces: `privacy.terms.s1.body` rewritten; `privacy.terms.s9.{title,body}` added; the old s8 (governing law) stays at s8.

- [ ] **Step 1: Write the failing test**

```tsx
it('names the operator and caps its liability in the terms', () => {
  render(<PolicyDocument locale="he" doc="terms" isDraft={false} versionLabel="3.0" />)
  // The operator's registered number is the fact that makes the contract enforceable
  // against a named party — the audit's finding 1.
  expect(screen.getByText(new RegExp(OPERATOR_REGISTRATION_NUMBER))).toBeTruthy()
  expect(screen.getByText(t('he', 'reports.privacy.terms.s9.title'))).toBeTruthy()
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Rewrite s1 and add s9, in all three locales**

`he/reports.ts` — replace `privacy.terms.s1.body`:

```ts
  'privacy.terms.s1.title': 'מי אנחנו ומהו השירות',
  'privacy.terms.s1.body':
    'האפליקציה מופעלת על ידי «שם הישות המשפטית», «ח.פ. / מספר עוסק», מכתובת «כתובת», ' +
    'דוא"ל «כתובת דוא"ל». המועדון שילדיכם רשומים אליו הוא הלקוח שלנו והוא האחראי על ' +
    'הפעילות בדוג\'ו עצמו. השירות משמש לרישום, מערכת שעות, נוכחות, תשלומים, הצהרות ' +
    'בריאות והודעות מהמועדון.',
```

Add `privacy.terms.s9`, after s8's governing law:

```ts
  'privacy.terms.s9.title': 'אחריות',
  'privacy.terms.s9.body':
    'האפליקציה היא כלי ניהול. האימון עצמו, הפיקוח על המזרן והבטיחות בו הם באחריות ' +
    'המועדון ובאחריותו בלבד — לא באחריות מפעיל האפליקציה. אנחנו לא נושאים באחריות לנזק ' +
    'עקיף, תוצאתי או אובדן רווח, ואחריותנו הכוללת בכל עילה לא תעלה על הסכום ששולם לנו ' +
    'עבור השירות בשלושת החודשים שקדמו לאירוע. אין באמור כדי לגרוע מזכות שאינה ניתנת ' +
    'להתניה לפי דין, ובכלל זה זכויות לפי חוק הגנת הצרכן.',
```

`en/reports.ts`:

```ts
  'privacy.terms.s1.title': 'Who we are and what this service is',
  'privacy.terms.s1.body':
    'The app is operated by «legal entity name», «company or business number», of «address», email «email». ' +
    'The club your children are enrolled in is our customer and is responsible for what happens in the dojo itself. ' +
    'The service is used for enrolment, the timetable, attendance, payments, health declarations and messages from the club.',
  'privacy.terms.s9.title': 'Liability',
  'privacy.terms.s9.body':
    'The app is a management tool. The training itself, supervision on the mat and safety there are the club’s responsibility and the club’s alone — not the app operator’s. ' +
    'We are not liable for indirect or consequential loss or for lost profit, and our total liability on any cause of action will not exceed what was paid to us for the service in the three months before the event. ' +
    'Nothing here reduces a right that cannot be contracted out of under law, including rights under the Consumer Protection Law.',
```

`ru/reports.ts` — translate both.

**The last sentence of s9 is not optional.** A liability cap that appears to contract out of statutory consumer rights is void and reads badly; carving them out explicitly is what keeps the rest of the clause standing.

- [ ] **Step 4: Run the test**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
```

Expected: PASS for `terms`, still failing for `cookies` and `refunds` — Tasks 7 and 8.

- [ ] **Step 5: Commit**

```bash
git add web/packages/i18n/he/reports.ts web/packages/i18n/en/reports.ts web/packages/i18n/ru/reports.ts \
        web/packages/ui/src/legal/PolicyDocument.test.tsx
git commit -m "feat(legal): the terms name the operator and cap its liability"
```

---

### Task 7: A cookie and storage section in the privacy policy

Spec §3. You asked whether you need a cookie banner. **The answer is no** — one strictly-necessary `httpOnly` authentication cookie and functional local storage, with no analytics, no advertising pixel and no session recording anywhere in the codebase. But the answer only holds if the policy says what is stored, and today the policy has no cookie section at all. This task writes the disclosure; Task 13 makes the build enforce the condition that keeps it true.

**Files:**
- Modify: `web/packages/i18n/{he,en,ru}/reports.ts`
- Test: `web/packages/ui/src/legal/PolicyDocument.test.tsx`

**Interfaces:**
- Consumes: Task 5's `SECTIONS.policy` of length 13 and `SECTIONS.cookies` of length 4.
- Produces: `privacy.policy.s13.*` (the summary inside the privacy policy) and `privacy.cookies.title` plus `privacy.cookies.s1..s4.*` (the standalone document at `/legal/cookies`).

- [ ] **Step 1: Write the failing test**

```tsx
it('discloses the one cookie and says why no banner is asked for', () => {
  render(<PolicyDocument locale="en" doc="cookies" isDraft={false} versionLabel="3.0" />)
  const body = screen.getByTestId('policy-document').textContent ?? ''
  expect(body).toContain('httpOnly')
  expect(body.toLowerCase()).toContain('we do not use analytics')
})
```

Add `data-testid="policy-document"` to `PolicyDocument`'s root element if it is not already there.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Add the standalone cookie document (English shown; write `he` first, then translate)**

```ts
  'privacy.cookies.title': 'Cookies and local storage',
  'privacy.cookies.s1.title': 'The one cookie we set',
  'privacy.cookies.s1.body':
    'A single sign-in cookie, which keeps you signed in between visits. It is httpOnly — script on the page cannot read it — it is sent only over a secure connection, and it is restricted so other sites cannot cause your browser to send it. It contains a random value and nothing about you. Signing out deletes it and revokes it on the server, so a copy taken beforehand is useless.',
  'privacy.cookies.s2.title': 'What the app keeps on your device',
  'privacy.cookies.s2.body':
    'Your chosen language, your light or dark theme, the accessibility adjustments you set, a draft of a registration form you have not finished, a note that you declined notifications, and the techniques you saved to your shelf. All of it stays in your browser on this device. None of it is sent to us, and clearing your browser data removes it.',
  'privacy.cookies.s3.title': 'We do not track you',
  'privacy.cookies.s3.body':
    'We do not use analytics, advertising pixels, session recording or any third-party tracking. Because nothing here is used to track you, there is nothing to ask your consent for and we do not show a cookie banner. If that ever changes, we will ask before it does.',
  'privacy.cookies.s4.title': 'Content from other services',
  'privacy.cookies.s4.body':
    'Two things on our pages come from elsewhere. Card payments are handled by uPay in a frame we do not see into, so your card details never reach us. Judo technique videos are played from YouTube, using its no-cookie address, and YouTube may set its own cookies once you press play. Everything else — fonts included — is served by us.',
```

The `he` version, written first as the reference locale:

```ts
  'privacy.cookies.title': 'עוגיות ואחסון מקומי',
  'privacy.cookies.s1.title': 'העוגייה היחידה שאנחנו שומרים',
  'privacy.cookies.s1.body':
    'עוגיית התחברות אחת, ששומרת אתכם מחוברים בין ביקורים. היא httpOnly — קוד בדף לא יכול ' +
    'לקרוא אותה — נשלחת רק בחיבור מאובטח, ומוגבלת כך שאתרים אחרים לא יוכלו לגרום לדפדפן ' +
    'לשלוח אותה. היא מכילה ערך אקראי ולא שום דבר עליכם. יציאה מהחשבון מוחקת אותה ומבטלת ' +
    'אותה גם בשרת, כך שעותק שנלקח קודם לכן חסר ערך.',
```

…and the same for s2–s4.

- [ ] **Step 4: Add the summary section to the privacy policy itself**

Somebody reading the privacy policy must not have to find a second document to learn this:

```ts
  'privacy.policy.s13.title': 'Cookies and local storage',
  'privacy.policy.s13.body':
    'One sign-in cookie, and settings kept in your browser on your device — language, theme, accessibility adjustments and an unfinished form draft. No analytics, no advertising and no tracking of any kind, which is why we ask for no cookie consent. The full detail is in the cookies and local storage document.',
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx --reporter=dot
```

Expected: PASS for `cookies` and `policy`.

- [ ] **Step 6: Commit**

```bash
git add web/packages/i18n/he/reports.ts web/packages/i18n/en/reports.ts web/packages/i18n/ru/reports.ts \
        web/packages/ui/src/legal/PolicyDocument.tsx web/packages/ui/src/legal/PolicyDocument.test.tsx
git commit -m "feat(legal): disclose the one cookie, and why no banner is asked for"
```

---

### Task 8: A refund and cancellation policy (BLOCKED on D3)

Spec §4.2. The terms today say "the club sets prices and the refund policy" — a sentence that hands the duty to the club and gives the consumer nothing, when the consumer's statutory rights do not depend on what the club sets.

**The statutory figures are the lawyer's to state, not the implementer's.** Every `«…»` is decision D3. The document is written statutory-floor first, club terms second.

**Files:**
- Modify: `web/packages/i18n/{he,en,ru}/reports.ts`
- Modify: `web/apps/parent/src/features/legal/LegalFooter.tsx` — link the two new documents
- Test: `web/packages/ui/src/legal/PolicyDocument.test.tsx`, `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

**Interfaces:**
- Consumes: Task 5's `SECTIONS.refunds` of length 5; Task 4's `LINKS`.
- Produces: `privacy.refunds.title` and `privacy.refunds.s1..s5.*`. Task 12's cancellation screen links to `/legal/refunds`.

- [ ] **Step 1: Write the failing test**

```tsx
it('states the cancellation right before the club’s own terms', () => {
  render(<PolicyDocument locale="en" doc="refunds" isDraft={false} versionLabel="3.0" />)
  const sections = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  // Order is the point: the statutory right is s1, the club's terms come after it.
  expect(sections[0]).toBe(t('en', 'reports.privacy.refunds.s1.title'))
})
```

And in `PublicLanding.test.tsx`:

```tsx
it('links the cookie and refund documents from the footer', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  const footer = await screen.findByTestId('landing-footer')
  expect(within(footer).getByRole('link', { name: t('he', 'people.landing.legalCookies') }))
    .toHaveAttribute('href', '/legal/cookies')
  expect(within(footer).getByRole('link', { name: t('he', 'people.landing.legalRefunds') }))
    .toHaveAttribute('href', '/legal/refunds')
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL on both.

- [ ] **Step 3: Write the document (English shown; `he` is the reference and is written first)**

```ts
  'privacy.refunds.title': 'Cancellation and refunds',
  'privacy.refunds.s1.title': 'Your right to cancel',
  'privacy.refunds.s1.body':
    'Because you signed up through the app rather than in person, this is a distance transaction under the Consumer Protection Law and you may cancel it. You may cancel within «cancellation window» of the transaction or of receiving the confirmation, provided it is at least «notice period» before the service begins. A cancellation fee of up to «cancellation fee» may be charged. Cancelling within this window is your right and does not depend on a reason.',
  'privacy.refunds.s2.title': 'Cancelling an ongoing subscription',
  'privacy.refunds.s2.body':
    'A monthly subscription is an ongoing transaction and you may end it at any time. Notice takes effect within «effective period» of us receiving it. You joined online, so you can leave online: the cancellation screen in the app is at the same distance as joining was, and cancelling there needs no phone call and no conversation. You can also cancel by phone or in writing to the club.',
  'privacy.refunds.s3.title': 'What happens to money already paid',
  'privacy.refunds.s3.body':
    '«The club’s pro-rata rule for a mid-month departure — decision D3.» A payment made for lessons not yet given is refunded to the means of payment used, less any cancellation fee the law allows. A refund of a card payment is made through uPay and can take a few business days to appear on your statement.',
  'privacy.refunds.s4.title': 'A trial lesson',
  'privacy.refunds.s4.body':
    'A trial lesson is free and booking one commits you to nothing. Not turning up costs you nothing, and cancelling one needs no notice — though telling the club helps them give the place to someone else.',
  'privacy.refunds.s5.title': 'How to cancel, and how to complain',
  'privacy.refunds.s5.body':
    'Cancel from the cancellation screen in the app, by phone on the club’s number, or in writing to the club’s address — all three are on the club screen. We will confirm in writing. If you are not satisfied with how a cancellation was handled, you can approach the Consumer Protection and Fair Trade Authority.',
```

Replace the second sentence of `privacy.terms.s4.body` — the one that says the club sets the refund policy — with a pointer:

```ts
  'privacy.terms.s4.body':
    'The club sets its prices. Your right to cancel and what happens to money already paid are set out in the cancellation and refunds document, which states your rights under the Consumer Protection Law first and the club’s own terms after them. Card payments are processed by uPay, the payment provider, and we do not store card details. A standing order cannot be opened through the app; a payment received that way is marked paid by the club by hand.',
```

- [ ] **Step 4: Link both new documents in the footer**

In `LegalFooter.tsx`, extend `LINKS`:

```tsx
const LINKS = [
  { href: '/legal/terms', key: 'people.landing.legalTerms' },
  { href: '/legal/policy', key: 'people.landing.legalPrivacy' },
  { href: '/legal/cookies', key: 'people.landing.legalCookies' },
  { href: '/legal/refunds', key: 'people.landing.legalRefunds' },
] as const
```

- [ ] **Step 5: Run both suites**

```bash
npx vitest run web/packages/ui/src/legal/PolicyDocument.test.tsx web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: PASS. All four documents now render every section.

- [ ] **Step 6: Commit**

```bash
git add web/packages/i18n/he/reports.ts web/packages/i18n/en/reports.ts web/packages/i18n/ru/reports.ts \
        web/apps/parent/src/features/legal/LegalFooter.tsx \
        web/packages/ui/src/legal/PolicyDocument.test.tsx \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "feat(legal): a cancellation and refunds document, statutory floor first"
```

---

### Task 9: Bump `POLICY_VERSION` to 3

Run this **once**, after Tasks 6, 7 and 8 have all landed and the text has been reviewed together. It re-gates every family: `ConsentService.outstanding` requires a grant at the current version, so everyone accepts again against the text they can actually read.

**Files:**
- Modify: `app/services/privacy/policy.py`
- Test: `tests/privacy/test_consent.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `POLICY_VERSION = 3`, `POLICY_VERSION_LABEL = "3.0"`. `expected_version('terms')` and `expected_version('privacy')` both return 3; `club_terms` still moves with `CLUB_TERMS_VERSION` and is untouched.

- [ ] **Step 1: Write the failing test**

```python
def test_a_grant_at_the_previous_version_is_rejected_after_the_bump(session, person):
    with pytest.raises(PolicyVersionMismatchError) as caught:
        ConsentService.record(
            session, person_id=person.id, consent_type="terms", granted=True, version=2
        )
    assert caught.value.current == 3
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/privacy/test_consent.py -q
```

Expected: FAIL — `current` is 2.

- [ ] **Step 3: Bump the version, and say why in the docstring**

In `app/services/privacy/policy.py`:

```python
POLICY_VERSION = 3
POLICY_VERSION_LABEL = "3.0"
```

Append to the module docstring, in the same voice as the entries above it:

```
**Raised again, 2 to 3, for the legal audit of 2026-09-08.** Three changes to the reviewed
text, landed together and reviewed together so this bump happens once rather than three
times: the terms now NAME the operator and cap its liability (audit §1 finding 1 -- until
now the contract named no party at all), the privacy policy gained a
cookies-and-local-storage section (§3 -- the disclosure that makes "no banner" a defensible
answer rather than an omission), and a cancellation-and-refunds document joined the set
(§4.2 -- replacing a sentence that handed the duty to the club and gave the consumer
nothing). Same rule as every entry above: change the text, raise the version, every family
is asked again.
```

- [ ] **Step 4: Run the privacy suite**

```bash
.venv/bin/pytest tests/privacy -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/privacy/policy.py tests/privacy/test_consent.py
git commit -m "feat(privacy): policy version 3 — every family re-accepts the reviewed text"
```

---

## Phase 4 — Business details on the shop window

### Task 10: Business details and a VAT statement in the footer (BLOCKED on D1)

Spec §4.2. The landing page shows three monthly prices and a booking button, which makes it an offer in a distance transaction. The seller's name, business number, address, and a price stated as including VAT are pre-transaction disclosures. There is no VAT statement anywhere in the codebase.

**Files:**
- Modify: `web/apps/parent/src/features/legal/LegalFooter.tsx`
- Modify: `web/apps/parent/src/features/landing/PublicLanding.tsx` — pass the club's details through
- Modify: `web/packages/i18n/{he,en,ru}/people.ts`
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

**Interfaces:**
- Consumes: Task 4's `LegalFooter`; `PublicLandingOut`'s existing `address`, `phone` and `studio_name`.
- Produces: `LegalFooter({ locale, business })` where `business` is `{ clubName: string; address: string | null; phone: string | null }`. The operator's own details are i18n constants, not props — they are the same for every club.

- [ ] **Step 1: Write the failing test**

```tsx
it('states who is selling, and that the price includes VAT', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  const footer = await screen.findByTestId('landing-footer')
  expect(within(footer).getByTestId('legal-business-details').textContent)
    .toContain(LANDING.address)
  const plans = screen.getByTestId('landing-plans')
  expect(plans.textContent).toContain(t('he', 'people.landing.priceIncludesVat'))
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Add the copy in all three locales**

`he/people.ts`:

```ts
  'landing.businessTitle': 'פרטי העסק',
  // «…» is decision D1 — do not invent an entity. See the audit, §7.
  'landing.businessOperator': 'האפליקציה מופעלת על ידי «שם הישות», «ח.פ. / מספר עוסק»',
  'landing.businessClub': 'השירות נמכר על ידי {club}, {address}, טלפון {phone}',
  'landing.priceIncludesVat': 'המחירים כוללים מע"מ',
  'landing.priceTerms': 'תנאי הביטול וההחזרים',
```

`en/people.ts`: `'Business details'`, `'The app is operated by «entity», «company or business number»'`, `'The service is sold by {club}, {address}, telephone {phone}'`, `'Prices include VAT'`, `'Cancellation and refund terms'`.

`ru/people.ts`: translate the same five.

- [ ] **Step 4: Render the block and the price note**

In `LegalFooter.tsx`, above the links:

```tsx
      <div className="gl-footer-business" data-testid="legal-business-details">
        <p>{t(locale, 'people.landing.businessOperator')}</p>
        {business.address ? (
          <p>
            {t(locale, 'people.landing.businessClub')
              .replace('{club}', business.clubName)
              .replace('{address}', business.address)
              .replace('{phone}', business.phone ?? '')}
          </p>
        ) : null}
      </div>
```

Use whatever interpolation helper `@studio/i18n` already provides if there is one — grep for an existing `{` placeholder in `he/people.ts` and copy that call shape rather than the `.replace` chain above.

In `PublicLanding.tsx`, in the plans section beneath the price:

```tsx
            <p className="gl-plan-vat">
              {t(locale, 'people.landing.priceIncludesVat')}{' '}
              <a href="/legal/refunds">{t(locale, 'people.landing.priceTerms')}</a>
            </p>
```

- [ ] **Step 5: Run the test and look at the page**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Then run the app and **look at the footer in Hebrew and in English**, at a phone width and at a desk width. A business-details block is the kind of thing that passes every test and renders as a wall of grey text nobody can read. `docs/screenshots/` is where the comparison goes.

- [ ] **Step 6: Commit**

```bash
git add web/apps/parent/src/features/legal/LegalFooter.tsx \
        web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/apps/parent/src/features/landing/landing.css \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "feat(landing): say who is selling, and that the price includes VAT"
```

---

## Phase 5 — Cancellation you can actually reach

### Task 11: A cancellation request service and route (BLOCKED on D3)

Spec §4.2. Joining is fully online; cancelling requires a phone call. `POST /recurring-subscriptions/{id}/cancel` at `app/routers/billing.py:1358` is staff-only. This task adds the consumer's side: a request a guardian can file themselves, which records what they asked for and when, and which the club then acts on.

**How the money actually moves (owner decision, 2026-09-08).** The app moves no money at all. Each of the three
payment methods is settled by a person:

| Method | Who acts | What the app does |
|---|---|---|
| Cash | The coach refunds by hand | Records the request; shows the coach a refund is owed |
| Card | The coach refunds through uPay | Records the request; shows the coach a refund is owed |
| Standing order (הוראת קבע) | **The family cancels it at their own bank** | Records the request; tells the family to cancel at the bank; watches for a payment that arrives anyway |

**The standing order carries a duty the club cannot hand to the family.** Telling a parent "it is your job to cancel it
at the bank" is true as a mechanism and is **not a defence**. If a payment reaches the club after the effective date --
because the parent was slow, or the bank was -- that money is the club's to return. A business may not make a
cancellation conditional on the consumer doing something at a third party. This is also the complaint that actually
happens: bank standing orders are exactly what people forget, and "you should have called your bank" is the sentence
that turns a phone call into a claim.

Two consequences, both built here rather than written into a policy nobody reads:

1. The cancellation screen says what happens **per payment method**, not one generic message -- and the standing-order
   message ends with the club's own promise: *if a payment reaches us after this date, we will return it.*
2. A payment received after a student's `effective_at` **surfaces as a refund owed**, not quietly as a normal payment
   in the ledger. Without this the money sits looking correct, and the club learns about it from an angry parent.

**Deliberately a request, not an immediate termination.** A cancellation has billing consequences the club settles — a pro-rata refund, a final charge, a place freed for a waiting family. What the law requires is that the consumer can *initiate* it as easily as they joined and that it takes effect within the statutory period. Recording the request with its effective date does exactly that and leaves the money to the club. The effective date is computed at write time, so what the family was told is what is stored — a rule the club changes later cannot move a date somebody already read.

**Files:**
- Create: `app/models/cancellation.py`
- Create: `app/schemas/cancellation.py`
- Create: `app/services/billing/cancellation.py`
- Create: `app/routers/cancellations.py`
- Test: `tests/billing/test_cancellation.py`
- Migration: **not in this lane.** `alembic/versions/**` belongs to `main`; the revision lands in the wave's contract commit.

**Interfaces:**
- Consumes: `TenantMixin` from `app/core/tenancy.py`, `AuditService.record`, `app.core.clock.now`.
- Produces: `CancellationService.request(session, *, student_id, requested_by_person_id, reason, at) -> CancellationRequest`, `CancellationService.for_guardian(session, *, person_id) -> list[CancellationRequest]`, and `CancellationService.refunds_owed(session, *, at) -> list[RefundOwed]`; `POST /api/v1/me/cancellation-requests` and `GET /api/v1/me/cancellation-requests`. Task 12's screen consumes the first two; the staff app's task list consumes `refunds_owed`.

- [ ] **Step 1: Write the failing test**

```python
def test_a_guardian_can_file_a_cancellation_and_the_effective_date_is_stored(
    session, guardian, student
):
    at = datetime(2026, 9, 8, 10, 0, tzinfo=UTC)
    row = CancellationService.request(
        session,
        student_id=student.id,
        requested_by_person_id=guardian.id,
        reason="moving away",
        at=at,
    )
    assert row.requested_at == at
    # Computed at write time, so a change to the rule cannot move a date already read.
    assert row.effective_at == at + CANCELLATION_NOTICE
    assert row.status == "requested"


def test_a_second_request_for_the_same_student_is_refused_rather_than_duplicated(
    session, guardian, student
):
    at = datetime(2026, 9, 8, 10, 0, tzinfo=UTC)
    CancellationService.request(
        session, student_id=student.id, requested_by_person_id=guardian.id, reason=None, at=at
    )
    with pytest.raises(ConflictError):
        CancellationService.request(
            session, student_id=student.id, requested_by_person_id=guardian.id, reason=None, at=at
        )
```

```python
def test_a_payment_after_the_effective_date_is_reported_as_a_refund_owed(
    session, guardian, student, charge
):
    at = datetime(2026, 9, 8, 10, 0, tzinfo=UTC)
    row = CancellationService.request(
        session, student_id=student.id, requested_by_person_id=guardian.id, reason=None, at=at
    )
    # The standing order the family had not yet cancelled at their bank pays anyway.
    pay(session, student=student, amount_agorot=30000, at=row.effective_at + timedelta(days=2))

    owed = CancellationService.refunds_owed(session, at=row.effective_at + timedelta(days=3))

    assert [o.student_id for o in owed] == [student.id]
    assert owed[0].amount_agorot == 30000
```

The second test is the repo's own rule: *refuse rather than accept, when accepting creates a dead end.* A family who files twice and sees two pending rows has no idea which one counts.

The third is the standing-order duty. A payment that arrives after the effective date looks completely normal in the ledger -- same amount, same student, same shape as every other month. Nothing distinguishes it except the date, so the date is what has to be checked. Without this query the club learns about the money from the parent who is owed it.

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/billing/test_cancellation.py -q
```

Expected: FAIL — no such module.

- [ ] **Step 3: Write the model**

`app/models/cancellation.py`:

```python
"""A guardian's own cancellation of an ongoing subscription.

The consumer's counterpart to `ReconciliationService.cancel_subscription`, which is
staff-only. Joining this club is fully online, so leaving it has to be too -- an online
route no harder than the one in.

Deliberately a REQUEST and not a termination. What a cancellation costs and what is
refunded is the club's to settle; what the law asks is that the family can start it
themselves and that it takes effect within the statutory period. `effective_at` is written
here, at request time, so a rule the club changes next month cannot move a date a family
has already been told.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey


class CancellationRequest(TenantMixin, UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "cancellation_request"

    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("student.id"), nullable=False, index=True
    )
    requested_by_person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("person.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Computed at write time from CANCELLATION_NOTICE. Never recomputed on read.
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: 'requested' | 'acknowledged' | 'completed' | 'withdrawn'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="requested")
    #: Free text from the family. Optional -- a cancellation needs no reason, and asking
    #: for one as a condition would be a dark pattern.
    reason: Mapped[str | None] = mapped_column(Text)
```

Check `TenantMixin`, `UUIDPrimaryKey` and `TimestampColumns` against a neighbouring model before writing — copy an existing model's declaration order rather than the one above if they differ.

- [ ] **Step 4: Write the service and the router**

`app/services/billing/cancellation.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cancellation import CancellationRequest
from app.services.audit import AuditService
from app.services.errors import ConflictError

#: «decision D3» -- the statutory notice period for an ongoing transaction, confirmed by
#: counsel. Named here so one place decides it and `effective_at` records what it was.
CANCELLATION_NOTICE = timedelta(days=3)

#: A request in one of these is still live; a second one would be a duplicate.
OPEN_STATUSES = ("requested", "acknowledged")


class CancellationService:
    @staticmethod
    def request(
        session: Session,
        *,
        student_id: uuid.UUID,
        requested_by_person_id: uuid.UUID,
        reason: str | None,
        at: datetime,
    ) -> CancellationRequest:
        existing = session.scalars(
            select(CancellationRequest).where(
                CancellationRequest.student_id == student_id,
                CancellationRequest.status.in_(OPEN_STATUSES),
            )
        ).first()
        if existing is not None:
            raise ConflictError(f"student {student_id} already has an open cancellation")
        row = CancellationRequest(
            student_id=student_id,
            requested_by_person_id=requested_by_person_id,
            requested_at=at,
            effective_at=at + CANCELLATION_NOTICE,
            status="requested",
            reason=reason or None,
        )
        session.add(row)
        session.flush()
        AuditService.record(
            session,
            action="cancellation.requested",
            entity="cancellation_request",
            entity_id=row.id,
            actor_person_id=requested_by_person_id,
            diff={"effective_at": row.effective_at.isoformat()},
        )
        return row
```

Match `AuditService.record`'s real signature — read `app/services/audit.py` before writing this. Note the standing rule: never put health contents in `diff`. A cancellation reason is free text from a family and could contain anything, so it does **not** go in the diff.

`app/routers/cancellations.py` follows the thin-router rule: parse, call the service, return. Copy the auth dependency shape from `app/routers/students.py`'s `/me/students/...` routes. It is mounted by discovery — do not edit `app/main.py`.

- [ ] **Step 5: Run the tests, the typecheck and the linter**

```bash
.venv/bin/pytest tests/billing/test_cancellation.py -q
.venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app
```

Expected: PASS.

- [ ] **Step 6: Commit, and note the migration owed**

```bash
git add app/models/cancellation.py app/schemas/cancellation.py \
        app/services/billing/cancellation.py app/routers/cancellations.py \
        tests/billing/test_cancellation.py
git commit -m "feat(billing): a guardian can file their own cancellation"
```

Then say plainly in the handoff that `cancellation_request` needs a revision in the wave's contract commit on `main`. A model with no table is a route that 500s in production.

---

### Task 12: The cancellation screen (BLOCKED on D3)

Spec §4.2 — the online route that makes leaving as easy as joining.

**Files:**
- Create: `web/apps/parent/src/features/billing/CancellationScreen.tsx`
- Create: `web/apps/parent/src/features/billing/cancellationClient.ts`
- Modify: `web/apps/parent/src/App.tsx` — a `#/cancel` route
- Modify: `web/apps/parent/src/features/people/redesign/sheets.tsx` — a row in the profile settings
- Modify: `web/packages/i18n/{he,en,ru}/billing.ts`
- Test: `web/apps/parent/src/features/billing/CancellationScreen.test.tsx`

**Interfaces:**
- Consumes: Task 11's `POST /api/v1/me/cancellation-requests`.
- Produces: `CancellationScreen({ locale, client, studentId })`. The regenerated `@studio/api-client` carries the request and response types — never hand-write them.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the effective date the server computed, not one it worked out itself', async () => {
  const client = {
    request: vi.fn(() =>
      Promise.resolve({ effective_at: '2026-09-11T10:00:00Z', status: 'requested' }),
    ),
    list: vi.fn(() => Promise.resolve({ items: [] })),
  }
  render(<CancellationScreen locale="he" client={client} studentId="s1" />)
  await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.cancel.submit') }))
  expect(await screen.findByTestId('cancel-effective')).toHaveTextContent('11')
})

it('needs no reason, because asking for one as a condition would be a dark pattern', async () => {
  const client = {
    request: vi.fn(() =>
      Promise.resolve({ effective_at: '2026-09-11T10:00:00Z', status: 'requested' }),
    ),
    list: vi.fn(() => Promise.resolve({ items: [] })),
  }
  render(<CancellationScreen locale="he" client={client} studentId="s1" />)
  await userEvent.click(screen.getByRole('button', { name: t('he', 'billing.cancel.submit') }))
  expect(client.request).toHaveBeenCalledWith({ student_id: 's1', reason: null })
})
```

The second test is the requirement, not a nicety. A cancellation flow that will not proceed without a reason, or that hides the button behind a retention offer, is the pattern the online-cancellation rule exists to prevent.

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run web/apps/parent/src/features/billing/CancellationScreen.test.tsx --reporter=dot
```

Expected: FAIL — no such module.

- [ ] **Step 3: Write the copy in all three locales**

`he/billing.ts`:

```ts
  'cancel.title': 'ביטול מנוי',
  'cancel.lead': 'אפשר לבטל כאן, באותו מרחק שבו נרשמתם. אין צורך לטלפן ואין צורך בהסבר.',
  'cancel.reasonLabel': 'רוצים לספר לנו למה? (לא חובה)',
  'cancel.submit': 'ביטול המנוי',
  'cancel.confirmTitle': 'לבטל את המנוי?',
  'cancel.confirmBody': 'הביטול ייכנס לתוקף ב-{date}. עד אז אפשר להתאמן כרגיל.',
  'cancel.done': 'הבקשה נקלטה',
  'cancel.effective': 'הביטול ייכנס לתוקף ב-{date}',
  // One message per payment method, because what the family has to DO differs. The
  // standing-order message ends with the club's own promise, and that sentence is the
  // one that matters: the duty to return a late payment is the club's, not the family's.
  'cancel.next.cash': 'החזר על תשלום במזומן יימסר לכם על ידי המאמן.',
  'cancel.next.card': 'החזר על תשלום באשראי יבוצע על ידי המאמן ויופיע בחשבון תוך מספר ימי עסקים.',
  'cancel.next.standingOrder':
    'הוראת הקבע נמצאת אצלכם בבנק — בטלו אותה גם שם. אם בכל זאת ייכנס תשלום אחרי ' +
    '{date}, נחזיר אותו לכם.',
  'cancel.terms': 'תנאי הביטול וההחזרים',
  'cancel.failed': 'לא הצלחנו לשמור את הבקשה. נסו שוב, או התקשרו למועדון.',
  'cancel.alreadyOpen': 'כבר יש בקשת ביטול פתוחה עבור החניך הזה.',
```

`en` and `ru`: translate the same eleven.

- [ ] **Step 4: Write the screen**

Rules it must follow, each traceable to a finding:

- One tap from the profile settings to this screen. No interstitial retention offer.
- The reason field is optional and marked optional. Submitting it empty sends `null`.
- A confirmation step that **states the effective date** before the request is sent.
- After success, the effective date, **the message for this student's payment method** (`cancel.next.cash`, `cancel.next.card` or `cancel.next.standingOrder`), and a link to `/legal/refunds`. Read the method from the student's billing record — never ask the family which one they use, because they will guess and the wrong instruction is worse than none.
- The standing-order message renders the effective date inside it. That sentence is the club's promise to return a late payment, and a promise with no date in it is not one.
- A `409` from the service renders `billing.cancel.alreadyOpen` — a real state, not a generic failure.
- Render the date through the app's existing Asia/Jerusalem formatter from `@studio/core`. Never `toLocaleDateString` inline; never a stored UTC string shown raw.

- [ ] **Step 5: Route it and link it**

Add `#/cancel` to `App.tsx` beside `#/payments`, and a row in the profile settings sheet in `sheets.tsx` beside the accessibility row.

- [ ] **Step 6: Run the tests and the typecheck**

```bash
npx vitest run web/apps/parent/src/features/billing/CancellationScreen.test.tsx --reporter=dot
cd web && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Look at it**

Run the app, walk the flow from the profile to the confirmation, and screenshot it in Hebrew. This is a screen a family reads while unhappy; it has to be plain.

- [ ] **Step 8: Commit**

```bash
git add web/apps/parent/src/features/billing/CancellationScreen.tsx \
        web/apps/parent/src/features/billing/cancellationClient.ts \
        web/apps/parent/src/features/billing/CancellationScreen.test.tsx \
        web/apps/parent/src/App.tsx \
        web/apps/parent/src/features/people/redesign/sheets.tsx \
        web/packages/i18n/he/billing.ts web/packages/i18n/en/billing.ts web/packages/i18n/ru/billing.ts
git commit -m "feat(billing): leaving is as easy as joining — an online cancellation screen"
```

---

## Phase 6 — Keep the "no banner" answer true

### Task 13: A test that fails the build when a tracker appears

Spec §3. "You do not need a cookie banner" is true today because there is no tracking. That is a property of the code, so the code should hold it. The day somebody adds Google Analytics, this test tells them they have just taken on a consent obligation — instead of a court telling them later.

**Files:**
- Create: `web/no-trackers.test.ts`
- Test: itself

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. A gate.

- [ ] **Step 1: Write the test**

`web/no-trackers.test.ts`:

```ts
// The privacy policy tells families we use no analytics, no advertising and no tracking,
// and that is why the site shows no cookie banner (legal audit §3). That sentence is only
// true while it is true of the code, so the code holds it.
//
// If this test fails, you have not broken a build rule — you have changed what the product
// must tell people. Adding any of these means the cookie disclosure needs rewriting and a
// consent mechanism needs designing BEFORE the tag ships.
//
// Source is read, not the dependency tree: a tag pasted into index.html is exactly how
// this arrives, and it appears in no package.json.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const TRACKERS = [
  'googletagmanager.com',
  'google-analytics.com',
  'gtag(',
  'connect.facebook.net',
  'fbq(',
  'clarity.ms',
  'hotjar',
  'mixpanel',
  'posthog',
  'segment.com',
  'amplitude',
  'fullstory',
  'smartlook',
  'logrocket',
]

// git ls-files, so build output and dependencies are out of scope by construction.
const BUILD_DIR = 'dist'
const files = execFileSync('git', ['ls-files', 'apps', 'packages'], { encoding: 'utf-8' })
  .split('\n')
  .filter((path) => /\.(tsx?|html|css|json)$/.test(path))
  .filter((path) => !path.split('/').includes(BUILD_DIR))
  // This file names every tracker on purpose.
  .filter((path) => !path.endsWith('no-trackers.test.ts'))

describe('the product carries no analytics, advertising or session-recording code', () => {
  it.each(TRACKERS)('no source file references %s', (tracker) => {
    const offenders = files.filter((path) =>
      readFileSync(path, 'utf-8').toLowerCase().includes(tracker.toLowerCase()),
    )
    expect(offenders, `${tracker} found in:\n${offenders.join('\n')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Prove the gate fires**

Temporarily add the text `gtag(` to any file under `web/apps/`, run the test, and confirm it fails and **names the file**. A gate nobody has watched fail is a gate that has never been shown to work. Then remove the plant.

```bash
npx vitest run web/no-trackers.test.ts --reporter=dot
```

Expected: FAIL with the planted file named, then PASS once removed.

- [ ] **Step 3: Commit**

```bash
git add web/no-trackers.test.ts
git commit -m "test(privacy): the build fails if a tracker arrives without a banner"
```

---

## Phase 7 — Accessibility

### Task 14: Rewrite the accessibility statement (BLOCKED on D2)

Spec §5.2. The current statement is short, has no date, names no coordinator, lists no known limitation beyond the signature pad — and **claims conformance to WCAG 2.1 level AA that nobody has verified**. That last part converts "we have some gaps" into "they said they complied", which is worse than saying nothing. Until an audit exists, the statement says what is true.

**Files:**
- Modify: `web/packages/i18n/{he,en,ru}/common.ts`
- Modify: `web/packages/ui/src/primitives/AccessibilityMenu.tsx`
- Test: `web/packages/ui/src/primitives/AccessibilityMenu.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `common.a11y.statement.{standard,checked,coordinator,limitations,response}` beside the existing `title`, `body`, `signature` and `contact`.

- [ ] **Step 1: Write the failing test**

```tsx
it('carries a coordinator, a date and the known limitations', async () => {
  render(<AccessibilityMenu locale="he" />)
  await userEvent.click(screen.getByRole('button', { name: t('he', 'common.a11y.button') }))
  const panel = screen.getByTestId('a11y-panel')
  expect(panel.textContent).toContain(t('he', 'common.a11y.statement.coordinator'))
  expect(panel.textContent).toContain(t('he', 'common.a11y.statement.checked'))
  expect(panel.textContent).toContain(t('he', 'common.a11y.statement.limitations'))
})

it('claims only what has been checked', () => {
  // The old text asserted WCAG 2.1 AA conformance nobody had audited. Publishing an
  // unverified conformance claim is a false statement in the first document a claimant
  // reads. Until an audit exists, the statement describes what was built and tested.
  expect(t('he', 'common.a11y.statement.standard')).not.toContain('תואמת במלואה')
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/packages/ui/src/primitives/AccessibilityMenu.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Rewrite the statement in all three locales**

`he/common.ts` — replace `a11y.statement.body` and add five keys:

```ts
  'a11y.statement.body':
    'אנחנו עובדים לפי התקן הישראלי ת"י 5568 (WCAG רמה AA) ומתאימים את האפליקציה באופן שוטף.',
  'a11y.statement.standard':
    'האפליקציה נבנתה לפי הנחיות ת"י 5568: ניווט מלא במקלדת, תיאורים לקורא מסך, ניגודיות ' +
    'צבעים נבדקת אוטומטית בכל שינוי, והתאמות התצוגה שבתפריט זה. טרם בוצעה ביקורת נגישות ' +
    'חיצונית מלאה, ולכן איננו מצהירים על התאמה מלאה — אנחנו מתארים כאן מה נבנה ומה נבדק.',
  // «…» is decision D2 — a real name, a real phone and an inbox that is answered.
  'a11y.statement.coordinator': 'רכז/ת הנגישות: «שם» · טלפון «טלפון» · דוא"ל «דוא"ל».',
  'a11y.statement.checked': 'הבדיקה האחרונה בוצעה ב-«תאריך».',
  'a11y.statement.limitations':
    'מה שידוע לנו שאינו נגיש: החתימה על הצהרת הבריאות מתבצעת בציור בלבד; סרטוני הטכניקות ' +
    'מוטמעים מיוטיוב וכתוביותיהם אינן בשליטתנו; דוחות שמורידים כקובץ PDF אינם מתויגים ' +
    'לקורא מסך. בכל אחד מהמקרים האלה המועדון ישלים עבורכם את הפעולה בטלפון.',
  'a11y.statement.response': 'נענה לכל פנייה בנושא נגישות תוך «מספר» ימי עסקים.',
```

`en` and `ru`: translate the same five. Keep the existing `signature` key — it is a good, specific disclosure and it now belongs under `limitations`.

- [ ] **Step 4: Render them**

In `AccessibilityMenu.tsx`, inside the existing `<details className="studio-a11y__statement">`, render `standard`, `checked`, `coordinator`, `limitations` and `response` as paragraphs beneath `body`. Add `data-testid="a11y-panel"` to the panel if it is not already there.

- [ ] **Step 5: Run the test**

```bash
npx vitest run web/packages/ui/src/primitives/AccessibilityMenu.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/primitives/AccessibilityMenu.tsx \
        web/packages/ui/src/primitives/AccessibilityMenu.test.tsx \
        web/packages/i18n/he/common.ts web/packages/i18n/en/common.ts web/packages/i18n/ru/common.ts
git commit -m "fix(a11y): the statement claims what was checked, and names who to call"
```

---

### Task 15: Bring the landing page's palette under the contrast gate

Spec §5.3 item 1. `tokens.audit.test.ts` reads `tokens.css` only. `landing.css` defines its own `--gl-*` palette, and the timetable tints — the densest information on the page — have never been measured. **The most-viewed page in the product has the least-checked colour.**

**Files:**
- Create: `web/apps/parent/src/features/landing/landing.contrast.test.ts`
- Modify: `web/apps/parent/src/features/landing/landing.css` — whatever fails
- Test: itself

**Interfaces:**
- Consumes: `contrastRatio`, `AA_TEXT` and `NON_TEXT` from `@studio/ui`'s `contrast.ts`.
- Produces: nothing. A gate.

- [ ] **Step 1: Write the failing test**

Model it on `tokens.audit.test.ts` — read the stylesheet from `process.cwd()`, strip comments, and merge every block matching a selector in document order. **Copy `readTokenBlock` rather than rewriting it**; its comments record two real bugs a fresh implementation would reintroduce (a second `:root` block invisible to the audit, and a selector prefix matching the wrong rule).

```ts
// landing.css carries its own scoped palette — the `--gl-*` variables — and
// tokens.audit.test.ts reads tokens.css only, so until now the club timetable's ten
// category tints, its two accent reds and the dark-mode heading were the only colours in
// the product nobody measured. On the one page a stranger sees first.
const LIGHT = readVariableBlock('.gl-scope')
const DARK = readVariableBlock('[data-theme="dark"] .gl-scope')

const CATEGORIES = ['judo', 'team', 'crossfit', 'girls', 'personal'] as const

describe('the landing palette meets the same floors as the design system', () => {
  it.each(CATEGORIES)('%s slot text is readable on its tint', (category) => {
    const background = LIGHT[`--gl-cat-${category}-bg`]!
    expect(contrastRatio(LIGHT['--gl-ink']!, background)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each(CATEGORIES)('%s slot edge is distinguishable from its tint', (category) => {
    expect(
      contrastRatio(LIGHT[`--gl-cat-${category}-edge`]!, LIGHT[`--gl-cat-${category}-bg`]!),
    ).toBeGreaterThanOrEqual(NON_TEXT)
  })

  it('the crimson call to action carries readable text', () => {
    expect(contrastRatio(LIGHT['--gl-on-red']!, LIGHT['--gl-red']!)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the dark-mode heading is readable on the dark ground', () => {
    expect(contrastRatio(DARK['--gl-heading']!, DARK['--gl-surface-low']!))
      .toBeGreaterThanOrEqual(AA_TEXT)
  })
})
```

Check the real selector names in `landing.css` first — the scope class may not be `.gl-scope`. Use whatever the file actually declares its variables on. Where a token resolves to another (`--gl-ink: var(--fg)`), resolve it against `tokens.css` rather than measuring the literal string.

- [ ] **Step 2: Run it and find out what is actually wrong**

```bash
npx vitest run web/apps/parent/src/features/landing/landing.contrast.test.ts --reporter=dot
```

Expected: some failures. **Record the measured ratios before changing anything** — they are the audit, and they belong in the commit message. Do not adjust a threshold to make a colour pass; adjust the colour.

- [ ] **Step 3: Fix whatever failed**

Darken a tint or lighten a text colour until each meets its floor, then look at the timetable and confirm the five categories are still visually distinct **from one another**. Contrast against the ground is not the same as distinguishable from each other, and a legend that reads as five shades of one grey has fixed one problem by creating another.

- [ ] **Step 4: Run the test and look at the page**

```bash
npx vitest run web/apps/parent/src/features/landing/landing.contrast.test.ts --reporter=dot
```

Expected: PASS. Then screenshot the timetable in both themes.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/landing/landing.contrast.test.ts \
        web/apps/parent/src/features/landing/landing.css
git commit -m "fix(landing): the timetable palette is measured, not assumed"
```

---

### Task 16: Honour reduced motion on the landing page

Spec §5.3 item 2. The accessibility menu offers a reduced-motion setting, and `primitives.css`, `manager-signin.css` and others honour it. `landing.css` — 1054 lines, the page with the zen-dot ground and the animated hero — does not.

**Files:**
- Modify: `web/apps/parent/src/features/landing/landing.css`
- Test: `web/apps/parent/src/features/landing/landing.contrast.test.ts` (extended — it already reads the file)

- [ ] **Step 1: Write the failing test**

```ts
it('honours reduced motion, like every other stylesheet in the product', () => {
  expect(raw).toContain('prefers-reduced-motion')
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/landing.contrast.test.ts --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Add the block**

Copy the shape `primitives.css` already uses, so both files say it the same way — read it first and match it. Typically:

```css
/* The accessibility menu offers a reduced-motion setting and this stylesheet ignored it
   until 2026-09-08. The landing page is the one screen a stranger meets, and it is the
   screen with the most movement on it. */
@media (prefers-reduced-motion: reduce) {
  .gl-scope *,
  .gl-scope *::before,
  .gl-scope *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run web/apps/parent/src/features/landing/landing.contrast.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/landing/landing.css \
        web/apps/parent/src/features/landing/landing.contrast.test.ts
git commit -m "fix(landing): reduced motion is honoured on the busiest page"
```

---

### Task 17: Fix the club-uploaded gallery's alt text

Spec §5.3 item 3. `PublicLanding.tsx:480` renders every club-uploaded photo as `alt={clubName}` — five photos, five identical alt strings. A screen reader hears the club's name five times and learns nothing, which is worse than `alt=""`. The *designed* gallery twenty lines below is exemplary by contrast: `galleryAlts` gives each photo its own description.

A club that has not written captions cannot have good alt text invented for it. So: `alt=""` plus `aria-hidden`, and the section gets an accessible name saying what it is. An honestly decorative image beats a lie.

**Files:**
- Modify: `web/apps/parent/src/features/landing/PublicLanding.tsx:467-490`
- Modify: `web/packages/i18n/{he,en,ru}/people.ts`
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('does not read the club’s name once per photo to a screen reader', async () => {
  renderLanding('judo-tel-aviv', clientReturning({
    ...LANDING,
    photo_urls: ['/p/1.jpg', '/p/2.jpg', '/p/3.jpg'],
  }))
  await screen.findByTestId('landing-hero')
  expect(screen.queryAllByRole('img', { name: LANDING.studio_name })).toHaveLength(0)
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL — three images carry that name.

- [ ] **Step 3: Make them decorative and name the section**

```tsx
        {/* The club's own uploaded strip. `alt=""`, deliberately: there is no caption
            field behind these, and five images all announcing the club's name tells a
            screen-reader user nothing while sounding like it does. The SECTION carries
            the accessible name instead. When settings.landing grows a caption per photo,
            this becomes real alt text. */}
          <img key={url} src={url} alt="" aria-hidden="true" className="gl-photo" />
```

and on the enclosing section:

```tsx
        <section
          className="gl-section gl-section--zen"
          aria-label={t(locale, 'people.landing.photosLabel')}
        >
```

Add `people.landing.photosLabel` in all three locales: `'תמונות מהמועדון'` / `'Photographs from the club'` / `'Фотографии клуба'`.

- [ ] **Step 4: Run the test**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "fix(a11y): an uploaded photo is decorative, not the club's name five times"
```

---

### Task 18: A skip-to-content link in all three apps

Spec §5.3 item 4. Keyboard and screen-reader users tab through the header, the language picker and the whole nav on every page load. A skip link is the cheapest keyboard-navigation fix there is, and it is the first thing an accessibility audit looks for.

**Files:**
- Create: `web/packages/ui/src/primitives/SkipLink.tsx`
- Modify: `web/packages/ui/src/primitives/primitives.css`
- Modify: `web/packages/ui/src/index.ts`
- Modify: `web/apps/{parent,staff,dashboard}/src/App.tsx`
- Modify: `web/packages/i18n/{he,en,ru}/common.ts`
- Test: `web/packages/ui/src/primitives/SkipLink.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SkipLink({ locale }: { locale: Locale })` rendering `<a href="#main">`. Every app must have an element with `id="main"` — the `<main>` each already renders.

- [ ] **Step 1: Write the failing test**

```tsx
it('is the first thing a keyboard reaches, and points at the main region', async () => {
  render(<><SkipLink locale="he" /><main id="main">content</main></>)
  await userEvent.tab()
  const link = screen.getByRole('link', { name: t('he', 'common.skipToContent') })
  expect(link).toHaveFocus()
  expect(link).toHaveAttribute('href', '#main')
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/packages/ui/src/primitives/SkipLink.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Write it**

```tsx
// The first tab stop on every page. Off-screen until focused, then visible — the pattern
// works only if a sighted keyboard user can SEE where their focus went, which is why this
// is a transform and not `display: none` (a hidden element is not focusable at all).
//
// Logical properties: this renders right-to-left in Hebrew.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export function SkipLink({ locale }: { locale: Locale }) {
  return (
    <a className="studio-skip-link" href="#main">
      {t(locale, 'common.skipToContent')}
    </a>
  )
}
```

```css
.studio-skip-link {
  position: absolute;
  inset-block-start: var(--space-2);
  inset-inline-start: var(--space-2);
  z-index: 100;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-2);
  background: var(--surface);
  color: var(--fg);
  /* Off-screen, but focusable — `display: none` would take it out of the tab order. */
  transform: translateY(-200%);
}

.studio-skip-link:focus-visible {
  transform: none;
  outline: 2px solid var(--focus-ring);
}
```

Add `common.skipToContent` in all three locales: `'דילוג לתוכן'` / `'Skip to content'` / `'Перейти к содержимому'`.

- [ ] **Step 4: Mount it in all three apps**

As the first child of each `App`'s tree, and confirm each app's `<main>` carries `id="main"`. `PublicLanding.tsx` already renders a `<main>` — check it has the id.

- [ ] **Step 5: Run the test, then tab through the real app**

```bash
npx vitest run web/packages/ui/src/primitives/SkipLink.test.tsx --reporter=dot
```

Then run each app and press Tab once from a fresh load. **Look at it** — a skip link that is focused but invisible is the classic way this ships broken, and no unit test catches it.

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/primitives/SkipLink.tsx \
        web/packages/ui/src/primitives/SkipLink.test.tsx \
        web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts \
        web/apps/parent/src/App.tsx web/apps/staff/src/App.tsx web/apps/dashboard/src/App.tsx \
        web/packages/i18n/he/common.ts web/packages/i18n/en/common.ts web/packages/i18n/ru/common.ts
git commit -m "feat(a11y): skip to content, the first tab stop in every app"
```

---

### Task 19: Turn on `eslint-plugin-jsx-a11y`

Spec §5.3 item 5. The codebase meets a high accessibility standard today by discipline — the comments show the team rejecting `<div onClick>` on its merits, more than once. Discipline does not survive a contractor, and the lint config carries `eslint-plugin-react-hooks` alone.

**Files:**
- Modify: `web/package.json`
- Modify: `web/eslint.config.js`
- Fix whatever it finds.

- [ ] **Step 1: Install and configure**

```bash
cd web && npm install --save-dev eslint-plugin-jsx-a11y
```

In `eslint.config.js`, add the plugin and its recommended rules for `**/*.tsx`.

- [ ] **Step 2: Run it and read every finding**

```bash
cd web && npm run lint
```

- [ ] **Step 3: Fix, or disable with a reason**

Fix each finding. Where a rule genuinely does not apply, disable it **inline with a comment saying why** — never in the config, which would turn the rule off everywhere, including the file that needs it next year.

Expect few findings. The likely ones: the modal scrims (`aria-hidden` with `onClick`, which is correct here because each dialog has a real close button and Escape handling through `useModalDialog` — disable inline with that reasoning), and possibly label-to-control associations in older forms.

- [ ] **Step 4: Run the lint and the frontend typecheck**

```bash
cd web && npm run lint && npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/eslint.config.js
git commit -m "chore(a11y): jsx-a11y lints what code review has been catching by hand"
```

Commit any fixes it forced separately, one commit per file group, so a reviewer can see what changed and why.

---

## Phase 8 — Headers and outbound links

### Task 20: Security response headers

Spec §6.4. There are none — no Content-Security-Policy, no Strict-Transport-Security, no Referrer-Policy, no X-Content-Type-Options, no frame protection. The CSP carries a compliance argument as well as a security one: PCI DSS v4 extended script-integrity duties to the page that hosts a payment iframe, and ours hosts uPay's.

**Files:**
- Create: `app/core/security_headers.py`
- Modify: `app/core/config.py` — the origins the CSP allows
- Modify: `app/main.py` — add the middleware beside CORS
- Test: `tests/core/test_security_headers.py`
- Also: whatever serves the built frontends. **Read `docs/deploy/railway-runbook.md`** — do not infer the serving arrangement from the Dockerfile.

**Interfaces:**
- Consumes: `Settings` from `app/core/config.py`.
- Produces: `SecurityHeadersMiddleware`. This is one of the few legitimate edits to `main.py` — it is middleware, not a router, and routers are what discovery mounts.

- [ ] **Step 1: Write the failing test**

```python
def test_every_response_carries_the_security_headers(client):
    response = client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=()" in response.headers["permissions-policy"]


def test_the_csp_permits_upay_to_frame_the_payment_form_and_nothing_else(client):
    csp = client.get("/api/v1/health").headers["content-security-policy"]
    assert "frame-src 'self' https://app.upay.co.il https://www.youtube-nocookie.com" in csp
    assert "default-src 'self'" in csp
    # The payment page must not itself be frameable — the clickjacking half of the PCI
    # argument, and the reason frame-ancestors is here and not just frame-src.
    assert "frame-ancestors 'none'" in csp
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/core/test_security_headers.py -q
```

Expected: FAIL — `KeyError`.

- [ ] **Step 3: Write the middleware**

```python
"""Security response headers, added 2026-09-08 (legal audit §6.4 -- there were none).

The CSP is the one that carries a compliance argument as well as a security one. The
family's payment happens in an <iframe> pointed at uPay, inside OUR page, and PCI DSS v4
put script-integrity duties on the page that hosts a payment frame. An explicit `frame-src`
is how that is stated; `frame-ancestors 'none'` is the other half -- our page may frame
uPay, and nobody may frame ours.

`connect-src` must list the API origin as well as 'self': the three PWAs are served from
different hosts than the api (see app/core/cors.py -- the refresh cookie is cross-origin in
every environment), so a policy of 'self' alone would block every request the app makes.
Get this wrong and the app fails with NO visible error, only a console line -- which is
exactly how a CSP ships broken.
"""
```

Build the policy from `Settings` rather than a literal, so staging and production each get their own origins. Then in `app/main.py`, beside the CORS middleware:

```python
app.add_middleware(SecurityHeadersMiddleware, settings=settings)
```

- [ ] **Step 4: Run the test**

```bash
.venv/bin/pytest tests/core/test_security_headers.py -q
```

Expected: PASS.

- [ ] **Step 5: Load the app and watch the console**

This is the step that catches a CSP which passes its test and breaks the product. Run all three apps, sign in, **open a payment**, and play a technique video, watching the browser console for CSP violation reports. A blocked request produces nothing on screen.

- [ ] **Step 6: Run the suites the change can reach**

```bash
.venv/bin/pytest tests/core -q && .venv/bin/mypy app
```

- [ ] **Step 7: Commit**

```bash
git add app/core/security_headers.py app/core/config.py app/main.py \
        tests/core/test_security_headers.py
git commit -m "feat(security): response headers, with a CSP that names the payment frame"
```

---

### Task 21: `rel="noopener noreferrer"` on outbound links

Spec §3. Five outbound links carry no `rel`, so each leaks the full referring URL to WhatsApp or Google and gives the opened page a handle on ours. Task 20's `Referrer-Policy` covers most of it; the `rel` closes the rest and is one attribute.

**Files:**
- Modify: `web/apps/parent/src/features/landing/BookingConfirmed.tsx:175`
- Modify: `web/apps/parent/src/features/landing/PublicLanding.tsx:629,637`
- Modify: `web/apps/parent/src/features/people/DirectionsScreen.tsx:74`
- Modify: `web/apps/parent/src/features/people/redesign/ContactSheet.tsx:83`
- Test: `web/apps/parent/src/features/landing/PublicLanding.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('hands no referrer and no window handle to WhatsApp or Google Maps', async () => {
  renderLanding('gladiator', clientReturning({ ...LANDING, slug: 'gladiator' }))
  const navigate = await screen.findByTestId('landing-navigate')
  expect(navigate).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByTestId('landing-whatsapp')).toHaveAttribute('rel', 'noopener noreferrer')
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: FAIL.

- [ ] **Step 3: Add the attribute to all five**

```tsx
  rel="noopener noreferrer"
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run web/apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/apps/parent/src/features/landing/BookingConfirmed.tsx \
        web/apps/parent/src/features/people/DirectionsScreen.tsx \
        web/apps/parent/src/features/people/redesign/ContactSheet.tsx \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx
git commit -m "fix(privacy): outbound links leak no referrer and no window handle"
```

---

## Phase 9 — The paperwork

### Task 22: The compliance documents

Spec §6.3. Not code, and last because it is the least urgent — not the least important. The system already implements the technical controls the Data Security Regulations ask for: encryption, an append-only audit log, role separation, tenant isolation that fails closed. What does not exist is any of the writing, and the writing is what an inspector or a claimant asks for first.

**Files:**
- Create: `docs/compliance/database-definitions.md`
- Create: `docs/compliance/information-security-procedure.md`
- Create: `docs/compliance/incident-response.md`
- Create: `docs/compliance/processors.md`
- Create: `docs/compliance/retention-schedule.md`
- Create: `NOTICES`

- [ ] **Step 1: The database definitions document**

What data is held, for what purpose, who may access it, where it physically lives, and how long it is kept. Derive it from `app/models/` rather than from memory — a definitions document that disagrees with the schema is worse than none.

- [ ] **Step 2: The information security procedure**

Write down what the system already does: the two database roles, the append-only grant on `audit_log`, `EncryptedJSON`/`EncryptedBytes` with keys in Railway secrets, `rewrap()` rotation that never decrypts, `TenantSession` failing closed, the log scrubber, and who holds which access.

- [ ] **Step 3: The incident response runbook**

Who decides an incident is severe, who notifies the Privacy Protection Authority, within what time, who tells affected families, and what is recorded. **Confirm the notification deadline with counsel** — do not write a number from memory.

- [ ] **Step 4: The processor register**

One row each for Railway (hosting and database), uPay (payments), Google (sign-in) and the push provider: what they process, under what agreement, where the data sits, and whether a signed data processing agreement exists. `privacy.policy.s6.body` already names these processors **to users**, which is a promise this register has to back.

- [ ] **Step 5: The retention schedule**

The policy already says financial records are kept about seven years for tax law, and that automatic deletion is planned but not in service. Both are honest, and both are promises with a deadline. Write down what is kept, for how long, and what triggers deletion — and record the unbuilt automatic deletion as an open item with an owner.

- [ ] **Step 6: `NOTICES`**

Rubik under the SIL Open Font License and lucide-react under ISC are both permissive and both require the licence text to travel with the distribution. Generate the file and check it in.

- [ ] **Step 7: Commit**

```bash
git add docs/compliance/ NOTICES
git commit -m "docs(compliance): the documents an inspector asks for first"
```

---

## Self-review

Run against the spec on 2026-09-08.

**Spec coverage.** Every finding maps to a task. §1 finding 1 → Task 6; finding 2 → Tasks 3, 4; finding 3 → Tasks 1, 2; finding 4 → Tasks 8, 11, 12; finding 5 → Task 10; finding 6 → Task 20. §3 → Tasks 7, 13, 21. §4.1 → Tasks 1, 2. §4.2 → Tasks 8, 10, 11, 12. §5.2 → Task 14. §5.3 items 1–5 → Tasks 15, 16, 17, 18, 19. §6.3 → Task 22. §6.4 → Task 20. §6.6 → Task 22 (`NOTICES`) and decision D5, which is owner action and correctly not tasked.

**Deliberately not tasked, and why.**

- **§5.3 item 6, automated accessibility assertions (axe or pa11y).** A dependency and a CI decision, not a compliance gap. Worth doing after Task 19 shows how much the linter already catches. Raise it then.
- **§5.3 item 7, `lang` on mixed-language content.** Real but small; it needs a pass over club-entered data rather than a code change, and it belongs with the external accessibility audit.
- **§3, a click-to-play facade for the YouTube embed.** A recommendation, not a duty. Task 7 discloses the embed honestly, which is what is required. Build the facade when the technique library is next touched.
- **§6.5, the WhatsApp anti-spam design.** Another session owns that spec. This plan flags it rather than acting on it: a `marketing` consent type, a per-channel opt-out, and a send path that refuses promotional content down a transactional route are cheap now and very expensive to retrofit. **Pass spec §6.5 to whoever is building it.**
- **Decision D5, photograph rights and consent.** Owner action. If any photograph lacks either, remove it from `web/apps/parent/public/clubs/` and from `GALLERY` — a one-line change once the answer exists.

**Placeholder scan.** Every `«…»` is a named owner decision (D1, D2 or D3), flagged at its task and listed in the Global Constraints table. No `TBD`s, no "add appropriate error handling", no "similar to Task N".

**Type consistency.** `PolicyDoc` is widened once, in Task 5, and consumed unchanged by Tasks 3, 6, 7 and 8. `SECTIONS` is one record keyed by `PolicyDoc`. `LegalFooter`'s signature grows in Task 10 and every caller is updated in the same task. `matchLegalPath` returns `{ doc: PolicyDoc } | null`, matching `matchLandingPath`'s existing `{ slug: string } | null`. `CancellationService.request` takes the same keyword arguments in Task 11's tests, its implementation, and Task 12's client.

**One ordering constraint, restated because getting it wrong is expensive.** Tasks 6, 7 and 8 all change reviewed legal text. Land all three, have them reviewed **together**, then run Task 9 once. A bump between them re-gates every family twice for no reason.

**Suggested order.** Tasks 1, 2, 3, 4 (no decisions, biggest risk reduction) → 13, 15, 16, 17, 18, 19, 21 (no decisions, accessibility and privacy hygiene) → 5 → 6, 7, 8 → 9 → 10 → 11, 12 → 14 → 20 → 22.
