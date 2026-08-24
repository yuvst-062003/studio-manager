# Installing on Android — the exact taps

Unlike iOS, Chromium fires `beforeinstallprompt`, so the app **can** offer a real
install button (§6.5). M1 wires that up. The manual path below is the fallback and
the thing to test against.

## The taps

1. Open the invitation link in **Chrome**.
2. Chrome usually shows an **Install** prompt at the bottom of the screen. Tap
   **Install** and you are done.
3. If no prompt appears, tap the **⋮** menu, top-right.
4. Tap **Add to Home screen** — Hebrew: **הוספה למסך הבית**.
5. Confirm with **Install**.
6. Launch from the home-screen icon. There should be no address bar.

## Why the prompt sometimes does not appear

- Chrome applies an engagement heuristic: it may want a few seconds on the page
  before offering the install.
- The app is already installed.
- The link opened in an in-app browser (WhatsApp, Facebook) rather than Chrome —
  same trap as iOS. Use the ⋮ → **Open in Chrome** control first.

## A real install, not a shortcut

On a device with Google Play Services, Chrome generates a **WebAPK** — a real
package with its own icon and its own entry in the app switcher. Without Play
Services (some emulator images, some non-Google devices) Chrome creates a plain
shortcut instead, which still launches standalone but is not a true install.

Test on a device with Play Services.

## Verified on

See [verification-log.md](verification-log.md).
