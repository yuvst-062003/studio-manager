// The half of the service worker that makes a phone light up. Imported by the Workbox
// worker vite-plugin-pwa generates, through `workbox.importScripts` — see tools/push-sw.mjs
// for why it is bolted on rather than written into a hand-authored worker.
//
// **This file is not bundled.** It is served verbatim and evaluated inside the service
// worker's global scope, so it may use nothing but the ServiceWorkerGlobalScope API: no
// imports, no @studio/i18n, no JSX, no optional chaining beyond what Safari 16.4 shipped.
// The route table and the fallback copy are injected above it as `self.__PUSH_ROUTES` and
// `self.__PUSH_FALLBACK` by the plugin, which is what keeps one handler serving three apps
// whose hash routers agree on nothing.
//
// **Every push MUST show a notification.** `usePushRegistration.ts` subscribes with
// `userVisibleOnly: true`, which is a promise to the browser. Break it and Chrome shows its
// own "This site has been updated in the background" in place of ours, then eventually
// revokes the permission. That is why `showFor` has no path that resolves without calling
// `showNotification` — a malformed message becomes the generic line, never silence.
//
// **§18.3 applies here too.** Nothing in this file logs a title, a body or a payload. A
// service worker's console is the one log a parent can open on their own phone.

/* global self, clients, URL */

/** What arrives on the wire, from `app/services/comms/push.py::WebPushSender.send`. */
// @typedef {{ title?: string, body?: string, kind?: string, payload?: Record<string, string> }} PushMessage

/**
 * The message, or `null` when there is nothing readable to show.
 *
 * A push with no data at all is legal and does happen — a push service may wake a worker to
 * say only "something changed". `null` is the honest answer, and the caller turns it into
 * the generic line rather than guessing.
 */
function readMessage(event) {
  if (!event.data) return null
  try {
    return event.data.json()
  } catch {
    return null
  }
}

/**
 * Which screen a tap on this notification opens.
 *
 * Routes are keyed on the kind's PREFIX — everything before the first dot — which is the
 * same convention `app/services/comms/kinds.py` reads to decide which preference switch
 * governs a notification. One convention, so a new `attendance.*` kind needs no edit in
 * either place.
 *
 * A template may name payload fields as `:student_id`. If the producer did not send one,
 * the template is abandoned for the fallback rather than opening `#/student/undefined` —
 * a dead screen is worse than the inbox, because the inbox always holds the message.
 */
function routeFor(kind, payload) {
  var routes = self.__PUSH_ROUTES || {}
  var fallback = self.__PUSH_FALLBACK || '#/'
  var prefix = String(kind || '').split('.')[0]
  var template = routes[prefix]
  if (!template) return fallback
  // NUL is the "a field was missing" marker, written as an escape rather than as the byte
  // itself: no route contains one and `encodeURIComponent` escapes it, so a real id can
  // never be mistaken for the marker — and the file stays plain ASCII for git and eslint.
  var missing = '\u0000'
  var resolved = template.replace(/:([a-z_]+)/g, function (whole, field) {
    var value = payload && payload[field]
    return value ? encodeURIComponent(String(value)) : missing
  })
  return resolved.indexOf(missing) === -1 ? resolved : fallback
}

/** The one place a notification is drawn. Always resolves having shown exactly one. */
function showFor(message) {
  var fallbackTitle = self.__PUSH_FALLBACK_TITLE || 'עדכון חדש'
  var fallbackBody = self.__PUSH_FALLBACK_BODY || 'יש לכם הודעה חדשה במועדון'
  var title = (message && message.title) || fallbackTitle
  var body = (message && message.body) || fallbackBody
  var payload = (message && message.payload) || {}
  var kind = (message && message.kind) || ''
  return self.registration.showNotification(title, {
    body: body,
    icon: 'icons/icon-192.png',
    // The same 192 rather than a monochrome badge asset: Android silhouettes whatever it is
    // given, and a silhouetted logo is a recognisable blob where no asset at all is the
    // browser's own generic dot. When a dedicated badge is drawn, this is the line to change.
    badge: 'icons/icon-192.png',
    // Hebrew, RTL, and said explicitly: the notification is drawn by the OS shell, which has
    // no <html dir> to inherit from and would otherwise lay the body out left to right.
    dir: 'rtl',
    lang: 'he',
    // No `tag`. Tagging by kind would collapse two belt awards for two children into one
    // notification and the second child's would never be seen — §5.11 fans out per person
    // and per event, so each message is its own.
    data: { url: routeFor(kind, payload) },
  })
}

self.addEventListener('push', function (event) {
  event.waitUntil(showFor(readMessage(event)))
})

/**
 * Focus the app if it is already open, otherwise open it — and in both cases land on the
 * screen the notification is about.
 *
 * `client.navigate` rather than reusing whatever hash the open tab happens to be on: a
 * parent who left the app on the payments screen and taps a belt notification is asking for
 * the belt, not for what they were doing an hour ago.
 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var target = (event.notification.data && event.notification.data.url) || '#/'
  var url = new URL(target, self.registration.scope).href
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windows) {
        for (var i = 0; i < windows.length; i += 1) {
          var open = windows[i]
          if (open.url.indexOf(self.registration.scope) !== 0) continue
          // **focus() is best-effort; navigate() is the feature.** `WindowClient.focus()`
          // requires user activation and rejects with `InvalidAccessError: Not allowed to
          // focus a window` without it — a real Chrome did exactly that on 2026-09-13. This
          // used to be `focus().then(navigate)`, so that rejection skipped the navigation
          // and a tapped notification did nothing whatsoever. Swallowing the focus failure
          // and navigating anyway is the difference between landing on the wrong screen and
          // landing on no screen at all.
          return open
            .focus()
            .catch(function () {
              return open
            })
            .then(function (focused) {
              var reachable = focused || open
              return reachable.navigate ? reachable.navigate(url) : reachable
            })
        }
        return clients.openWindow(url)
      })
      .catch(function () {
        // A tap that cannot open a window is a dead end either way; swallowing keeps the
        // worker alive for the next push rather than leaving an unhandled rejection.
      }),
  )
})

/**
 * The subscription the browser silently replaced.
 *
 * A push endpoint is not forever: browsers rotate one when their push service moves, and the
 * old one then 410s for good. Re-subscribing HERE is all this worker can do — it holds no
 * access token (`packages/core/src/identity/session.ts` keeps that in the page's memory) and
 * the refresh cookie is scoped to the refresh endpoint alone, so it cannot tell our server
 * about the new endpoint. The page does that: `usePushRegistration.ts` re-posts the current
 * subscription on every launch, and `POST /push-tokens` is idempotent by design for exactly
 * this. Without the re-subscribe below there would be nothing for it to post.
 *
 * `event.oldSubscription` is absent in some browsers; `applicationServerKey` off the existing
 * subscription is the fallback, and if neither exists there is no key to re-subscribe with
 * and the launch path has to recover it.
 */
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        var old = event.oldSubscription
        if (old && old.options && old.options.applicationServerKey) return old.options
        return self.registration.pushManager.getSubscription().then(function (current) {
          return current && current.options ? current.options : null
        })
      })
      .then(function (options) {
        if (!options || !options.applicationServerKey) return null
        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: options.applicationServerKey,
        })
      })
      .catch(function () {
        // Nothing to recover from in the worker. The next launch re-registers.
      }),
  )
})
