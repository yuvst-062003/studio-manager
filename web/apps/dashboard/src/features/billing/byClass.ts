// Grouping a list by its class, and the unfiled bucket that must never be silent.
//
// Two screens need the same shape — פריטים למכירה and מחירים ומסלולים — and both have the
// same trap in them: a row with NO class is not "belongs to the whole club". It is
// UNUSABLE. An unfiled item appears in nobody's shop, and after the owner's "a class can
// have no all-classes plan" an unfiled plan can be given to no child. Both looked perfectly
// healthy on their list, which is the whole reason `unfiled` is returned separately rather
// than as a group named "—".
//
// The club's own class order is kept rather than the order rows happen to arrive in, so the
// two screens agree with each other and with the class picker beside them.

export type HasClass = { class_id?: string | null }
export type NamedClass = { id: string; name: string }

export type ClassGroup<T> = { classId: string; className: string; rows: T[] }

export type GroupedByClass<T> = {
  /** Rows with no class. **Never a group** — these are broken, not categorised. */
  unfiled: T[]
  groups: ClassGroup<T>[]
}

/**
 * Split rows into their classes, in the club's own class order.
 *
 * A row naming a class the caller did not pass — a class that was deleted, or a list that
 * failed to load — is treated as UNFILED rather than dropped. Dropping it would make a row
 * vanish from the only screen that can repair it, which is the failure this whole grouping
 * exists to make visible.
 */
export function groupByClass<T extends HasClass>(
  rows: readonly T[],
  classes: readonly NamedClass[],
): GroupedByClass<T> {
  const byId = new Map(classes.map((klass) => [klass.id, klass.name]))
  const groups = new Map<string, ClassGroup<T>>()
  const unfiled: T[] = []

  for (const row of rows) {
    const classId = row.class_id ?? null
    const className = classId === null ? undefined : byId.get(classId)
    if (classId === null || className === undefined) {
      unfiled.push(row)
      continue
    }
    let group = groups.get(classId)
    if (group === undefined) {
      group = { classId, className, rows: [] }
      groups.set(classId, group)
    }
    group.rows.push(row)
  }

  // The club's order, not the rows'. `classes` is what the picker renders, and two lists
  // that disagree about the order of the same four classes read as two different clubs.
  const ordered = classes
    .map((klass) => groups.get(klass.id))
    .filter((group): group is ClassGroup<T> => group !== undefined)

  return { unfiled, groups: ordered }
}
