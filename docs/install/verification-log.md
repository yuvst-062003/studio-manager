# Install verification log

What has actually been confirmed, and what has not. Nothing here is inferred.

## What the iOS Simulator proved — Xcode 16.4, iOS 18.6, iPhone 16 Pro

Run against `apps/staff/dist` served over `http://localhost:8899`.

| Check | Result |
|---|---|
| Page loads in real iOS Safari | ✅ |
| `dir="rtl"` applies, layout mirrors | ✅ |
| Rubik renders Hebrew, Latin and Cyrillic with no tofu | ✅ |
| Light theme ground `#f7f5f1` | ✅ |
| `useDisplayMode()` reports browser mode when not installed | ✅ — screen reads **פועל בדפדפן** |

That last row is worth calling out: it is the first confirmation that
`getDisplayMode()` behaves correctly against real WebKit rather than jsdom stubs.

## What the iOS Simulator could not prove

| Check | Why not |
|---|---|
| **Add to Home Screen** exists in the share sheet | `simctl` has no tap primitive, and driving the UI via AppleScript needs assistive access this machine has not granted. Not automatable here. |
| Launching standalone from the home-screen icon | Same — depends on completing the install. |
| Web Push | The simulator has no APNs connection. Web Push cannot be exercised on a simulator at all, on any iOS version. |
| Storage eviction under pressure | Not reproducible on a simulator. §6.5 accepts this as managed, not engineered around. |

**Conclusion: the simulator covers the rendering half and nothing of the install
half.** SPEC §15 item 4 (one iPhone and one Android) is still required, and the
exit gate stays open until it is met. That is not a formality — §6.5 makes the iOS
install the product's main adoption risk, and the walkthrough becomes an onboarding
screen in M1, so a wrong tap becomes a wrong instruction in front of a parent.

## Android emulator

Not run. The only installed system image is `android-35/google_apis`, which has no
Play Services. Chrome on that image creates a **shortcut**, not a WebAPK, so it
cannot verify a real install. A `google_apis_playstore` image would be needed —
or, better, the real device §15 item 4 already calls for.

## What CI does cover, automatically, on every push

`web/scripts/check-installability.mjs`, run by the `installability` job:

- manifest present, fetchable, and valid against Chromium's installability criteria
- `display: standalone`, `start_url` within `scope`, theme and background colours set
- 192 and 512 icons present, a maskable icon present, all icons resolve (no 404s)
- `apple-touch-icon` link present — without it iOS uses a screenshot of the page
- service worker registers and reaches `activated`
- Rubik actually loaded (`document.fonts.check`)
- `dir="rtl"` actually applied

Observed failing on a deliberately broken manifest before being trusted.

## Still to do — needs hardware

| # | Check | Device |
|---|---|---|
| 1 | Install all three apps to the home screen | iPhone |
| 2 | Each launches standalone, no browser chrome | iPhone |
| 3 | Screen reads **מותקן במסך הבית** | iPhone |
| 4 | Hebrew renders in Rubik, layout RTL, light/dark both work | iPhone |
| 5 | `studio.storage.persistence` recorded (Web Inspector → Storage → Local Storage) | iPhone, staff app |
| 6 | Airplane mode + relaunch: shell and font still render | iPhone |
| 7 | Repeat 1–6 | Android with Play Services |
| 8 | Correct every tap in [ios-walkthrough.md](ios-walkthrough.md) that differs | both |

### Results

| Device | OS | App | Result | Date |
|---|---|---|---|---|
| _pending_ | | | | |
