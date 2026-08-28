# l4 + l7 — link targets and network log (transcripts)

## l4 link hrefs (read from the DOM)
- ניווט → https://maps.google.com/?q=שרת 28 ב (URL-encoded)
- וואטסאפ → https://wa.me/972549577552 (club number, intl format)
- phone → tel:0549577552 (tappable, hero + footer)

## l7 — fresh load of /t/gladiator, full network log: 12 requests
Only two API calls, both public; zero authenticated requests:
- GET /api/v1/public/studios/gladiator/landing → 200
- GET (app origin) /api/v1/public/studios/gladiator/logo → 200
Everything else: index.html, JS/CSS bundles, manifest, workbox, 3 font files, favicon, icon-192.
No /auth/*, no /me/*, no Authorization-bearing calls. Booking form is OPEN on load;
its first step is התחברות ("התחברות והמשך").
