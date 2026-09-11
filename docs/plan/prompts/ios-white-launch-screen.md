# Bug: the installed app opens on a white screen with the gi logo

## Symptom

Owner taps the app on his iPhone home screen. He gets a **white screen with the club's
judo-gi mark** on it, then the sign-in page. Both installable apps — parent
(`app.gladiatorclub.co.il`) and staff (`staff.gladiatorclub.co.il`). Reinstalling did
not change it.

## What is already ruled out — do not redo any of this

Eight commits on 2026-09-08 tried to fix it and none did. All reverted in `b8b92a17`.
They were: a React loading screen, an inline `#boot-splash` in each `index.html`, the
iOS launch images redrawn flat navy, and a 700ms minimum hold. The owner stopped the
work: **"why the overcomplications."** Do not rebuild them.

Verified against production before the revert — every one of these was already correct:

- all 30 `apple-touch-startup-image` tags served in the HTML
- the launch PNGs flat navy, no logo (`#14306b` staff, `#001849` parent)
- `manifest.webmanifest` `background_color` navy
- served PNG bytes identical to the repo's

**Nothing left in our code was white.** That is the whole point of this handoff.

## The likely cause

iOS composes its *own* launch screen — white, with the app icon on it — when no
`apple-touch-startup-image` media query matches the device. The icon is the gi mark.
That would explain a white screen with the logo that our own navy images cannot touch.

## Start here

1. **Ask the owner his exact iPhone model and iOS version.** Compare against the device
   table in [web/tools/splash-screens.mjs](../../../web/tools/splash-screens.mjs). If no
   row matches his phone, that is the bug and the fix is one row.
2. iOS caches the launch screen **at install time**. Any change needs the app removed
   from the home screen and re-added before it can be judged.
3. If a row does match his phone, the theory above is wrong — find out what iOS is
   actually doing before changing anything.

## Owner's own suggestion, if a simple fix is wanted

> "just use the same page but make it navy blue and instead of the staff logo write
> gladiator club"

I was part-way into that when he stopped me: draw `GLADIATOR / CLUB` in white on the
navy ground into the launch PNGs, so iOS's picture and the app's first paint match. It
renders correctly (checked). It only helps if iOS is using **our** image — see step 1.

## Constraint

Keep it to one change. If the first fix does not remove the white screen, stop and
re-diagnose rather than adding a second mechanism. That is how the last attempt reached
eight commits.
