// Pull-to-refresh must reach every screen-level read.
//
// `PullToRefresh` used to call `location.reload()`. That was heavy-handed — it restarted the
// app, which is the "it regenerates the screen from the start" the owner reported on
// 2026-09-08 — but it had one property the replacement has to earn rather than assume: a
// document reload CANNOT miss a read. The file said so itself: "a refresh that quietly
// missed one would be worse than none — the parent would be looking at a stale number
// believing they had just asked for it."
//
// `requestRefresh()` publishes to subscribers instead, so a loader that forgets to
// subscribe is exactly that failure, and it is silent: the screen looks refreshed. Nothing
// about a stale number announces itself.
//
// So subscription is a build gate rather than a convention. The list is explicit and not a
// heuristic — a rule that guessed which files "look like loaders" would either miss one or
// cry wolf, and both teach people to ignore it. Adding a screen that owns a read means
// adding it here, which is the moment to notice it needs the signal at all.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Files that own a top-level read for a screen the pull gesture can reach.
 *
 * NOT every file that fetches. A read that only ever runs behind a press — a sheet's
 * contents, a wizard step — is re-read when the parent opens it again, and pulling on the
 * screen behind it is not a request to refresh something that is not on screen.
 */
const LOADERS_THAT_MUST_SUBSCRIBE = [
  // The shell's own read: the children, the plan, the day's lessons. Everything בית draws.
  'apps/parent/src/features/identity/Resolve.tsx',
  // תשלומים — the debts, the terms, the balance, the promises.
  'apps/parent/src/features/billing/redesign/ParentPayments.tsx',
  // The plan screen, per child.
  'apps/parent/src/features/billing/redesign/PlanSection.tsx',
  // The other three tabs. All four have to answer, or the gesture is a lie on whichever
  // one the parent happened to be standing on -- and a lie of exactly the kind the old
  // `location.reload()` could not tell.
  'apps/parent/src/features/comms/redesign/UpdatesScreen.tsx',
  'apps/parent/src/features/billing/redesign/ClubShop.tsx',
  'apps/parent/src/features/people/redesign/ProfileScreen.tsx',
]

describe('every screen-level loader answers pull-to-refresh', () => {
  it.each(LOADERS_THAT_MUST_SUBSCRIBE)('%s subscribes to the refresh signal', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf-8')
    expect(source).toContain('useRefreshSignal')
  })

  it.each(LOADERS_THAT_MUST_SUBSCRIBE)('%s puts the signal in a dependency array', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf-8')
    // Importing the hook and not using it is the same defect wearing a passing test: the
    // subscription only exists where the value reaches an effect's dependencies.
    expect(source).toMatch(/}, \[[^\]]*refreshSignal[^\]]*\]\)/)
  })

  it('still routes the gesture through the bus rather than reloading the document', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/parent/src/features/shell/PullToRefresh.tsx'),
      'utf-8',
    )
    expect(source).toContain('requestRefresh')
    // The regression this whole change is about: `location.reload()` restarts the app.
    //
    // Comments are stripped first, and that is not a convenience — the file's header NAMES
    // `location.reload()` in order to explain what replaced it and why the old choice was
    // reasonable. A guard that read prose would either fail on an accurate comment or
    // pressure someone into deleting the explanation to get a green build, which is the
    // opposite of what this repo wants its comments to be worth.
    const code = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
      })
      .join('\n')
    expect(code).not.toContain('location.reload()')
  })
})
