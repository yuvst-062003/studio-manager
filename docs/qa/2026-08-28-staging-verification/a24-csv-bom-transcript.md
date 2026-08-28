# a24 — accountant + attendance CSV: BOM + Hebrew headers (authenticated fetch, bytes inspected)

Fetched in-page with the app's own Bearer token (refresh → access token), read raw bytes:

## /api/v1/exports/accountant?year=2026&month=8 → 200
- first 3 bytes: ef bb bf (UTF-8 BOM ✓)
- header row: תאריך,משלם,אמצעי,"סכום בש""ח",קבלה,בוטל
- 73 bytes total (no payment rows yet — headers only, correct)

## /api/v1/exports/attendance?from=2026-08-01&to=2026-08-28 → 200
- first 3 bytes: ef bb bf (UTF-8 BOM ✓)
- header row: תאריך,קבוצה,חניך,סטטוס
- 46 bytes total (no attendance rows yet)

UI path exists: תשלומים וגבייה screen has ייצוא לרו"ח (downloadFile carries the Authorization header).
