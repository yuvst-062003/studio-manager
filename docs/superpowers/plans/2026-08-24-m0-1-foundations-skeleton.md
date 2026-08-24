# M0.1 — Config corrections, monorepo skeleton, CI, Railway, PWA install layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four Part 5 config corrections, then the SPEC §8.2 monorepo with three
installable-PWA Vite apps, a CI gate that fails on regressions, and Railway dev/staging/production.

**Architecture:** npm workspaces rooted at `web/`, four shared packages and three apps.
A minimal FastAPI app exists only so the generated-api-client CI gate has a real OpenAPI
source rather than a vacuous one; it is created in its final Seam-2 discovery form so no later
wave has to reopen `app/main.py`. The PWA layer is per-app (own origin, own manifest, own
service-worker scope) because staff and parent apps must not share origin storage — §10.6's
`pending_ops` and G7's health data sit in IndexedDB.

**Tech Stack:** React 19 · TS 5.9 · Vite 7 · vite-plugin-pwa (Workbox) · Vitest 3 ·
ESLint 9 flat config · Playwright (Chromium, installability gate) · FastAPI · Railway.

**Spec:** [SPEC.md](../../../SPEC.md) §6.5, §8.2, §8.3, §9, §10.6, §15 ·
[milestone-plan.md](../../plan/milestone-plan.md) Global Constraints, §1.3, W0·M0, Part 5 ·
[decisions.md](../../design/decisions.md) D1–D10.

---

## Global Constraints

Copied verbatim from their sources. Every task inherits all of them.

| # | Constraint | Source |
|---|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md §Commands |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem` **regardless of locale**. | SPEC §8.3, §9 |
| G4 | No user-facing string is ever inlined in a component. Everything goes through the i18n package. | SPEC §8.3 |
| G5 | New API endpoints are versioned under `/api/v1/`. | CLAUDE.md §Conventions |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. | SPEC §7, CLAUDE.md |
| G7 | Health declarations contain personal data about minors. **Never log their contents.** | CLAUDE.md §Gotchas |
| G11 | `#6f6b62` is the floor for any **light-mode** text token. `#a8a49a` and `#8f8b82` are **dark-mode-only**. `#7a766d` is retired outright. | D8 |
| G12 | Physical CSS properties (`margin-left`, `padding-right`, `left:`, `right:`) are banned by ESLint in all frontend source. Exported canvas CSS is a **visual reference only**. | D10 |
| G13 | Colours live in named tokens, never hardcoded hex. Semantic tokens are **never overridable**. | D1, D2 |
| G14 | Typeface is **Rubik**, one family, weights 300/400/500/600/700. | D6 |
| G17 | **Both apps are installable PWAs — no App Store, no Play listing.** On iOS there is no way to *trigger* an install (`beforeinstallprompt` is Chromium-only). Treat the install as part of onboarding. | §6.5, §12 |
| G18 | A failing test is written before any bug fix. Prefer a single test file over the full suite. | CLAUDE.md §Workflow |

**Exact palette** — from the `4h` artboard audit, D7 and D8:

| Role | Light | Dark |
|---|---|---|
| ground | `#f7f5f1` | `#141311` |
| surface | `#fffefb` | `#1e1d1a` |
| foreground | `#17150f` | `#fffefb` |
| text-secondary | `#55524a` | `#a8a49a` |
| text-muted | `#6f6b62` (floor) | `#8f8b82` |
| border | `#e6e1d6` | `#3a3833` |
| accent | `#1f6b3f` | `#3f8f52` |
| danger | `#b3261e` | `#ff8a7d` |

---

## Decisions taken before writing this plan

1. **Domain — Railway-generated subdomains for now.** §15 item 5 (stable HTTPS domain) is
   still open. Manifests use *relative* `start_url`/`scope`, so they do not depend on it.
   The domain appears in exactly one place — `infra/railway/domains.json` — so swapping it in
   later is a one-file change. This unblocks §15 item 3 (public HTTPS staging URL for uPay
   IPN testing in W4) today.
2. **Installability gate is Playwright + CDP, not Lighthouse.** Lighthouse removed the PWA
   category in v12, so `--only-categories=pwa` no longer exists. Task 10 verifies this
   empirically before committing to the replacement.
3. **The D10 ESLint rule is included** (Task 2), although it is C1 item 3 and was not in the
   session brief. An ESLint config is required for CI's lint step regardless, and D10 says
   "before the first component exists" — which is now. Flagged for veto.
4. **Per-app origins, not path scopes.** Staff and parent apps get separate subdomains so they
   do not share origin-scoped IndexedDB.

## Explicitly out of scope for M0.1

Remaining W0·M0 work, not started here: Alembic baseline (Seam 1) · `TenantMixin` /
`TenantSession` (§4.2) · AES-256-GCM envelope (§11.1) · append-only `audit_log` (§11.2) ·
log scrubber · the `4h` component library port beyond the token layer · the slot registry
(Seam 4) · demo studio seed, developer account, dev bar (§19) · `scripts/lane-check.sh` ·
`scripts/i18n-parity.mjs` · iOS `apple-touch-startup-image` splash set.

---

## File structure

```
.claude/rules/api.md                   MODIFY  club_id → studio_id, cite §4.2 TenantMixin
.claude/rules/ui-rtl-a11y.md           MODIFY  paths → web/apps/**, web/packages/**
.claude/settings.json                  MODIFY  .venv/bin allow + deny entries
CLAUDE.md                              MODIFY  §Layout → §8.2 tree; i18n line → namespaced
SPEC.md                                MODIFY  delete POST /people/{id}/payment-mode

tests/config/test_repo_config.py       CREATE  regression guard for all four corrections
app/main.py                            CREATE  Seam 2 — router discovery, never edited again
app/models/__init__.py                 CREATE  Seam 2 — model discovery, never edited again
app/core/config.py                     CREATE  ENV settings
app/routers/health.py                  CREATE  the only router in M0.1
scripts/export_openapi.py              CREATE  OpenAPI → openapi.json
tests/test_health.py                   CREATE
tests/test_router_discovery.py         CREATE

web/package.json                       CREATE  npm workspaces root
web/tsconfig.base.json                 CREATE
web/eslint.config.js                   CREATE  D10 rule + i18n-only-strings
web/vitest.config.ts                   CREATE  projects across packages + apps
web/packages/i18n/                     CREATE  Seam 3 — index.ts + he|en|ru × 9 namespaces
web/packages/ui/                       CREATE  tokens.css, fonts.css, ThemeProvider
web/packages/core/                     CREATE  useDisplayMode, requestPersistentStorage
web/packages/api-client/               CREATE  generated schema.d.ts + hand-written index.ts
web/apps/{staff,parent,dashboard}/     CREATE  Vite app, manifest, SW, hello screen

scripts/generate-icons.mjs             CREATE  SVG mark → PNG icon set (sharp)
scripts/check-installability.mjs       CREATE  the CI installability gate
infra/railway/domains.json             CREATE  the single place a domain is named
.github/workflows/ci.yml               CREATE
docs/install/ios-walkthrough.md        CREATE  the exact taps — M1 turns this into a screen
```

---

### Task 1: The four config corrections (C1, C6, C7, C8)

All four are edits to checked-in config that every later session reads. They ship as one task
with one regression guard, because a reviewer would accept or reject them together.

**Files:**
- Modify: `CLAUDE.md` (§Layout lines 23–26, §Conventions line 31)
- Modify: `.claude/rules/ui-rtl-a11y.md:3`
- Modify: `.claude/rules/api.md:10`
- Modify: `.claude/settings.json`
- Modify: `SPEC.md:1460`
- Create: `tests/config/test_repo_config.py`

**Interfaces:**
- Produces: nothing importable. Later tasks rely on `web/apps/**` and `web/packages/**` being
  the paths the RTL rule matches, and on `.venv/bin/pytest` no longer prompting.

- [ ] **Step 1: Write the failing test**

`tests/config/test_repo_config.py`:

```python
"""Regression guard for the Part 5 config corrections (C1, C6, C7, C8).

Each of these was a real defect: a rule scoped to a path that never exists matches
zero files while appearing configured, and an allowlist that does not match the
mandated command prompts on every call.
"""

import json
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{path} has no YAML frontmatter"
    _, fm, _ = text.split("---", 2)
    return yaml.safe_load(fm)


# ── C1 ──────────────────────────────────────────────────────────────────────
def test_c1_claude_md_layout_matches_spec_8_2():
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "web/src/" not in text, "CLAUDE.md still describes the single-app web/src/ layout"
    for expected in (
        "web/packages/api-client",
        "web/packages/ui",
        "web/packages/core",
        "web/packages/i18n",
        "web/apps/staff",
        "web/apps/parent",
        "web/apps/dashboard",
    ):
        assert expected in text, f"CLAUDE.md §Layout is missing {expected}"


def test_c1_claude_md_i18n_line_is_namespaced():
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "web/src/i18n/he.ts" not in text
    assert "web/packages/i18n/he/" in text


def test_c1_rtl_rule_is_scoped_to_paths_that_exist():
    rule = ROOT / ".claude/rules/ui-rtl-a11y.md"
    paths = _frontmatter(rule)["paths"]
    assert paths == ["web/apps/**", "web/packages/**"], paths
    # The defect this guards: a glob that matches nothing reads as protection.
    for glob in paths:
        root = ROOT / glob.split("/**")[0]
        assert root.is_dir(), f"rule path {glob} matches zero files — {root} does not exist"


# ── C6 ──────────────────────────────────────────────────────────────────────
def test_c6_spec_does_not_offer_a_payment_mode_endpoint():
    text = (ROOT / "SPEC.md").read_text(encoding="utf-8")
    assert "payment-mode" not in text, (
        "§4.3 states there is no payment_mode on a person; §7 must not list the endpoint"
    )


# ── C7 ──────────────────────────────────────────────────────────────────────
def test_c7_api_rule_uses_studio_id_and_names_the_mechanism():
    text = (ROOT / ".claude/rules/api.md").read_text(encoding="utf-8")
    assert "club_id" not in text, "the schema has no club_id column"
    assert "studio_id" in text
    assert "TenantMixin" in text, "the enforcement mechanism should be named, not implied"


# ── C8 ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "pattern",
    [
        "Bash(.venv/bin/pytest:*)",
        "Bash(.venv/bin/ruff:*)",
        "Bash(.venv/bin/mypy:*)",
        "Bash(.venv/bin/alembic upgrade:*)",
        "Bash(./scripts/lane-check.sh:*)",
        "Bash(npx eslint:*)",
        "Bash(git worktree:*)",
    ],
)
def test_c8_allowlist_matches_the_mandated_commands(pattern):
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    assert pattern in settings["permissions"]["allow"]


def test_c8_alembic_downgrade_deny_actually_matches():
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    deny = settings["permissions"]["deny"]
    assert "Bash(.venv/bin/alembic downgrade:*)" in deny, (
        "G1 mandates the .venv/bin prefix, so a bare `alembic downgrade` deny protects nothing"
    )
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pip install pyyaml pytest
.venv/bin/pytest tests/config/test_repo_config.py -q
```

Expected: 8+ failures — `web/src/` still present, rule paths still `["web/src/**"]`,
`payment-mode` still in SPEC.md, allowlist entries absent.

- [ ] **Step 3: Apply C1 — CLAUDE.md §Layout**

Replace lines 23–26 of `CLAUDE.md`:

```markdown
## Layout
- `app/` FastAPI: `routers/`, `services/`, `models/`, `schemas/`, `workers/`,
  `integrations/upay/`, `core/` (auth, tenancy, encryption, audit, config)
- `alembic/` migrations — `main` owns `alembic/versions/**`. Lanes never run
  `alembic revision`; one revision per wave lands in the wave's contract commit.
- `web/` npm workspaces root
  - `web/packages/api-client/` generated from OpenAPI — never hand-edited
  - `web/packages/ui/` RTL/LTR-aware design system, tokens, primitives
  - `web/packages/core/` shared hooks, formatting, permissions, offline queue
  - `web/packages/i18n/` namespaced locale files (see §Conventions)
  - `web/apps/staff/` managers + coaches
  - `web/apps/parent/` guardians + adult students
  - `web/apps/dashboard/` manager web
- There is **no** `native/` directory. §6.5 ships installable PWAs — no App Store
  build, no Play listing, no native shell.
- Business logic lives in `services/`. Routers stay thin — parse, call a service, return.
- `app/main.py` and `app/models/__init__.py` mount routers and models by **discovery**.
  Adding `app/routers/attendance.py` mounts it. Never edit either file to register something.
```

- [ ] **Step 4: Apply C1 — the i18n line**

Replace line 31 of `CLAUDE.md`:

```markdown
- Hebrew user-facing strings live in `web/packages/i18n/he/<namespace>.ts` — one namespace
  file per feature vertical (`common`, `schedule`, `people`, `health`, `attendance`,
  `billing`, `events`, `comms`, `reports`), mirrored in `en/` and `ru/`. Never inline a
  string in a component. `web/packages/i18n/index.ts` lists every namespace and is authored
  once — a lane never edits it. A single `he.ts` would serialize every wave.
```

- [ ] **Step 5: Apply C1 — re-scope the RTL rule**

`.claude/rules/ui-rtl-a11y.md` frontmatter:

```yaml
---
paths:
  - "web/apps/**"
  - "web/packages/**"
---
```

- [ ] **Step 6: Apply C6 — delete the stale endpoint**

In `SPEC.md:1460`, the line currently reads:

```
POST   /people/{id}/payment-mode          GET  /me/students
```

Replace with:

```
GET    /me/students
```

- [ ] **Step 7: Apply C7 — `.claude/rules/api.md`**

Replace the last line:

```markdown
- Any endpoint touching student data must filter by the caller's `studio_id`. Tenancy is
  enforced by `TenantMixin` / `TenantSession` (SPEC §4.2) — every tenant-scoped table carries
  a non-null `studio_id` with a leading composite index. Bypassing it requires the explicit
  `.with_all_tenants()` escape hatch, which is never valid in a request-scoped path.
```

- [ ] **Step 8: Apply C8 — `.claude/settings.json`**

Add to `permissions.allow`:

```json
"Bash(.venv/bin/pytest:*)",
"Bash(.venv/bin/ruff:*)",
"Bash(.venv/bin/mypy:*)",
"Bash(.venv/bin/alembic upgrade:*)",
"Bash(./scripts/lane-check.sh:*)",
"Bash(npx eslint:*)",
"Bash(git worktree:*)"
```

Add to `permissions.deny`:

```json
"Bash(.venv/bin/alembic downgrade:*)"
```

- [ ] **Step 9: Run the tests**

```bash
.venv/bin/pytest tests/config/test_repo_config.py -q
```

Expected: all pass **except** `test_c1_rtl_rule_is_scoped_to_paths_that_exist`, which still
fails — `web/apps/` and `web/packages/` do not exist yet. That failure is correct and is
retired by Task 6. Mark it `xfail(strict=True)` with reason `"web/ tree lands in Task 6"`,
and delete the marker in Task 6.

- [ ] **Step 10: Commit**

```bash
git add CLAUDE.md SPEC.md .claude/rules/ .claude/settings.json tests/config/
git commit -m "fix(config): resolve Part 5 conflicts C1, C6, C7, C8

C1 CLAUDE.md §Layout described web/src/, which SPEC §8.2 replaces with npm
   workspaces. The damage was not stylistic: ui-rtl-a11y.md was scoped to
   web/src/** and therefore matched zero files while reading as configured.
C6 §7 listed POST /people/{id}/payment-mode, which §4.3 explicitly forbids.
C7 api.md said club_id; the schema uses studio_id.
C8 the allowlist did not match the .venv/bin commands G1 mandates, and the
   alembic downgrade deny had the same prefix problem, so it protected nothing."
```

---

### Task 2: npm workspaces root and shared tooling

**Files:**
- Create: `web/package.json`, `web/tsconfig.base.json`, `web/eslint.config.js`,
  `web/vitest.config.ts`, `web/.gitignore`
- Test: `web/tools/__tests__/d10-logical-css.test.ts`

**Interfaces:**
- Produces: workspace package names `@studio/ui`, `@studio/core`, `@studio/i18n`,
  `@studio/api-client`, `@studio/staff`, `@studio/parent`, `@studio/dashboard`.
  Root scripts `typecheck`, `lint`, `test`, `build` that later tasks and CI call.

- [ ] **Step 1: Write the failing test**

`web/tools/__tests__/d10-logical-css.test.ts` — asserts the D10 rule actually rejects a
physical property. Linting a fixture is the only way to prove a lint rule is live.

```ts
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const lintText = async (code: string) => {
  const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
  const [result] = await eslint.lintText(code, { filePath: 'apps/staff/src/Fixture.tsx' })
  return result.messages.map((m) => m.message).join('\n')
}

describe('D10 — physical CSS properties are banned before the first component', () => {
  it('rejects marginLeft in a style object', async () => {
    const out = await lintText(`export const A = () => <div style={{ marginLeft: 8 }} />`)
    expect(out).toMatch(/marginInlineStart/)
  })

  it('rejects a bare left offset', async () => {
    const out = await lintText(`export const A = () => <div style={{ left: 0 }} />`)
    expect(out).toMatch(/insetInlineStart/)
  })

  it('accepts the logical equivalent', async () => {
    const out = await lintText(
      `export const A = () => <div style={{ marginInlineStart: 8 }} />`,
    )
    expect(out).not.toMatch(/marginInlineStart is banned/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd web && npx vitest run tools/__tests__/d10-logical-css.test.ts --reporter=dot
```

Expected: FAIL — no `package.json`, no eslint.

- [ ] **Step 3: Create the workspace root**

`web/package.json`:

```json
{
  "name": "@studio/web",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "tsc --build --verbose",
    "lint": "eslint . && stylelint \"**/*.css\"",
    "test": "vitest run --reporter=dot",
    "build": "npm run build --workspaces --if-present",
    "installability": "node ../scripts/check-installability.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "jsdom": "^25.0.0",
    "stylelint": "^16.10.0",
    "stylelint-config-standard": "^36.0.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.15.0",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^0.21.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Create `web/tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `web/eslint.config.js` with the D10 rule**

The `PHYSICAL` map is the rule's whole point: the message must name the logical replacement,
because "don't use marginLeft" without "use marginInlineStart" gets worked around rather than
fixed.

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// D10 — physical properties are banned in favour of their logical equivalents.
// RTL bugs of this kind are nearly invisible to an LTR reader, so they survive
// review and surface in front of Hebrew-speaking users.
const PHYSICAL = {
  marginLeft: 'marginInlineStart',
  marginRight: 'marginInlineEnd',
  paddingLeft: 'paddingInlineStart',
  paddingRight: 'paddingInlineEnd',
  borderLeft: 'borderInlineStart',
  borderRight: 'borderInlineEnd',
  borderLeftWidth: 'borderInlineStartWidth',
  borderRightWidth: 'borderInlineEndWidth',
  borderLeftColor: 'borderInlineStartColor',
  borderRightColor: 'borderInlineEndColor',
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
  textAlignLeft: 'textAlign: "start"',
}

const physicalPropertySyntax = Object.entries(PHYSICAL).map(([bad, good]) => ({
  selector: `Property[key.name="${bad}"]`,
  message: `D10: ${bad} is banned — use ${good}. The UI is genuinely bidirectional (SPEC §9).`,
}))

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', '**/*.gen.ts', '**/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...physicalPropertySyntax],
      // G4 — no user-facing string is ever inlined in a component.
      'no-restricted-syntax-jsx-text': 'off',
    },
  },
  {
    // G4 enforcement: literal text between JSX tags must come from i18n.
    // Scoped to apps because packages/ui primitives take text as props.
    files: ['apps/*/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...physicalPropertySyntax,
        {
          selector: 'JSXText[value=/[A-Za-z\\u0590-\\u05FF]{2,}/]',
          message:
            'G4: no user-facing string is inlined in a component. Use t() from @studio/i18n.',
        },
      ],
    },
  },
)
```

- [ ] **Step 6: Create `web/.stylelintrc.json` — D10 for `.css`**

ESLint cannot see `.css` files, and `tokens.css` is where physical properties are most likely
to be copy-pasted from the exported canvas.

```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "property-disallowed-list": [
      "margin-left", "margin-right", "padding-left", "padding-right",
      "border-left", "border-right", "left", "right",
      "border-top-left-radius", "border-top-right-radius",
      "border-bottom-left-radius", "border-bottom-right-radius"
    ],
    "declaration-property-value-disallowed-list": {
      "text-align": ["left", "right"],
      "float": ["left", "right"]
    },
    "custom-property-pattern": null
  }
}
```

- [ ] **Step 7: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'tools', include: ['tools/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'packages',
          include: ['packages/*/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'apps',
          include: ['apps/*/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
```

`web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 8: Create `web/.gitignore`**

```
node_modules/
dist/
dev-dist/
*.tsbuildinfo
.vite/
```

- [ ] **Step 9: Install and run the test**

```bash
cd web && npm install && npx vitest run tools/__tests__/d10-logical-css.test.ts --reporter=dot
```

Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.base.json web/eslint.config.js \
        web/.stylelintrc.json web/vitest.config.ts web/vitest.setup.ts web/.gitignore web/tools/
git commit -m "feat(web): npm workspaces root, D10 logical-CSS lint rule, vitest projects

Closes C1 item 3 — D10's rule was scoped to web/src/**, which SPEC §8.2 means
never exists. Rewritten against web/apps/** and web/packages/**, and proved live
by linting a fixture rather than by asserting the config file's contents."
```

---

### Task 3: `@studio/i18n` — Seam 3, namespaced

**Files:**
- Create: `web/packages/i18n/{package.json,tsconfig.json,index.ts,types.ts}`
- Create: `web/packages/i18n/{he,en,ru}/{common,schedule,people,health,attendance,billing,events,comms,reports}.ts`
- Test: `web/packages/i18n/src/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Locale = 'he' | 'en' | 'ru'`
  - `type Namespace = 'common' | 'schedule' | 'people' | 'health' | 'attendance' | 'billing' | 'events' | 'comms' | 'reports'`
  - `const DIRECTION: Record<Locale, 'rtl' | 'ltr'>`
  - `function t(locale: Locale, key: string): string` — dotted `"<namespace>.<key>"`,
    falls back to `he`, returns the key itself if absent in `he` too.
  - `const REFERENCE_LOCALE: Locale = 'he'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { DIRECTION, NAMESPACES, REFERENCE_LOCALE, t, bundles } from '../index'

describe('locale direction (SPEC §9)', () => {
  it('he is RTL, en and ru are LTR', () => {
    expect(DIRECTION.he).toBe('rtl')
    expect(DIRECTION.en).toBe('ltr')
    expect(DIRECTION.ru).toBe('ltr')
  })
})

describe('Seam 3 — namespaces exist for every vertical in every locale', () => {
  it('lists all nine namespaces', () => {
    expect(NAMESPACES).toEqual([
      'common', 'schedule', 'people', 'health',
      'attendance', 'billing', 'events', 'comms', 'reports',
    ])
  })

  it.each(['he', 'en', 'ru'] as const)('%s has a file for every namespace', (locale) => {
    for (const ns of NAMESPACES) {
      expect(bundles[locale][ns], `${locale}/${ns}.ts missing`).toBeDefined()
    }
  })
})

describe('fallback (SPEC §9 — Hebrew is the reference locale)', () => {
  it('returns the Hebrew string when a key is missing in ru', () => {
    expect(t('ru', 'common.appName.staff')).toBe(t('he', 'common.appName.staff'))
  })

  it('returns the translated string when present', () => {
    expect(t('en', 'common.hello')).toBe('Hello')
    expect(t('he', 'common.hello')).toBe('שלום')
  })

  it('returns the key itself when absent everywhere, rather than throwing', () => {
    expect(t('he', 'common.nope')).toBe('common.nope')
  })
})

describe('REFERENCE_LOCALE', () => {
  it('is he', () => expect(REFERENCE_LOCALE).toBe('he'))
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd web && npx vitest run packages/i18n --reporter=dot
```

Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Create `web/packages/i18n/package.json`**

```json
{
  "name": "@studio/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": { ".": "./index.ts" }
}
```

- [ ] **Step 4: Create `types.ts`**

```ts
export const LOCALES = ['he', 'en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * One namespace per feature vertical. Seam 3 of the parallel plan: a lane owns
 * `*/<its vertical>.ts` in all three locales and nothing else, so two lanes never
 * touch the same file. A single he.ts would conflict on every wave.
 */
export const NAMESPACES = [
  'common', 'schedule', 'people', 'health',
  'attendance', 'billing', 'events', 'comms', 'reports',
] as const
export type Namespace = (typeof NAMESPACES)[number]

export type Bundle = Record<string, string>

/** SPEC §9 — Hebrew is RTL; English and Russian are LTR. */
export const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  he: 'rtl',
  en: 'ltr',
  ru: 'ltr',
}

/** Missing keys in en/ru fall back to he and are reported per-locale (SPEC §9). */
export const REFERENCE_LOCALE: Locale = 'he'
```

- [ ] **Step 5: Create the locale files**

`he/common.ts` — the only one with content in M0.1:

```ts
import type { Bundle } from '../types'

export const common: Bundle = {
  hello: 'שלום',
  'appName.staff': 'סטודיו — צוות',
  'appName.parent': 'סטודיו — הורים',
  'appName.dashboard': 'סטודיו — ניהול',
  'hello.title': 'הבסיס עובד',
  'hello.fontProof': 'אבגד הוזח · ABCD efgh · АБВГ абвг · 0123',
  'hello.direction': 'כיוון הכתיבה',
  'hello.theme': 'ערכת נושא',
  'theme.light': 'בהיר',
  'theme.dark': 'כהה',
  'theme.system': 'מערכת',
  'displayMode.standalone': 'מותקן במסך הבית',
  'displayMode.browser': 'פועל בדפדפן',
  'storage.persisted': 'אחסון קבוע אושר',
  'storage.notPersisted': 'אחסון קבוע לא אושר',
  'storage.unsupported': 'אחסון קבוע לא נתמך בדפדפן הזה',
}
```

`en/common.ts`:

```ts
import type { Bundle } from '../types'

export const common: Bundle = {
  hello: 'Hello',
  'appName.staff': 'Studio — Staff',
  'appName.parent': 'Studio — Parents',
  'appName.dashboard': 'Studio — Management',
  'hello.title': 'The foundation works',
  'hello.fontProof': 'אבגד הוזח · ABCD efgh · АБВГ абвг · 0123',
  'hello.direction': 'Writing direction',
  'hello.theme': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'displayMode.standalone': 'Installed to home screen',
  'displayMode.browser': 'Running in a browser tab',
  'storage.persisted': 'Persistent storage granted',
  'storage.notPersisted': 'Persistent storage not granted',
  'storage.unsupported': 'Persistent storage unsupported in this browser',
}
```

`ru/common.ts` — deliberately partial. §15 item 9 (the `ru` translation source) is still
outstanding, so this file proves the fallback path rather than pretending to be translated:

```ts
import type { Bundle } from '../types'

/**
 * Partial by design. SPEC §15 item 9 (ru translation source) is outstanding;
 * missing keys fall back to Hebrew and are reported per-locale (SPEC §9).
 */
export const common: Bundle = {
  hello: 'Привет',
  'hello.title': 'Основа работает',
  'theme.light': 'Светлая',
  'theme.dark': 'Тёмная',
  'theme.system': 'Системная',
}
```

Every other namespace file, in all three locales — 24 files — is an empty stub. Authored now
so no lane ever creates one, which is what would reintroduce the conflict Seam 3 removes:

```ts
import type { Bundle } from '../types'

/** Owned by the <VERTICAL> lane. Empty until that milestone. */
export const <vertical>: Bundle = {}
```

- [ ] **Step 6: Create `index.ts` — authored once, never edited by a lane**

```ts
import { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE } from './types'
import type { Bundle, Locale, Namespace } from './types'

import { common as heCommon } from './he/common'
import { schedule as heSchedule } from './he/schedule'
import { people as hePeople } from './he/people'
import { health as heHealth } from './he/health'
import { attendance as heAttendance } from './he/attendance'
import { billing as heBilling } from './he/billing'
import { events as heEvents } from './he/events'
import { comms as heComms } from './he/comms'
import { reports as heReports } from './he/reports'
// …the same nine imports for en/ and ru/

export const bundles: Record<Locale, Record<Namespace, Bundle>> = {
  he: {
    common: heCommon, schedule: heSchedule, people: hePeople, health: heHealth,
    attendance: heAttendance, billing: heBilling, events: heEvents,
    comms: heComms, reports: heReports,
  },
  en: { /* the same nine */ },
  ru: { /* the same nine */ },
}

/**
 * `t('he', 'common.hello')`. Missing keys fall back to the reference locale;
 * a key missing everywhere returns itself rather than throwing, so a missing
 * translation degrades to a visible key instead of a blank screen.
 */
export function t(locale: Locale, key: string): string {
  const dot = key.indexOf('.')
  if (dot === -1) return key
  const ns = key.slice(0, dot) as Namespace
  const rest = key.slice(dot + 1)
  return (
    bundles[locale]?.[ns]?.[rest] ??
    bundles[REFERENCE_LOCALE]?.[ns]?.[rest] ??
    key
  )
}

export { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE }
export type { Bundle, Locale, Namespace }
```

- [ ] **Step 7: Run the tests**

```bash
cd web && npx vitest run packages/i18n --reporter=dot
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/packages/i18n
git commit -m "feat(i18n): namespaced locale tree — Seam 3

One namespace file per vertical per locale. index.ts lists all nine namespaces
up front, including empty stubs, so a lane never edits it. ru/common.ts is
deliberately partial — §15 item 9 is outstanding, and the gap exercises the
Hebrew fallback rather than hiding it."
```

---

### Task 4: `@studio/ui` — Rubik and the D2 token layer

**Files:**
- Create: `web/packages/ui/{package.json,tsconfig.json}`
- Create: `web/packages/ui/src/{tokens.css,fonts.css,index.ts,theme.ts,ThemeProvider.tsx}`
- Test: `web/packages/ui/src/theme.test.ts`

**Interfaces:**
- Produces:
  - `type ThemePreference = 'light' | 'dark' | 'system'` (D4)
  - `type ResolvedTheme = 'light' | 'dark'`
  - `function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme`
  - `<ThemeProvider>` — sets `data-theme` on `<html>`, persists preference to
    `localStorage['studio.theme']`
  - `function useTheme(): { preference, resolved, setPreference }`
  - CSS custom properties: `--ground`, `--surface`, `--fg`, `--text-secondary`,
    `--text-muted`, `--border`, `--accent`, `--danger`, `--focus-ring`
  - `export const THEME_COLOR: Record<ResolvedTheme, string>` — consumed by the manifests

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { THEME_COLOR, resolveTheme } from './theme'

describe('D4 — light / dark / system', () => {
  it('honours an explicit preference over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system setting when preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('D8 — the light-mode text floor', () => {
  it('exposes ground colours the manifests can name', () => {
    expect(THEME_COLOR.light).toBe('#f7f5f1')
    expect(THEME_COLOR.dark).toBe('#141311')
  })
})
```

And a token-integrity test that reads the CSS, so a retired grey cannot creep back in:

`web/packages/ui/src/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf-8')
const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('[data-theme="dark"]'))

describe('D8 — retired greys never return to a light-mode text token', () => {
  it.each(['#a8a49a', '#8f8b82', '#7a766d'])('%s is absent from the light block', (hex) => {
    expect(lightBlock).not.toContain(hex)
  })

  it('#a8a49a and #8f8b82 remain valid in the dark block', () => {
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'))
    expect(darkBlock).toContain('#a8a49a')
    expect(darkBlock).toContain('#8f8b82')
  })
})

describe('D1/D2 — semantic tokens are defined, not improvised', () => {
  it.each(['--debt', '--paid', '--pending', '--cancelled', '--danger', '--focus-ring'])(
    '%s exists',
    (token) => expect(css).toContain(token),
  )
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd web && npx vitest run packages/ui --reporter=dot
```

Expected: FAIL — module not found.

- [ ] **Step 3: Install Rubik as a workspace dependency**

```bash
cd web && npm install --workspace @studio/ui @fontsource-variable/rubik
```

Then confirm the Hebrew and Cyrillic subsets shipped — D6 turns on exactly this:

```bash
ls node_modules/@fontsource-variable/rubik/files | grep -E 'hebrew|cyrillic-wght|latin-wght' | head
```

Expected: `rubik-hebrew-wght-normal.woff2`, `rubik-cyrillic-wght-normal.woff2`,
`rubik-latin-wght-normal.woff2`. If the Hebrew subset is absent, stop — D6's entire premise is
that Rubik is the only family covering Hebrew + Latin + base Cyrillic, and the plan needs
revisiting rather than patching.

- [ ] **Step 4: Create `src/fonts.css`**

Self-hosted, not the Google CDN — §6.1's offline priming assumes the font is a precachable
build asset, and a CDN request fails in a basement.

```css
/* D6 — Rubik, one family, weights 300–700 via the variable axis.
   Self-hosted so the service worker can precache it (§6.1 offline priming). */
@import '@fontsource-variable/rubik/hebrew.css';
@import '@fontsource-variable/rubik/latin.css';
@import '@fontsource-variable/rubik/cyrillic.css';

:root {
  --font-sans: 'Rubik Variable', 'Rubik', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 5: Create `src/tokens.css`**

```css
/* D2 — three tiers. Semantic and structural are never overridable.
   D8 — #6f6b62 is the floor for any light-mode text token.
   D3 — near-neutral warm grounds, one deep accent. */

:root {
  --ground: #f7f5f1;
  --surface: #fffefb;
  --fg: #17150f;
  --text-secondary: #55524a;
  --text-muted: #6f6b62;   /* D8 floor — 4.88:1 on --ground */
  --border: #e6e1d6;
  --border-strong: #e5e0d5;

  --accent: #1f6b3f;
  --on-accent: #fffefb;

  /* Semantic — never overridable, never a brand colour (D2 consequence 2). */
  --debt: #b3261e;
  --paid: #1f6b3f;
  --pending: #8a5a00;
  --cancelled: #6f6b62;
  --danger: #b3261e;
  --focus-ring: #2f6fa8;

  /* D7 — every belt bar carries a 1px ring in the current foreground colour. */
  --belt-ring: #17150f;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}

[data-theme='dark'] {
  --ground: #141311;
  --surface: #1e1d1a;
  --fg: #fffefb;
  --text-secondary: #a8a49a;  /* 7.46:1 on --ground — dark-mode-only (D8) */
  --text-muted: #8f8b82;      /* 5.47:1 on --ground — dark-mode-only (D8) */
  --border: #3a3833;
  --border-strong: #4a4842;

  --accent: #3f8f52;
  --on-accent: #141311;

  --debt: #ff8a7d;
  --paid: #3f8f52;
  --pending: #e5b44f;
  --cancelled: #8f8b82;
  --danger: #ff8a7d;
  --focus-ring: #6aa9e0;

  --belt-ring: #fffefb;
}

*,
*::before,
*::after { box-sizing: border-box; }

html {
  background: var(--ground);
  color: var(--fg);
  font-family: var(--font-sans);
  /* G3 — rendered in Asia/Jerusalem regardless of locale; set at format time, not here. */
}

body { margin: 0; }

:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Create `src/theme.ts`**

```ts
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'studio.theme'

/** The `--ground` value per theme, so a manifest and a meta tag cannot drift from the CSS. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f7f5f1',
  dark: '#141311',
}

/** D4 — three options. "System" follows the OS, which already schedules by hour. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}
```

- [ ] **Step 7: Create `src/ThemeProvider.tsx` and `src/index.ts`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { THEME_COLOR, THEME_STORAGE_KEY, resolveTheme } from './theme'
import type { ResolvedTheme, ThemePreference } from './theme'

type ThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const readStoredPreference = (): ThemePreference => {
  const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(preference, systemPrefersDark)

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolved])
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
```

`src/index.ts`:

```ts
import './fonts.css'
import './tokens.css'

export { ThemeProvider, useTheme } from './ThemeProvider'
export { THEME_COLOR, THEME_STORAGE_KEY, resolveTheme } from './theme'
export type { ResolvedTheme, ThemePreference } from './theme'
```

- [ ] **Step 8: Run the tests**

```bash
cd web && npx vitest run packages/ui --reporter=dot
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add web/packages/ui web/package-lock.json
git commit -m "feat(ui): D2 token layer, D8-corrected greys, self-hosted Rubik

Retired greys are asserted absent from the light block by a test that reads the
CSS, because D8's failure mode is a #8f8b82 quietly reappearing in a later port.
Rubik is self-hosted rather than CDN-loaded so the service worker can precache
it — §6.1's offline priming assumes the font is already there."
```

---

### Task 5: `@studio/core` — `useDisplayMode()` and persistent storage

M1's onboarding gate and M8's install reporting both read display mode, so it belongs in
`core`, not in an app.

**Files:**
- Create: `web/packages/core/{package.json,tsconfig.json}`
- Create: `web/packages/core/src/{index.ts,useDisplayMode.ts,persistentStorage.ts}`
- Test: `web/packages/core/src/{useDisplayMode.test.ts,persistentStorage.test.ts}`

**Interfaces:**
- Produces:
  - `type DisplayMode = 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser'`
  - `function getDisplayMode(): DisplayMode`
  - `function useDisplayMode(): DisplayMode`
  - `function isInstalled(): boolean` — `getDisplayMode() !== 'browser'`
  - `type PersistenceResult = { supported: boolean; persisted: boolean; alreadyPersisted: boolean; checkedAt: string }`
  - `const PERSISTENCE_STORAGE_KEY = 'studio.storage.persistence'`
  - `async function requestPersistentStorage(): Promise<PersistenceResult>`
  - `function readPersistenceResult(): PersistenceResult | null` — M8 reads this

- [ ] **Step 1: Write the failing tests**

`useDisplayMode.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDisplayMode, isInstalled } from './useDisplayMode'

const mockMatchMedia = (standalone: string | null) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone !== null && query.includes(standalone),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('getDisplayMode', () => {
  it('reports browser when no display-mode query matches', () => {
    mockMatchMedia(null)
    expect(getDisplayMode()).toBe('browser')
    expect(isInstalled()).toBe(false)
  })

  it('reports standalone from the display-mode media query', () => {
    mockMatchMedia('standalone')
    expect(getDisplayMode()).toBe('standalone')
    expect(isInstalled()).toBe(true)
  })

  it('reports fullscreen in preference to standalone', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(getDisplayMode()).toBe('fullscreen')
  })

  // §6.5 — on iOS the home-screen web app is the only context with Web Push,
  // so detecting it correctly is load-bearing, and older iOS only exposes
  // the non-standard navigator.standalone.
  it('trusts navigator.standalone on iOS even when matchMedia disagrees', () => {
    mockMatchMedia(null)
    vi.stubGlobal('navigator', { standalone: true })
    expect(getDisplayMode()).toBe('standalone')
  })
})
```

`persistentStorage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSISTENCE_STORAGE_KEY,
  readPersistenceResult,
  requestPersistentStorage,
} from './persistentStorage'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('requestPersistentStorage (§10.6 — pending_ops is never reclaimed)', () => {
  it('reports unsupported without throwing when the API is absent', async () => {
    vi.stubGlobal('navigator', {})
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: false, persisted: false })
  })

  it('does not re-request when already persisted', async () => {
    const persist = vi.fn()
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => true, persist },
    })
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: true, persisted: true, alreadyPersisted: true })
    expect(persist).not.toHaveBeenCalled()
  })

  it('requests persistence and records a refusal rather than swallowing it', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => false, persist: async () => false },
    })
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: true, persisted: false, alreadyPersisted: false })
  })

  it('records the result where M8 install reporting can read it', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => false, persist: async () => true },
    })
    await requestPersistentStorage()
    const stored = readPersistenceResult()
    expect(stored?.persisted).toBe(true)
    expect(stored?.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(localStorage.getItem(PERSISTENCE_STORAGE_KEY)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd web && npx vitest run packages/core --reporter=dot
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `useDisplayMode.ts`**

```ts
import { useEffect, useState } from 'react'

export type DisplayMode = 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser'

/** Checked most-specific-first; a fullscreen app also matches standalone. */
const MODES = ['fullscreen', 'standalone', 'minimal-ui'] as const

type IosNavigator = Navigator & { standalone?: boolean }

/**
 * §6.5 — on iOS, Web Push exists only for a home-screen web app, so this is the
 * check that decides whether a parent can be reached at all. iOS before 16.4 does
 * not answer the display-mode media query, hence the navigator.standalone branch.
 */
export function getDisplayMode(): DisplayMode {
  if ((globalThis.navigator as IosNavigator | undefined)?.standalone === true) {
    return 'standalone'
  }
  for (const mode of MODES) {
    if (globalThis.matchMedia?.(`(display-mode: ${mode})`).matches) return mode
  }
  return 'browser'
}

export function isInstalled(): boolean {
  return getDisplayMode() !== 'browser'
}

/**
 * M1's onboarding gate and M8's install reporting both read this, which is why it
 * lives in core rather than in an app.
 */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>(getDisplayMode)

  useEffect(() => {
    const queries = MODES.map((m) => globalThis.matchMedia?.(`(display-mode: ${m})`)).filter(
      (q): q is MediaQueryList => Boolean(q),
    )
    const onChange = () => setMode(getDisplayMode())
    queries.forEach((q) => q.addEventListener('change', onChange))
    return () => queries.forEach((q) => q.removeEventListener('change', onChange))
  }, [])

  return mode
}
```

- [ ] **Step 4: Implement `persistentStorage.ts`**

```ts
export type PersistenceResult = {
  supported: boolean
  persisted: boolean
  alreadyPersisted: boolean
  checkedAt: string
}

export const PERSISTENCE_STORAGE_KEY = 'studio.storage.persistence'

/**
 * §10.6 requires that pending_ops is never reclaimed. A home-screen web app on iOS
 * is exempt from Safari's 7-day script-storage cap but may still be evicted under
 * storage pressure — a guarantee only a native container would have given, and §6.5
 * accepts that as managed rather than engineered around.
 *
 * The result is recorded rather than merely awaited: M8 reports install state beside
 * push delivery, and a refusal here is the signal the office needs.
 */
export async function requestPersistentStorage(): Promise<PersistenceResult> {
  const storage = globalThis.navigator?.storage
  const checkedAt = new Date().toISOString()

  if (!storage?.persist || !storage.persisted) {
    return record({ supported: false, persisted: false, alreadyPersisted: false, checkedAt })
  }

  const alreadyPersisted = await storage.persisted()
  if (alreadyPersisted) {
    return record({ supported: true, persisted: true, alreadyPersisted: true, checkedAt })
  }

  const persisted = await storage.persist()
  return record({ supported: true, persisted, alreadyPersisted: false, checkedAt })
}

function record(result: PersistenceResult): PersistenceResult {
  try {
    globalThis.localStorage?.setItem(PERSISTENCE_STORAGE_KEY, JSON.stringify(result))
  } catch {
    // A refused write must not break boot. The in-memory result is still returned.
  }
  return result
}

export function readPersistenceResult(): PersistenceResult | null {
  const raw = globalThis.localStorage?.getItem(PERSISTENCE_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistenceResult
  } catch {
    return null
  }
}
```

`src/index.ts`:

```ts
export { getDisplayMode, isInstalled, useDisplayMode } from './useDisplayMode'
export type { DisplayMode } from './useDisplayMode'
export {
  PERSISTENCE_STORAGE_KEY,
  readPersistenceResult,
  requestPersistentStorage,
} from './persistentStorage'
export type { PersistenceResult } from './persistentStorage'
```

- [ ] **Step 5: Run the tests**

```bash
cd web && npx vitest run packages/core --reporter=dot
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/packages/core
git commit -m "feat(core): useDisplayMode and navigator.storage.persist recording

Both live in core because M1's onboarding gate and M8's install reporting read
them. getDisplayMode falls back to navigator.standalone: iOS before 16.4 does not
answer the display-mode query, and on iOS the home-screen app is the only context
where Web Push exists at all (§6.5)."
```

---

### Task 6: The three Vite apps and the hello screen

**Files:**
- Create: `web/apps/{staff,parent,dashboard}/{package.json,tsconfig.json,vite.config.ts,index.html}`
- Create: `web/apps/*/src/{main.tsx,App.tsx,HelloScreen.tsx}`
- Create: `web/packages/ui/src/HelloProof.tsx` (shared — the three apps differ only in name)
- Test: `web/apps/*/src/App.test.tsx`, `web/packages/ui/src/HelloProof.test.tsx`
- Modify: `tests/config/test_repo_config.py` — remove the `xfail` marker from Task 1 Step 9

**Interfaces:**
- Consumes: `@studio/ui` (`ThemeProvider`, `useTheme`), `@studio/core` (`useDisplayMode`,
  `requestPersistentStorage`), `@studio/i18n` (`t`, `DIRECTION`).
- Produces: `<HelloProof appNameKey={...} />` from `@studio/ui`; three dev servers on
  ports 5173 (staff), 5174 (parent), 5175 (dashboard).

- [ ] **Step 1: Write the failing test**

`web/packages/ui/src/HelloProof.test.tsx` — the three things the screen must prove:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelloProof } from './HelloProof'
import { ThemeProvider } from './ThemeProvider'

const renderProof = () =>
  render(
    <ThemeProvider>
      <HelloProof appNameKey="common.appName.staff" />
    </ThemeProvider>,
  )

describe('the hello screen proves the three things M0.1 claims', () => {
  it('sets dir=rtl on the document root for the Hebrew locale (SPEC §9)', () => {
    renderProof()
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('he')
  })

  it('renders the font proof string covering Hebrew, Latin and base Cyrillic (D6)', () => {
    renderProof()
    // If Rubik ever loses a subset, this is the string that shows tofu on screen.
    expect(screen.getByTestId('font-proof').textContent).toMatch(/[֐-׿]/)
    expect(screen.getByTestId('font-proof').textContent).toMatch(/[Ѐ-џ]/)
    expect(screen.getByTestId('font-proof').textContent).toMatch(/[A-Za-z]/)
  })

  it('applies a resolved theme to the document root (D4)', () => {
    renderProof()
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme)
  })

  it('takes every visible string from i18n, never inlined (G4)', () => {
    renderProof()
    expect(screen.getByRole('heading')).toHaveTextContent('הבסיס עובד')
  })
})
```

`web/apps/staff/src/App.test.tsx` (mirrored in `parent` and `dashboard` with their own key):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('staff app', () => {
  it('renders its own app name', () => {
    render(<App />)
    expect(screen.getByText('סטודיו — צוות')).toBeInTheDocument()
  })

  it('reports whether it is installed or running in a tab', () => {
    render(<App />)
    expect(screen.getByTestId('display-mode')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd web && npx vitest run packages/ui/src/HelloProof.test.tsx --reporter=dot
```

Expected: FAIL — `HelloProof` does not exist.

- [ ] **Step 3: Implement `HelloProof.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDisplayMode } from '@studio/core'
import { useTheme } from './ThemeProvider'
import type { ThemePreference } from './theme'

const PREFERENCES: ThemePreference[] = ['light', 'dark', 'system']

export function HelloProof({
  appNameKey,
  locale = 'he',
}: {
  appNameKey: string
  locale?: Locale
}) {
  const { preference, resolved, setPreference } = useTheme()
  const displayMode = useDisplayMode()
  const [fontReady, setFontReady] = useState(false)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = DIRECTION[locale]
  }, [locale])

  useEffect(() => {
    // document.fonts is absent in jsdom; the real proof runs in the Playwright gate.
    document.fonts?.ready.then(() => setFontReady(document.fonts.check('1rem "Rubik Variable"')))
  }, [])

  return (
    <main
      style={{
        minBlockSize: '100dvh',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        background: 'var(--ground)',
        color: 'var(--fg)',
      }}
    >
      <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t(locale, appNameKey)}</p>
      <h1 style={{ margin: 0, fontWeight: 600 }}>{t(locale, 'common.hello.title')}</h1>

      <p
        data-testid="font-proof"
        data-font-ready={fontReady}
        style={{ fontSize: '1.25rem', margin: 0, borderBlockEnd: '1px solid var(--border)' }}
      >
        {t(locale, 'common.hello.fontProof')}
      </p>

      <dl style={{ display: 'grid', gap: 'var(--space-2)', margin: 0 }}>
        <div>
          <dt style={{ color: 'var(--text-muted)' }}>{t(locale, 'common.hello.direction')}</dt>
          <dd data-testid="direction" style={{ marginInlineStart: 0 }}>
            {DIRECTION[locale]}
          </dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-muted)' }}>{t(locale, 'common.hello.theme')}</dt>
          <dd data-testid="resolved-theme" style={{ marginInlineStart: 0 }}>
            {resolved}
          </dd>
        </div>
        <div>
          <dd data-testid="display-mode" style={{ marginInlineStart: 0 }}>
            {t(
              locale,
              displayMode === 'browser'
                ? 'common.displayMode.browser'
                : 'common.displayMode.standalone',
            )}
          </dd>
        </div>
      </dl>

      <div role="group" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {PREFERENCES.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preference === p}
            onClick={() => setPreference(p)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${preference === p ? 'var(--fg)' : 'var(--border)'}`,
              background: preference === p ? 'var(--fg)' : 'var(--surface)',
              color: preference === p ? 'var(--ground)' : 'var(--fg)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {t(locale, `common.theme.${p}`)}
          </button>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Create the three apps**

`web/apps/staff/package.json` (parent/dashboard identical but for name and port):

```json
{
  "name": "@studio/staff",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build",
    "preview": "vite preview --port 5173"
  },
  "dependencies": {
    "@studio/core": "*",
    "@studio/i18n": "*",
    "@studio/ui": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

`web/apps/staff/src/App.tsx`:

```tsx
import { ThemeProvider, HelloProof } from '@studio/ui'

export default function App() {
  return (
    <ThemeProvider>
      <HelloProof appNameKey="common.appName.staff" />
    </ThemeProvider>
  )
}
```

`web/apps/staff/src/main.tsx` — the staff app is the one that requests persistent storage:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { requestPersistentStorage } from '@studio/core'
import App from './App'

// §10.6 — pending_ops must never be reclaimed. Requested on boot, and the result is
// recorded for M8's install report rather than discarded. Deliberately not awaited:
// a slow or refused permission must not delay first paint.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`parent/src/main.tsx` and `dashboard/src/main.tsx` are the same without the
`requestPersistentStorage()` call — only the staff app queues offline work (§10.2).

`web/apps/staff/index.html`:

```html
<!doctype html>
<html lang="he" dir="rtl" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f7f5f1" />
    <title>סטודיו — צוות</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/apps/staff/vite.config.ts` (PWA plugin added in Task 9):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
```

- [ ] **Step 5: Retire the xfail from Task 1**

`web/apps/` and `web/packages/` now exist, so the RTL rule matches real files. Remove the
`@pytest.mark.xfail` marker from `test_c1_rtl_rule_is_scoped_to_paths_that_exist`.

- [ ] **Step 6: Run the tests**

```bash
cd web && npx vitest run --reporter=dot
cd .. && .venv/bin/pytest tests/config -q
```

Expected: all frontend tests pass; all config tests pass with no xfail.

- [ ] **Step 7: Confirm each app boots and looks right**

```bash
cd web && npm run build --workspaces
```

Expected: three `dist/` directories. Then spot-check one in a browser: RTL layout, Rubik
rendering Hebrew + Cyrillic without tofu, and the theme buttons switching light/dark.

- [ ] **Step 8: Commit**

```bash
git add web/apps web/packages/ui/src/HelloProof.tsx web/packages/ui/src/HelloProof.test.tsx \
        tests/config/test_repo_config.py
git commit -m "feat(apps): staff, parent and dashboard hello screens

Each proves the three things the skeleton claims: Rubik loads with Hebrew and
Cyrillic subsets, dir=rtl applies from the locale, and light/dark both resolve.
No native/ directory — §6.5 ships installable PWAs and no native shell.
Only the staff app calls requestPersistentStorage(); it is the only one that
queues offline work (§10.2)."
```

---

### Task 7: Minimal FastAPI app and the generated api-client

The api-client diff gate is vacuous without an OpenAPI source, so the backend appears here —
and in its final Seam-2 discovery form, so no later wave reopens `app/main.py`.

**Files:**
- Create: `app/{__init__.py,main.py}`, `app/core/{__init__.py,config.py}`,
  `app/models/__init__.py`, `app/routers/{__init__.py,health.py}`
- Create: `scripts/export_openapi.py`
- Create: `web/packages/api-client/{package.json,tsconfig.json,src/index.ts}`
- Create: `openapi.json` (generated, committed)
- Test: `tests/test_health.py`, `tests/test_router_discovery.py`

**Interfaces:**
- Produces: `GET /api/v1/health` → `{"status": "ok", "env": "<env>"}`;
  `openapi.json` at repo root; `@studio/api-client` exporting `paths`/`components` types
  from `src/schema.d.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_versioned_under_api_v1():
    """G5 — new API endpoints are versioned under /api/v1/."""
    assert client.get("/health").status_code == 404
    assert client.get("/api/v1/health").status_code == 200


def test_health_reports_status_and_env():
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["env"] in {"development", "staging", "production", "test"}
```

`tests/test_router_discovery.py`:

```python
"""Seam 2 — app/main.py mounts routers by discovery and is never edited again.

A lane adds app/routers/attendance.py and it mounts. If someone reintroduces an
explicit include_router list, this test fails.
"""

import app.main as main_module


def test_main_mounts_by_discovery_not_by_an_explicit_list():
    source = (main_module.__file__ or "").replace(".pyc", ".py")
    with open(source, encoding="utf-8") as fh:
        text = fh.read()
    assert "pkgutil.iter_modules" in text, "routers must be discovered, not listed"
    # One include_router call inside the loop, plus the versioned mount. No more.
    assert text.count("include_router") == 2


def test_dev_router_is_absent_in_production(monkeypatch):
    """§19.6 — the dev router does not exist in prod, not merely guarded."""
    import importlib

    monkeypatch.setenv("ENV", "production")
    import app.core.config as config_module

    importlib.reload(config_module)
    reloaded = importlib.reload(main_module)
    routes = {getattr(r, "path", "") for r in reloaded.app.routes}
    assert not any(path.startswith("/api/v1/dev") for path in routes)
```

- [ ] **Step 2: Run and confirm failure**

```bash
.venv/bin/pip install "fastapi[standard]" pydantic-settings httpx
.venv/bin/pytest tests/ -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3: Implement `app/core/config.py`**

```python
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["development", "staging", "production", "test"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: Env = "development"


settings = Settings()
```

- [ ] **Step 4: Implement the two Seam-2 files**

`app/models/__init__.py` — final content, never edited again:

```python
"""Model discovery. Seam 2 — never edited to register a model.

Importing this package imports every module beside it, so a lane adding
app/models/attendance.py gets its tables registered on Base without touching
a shared file. app/models/__init__.py conflicting on every merge is exactly
what this replaces.
"""

import importlib
import pkgutil

for _module in pkgutil.iter_modules(__path__):
    if not _module.name.startswith("_"):
        importlib.import_module(f"{__name__}.{_module.name}")
```

`app/main.py` — final content, never edited again:

```python
"""Router mounting by discovery. Seam 2 — never edited to register a router.

A lane adds app/routers/attendance.py and it mounts under /api/v1/. No shared
file changes, so two lanes never conflict here.
"""

import importlib
import pkgutil

from fastapi import APIRouter, FastAPI

import app.routers
from app.core.config import settings

app = FastAPI(title="Studio Manager API", version="0.1.0")

v1 = APIRouter(prefix="/api/v1")
for _module in pkgutil.iter_modules(app.routers.__path__):
    if _module.name.startswith("_"):
        continue
    # §19.6 — the dev router does not exist in production, not merely guarded.
    if _module.name == "dev" and settings.ENV == "production":
        continue
    v1.include_router(importlib.import_module(f"app.routers.{_module.name}").router)

app.include_router(v1)
```

- [ ] **Step 5: Implement `app/routers/health.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import Env, settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    env: Env


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    """Liveness. Deliberately carries no tenant data and needs no auth."""
    return HealthResponse(status="ok", env=settings.ENV)
```

- [ ] **Step 6: Implement `scripts/export_openapi.py`**

```python
"""Write the OpenAPI schema to openapi.json.

CI regenerates this and the TypeScript client, then fails on any uncommitted diff —
so a breaking backend change fails the build rather than production (SPEC §8.2).
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

if __name__ == "__main__":
    target = pathlib.Path(__file__).resolve().parents[1] / "openapi.json"
    target.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
```

- [ ] **Step 7: Generate the client**

```bash
cd web && npm install --workspace @studio/api-client --save-dev openapi-typescript
cd .. && .venv/bin/python scripts/export_openapi.py
cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts
```

`web/packages/api-client/src/index.ts`:

```ts
// Generated from openapi.json. schema.d.ts is never hand-edited — CI regenerates it
// and fails on an uncommitted diff (SPEC §8.2).
export type { components, operations, paths } from './schema'
```

- [ ] **Step 8: Run the tests**

```bash
.venv/bin/pytest tests/ -q
cd web && npm run typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add app/ scripts/export_openapi.py openapi.json tests/ web/packages/api-client \
        web/package-lock.json
git commit -m "feat(api): minimal FastAPI app in Seam-2 discovery form, generated client

The backend appears in M0.1 only because the generated-api-client CI gate is
vacuous without an OpenAPI source. Since main.py had to exist, it is written in
its final discovery form so no later wave reopens it — that file conflicting on
every merge is the seam this removes."
```

---

### Task 8: Web App Manifests and the icon set

**Files:**
- Create: `web/packages/ui/src/brand/mark.svg`
- Create: `scripts/generate-icons.mjs`
- Create: `web/apps/*/public/icons/*.png`, `web/apps/*/public/apple-touch-icon.png`
- Create: `web/apps/*/manifest.config.ts`
- Modify: `web/apps/*/index.html` (apple-touch-icon + iOS meta)
- Test: `web/apps/*/src/manifest.test.ts`

**Interfaces:**
- Produces: `manifestFor(app: 'staff' | 'parent' | 'dashboard'): ManifestOptions` per app,
  consumed by `vite-plugin-pwa` in Task 9.

- [ ] **Step 1: Write the failing test**

`web/apps/staff/src/manifest.test.ts` (mirrored per app):

```ts
import { describe, expect, it } from 'vitest'
import { THEME_COLOR } from '@studio/ui'
import { manifest } from '../manifest.config'

describe('staff manifest (§6.5 — the install is the product, not boilerplate)', () => {
  it('declares standalone display so the app launches without browser chrome', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('names the app in Hebrew, with a short_name that fits under a home-screen icon', () => {
    expect(manifest.name).toBe('סטודיו — צוות')
    expect(manifest.short_name).toBe('צוות')
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('uses relative start_url and scope so the domain is not baked in', () => {
    // §15 item 5 is still open; a hardcoded origin would need a rebuild to change.
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('takes theme and background colours from the D2 token layer, not literals', () => {
    expect(manifest.theme_color).toBe(THEME_COLOR.light)
    expect(manifest.background_color).toBe(THEME_COLOR.light)
  })

  it('declares RTL and Hebrew, so the install dialog is not mirrored wrong', () => {
    expect(manifest.dir).toBe('rtl')
    expect(manifest.lang).toBe('he')
  })

  it('ships the icon sizes Chromium requires for installability', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('ships a maskable icon so Android does not letterbox it', () => {
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('declares png mime types', () => {
    expect(manifest.icons.every((i) => i.type === 'image/png')).toBe(true)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd web && npx vitest run apps/staff/src/manifest.test.ts --reporter=dot
```

Expected: FAIL — `../manifest.config` does not exist.

- [ ] **Step 3: Create the brand mark**

`web/packages/ui/src/brand/mark.svg` — a placeholder. §15 item 7 (studio branding) is
outstanding and blocks M1, so this is deliberately generic and clearly marked:

```svg
<!-- PLACEHOLDER. §15 item 7 (studio logo and colours) is outstanding and blocks M1.
     D3 restraint: one deep accent on a warm ground, no decoration.
     Replace this file and re-run scripts/generate-icons.mjs. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f7f5f1"/>
  <rect x="96" y="150" width="320" height="64" rx="8" fill="#17150f"/>
  <rect x="96" y="150" width="320" height="64" rx="8" fill="none" stroke="#17150f" stroke-width="2"/>
  <rect x="96" y="298" width="320" height="64" rx="8" fill="#1f6b3f"/>
  <rect x="96" y="298" width="320" height="64" rx="8" fill="none" stroke="#17150f" stroke-width="2"/>
</svg>
```

- [ ] **Step 4: Write `scripts/generate-icons.mjs`**

Committed rather than run once, so the real logo drops in with one command in M1.

```js
#!/usr/bin/env node
/**
 * Rasterise the brand mark into every icon size the three apps need.
 *
 * Re-run after replacing web/packages/ui/src/brand/mark.svg with the real logo
 * (§15 item 7, blocks M1):  node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = resolve(ROOT, 'web/packages/ui/src/brand/mark.svg')
const APPS = ['staff', 'parent', 'dashboard']

/** Chromium installability needs 192 and 512; the rest are polish. */
const STANDARD = [64, 128, 192, 256, 384, 512]
/** iOS reads apple-touch-icon; 180 is current, the others cover older hardware. */
const APPLE = [120, 152, 167, 180]
/** Maskable icons need ~20% safe-area padding or Android crops the mark. */
const MASKABLE = [192, 512]

const MASKABLE_PAD = 0.2

for (const app of APPS) {
  const out = resolve(ROOT, `web/apps/${app}/public/icons`)
  await mkdir(out, { recursive: true })

  for (const size of STANDARD) {
    await sharp(MARK).resize(size, size).png().toFile(`${out}/icon-${size}.png`)
  }

  for (const size of MASKABLE) {
    const inner = Math.round(size * (1 - MASKABLE_PAD * 2))
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: '#f7f5f1',
      },
    })
      .composite([{ input: await sharp(MARK).resize(inner, inner).png().toBuffer() }])
      .png()
      .toFile(`${out}/maskable-${size}.png`)
  }

  for (const size of APPLE) {
    // iOS does not respect transparency on the home screen — flatten to the ground colour.
    await sharp(MARK)
      .resize(size, size)
      .flatten({ background: '#f7f5f1' })
      .png()
      .toFile(`${out}/apple-touch-icon-${size}.png`)
  }

  await sharp(MARK)
    .resize(180, 180)
    .flatten({ background: '#f7f5f1' })
    .png()
    .toFile(resolve(ROOT, `web/apps/${app}/public/apple-touch-icon.png`))

  await writeFile(
    `${out}/README.md`,
    '# Generated\n\nDo not edit by hand. Run `node scripts/generate-icons.mjs`\n' +
      'after replacing `web/packages/ui/src/brand/mark.svg`.\n',
  )
  console.log(`icons → web/apps/${app}/public/icons`)
}
```

Run it:

```bash
cd web && npm install --save-dev sharp && cd ..
node scripts/generate-icons.mjs
```

- [ ] **Step 5: Create `web/apps/staff/manifest.config.ts`**

```ts
import { THEME_COLOR } from '@studio/ui'
import type { ManifestOptions } from 'vite-plugin-pwa'

const icons = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

/**
 * §6.5 — this app installs from an invitation link and nothing else. start_url and
 * scope stay relative so the domain (§15 item 5, still open) is not baked into a build.
 */
export const manifest: Partial<ManifestOptions> & { icons: typeof icons } = {
  id: '/?app=staff',
  name: 'סטודיו — צוות',
  short_name: 'צוות',
  description: 'ניהול נוכחות, קבוצות ותלמידים',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  dir: 'rtl',
  lang: 'he',
  theme_color: THEME_COLOR.light,
  background_color: THEME_COLOR.light,
  categories: ['sports', 'education', 'productivity'],
  icons,
}
```

`parent`: name `סטודיו — הורים`, short_name `הורים`, id `/?app=parent`.
`dashboard`: name `סטודיו — ניהול`, short_name `ניהול`, id `/?app=dashboard`,
`orientation: 'any'` — it is the big-screen surface (§6.4).

- [ ] **Step 6: Add the iOS tags to each `index.html`**

iOS ignores the manifest for the home-screen icon and reads these instead — this block is the
difference between a crisp icon and a screenshot of the page.

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="צוות" />
```

- [ ] **Step 7: Run the tests**

```bash
cd web && npx vitest run apps --reporter=dot
```

Expected: all three manifest test files pass.

- [ ] **Step 8: Commit**

```bash
git add web/apps/*/manifest.config.ts web/apps/*/public web/apps/*/index.html \
        web/apps/*/src/manifest.test.ts web/packages/ui/src/brand scripts/generate-icons.mjs \
        web/package-lock.json
git commit -m "feat(pwa): per-app manifest, icon set and iOS apple-touch-icon tags

theme_color and background_color come from the D2 token layer rather than
literals, so a token change cannot leave the install dialog on a stale colour.
start_url and scope are relative — §15 item 5 is still open and a hardcoded
origin would need a rebuild to change. The mark is a clearly-labelled
placeholder; §15 item 7 blocks M1, and one command regenerates every size."
```

---

### Task 9: Workbox service worker, precaching the Rubik subset

**Files:**
- Modify: `web/apps/*/vite.config.ts`
- Create: `web/apps/*/src/registerSW.ts`
- Modify: `web/apps/*/src/main.tsx`
- Test: `web/apps/*/src/sw-precache.test.ts` (asserts the built manifest, not the config)

**Interfaces:**
- Produces: `dist/sw.js` and `dist/manifest.webmanifest` per app; `registerServiceWorker()`.

- [ ] **Step 1: Write the failing test**

Asserting the *built* precache manifest is the point — asserting the Vite config would pass
while the font silently failed to precache.

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dist = resolve(__dirname, '../dist')
const read = (f: string) => readFileSync(resolve(dist, f), 'utf-8')

describe('service worker build output (run after `npm run build`)', () => {
  it('emits a Workbox service worker', () => {
    expect(read('sw.js')).toMatch(/workbox/i)
  })

  it('precaches the Rubik subsets — §6.1 offline priming assumes the font is there', () => {
    const sw = read('sw.js')
    expect(sw).toMatch(/rubik-hebrew[^"']*\.woff2/)
    expect(sw).toMatch(/rubik-latin[^"']*\.woff2/)
    expect(sw).toMatch(/rubik-cyrillic[^"']*\.woff2/)
  })

  it('precaches the app shell', () => {
    expect(read('sw.js')).toMatch(/index\.html/)
  })

  it('emits a webmanifest linked from the built HTML', () => {
    expect(read('index.html')).toMatch(/manifest\.webmanifest/)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd web && npm run build --workspace @studio/staff && \
  npx vitest run apps/staff/src/sw-precache.test.ts --reporter=dot
```

Expected: FAIL — `dist/sw.js` does not exist.

- [ ] **Step 3: Wire `vite-plugin-pwa` into each app**

`web/apps/staff/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './manifest.config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest,
      workbox: {
        // woff2 is the load-bearing entry: §6.1 primes offline on the assumption
        // that Rubik is already cached before a coach walks into a basement.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
})
```

- [ ] **Step 4: Register the worker in each app**

`web/apps/staff/src/registerSW.ts`:

```ts
import { registerSW } from 'virtual:pwa-register'

/**
 * registerType 'prompt' rather than 'autoUpdate': the staff app may hold unsynced
 * pending_ops (§10.6), and reloading underneath a coach mid-register would be worse
 * than a stale build. M1 turns onNeedRefresh into a visible control.
 */
export function registerServiceWorker() {
  return registerSW({
    onNeedRefresh() {
      // M1 replaces this with a real prompt in the app shell.
      console.info('[sw] a new version is ready')
    },
    onOfflineReady() {
      console.info('[sw] offline ready')
    },
  })
}
```

Call it from each `main.tsx`:

```tsx
import { registerServiceWorker } from './registerSW'
registerServiceWorker()
```

Add to each app's `tsconfig.json` `compilerOptions.types`: `["vite-plugin-pwa/client"]`.

- [ ] **Step 5: Build and run the tests**

```bash
cd web && npm run build --workspaces && npx vitest run apps --reporter=dot
```

Expected: all pass, including the three `sw-precache` files.

If the Rubik assertions fail: the fonts are being resolved from `node_modules` but not emitted
into `dist/assets`. Fix by importing `@studio/ui` (which imports `fonts.css`) from `main.tsx`
so Vite treats the woff2 files as build assets — do **not** fix it by loosening the assertion.

- [ ] **Step 6: Commit**

```bash
git add web/apps/*/vite.config.ts web/apps/*/src/registerSW.ts web/apps/*/src/main.tsx \
        web/apps/*/src/sw-precache.test.ts web/apps/*/tsconfig.json
git commit -m "feat(pwa): Workbox service worker in all three apps, Rubik precached

The test asserts the built sw.js precache manifest rather than the Vite config —
a config assertion passes while the font silently fails to precache, which is
exactly the regression §6.1's offline priming cannot survive.
registerType is 'prompt', not 'autoUpdate': reloading under a coach who is
holding unsynced pending_ops (§10.6) is worse than a stale build."
```

---

### Task 10: The installability gate

**Files:**
- Create: `scripts/check-installability.mjs`
- Create: `scripts/__tests__/installability.test.mjs`
- Modify: `web/package.json` (the `installability` script already declared in Task 2)

**Interfaces:**
- Produces: `node scripts/check-installability.mjs [--app staff]` — exit 0 clean,
  exit 1 with a per-app list of failures.

- [ ] **Step 1: Establish which gate is actually available**

Lighthouse removed the PWA category in v12, so `--only-categories=pwa` no longer exists.
Confirm before building on either:

```bash
npx --yes lighthouse@latest --list-all-audits 2>/dev/null | grep -ci installable || echo "no installable audit"
```

If the count is 0, use the CDP gate below — it is what Lighthouse's PWA audit called
internally anyway, so this is the same check without the deprecated wrapper.

- [ ] **Step 2: Write the failing test**

`scripts/__tests__/installability.test.mjs` — proves the gate rejects a broken manifest, so a
green CI run means something:

```js
import { describe, expect, it } from 'vitest'
import { auditManifest } from '../check-installability.mjs'

const valid = {
  name: 'סטודיו — צוות',
  short_name: 'צוות',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#f7f5f1',
  background_color: '#f7f5f1',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

describe('auditManifest', () => {
  it('passes a valid manifest', () => {
    expect(auditManifest(valid)).toEqual([])
  })

  it('fails a display mode that would launch in browser chrome', () => {
    expect(auditManifest({ ...valid, display: 'browser' }).join()).toMatch(/display/)
  })

  it('fails a missing 512 icon', () => {
    const icons = valid.icons.filter((i) => i.sizes !== '512x512')
    expect(auditManifest({ ...valid, icons }).join()).toMatch(/512/)
  })

  it('fails a missing maskable icon', () => {
    const icons = valid.icons.filter((i) => i.purpose !== 'maskable')
    expect(auditManifest({ ...valid, icons }).join()).toMatch(/maskable/)
  })

  it('fails a start_url outside scope', () => {
    expect(auditManifest({ ...valid, start_url: '/elsewhere/', scope: '/app/' }).join())
      .toMatch(/scope/)
  })

  it('fails a missing name', () => {
    expect(auditManifest({ ...valid, name: '' }).join()).toMatch(/name/)
  })
})
```

- [ ] **Step 3: Run and confirm failure**

```bash
cd web && npx vitest run ../scripts/__tests__/installability.test.mjs --reporter=dot
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scripts/check-installability.mjs`**

```js
#!/usr/bin/env node
/**
 * Fail the build when an app stops being installable.
 *
 * §6.5 makes the install the product's main adoption risk: there is no store
 * listing to fall back on, and on iOS there is no way to trigger an install at
 * all. A regression here surfaces on a parent's phone, which is the one place it
 * must not. So it fails CI instead.
 *
 * Lighthouse's PWA category was removed in v12, so this queries CDP
 * Page.getInstallabilityErrors — the same signal that audit used internally —
 * and falls back to the explicit criteria when the method is unavailable.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const APPS = ['staff', 'parent', 'dashboard']

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
}

/** The manifest half of Chromium's installability criteria, asserted explicitly. */
export function auditManifest(m) {
  const errors = []
  if (!m.name) errors.push('manifest.name is empty')
  if (!m.short_name) errors.push('manifest.short_name is empty')
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(m.display)) {
    errors.push(`manifest.display is "${m.display}" — must not launch in browser chrome`)
  }
  if (!m.start_url) errors.push('manifest.start_url is missing')
  if (m.scope && m.start_url && !m.start_url.startsWith(m.scope)) {
    errors.push(`manifest.start_url "${m.start_url}" is outside scope "${m.scope}"`)
  }
  if (!m.theme_color) errors.push('manifest.theme_color is missing')
  if (!m.background_color) errors.push('manifest.background_color is missing')

  const icons = m.icons ?? []
  const has = (size) => icons.some((i) => (i.sizes ?? '').split(' ').includes(size))
  if (!has('192x192')) errors.push('no 192x192 icon — Chromium requires it to install')
  if (!has('512x512')) errors.push('no 512x512 icon — Chromium requires it to install')
  if (!icons.some((i) => (i.purpose ?? '').includes('maskable'))) {
    errors.push('no maskable icon — Android will letterbox the mark')
  }
  if (icons.some((i) => i.type !== 'image/png')) {
    errors.push('every icon must declare type image/png')
  }
  return errors
}

const serve = (dir) =>
  new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = (req.url ?? '/').split('?')[0]
      for (const candidate of [join(dir, path), join(dir, path, 'index.html'), join(dir, 'index.html')]) {
        try {
          const body = await readFile(candidate)
          res.writeHead(200, { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' })
          return res.end(body)
        } catch { /* try the next candidate */ }
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port }))
  })

async function checkApp(app) {
  const { server, port } = await serve(resolve(ROOT, `web/apps/${app}/dist`))
  const browser = await chromium.launch()
  const errors = []
  try {
    const page = await browser.newPage()
    // localhost is a secure context, so service workers and install criteria apply.
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    if (!href) errors.push('no <link rel="manifest"> in the served HTML')

    if (!(await page.getAttribute('link[rel="apple-touch-icon"]', 'href'))) {
      errors.push('no apple-touch-icon — iOS falls back to a screenshot of the page')
    }

    if (href) {
      const manifest = await page.evaluate(
        async (url) => (await fetch(url)).json(),
        new URL(href, `http://127.0.0.1:${port}/`).href,
      )
      errors.push(...auditManifest(manifest))
    }

    const swState = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return 'unsupported'
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      return reg.active?.state ?? 'none'
    })
    if (swState !== 'activated') errors.push(`service worker did not activate (state: ${swState})`)

    // The Chromium engine's own verdict, where it is exposed.
    try {
      const cdp = await page.context().newCDPSession(page)
      const { installabilityErrors = [] } = await cdp.send('Page.getInstallabilityErrors')
      for (const e of installabilityErrors) errors.push(`chromium: ${e.errorId}`)
    } catch {
      console.warn(`  (Page.getInstallabilityErrors unavailable — relying on explicit criteria)`)
    }

    const fontOk = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('1rem "Rubik Variable"')
    })
    if (!fontOk) errors.push('Rubik did not load — D6 is the only family covering he+en+ru')

    const dir = await page.evaluate(() => document.documentElement.dir)
    if (dir !== 'rtl') errors.push(`document dir is "${dir}", expected "rtl" (SPEC §9)`)
  } finally {
    await browser.close()
    server.close()
  }
  return errors
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.includes('--app')
    ? [process.argv[process.argv.indexOf('--app') + 1]]
    : APPS
  let failed = false
  for (const app of only) {
    const errors = await checkApp(app)
    if (errors.length) {
      failed = true
      console.error(`✗ ${app}`)
      errors.forEach((e) => console.error(`    ${e}`))
    } else {
      console.log(`✓ ${app} is installable`)
    }
  }
  process.exit(failed ? 1 : 0)
}
```

- [ ] **Step 5: Install Playwright and run**

```bash
cd web && npm install --save-dev playwright && npx playwright install chromium --with-deps
cd .. && cd web && npm run build --workspaces && cd .. && node scripts/check-installability.mjs
```

Expected: `✓ staff`, `✓ parent`, `✓ dashboard`.

- [ ] **Step 6: Prove the gate bites**

Temporarily set `display: 'browser'` in `web/apps/staff/manifest.config.ts`, rebuild staff,
re-run. Expected: exit 1 naming the display failure. Revert.

A gate that has never failed is not known to work.

- [ ] **Step 7: Run the unit tests and commit**

```bash
cd web && npx vitest run ../scripts --reporter=dot
git add scripts/check-installability.mjs scripts/__tests__ web/package.json web/package-lock.json
git commit -m "feat(ci): installability gate — Playwright + CDP, not Lighthouse

Lighthouse dropped the PWA category in v12, so this queries CDP
Page.getInstallabilityErrors directly — the same signal that audit used — and
backs it with the explicit criteria when the method is unavailable. Also checks
Rubik actually loaded and dir=rtl actually applied, because the failure mode
§6.5 cares about is a regression surfacing on a parent's phone."
```

---

### Task 11: CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.gitleaks.toml`
- Create: `requirements-dev.txt`
- Modify: `.gitignore` (add `web/apps/*/dist`, `dev-dist`)

**Interfaces:**
- Produces: a `ci` workflow on push and pull_request with jobs `backend`, `frontend`,
  `generated`, `installability`, `security`.

- [ ] **Step 1: Write the failing check**

CI cannot be TDD'd in the usual sense, so the test is a local dry run of every gate. Write
`scripts/ci-local.sh` first and confirm it fails on a deliberately uncommitted client diff:

```bash
#!/usr/bin/env bash
# Every gate CI runs, runnable locally. Keep in lockstep with .github/workflows/ci.yml.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "── backend: lint, types, tests ──"
.venv/bin/ruff check app scripts
.venv/bin/ruff format --check app scripts
.venv/bin/mypy app
.venv/bin/pytest -q

echo "── frontend: types, lint, tests ──"
(cd web && npm run typecheck && npm run lint && npm run test)

echo "── generated api-client is committed ──"
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts

echo "── build + installability ──"
(cd web && npm run build --workspaces)
node scripts/check-installability.mjs

echo "✅ all gates green"
```

- [ ] **Step 2: Prove the generated-diff gate bites**

```bash
sed -i '' 's/"ok"/"okay"/' app/routers/health.py   # temporary
./scripts/ci-local.sh
```

Expected: FAIL at the `git diff --exit-code` step with a non-empty diff. Revert the edit.

This is the gate the brief singles out — "a generated diff that is not committed fails the
build" — so it must be observed failing before it is trusted.

- [ ] **Step 3: Create `requirements-dev.txt`**

```
fastapi[standard]
pydantic-settings
httpx
pytest
pyyaml
mypy
ruff
pip-audit
```

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  PYTHON_VERSION: '3.14'
  NODE_VERSION: '22'

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: pip
      - run: pip install -r requirements-dev.txt
      - name: Lint
        run: ruff check app scripts && ruff format --check app scripts
      - name: Typecheck
        run: mypy app
      - name: Tests
        run: pytest -q

  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Lint
        run: npm run lint
      - name: Tests
        run: npm run test

  generated:
    # SPEC §8.2 — a diff in generated output that is not committed fails the build.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.14', cache: pip }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: pip install -r requirements-dev.txt
      - run: npm ci
        working-directory: web
      - name: Regenerate the OpenAPI schema and the TypeScript client
        run: |
          python scripts/export_openapi.py
          cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts
      - name: Fail if the generated output is not committed
        run: |
          if ! git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts; then
            echo "::error::openapi.json / api-client is stale. Run scripts/ci-local.sh and commit the result."
            exit 1
          fi

  installability:
    # §6.5 — the install is the main adoption risk. A regression must fail here,
    # not on a parent's phone.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npx playwright install chromium --with-deps
        working-directory: web
      - run: npm run build --workspaces
        working-directory: web
      - run: node scripts/check-installability.mjs

  security:
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-python@v5
        with: { python-version: '3.14' }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: web/package-lock.json
      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Python dependency audit
        run: pip install pip-audit && pip-audit -r requirements-dev.txt --strict
      - name: npm dependency audit
        run: npm audit --audit-level=high
        working-directory: web
```

- [ ] **Step 5: Create `.gitleaks.toml`**

```toml
title = "studio-manager"

[extend]
useDefault = true

[[rules]]
id = "upay-merchant-credentials"
description = "uPay merchant identifiers or keys"
regex = '''(?i)(upay[_-]?(secret|key|token|merchant)[^\n]{0,10}[=:]\s*['"][^'"]{8,}['"])'''
tags = ["upay", "payments"]

[allowlist]
description = "Generated and documentation files"
paths = [
  '''openapi\.json''',
  '''web/packages/api-client/src/schema\.d\.ts''',
  '''docs/.*\.md''',
]
```

- [ ] **Step 6: Run the whole thing locally, then push and watch it**

```bash
./scripts/ci-local.sh
git add .github/workflows/ci.yml .gitleaks.toml requirements-dev.txt scripts/ci-local.sh .gitignore
git commit -m "ci: typecheck, lint, tests, generated-client diff, installability, security

The generated-client job is the one SPEC §8.2 names: a stale openapi.json or
schema.d.ts fails the build rather than production. Observed failing on a
deliberate stale diff before being trusted.
gitleaks carries a uPay-specific rule — merchant credentials are the highest-value
secret this repo will ever hold (§12)."
git push
gh run watch
```

Expected: all five jobs green.

---

### Task 12: Railway — dev, staging and production

**Outward-facing and billable.** The user authorised provisioning and will complete
`railway login` in a browser. Announce each create command before running it.

**Files:**
- Create: `infra/railway/domains.json`, `infra/railway/README.md`
- Create: `railway.json`, `Dockerfile`, `web/apps/*/Caddyfile`
- Create: `docs/deploy/railway-runbook.md`

**Interfaces:**
- Produces: `infra/railway/domains.json` — the single file naming every environment's host.
  Swapping in the real domain (§15 item 5) is a one-file change.

- [ ] **Step 1: Write the failing test**

`tests/config/test_railway_config.py`:

```python
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOMAINS = ROOT / "infra/railway/domains.json"


def test_every_environment_is_configured():
    config = json.loads(DOMAINS.read_text(encoding="utf-8"))
    assert set(config["environments"]) == {"development", "staging", "production"}


def test_every_environment_names_all_three_apps_and_the_api():
    config = json.loads(DOMAINS.read_text(encoding="utf-8"))
    for env, hosts in config["environments"].items():
        assert set(hosts) == {"api", "staff", "parent", "dashboard"}, env


def test_staging_has_a_public_https_url():
    """SPEC §15 item 3 — uPay IPN testing in W4 needs this."""
    api = json.loads(DOMAINS.read_text(encoding="utf-8"))["environments"]["staging"]["api"]
    assert api.startswith("https://"), api
    assert "TODO" not in api


def test_the_domain_is_named_in_exactly_one_place():
    """§15 item 5 is still open; swapping the domain must not need a rebuild."""
    config = json.loads(DOMAINS.read_text(encoding="utf-8"))
    assert "base_domain" in config
```

- [ ] **Step 2: Run and confirm failure** — `infra/railway/domains.json` does not exist.

- [ ] **Step 3: Install the CLI and hand off the login**

```bash
npm install -g @railway/cli
railway login
```

`railway login` opens a browser. **Stop here and let the user complete it.** Confirm with
`railway whoami` before continuing.

- [ ] **Step 4: Create the project and the three environments**

```bash
railway init --name studio-manager
railway environment new development
railway environment new staging
# Railway's default environment is `production` — do not create a fourth.
railway environment
```

- [ ] **Step 5: Create the Dockerfile and static serving**

`Dockerfile` (API):

```dockerfile
FROM python:3.14-slim
WORKDIR /srv
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY app ./app
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
```

Each PWA is a static site served by Caddy — separate origins, because staff and parent must
not share origin-scoped IndexedDB (§10.6 `pending_ops`, G7 health data).

`web/apps/staff/Caddyfile`:

```
:{$PORT}
root * /srv/dist
encode gzip zstd
# The service worker must never be served stale, or an install can pin a dead build.
@sw path /sw.js /manifest.webmanifest
header @sw Cache-Control "no-cache"
header /assets/* Cache-Control "public, max-age=31536000, immutable"
try_files {path} /index.html
file_server
```

- [ ] **Step 6: Deploy staging and read back the URL**

```bash
railway environment staging
railway add --service api
railway up --service api --detach
railway domain --service api
```

Repeat `railway add` / `railway up` / `railway domain` for `staff`, `parent`, `dashboard`.

- [ ] **Step 7: Record the real hostnames**

`infra/railway/domains.json` — filled from the `railway domain` output:

```json
{
  "$comment": "The only place a hostname is written. SPEC §15 item 5 (stable custom domain) is still open; these are Railway-generated subdomains. Replace base_domain and the four hosts per environment when the domain lands — nothing else changes.",
  "base_domain": null,
  "environments": {
    "development": {
      "api": "http://localhost:8000",
      "staff": "http://localhost:5173",
      "parent": "http://localhost:5174",
      "dashboard": "http://localhost:5175"
    },
    "staging": {
      "api": "https://<from railway domain>",
      "staff": "https://<from railway domain>",
      "parent": "https://<from railway domain>",
      "dashboard": "https://<from railway domain>"
    },
    "production": {
      "api": "https://<from railway domain>",
      "staff": "https://<from railway domain>",
      "parent": "https://<from railway domain>",
      "dashboard": "https://<from railway domain>"
    }
  }
}
```

- [ ] **Step 8: Verify staging is actually reachable over HTTPS**

```bash
curl -fsS "$(python3 -c "import json;print(json.load(open('infra/railway/domains.json'))['environments']['staging']['api'])")/api/v1/health"
```

Expected: `{"status":"ok","env":"staging"}`. This is §15 item 3 satisfied — the URL W4's uPay
IPN testing needs.

- [ ] **Step 9: Run the tests and commit**

```bash
.venv/bin/pytest tests/config -q
git add infra/ railway.json Dockerfile web/apps/*/Caddyfile tests/config/test_railway_config.py \
        docs/deploy/railway-runbook.md
git commit -m "infra(railway): dev, staging and production environments

Staging serves a public HTTPS URL — §15 item 3, which W4's uPay IPN testing needs.
Every hostname lives in infra/railway/domains.json and nowhere else, so swapping
in the real domain (§15 item 5, still open) is a one-file change and not a rebuild.
Each PWA gets its own origin: staff and parent must not share origin-scoped
IndexedDB, which holds pending_ops (§10.6) and health flags (G7)."
```

---

### Task 13: Device verification and the iOS walkthrough

The exit gate. Tasks 1–12 make the apps installable; this proves it and writes down the taps
that M1 turns into an onboarding screen.

**Files:**
- Create: `docs/install/ios-walkthrough.md`
- Create: `docs/install/android-walkthrough.md`
- Create: `docs/install/verification-log.md`

- [ ] **Step 1: Establish what the simulator can and cannot prove**

Boot the simulator and try the install path end to end, rather than assuming:

```bash
xcrun simctl boot "iPhone 16 Pro"
open -a Simulator
xcrun simctl openurl booted "https://<staging staff host>/"
```

Then, in the simulator's Safari, attempt Share → Add to Home Screen and record what actually
happens in `verification-log.md`. Expected finding, to be confirmed rather than assumed: the
simulator does not offer a working Add to Home Screen, and cannot exercise Web Push at all
(no APNs). If so, the simulator covers the *rendering* half — RTL, Rubik, light/dark, service
worker registration — and the install gate still needs real hardware.

- [ ] **Step 2: Verify on the Android emulator**

The Android emulator with a Google Play system image does generate WebAPKs, so this half is
genuinely automatable:

```bash
~/Library/Android/sdk/emulator/emulator -list-avds
~/Library/Android/sdk/emulator/emulator -avd <avd> &
~/Library/Android/platform-tools/adb shell am start -a android.intent.action.VIEW \
  -d "https://<staging staff host>/"
```

In Chrome: the install prompt should appear, or ⋮ → *Add to Home screen* → *Install*. Confirm
the launched app has no browser chrome. Record the result.

- [ ] **Step 3: Write `docs/install/ios-walkthrough.md`**

Verify each step against the real device before committing the file — this text becomes an
onboarding screen in M1, so a wrong tap here becomes a wrong instruction in front of a parent.

```markdown
# Installing on iPhone — the exact taps

iOS gives no way to *trigger* an install (`beforeinstallprompt` is Chromium-only),
so this is taught, never prompted (§6.5). On iPhone the app must be on the home
screen or **push notifications do not exist at all** — Apple exposes the Push API
only to a home-screen web app.

## Before you start

The link must open in **Safari**. This is the single most common failure: an
invitation link tapped inside WhatsApp, Gmail or Instagram opens in that app's
in-app browser, which has no *Add to Home Screen*.

If the page did not open in Safari:
1. Tap the **⋯** or **Open in browser** control in the in-app browser (bottom-right
   in WhatsApp, top-right in Gmail).
2. Choose **Open in Safari**.

## The taps

1. Open the invitation link in **Safari**.
2. Tap the **Share** button — the square with an arrow pointing out of the top, in
   the centre of the bottom toolbar. (In landscape or on iPad it is top-right.)
3. Scroll the share sheet **down** past the row of apps and past *Copy*, *Add to
   Reading List* and *Add Bookmark*.
4. Tap **Add to Home Screen** — Hebrew: **הוספה למסך הבית**.
5. The name field is pre-filled from the app. Leave it or shorten it.
6. Tap **Add** (top-right) — Hebrew: **הוסף**.
7. The icon appears on the home screen. **Tap the icon, not the Safari tab** — the
   app only counts as installed when launched from the icon.
8. It opens with no address bar and no Safari toolbar. That is standalone mode, and
   it is what the app checks for.

## If *Add to Home Screen* is not in the share sheet

- The page is not open in Safari — go back to *Before you start*.
- Or the action was hidden: scroll to the bottom of the share sheet, tap
  **Edit Actions…**, and turn on **Add to Home Screen**.
- Private Browsing hides it on some iOS versions. Open the link in a normal tab.

## Verified on

<!-- filled in by Task 13 Step 4 -->
| Device | iOS | Result | Date |
|---|---|---|---|
```

- [ ] **Step 4: Verify on the real devices and fill the log**

§15 item 4 supplies one iPhone and one Android. For each of the three apps on each device:

1. Open the staging URL from `infra/railway/domains.json`.
2. Follow the walkthrough exactly. Correct the text wherever a tap differs.
3. Launch from the home-screen icon.
4. Confirm: no browser chrome; Hebrew renders in Rubik with no tofu; layout is RTL;
   the theme buttons switch light/dark; the screen reports *מותקן במסך הבית*.
5. On the staff app, confirm the persistence result was recorded — Safari Web Inspector →
   Storage → Local Storage → `studio.storage.persistence`.
6. Turn on airplane mode and relaunch. The app shell and Rubik must still render — that is
   the precache working, and it is what §6.1's offline priming depends on.

Record every result in `docs/install/verification-log.md`, including failures.

- [ ] **Step 5: Commit**

```bash
git add docs/install/
git commit -m "docs(install): iOS and Android walkthroughs, device verification log

The iOS walkthrough is verified tap-by-tap on hardware because M1 turns it into
an onboarding screen — a wrong tap here becomes a wrong instruction in front of a
parent. The in-app-browser trap is documented first: it is the most likely way an
invitation link fails, and §6.5 leaves no store listing to fall back on."
```

---

## Self-review

**Spec coverage.**

| Requirement | Task |
|---|---|
| C1 CLAUDE.md §Layout, i18n line, RTL rule re-scope | 1 |
| C1 item 3 — D10 ESLint rule against the new globs | 2 (flagged as beyond the brief) |
| C6 delete `POST /people/{id}/payment-mode` | 1 |
| C7 `club_id` → `studio_id` + TenantMixin | 1 |
| C8 allow/deny `.venv/bin` patterns | 1 |
| §8.2 monorepo tree, npm workspaces at `web/` | 2–7 |
| No `native/` directory | 1 (stated in CLAUDE.md), 6 (never created) |
| Three Vite apps, one hello screen each | 6 |
| Hello proves Rubik, `dir="rtl"`, light/dark | 4, 6 (unit), 10 (real browser) |
| CI typecheck, lint, pytest, vitest | 11 |
| CI generated-api-client diff fails the build | 7, 11 |
| CI dependency + secret scanning | 11 |
| Railway dev/staging/production, real domain | 12 |
| Staging public HTTPS URL (§15 item 3) | 12 step 8 |
| Manifest per app: name, short_name, start_url, scope, standalone, colours, icons | 8 |
| iOS apple-touch-icon sizes | 8 |
| Workbox SW in all three apps | 9 |
| Rubik subset precached | 9 |
| `useDisplayMode()` in `web/packages/core` | 5 |
| `navigator.storage.persist()` on staff boot, result recorded | 5, 6 |
| Installability check in CI | 10, 11 |
| Exit gate: iPhone + Android install, standalone | 13 |
| Exact iPhone taps for M1 | 13 step 3 |
| Seam 2 (module registration) | 7 |
| Seam 3 (i18n namespaces) | 3 |

**Gaps accepted, and why.** Seam 1 (Alembic) has no migration in M0.1 because there is no
schema yet. Seam 4 (slot registry) has no consumer until M3. Both are named in the
out-of-scope list rather than silently dropped. The `native/` absence is asserted only by
CLAUDE.md prose — no test forbids the directory, which is proportionate.

**Type consistency.** `DisplayMode`, `PersistenceResult`, `ThemePreference`, `ResolvedTheme`,
`Locale`, `Namespace` and `Bundle` are each defined once and imported everywhere else.
`THEME_COLOR` is defined in Task 4 and consumed by Task 8's manifests, which is what keeps the
manifest colour and the CSS token from drifting.

**Placeholder scan.** The only deliberate placeholders are the brand mark (§15 item 7 is
outstanding and blocks M1) and `ru/common.ts` (§15 item 9 is outstanding). Both are labelled
in-file with the spec item that unblocks them, and the `ru` gap is load-bearing — it exercises
the Hebrew fallback rather than hiding it.

**Open input, restated.** §15 item 5, the stable HTTPS domain, is unresolved. The plan
proceeds on Railway-generated subdomains and confines every hostname to
`infra/railway/domains.json`, so the swap is one file. Nothing else in M0.1 blocks on it.
