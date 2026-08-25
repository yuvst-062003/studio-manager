// What `@studio/ui/dev-bar` resolves to in a production build. Not a stub for tests —
// the real production shapes.
export const AbsentDevBar = () => null

/** No dev bar means no time travel, so a production client cannot send the header at
 *  all. M1's fetch layer imports this name unconditionally and needs no branch. */
export const absentDevHeaders = (): Record<string, string> => ({})
