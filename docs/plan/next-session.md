# Next steps — how to open the sessions that build M0

Companion to [milestone-plan.md](milestone-plan.md). That document says *what* M0 delivers.
This one is the running order: what to do off-keyboard, and the exact prompt to paste into
each session.

M0 is sequential on `main` — no worktrees yet. It is four sessions.

---

## Step 0 — before you type anything

These are SPEC.md §15's "required from you" items. Two of them gate day one, and the plan
cannot buy back the time if they slip.

> **Scope change, 2026-08-24.** The apps now ship as **installable PWAs** — no App Store, no
> Google Play. SPEC §6.5, §12, §14 and §15 are amended accordingly. That removes the Google
> Play developer account, the Apple Developer enrollment, the 12 testers and the 14-consecutive-
> day closed test from this list entirely. **Nothing gates day one any more** — the list below
> is real work, but none of it stops you starting Session 1 this evening.

| Do now | Why it cannot wait |
|---|---|
| **A stable HTTPS domain** for the apps — §15 #5 | Blocks M0. People will install this to their home screen from an invitation link; a random Railway subdomain reads as a phishing attempt and hurts install conversion, which is now the product's main adoption risk. |
| **The studio's הצהרת בריאות PDF** → `docs/forms/health-declaration.pdf` — §15 #1 | **Hard-blocks the entire M4 health lane.** The template derives from it. Get it before W3 opens, not during. |
| **One iPhone and one Android** to test on — §15 #4 | The iOS install walkthrough cannot be validated in a desktop browser. Needed from M1. |
| **3–5 real parents** willing to be walked through the iPhone install — §15 #6 | Needed at M11, before the club-wide invite. Their confusion is the only honest measure of whether the walkthrough works; your own phone will not tell you. |
| **`ru` translation source** — decide: real translation, or machine-translate with a native-speaker review — §15 #9 | Blocks M0's i18n scaffolding. Easy to forget until the namespace files need content. |
| **uPay merchant email + confirmation the account is live** — §15 #2 | Blocks W4. Third-party turnaround is not yours to control. |
| Studio logo (§15 #7) · price list per group (§15 #8) · real class/group structure and weekly schedule (§15 #10) | Needed by M1, M6 and M2 respectively. Collect them in one conversation with the club now rather than three interruptions later. |

**Also decide now:** conflict **C9** — the D9 canvas edits are recorded but not applied, so
`2b` still shows in-app chat, `7c` still shows the weight column, `12f` is still titled
`קבלות ותשלומים`. Either run a Claude Design edit pass on the canvas, or rely on the ▲ markers
in the plan and the correction baked into `canvas-porter`. The edit pass is safer — the mockup
is what a human opens at 2am, not a table in a plan.

---

## Session 1 — M0.1 · corrections, skeleton, install layer

Do this one first. It is small, it unblocks everything else, and it ends with three apps you
can actually install on a phone.

```
Read @docs/plan/milestone-plan.md — Global Constraints, Part 1 §1.3 (the four
seams), W0 · M0, and Part 5 (conflicts C1, C6, C7, C8).
Read @SPEC.md §6.5, §8.2, §8.3, §9. Read @CLAUDE.md.

This is M0.1. Sequential work on main — no worktrees.

FIRST, apply the four config corrections from Part 5. They are small and every
later session reads what they fix:
  C1 — CLAUDE.md §Layout still describes web/src/. SPEC §8.2 specifies npm
       workspaces with web/packages/{api-client,ui,core,i18n} and
       web/apps/{staff,parent,dashboard}. §8.2 wins. Amend CLAUDE.md §Layout,
       and amend its i18n line to the namespaced tree.
       Then re-scope .claude/rules/ui-rtl-a11y.md from "web/src/**" to
       ["web/apps/**", "web/packages/**"] — as written it currently matches
       zero files.
  C6 — delete POST /people/{id}/payment-mode from SPEC §7. §4.3 says explicitly
       there is no payment_mode on a person.
  C7 — .claude/rules/api.md says club_id. The schema uses studio_id. Fix it, and
       point the rule at §4.2's TenantMixin.
  C8 — .claude/settings.json allows Bash(pytest:*) but CLAUDE.md mandates
       .venv/bin/pytest, which does not match. Add the .venv/bin/ variants to
       allow, and add Bash(.venv/bin/alembic downgrade:*) to deny — the existing
       deny has the same prefix problem, so it protects nothing.

THEN build the skeleton:
  - The §8.2 monorepo tree. npm workspaces root at web/. There is no native/
    directory — §6.5 ships installable PWAs and no native shell.
  - The three Vite apps, each rendering one screen: a "hello" that proves the
    Rubik font loads, dir="rtl" applies, and light/dark both work.
  - CI: typecheck, lint, pytest, vitest, generated-api-client diff, dependency
    and secret scanning. A generated diff that is not committed fails the build.
  - Railway: dev, staging and production environments, on the real domain.
    Staging needs a public HTTPS URL — SPEC §15 item 3 needs it for IPN testing
    in W4.

THEN the PWA install layer (§6.5) — this is what replaced the store work, and it
is now the product's main adoption risk, so do not treat it as boilerplate:
  - A Web App Manifest per app: name, short_name, start_url, scope,
    display: standalone, theme and background colours from the D2 token layer,
    and a full icon set including iOS apple-touch-icon sizes.
  - Workbox service worker registered in all three apps. Precache the Rubik
    subset — §6.1's offline priming assumes the font is already there.
  - A useDisplayMode() hook in web/packages/core that reports standalone vs
    browser tab. M1's onboarding gate and M8's install reporting both read it,
    so it belongs in core, not in an app.
  - navigator.storage.persist() requested on boot in the staff app, with the
    result recorded — §10.6 requires pending_ops never be reclaimed, and iOS
    cannot fully guarantee that without a native container.
  - An installability check in CI (Lighthouse PWA audit, or equivalent) so a
    regression that quietly breaks installability fails the build rather than
    surfacing on a parent's phone.

Plan first with superpowers:writing-plans, then work the plan task by task:
failing test, confirm it fails, minimal implementation, green, commit.

Exit gate: all three apps install to the home screen on a real iPhone AND a real
Android, and launch standalone. Tell me the exact taps for the iPhone path — that
walkthrough is what M1 turns into an onboarding screen.
```

## Session 2 — M0.2 · the seams and the core

> **Ready-to-paste prompt:** [prompts/m0-2.md](prompts/m0-2.md) — written after M0.1 shipped, so it reflects what actually landed and names the two missing prerequisites (no Postgres service, no psycopg driver). Prefer it over the block below.

The load-bearing session. Everything in waves 2–5 depends on the four seam mechanisms
existing and being correct.

> **M0.2 SHIPPED (2026-08-24).** All four seams and items 1–7 below are on `main`. Exit
> gate met: `./scripts/lane-check.sh core` is green and `.venv/bin/alembic upgrade head`
> runs clean on a fresh database. What landed, and the parts that differ from what this
> block anticipated:
>
> - **Seam 1** — `alembic.ini`, `alembic/env.py`, revisions `0001_baseline` (roles,
>   default privileges, `studio`) and `0002_audit_log`. `alembic check` runs as a test, so
>   model/migration drift fails the build. The `block-protected.sh` hook had a real gap —
>   `*/alembic/versions/*` needs a prefix before `alembic`, so a bare relative path was
>   never blocked; fixed and asserted.
> - **Seam 4** — `web/packages/ui/src/slots.ts`. `SlotEntry` is generic rather than the
>   plan's `React.FC<any>`: `no-explicit-any` and `tsc --strict` both reject that, and
>   `Record<string, unknown>` fails too because props are contravariant.
> - **Tenancy** (§4.2) — `TenantSession`, `TenantMixin`, `with_all_tenants(reason=...)`.
>   Fails closed. `with_all_tenants` takes a **required reason**, which is an addition to
>   the spec's wording.
> - **Encryption** (§11.1) — a real envelope: a per-record DEK wrapped by a versioned KEK,
>   so `rewrap()` rotates a row without decrypting its payload. `EncryptedJSON` /
>   `EncryptedBytes` are ready for M3's `payload_encrypted`.
> - **Audit log** (§11.2) — append-only **by grant**. Two DB roles (`studio_migrator`,
>   `studio_app`) exist because one role cannot both own a table and be denied rights on
>   it. Proven by granting `UPDATE` back and watching three tests go red.
> - **Log scrubber** (§11.7) + `tests/invariants/` — SPEC §13's five, each with a
>   self-test proving its detector fires.
> - **`scripts/lane-check.sh`** and **`web/scripts/i18n-parity.mjs`** — note the path:
>   Node scripts live in `web/scripts/`, not the milestone plan's `scripts/`.
>
> **Settled after the session (2026-08-24):**
> - **PostgreSQL 18 everywhere.** Railway provisions 18; rather than maintain a 16 image
>   ourselves, SPEC §8.1a, `docker-compose.yml` and CI all moved to 18. Note the image
>   change that came with it: PG18 mounts its volume at `/var/lib/postgresql`, not
>   `/var/lib/postgresql/data` — the old path makes the container refuse to start.
> - **SPEC §15 item 9 — the `ru` source.** Machine-translated UI strings with a
>   native-speaker review before launch. `ru/common.ts` is now at full parity with `he`;
>   `i18n-parity.mjs` keeps `ru` on *report* until that review, then flips to *strict*.
>
> **One open item carried forward**, recorded in
> [the Railway runbook](../deploy/railway-runbook.md): the staging api still connects as
> the superuser rather than as `studio_app`. M1 closes it.

> **Already landed in M0.1 — do not rebuild:**
> - **Seam 2** (`app/main.py` + `app/models/__init__.py` pkgutil discovery), including the
>   `ENV == "production"` exclusion for the dev router. Note the plan's own snippet has a
>   bug — `app = FastAPI(...)` shadows the `app` package, so `app.routers.__path__` resolves
>   against the FastAPI instance and discovery silently finds nothing. The shipped version
>   aliases it to `routers_pkg`.
> - **Seam 3** (`web/packages/i18n`, nine namespaces × three locales, `index.ts` authored
>   once with every namespace including the 24 empty stubs).
>
> **Still to build here:** nothing — see the M0.2 SHIPPED note above. The prompt below is
> kept as the record of what was asked for.

```
Read @docs/plan/milestone-plan.md — Global Constraints, Part 1 §1.3 (all four
seams, with their code), and W0 · M0.
Read @SPEC.md §4.2, §8.3, §11.1, §11.2, §11.7, §13.
Read @CLAUDE.md.

This is M0.2. Sequential on main.

BUILD, in this order:

1. The two remaining seam mechanisms from Part 1 §1.3. Seams 2 and 3 already
   landed in M0.1 — read app/main.py and web/packages/i18n/index.ts first and
   leave them alone.
     - Alembic baseline; alembic/versions/** stays owned by main (the
       block-protected.sh hook already enforces this)
     - web/packages/ui/src/slots.ts — the slot registry

2. Tenancy (§4.2): TenantSession dependency, TenantMixin with the default
   studio_id filter, and the .with_all_tenants() escape hatch legal only in
   platform-admin code and deliberate cross-studio jobs.

3. Encryption (§11.1): AES-256-GCM envelope, keys in Railway secrets and never
   in the database, versioned so rotation does not require re-encrypting
   everything. M3 needs this for registration_request.payload_encrypted, not
   just M4.

4. Audit log (§11.2): append-only. The application DB role gets INSERT and no
   UPDATE or DELETE. Assert that in a test against the actual grants.

5. The log scrubber, and the test that sensitive fields never serialize into log
   output.

6. tests/invariants/ — SPEC §13's five non-negotiables. Three and five will
   assert vacuously true until M6 exists; that is correct and intended. They
   must exist now so no lane can land the first violation unnoticed.

7. scripts/lane-check.sh and scripts/i18n-parity.mjs. The plan gives
   lane-check.sh in full. Every lane in every wave runs it as its one command,
   so it has to be right.

Plan first with superpowers:writing-plans. Per task: failing test, confirm it
fails, minimal implementation, green, commit.

Exit gate: ./scripts/lane-check.sh core is green, and
.venv/bin/alembic upgrade head is clean on a fresh database.
```

---

## Session 3 — M0.3 · the design system

```
Read @docs/plan/milestone-plan.md — Global Constraints G10–G14, and W0 · M0.
Read @docs/design/decisions.md in full — D1, D2, D3, D4, D6, D7, D8, D10.
Read @docs/design/canvas-review.md — the contrast audit at the bottom.
Read @SPEC.md §9.

This is M0.3. Sequential on main.

Use the canvas-porter agent on dashboard artboard 4h — ספריית רכיבים, the
component library. decisions.md calls it "the highest-value artboard for the code
port, the intended source for the token and component layer." Do NOT open the
.dc.html yourself; it is ~856 KB of inline styles and will swamp this session.

BUILD:
  - The token layer, in D2's three tiers. Brand tokens exist but are not
    settable in v1 (D1 — logo only). Semantic tokens (debt · paid · pending ·
    cancelled · danger · focus ring) and structural tokens are never
    overridable.
  - Light and dark palettes as separate token sets. Per D8, #a8a49a and #8f8b82
    are DARK-MODE-ONLY tokens — they fail AA on the light ground at 2.28:1 and
    3.12:1. #7a766d is retired outright. #6f6b62 is the floor for any light-mode
    text token. Do not fix this by lightening the ground; the ground is #f7f5f1
    by design.
  - Rubik, weights 300/400/500/600/700, one family, one loading strategy — it is
    the only family covering Hebrew, Latin AND base Cyrillic (D6). Cache it for
    offline (§6.1's offline priming assumes the font is already there).
  - Light / Dark / System, user-settable, on both apps (D4).
  - The UI primitives 4h defines. The BeltBar primitive carries a 1px ring in
    the current foreground colour — #17150f on light, #fffefb on dark — and there
    is no fill-only variant to reach for (D7). Fill alone makes white invisible
    on light at 1.08:1, black invisible on dark at 1.02:1, and yellow fail even
    the 3:1 non-text threshold at 2.02:1.
  - The D10 ESLint rule, banning margin-left / margin-right / padding-left /
    padding-right / left: / right: across web/apps/** and web/packages/**.
    Write it BEFORE the first component, which is the whole point of D10.

Every component gets a vitest + Testing Library test rendering it in both he
(RTL) and en (LTR), per §13.

Treat the exported canvas CSS as a VISUAL REFERENCE ONLY. Never copy-paste it —
Manager Dashboard.dc.html carries 14 physical CSS declarations and zero logical
ones.

Plan first with superpowers:writing-plans.
```

---

## Session 4 — M0.4 · the demo studio and the dev bar

```
Read @docs/plan/milestone-plan.md — W0 · M0.
Read @SPEC.md §19 in full.
In @docs/architecture.html read "The demo studio", "The role switcher",
"Personas", "The dev bar", "The four tools, and what each makes testable" and
"What it cannot do".

This is M0.4, the last of M0. Sequential on main.

architecture.html is explicit that this is built in M0, not last: "Every later
milestone is then testable end to end from the day it lands, instead of waiting
for real data to exist." That is the entire reason it is here.

BUILD:
  - The demo studio, seeded from a versioned fixture set, is_demo = true.
  - The developer account. is_developer is settable ONLY by seed or migration —
    write the test asserting no route can write that column.
  - The role switcher and its personas: owner · manager · lead coach · assistant
    coach · parent with 3 children · parent with 1 child · trial parent ·
    parent+coach · no permissions. There is no student persona — students have
    no login in v1 — and the dev bar says so explicitly rather than leaving a
    confusing gap.
  - The dev bar, rendered only for is_developer, and TREE-SHAKEN OUT of
    production client bundles by an env flag — not merely hidden.
  - Its four tools, registered through the 'dev-bar' slot so M5 and M6 can fill
    theirs later without reopening the container:
      offline / slow simulation      → M5 fills
      time travel via X-Dev-Now      → M6 fills (non-prod only)
      run a job now                  → M6/M8 fill
      simulate a uPay IPN            → M6 fills
    Build the container and the registry now; the tools arrive with their lanes.
  - POST /dev/demo/reset restoring the fixture set, plus the nightly staging
    reset so the data cannot drift into a state that hides a bug.

THE FIVE RESTRICTIONS, each with a test — these are what make the whole thing
safe to ship:
  - Cannot act inside a non-demo studio in production. The studio resolver
    excludes is_demo = false for developer sessions in production.
  - Cannot reach /dev/* in production. The router is CONDITIONALLY MOUNTED —
    when ENV = production the routes DO NOT EXIST, rather than being guarded by
    an if someone can invert. (Session 2 built this; assert it here.)
  - Cannot read any real person's health declaration. Real-data support goes
    through break-glass, which excludes health contents entirely, and the
    developer flag does not change that.
  - Cannot grant itself the flag, or grant it to anyone.
  - Cannot touch live money. The demo studio's uPay config is pinned to
    livesystem=0, and a test asserts a demo studio can never render a live
    payment form.

DEMO DATA HYGIENE: the demo studio is excluded from platform_studio_stats, from
every cross-studio report, and from the operations-board totals.

Plan first with superpowers:writing-plans.

Exit gate for all of M0: ./scripts/lane-check.sh core green, all three apps
installing and running standalone on a real iPhone and a real Android, and every
one of the five restrictions covered by a passing test.
```

---

## After M0

| Then | Sessions | Notes |
|---|---|---|
| **W1 · M1** Identity & structure | sequential on main, 2–3 sessions | Auth, roles, classes/groups/locations, both app shells, the platform console's provisioning half, the setup wizard container. Everything downstream imports it. **Also seed the `kind='trial'` health template here** — conflict C3, it is what unblocks M3's trial booking. **And the iOS install walkthrough** (§6.5) — the invitation link detects iOS Safari and shows a screenshotted Add-to-Home-Screen guide, and first run does not proceed until the app is standalone. Verify on a real device that the OAuth redirect survives the round trip in standalone mode; that is the one place install mode changes auth behaviour. |
| **W2 · M2 ∥ M3** | first parallel wave | Contract commit on main first, then the worktree commands and opening prompts in [lanes.md](lanes.md) §2 and §3. This is where the plan stops being sequential. |

Do not create a worktree before that wave's contract commit is pushed. A lane branched from a
pre-contract `main` will invent its own version of the seam, which is exactly what the contract
exists to prevent.
