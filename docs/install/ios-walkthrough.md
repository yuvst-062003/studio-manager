# Installing on iPhone — the exact taps

> **This file becomes an onboarding screen in M1.** Every tap below must be
> confirmed on real hardware before it is shown to a parent. See
> [verification-log.md](verification-log.md) for what is confirmed and what is not.

iOS gives no way to *trigger* an install — `beforeinstallprompt` is Chromium-only —
so this is **taught, never prompted** (§6.5). And on iPhone the app must be on the
home screen or **push notifications do not exist at all**: Apple exposes the Push
API only to a home-screen web app. A parent who never installs is reachable only
by telephone, because §5.11 permits no email or SMS fallback.

## Before you start: the link must open in Safari

This is the single most common failure. An invitation link tapped inside WhatsApp,
Gmail, Instagram or Facebook opens in *that app's* in-app browser, which has no
**Add to Home Screen** at all.

If the page did not open in Safari:

1. Tap the **⋯** or **Open in browser** control in the in-app browser — bottom-right
   in WhatsApp, top-right in Gmail.
2. Choose **Open in Safari**.

## The taps

1. Open the invitation link in **Safari**.
2. Tap the **Share** button — the square with an arrow pointing up out of it, in the
   **centre of the bottom toolbar**, between the back/forward arrows and the
   bookmarks icon. On iPad, or iPhone in landscape, it sits at the top-right instead.
3. Scroll the share sheet **down**, past the row of app icons and past *Copy*,
   *Add to Reading List* and *Add Bookmark*.
4. Tap **Add to Home Screen** — Hebrew: **הוספה למסך הבית**.
5. The name field is pre-filled from the app (`צוות`, `הורים` or `ניהול`). Leave it
   or shorten it.
6. Tap **Add**, top-right — Hebrew: **הוסף**.
7. The icon appears on the home screen. **Tap that icon, not the Safari tab.** The
   app only counts as installed when it is launched from the icon.
8. It opens with no address bar and no Safari toolbar. That is standalone mode, and
   it is what the app checks for — the screen will say **מותקן במסך הבית** rather
   than **פועל בדפדפן**.

## If *Add to Home Screen* is not in the share sheet

- The page is not open in Safari. Go back to *Before you start*.
- The action is switched off: scroll to the bottom of the share sheet, tap
  **Edit Actions…**, and turn on **Add to Home Screen**.
- Private Browsing hides it on some iOS versions. Open the link in a normal tab.

## Verified on

See [verification-log.md](verification-log.md).
