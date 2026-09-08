# Club photographs held back pending rights and consent

Five photographs of the club, withdrawn from publication on 2026-09-08 and kept here.

They were in `web/apps/parent/public/clubs/` and rendered on the public landing page. Two
questions were open and neither had an answer:

1. **Copyright.** Who took them. A photograph taken at a club event by a parent is not
   automatically the club's to publish, and a hired photographer's work needs a licence or
   an assignment.
2. **The people in them.** They show identifiable minors. `photo_video` already exists in
   `GRANTABLE_CONSENT_TYPES` — the mechanism is there and nothing tied it to what was
   actually published. Meanwhile `privacy.policy.s3.body` promises parents that photo
   consent is voluntary and that refusing changes nothing. A published gallery that no
   consent record backs makes that sentence untrue.

**Not deleted, and not left in `public/`.** Anything under `public/` is fetchable by direct
URL whether or not a page links to it, so un-rendering alone would not have taken them down.

## Putting one back

Per photo, both must hold:

- the club owns the copyright or holds a licence, and
- every identifiable child's guardian has a `photo_video` consent on record.

Then move that file back into `web/apps/parent/public/clubs/` and add it to
`GALLERY_PENDING_CONSENT` → `GALLERY` in
`web/apps/parent/src/features/landing/clubContent.ts`. The alt text for each is still in
that file, written per photo — it was already good and is worth keeping.
