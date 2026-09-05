// The shapes עדכונים's ported components take.
//
// THE MAPPING. `NotificationOut` carries `{id, kind, title, body, created_at, read_at,
// action?}` and `NotificationActionOut` carries `{kind, outstanding, settled_at,
// subject_name}`. That is enough for all three of the prototype's sections without
// inventing a field:
//
//   דורש פעולה מיידית   action !== null && action.outstanding
//   הודעות המועדון      no action, and no subject — it is addressed to everyone
//   עדכונים אישיים      no outstanding action, but a subject: it is about one child
//
// `subject_name` is the child's name, which is exactly what the prototype's blue chip
// prints. The server resolves it (`app/services/comms/actions.py`), so the client never
// joins a notification to a roster row and cannot get the pair wrong.

/** One row of the feed, already classified by the container. */
export type UpdateRow = {
  id: string
  /** The server's `kind` — `health_declaration`, `event_rsvp`, `payment`, … It chooses the
   *  icon and the button, and an unknown kind renders as a plain row rather than as a
   *  button that goes nowhere. That is `InboxScreen`'s rule, kept. */
  kind: string
  title: string
  body: string
  /** UTC ISO. Formatted by the container, in the studio's zone. */
  createdAt: string
  /** The child this is about, or `null` for a club-wide notice. */
  subjectName: string | null
  /** Unread, and only meaningful on a row that asks for nothing — the `חדש` mark.
   *  An outstanding obligation is shown by being outstanding, not by being unopened. */
  isNew: boolean
  /** What the card's button does, or `null` when the row is purely informational. */
  action: UpdateAction | null
}

export type UpdateAction = {
  kind: string
  /** Still owed. `false` once the record that settles it exists — a declaration signed
   *  from §6.1's gate settles the notice even though the parent never opened it. */
  outstanding: boolean
  /** When it was settled, for the `טופל` mark. */
  settledAt: string | null
  /** Where the button goes. `null` for a kind this build does not know. */
  href: string | null
  /** The button's words. `null` alongside a null href. */
  label: string | null
}

/** The three groups, in the prototype's own order. */
export type UpdateGroups = {
  urgent: readonly UpdateRow[]
  club: readonly UpdateRow[]
  personal: readonly UpdateRow[]
}

/** The filter strip's selection. `null` is הכל. */
export type UpdateFilter =
  | { kind: 'all' }
  | { kind: 'action' }
  | { kind: 'club' }
  | { kind: 'child'; name: string }
