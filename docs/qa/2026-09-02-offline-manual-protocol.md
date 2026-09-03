# The 90-minute airplane-mode run — a numbered protocol

For `HB-w3-manual-offline` (`docs/plan/state.yaml`, still `open`). Written so the manager,
or anyone else with a phone, can run it without reading the code first.

**What this proves that no automated test can.** The staff app's offline queue is covered
by real unit and component tests (`web/packages/core/src/offline/`,
`RosterScreen.test.tsx`, `NetworkStatus.test.tsx`, `ConflictSection.test.tsx`) and the dev
bar's forced-network-mode toggle proves every one of those code paths runs. None of that
proves iOS actually **suspends the app the way we assumed** when it has been backgrounded
in airplane mode for an hour and a half in a basement with no signal — a native container's
storage guarantee was traded away on purpose (§6.5), and this run is the only thing that
checks the trade held.

## Before you start

- A phone (iOS is the one this run is specifically about — §6.5's storage trade is an iOS
  Safari/PWA question; Android's WebView guarantee is different and not what this protocol
  is checking).
- The staff app installed as a **standalone PWA** — not a browser tab. From Safari, open
  the staff app on staging, tap Share → Add to Home Screen, and open it from the home
  screen icon from here on. §6.5's storage promise is conditioned on standalone mode; a
  browser tab does not get it, and running this test in a tab would tell you nothing about
  what a coach's actual home-screen icon does.
- A real coach or manager sign-in on **staging**, not production — this run marks
  attendance and files notes; do it against `staff.staging.gladiatorclub.co.il`, never
  against the club currently trialing on production.
- A session scheduled for **today**, with at least 4-5 students on the roster, so there is
  something real to mark and something real to watch sync back.
- A stopwatch or just the phone's clock — the timing (90 minutes) is the point.

## The run

1. **Open the roster while still online.** Sign in, navigate to today's session, open the
   register. Confirm it loads and the top strip (`NetworkStatus`) shows nothing — no mode
   text, no pending count. This is the baseline: online, empty queue.

2. **Turn on airplane mode.** Not Wi-Fi off and cellular on separately — airplane mode,
   fully, the way a coach in a basement with a dead phone signal actually experiences it.

3. **Confirm the top strip changes within a few seconds** to `לא מקוון` (offline), with the
   reassurance line beneath it (`הסימונים נשמרים במכשיר ויסונכרנו כשהחיבור יחזור`). If it
   does not change, or takes longer than the network monitor's poll interval to notice,
   that is itself a finding — write down how long it actually took.

4. **Mark 4-5 students on the register** — a mix of present and absent, at least one bulk
   "mark all present" if the roster has an unmarked section. After each tap:
   - the row updates immediately (this is the optimistic-write guarantee — it must not
     wait for a network that is not there);
   - the top strip's pending count increases by one **per mark**, not per tap-sequence —
     tapping the same student three times (present → absent → unmarked → present) should
     still show as **one** pending mark for that student, not three (§10.5's client-side
     idempotency on `client_mark_id`).
   - Confirm the count reads correctly at each step: "סימון אחד ממתין לסנכרון" at exactly
     one pending mark, "N סימונים ממתינים לסנכרון" from two up — this is the plural-rule
     fix from register §9; if you see "1 סימונים" anywhere, the fix did not ship.

5. **Close the app** (swipe it away, don't just lock the screen — the point is to let iOS
   actually decide what to do with a backgrounded PWA) **and leave it closed for 90
   minutes**, phone still in airplane mode the whole time. Do something else. Set an alarm.

6. **After 90 minutes, reopen the app — still in airplane mode.** Confirm:
   - the roster still shows every mark you made in step 4, exactly as you left it (this is
     the thing that cannot be proven any other way — if iOS evicted the local database
     while the app was backgrounded, this is where it would show up as marks silently
     reverting to unmarked);
   - the top strip still reads offline, with the same pending count as when you closed the
     app — nothing should have quietly drained, retried, or been lost while backgrounded
     with no network.

7. **Turn off airplane mode.** Watch the top strip. Within roughly fifteen seconds to a
   couple of minutes (the drain is client-triggered on reconnect, not on a fixed timer),
   confirm:
   - the mode text disappears (back to online);
   - the pending count **counts down**, not just disappears in one jump — if you marked 5
     students, you should be able to see it pass through 4, 3, 2, 1 if you watch closely
     (network latency permitting), or at minimum go straight from 5 to gone with no error
     shown in between;
   - every mark you made in step 4 is now reflected on **another device or the dashboard**
     signed into the same studio — the real proof it reached the server, not just that the
     local badge went quiet.

8. **Optional, if you have a second phone or the dashboard open on a laptop the whole
   time:** have a manager mark the same session's attendance from the dashboard *while your
   phone is still offline* in step 5. When you reconnect in step 7, you should see a
   conflict card (`ConflictSection`, "§10.5's four cases") rather than your offline mark
   silently overwriting theirs or vice versa. This is the one state genuinely worth trying
   to provoke on purpose, since it is the hardest to hit by accident and the automated
   coverage (`ConflictSection.test.tsx`) proves the card renders correctly but cannot prove
   the real conflict-detection round trip end to end.

## What to report back

For each numbered step: it happened as described, or it did not — and if not, exactly what
you saw instead, with a screenshot if the phone lets you take one without leaving airplane
mode (it will). The three specific captures worth keeping, since register §9 noted the
evidence set never had them:

- the top strip mid-queue, showing a pending count greater than zero;
- the roster screen after the 90-minute reopen, still showing your marks;
- the top strip mid-drain on reconnect, ideally caught between two different pending
  counts.

If every step passed: `HB-w3-manual-offline` closes, and this file's evidence is what
closes it — cite it in `docs/plan/state.yaml`. If any step failed, that failure is the
finding; do not round it up to a pass.
