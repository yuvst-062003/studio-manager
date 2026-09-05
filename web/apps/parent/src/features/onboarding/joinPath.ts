// Task 7 -- lifted out of `JoinFlow.tsx` when that module's own four screens were
// retired (door B now runs on the redesigned wizard, `wizard/JoinWizard.tsx`). This one
// function had nothing to do with those screens -- it is the `/join/{token}` route
// matcher `App.tsx` calls before anything else mounts -- so it moves here, with its own
// tests, rather than being deleted alongside the rest or inlined into `App.tsx`.

/** `/join/<token>` → the token, or null. A real path, not a hash: the URL lives in a
 *  WhatsApp message and must survive being tapped cold. */
export function matchJoinPath(pathname: string): string | null {
  const match = /^\/join\/([A-Za-z0-9_-]{16,})$/.exec(pathname)
  return match ? (match[1] ?? null) : null
}
