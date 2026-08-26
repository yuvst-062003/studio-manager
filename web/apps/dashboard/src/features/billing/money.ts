// The one shekels → agorot conversion in this lane, next to the only inputs where a human
// types money (`5a`'s price form and `3e`'s payment dialogue).
//
// **G2, at the boundary that matters.** A manager types 320; the server stores 32000. Getting
// this wrong by a factor of a hundred is the single most likely money bug in the product, and
// it is invisible until a parent is billed ₪3.20 — or ₪32,000.
//
// `@studio/core`'s `money.ts` formats agorot for display and has no parse in the other
// direction. Adding one there is a `packages/core` change and therefore **not a lane's**
// (w4-lanes.md's rule about primitives applies to shared packages too), so this lives here
// and is owed back — see the handover note.
export function agorotFromShekels(input: string | number): number {
  const value = typeof input === 'number' ? input : Number(input.trim().replace(',', '.'))
  if (!Number.isFinite(value)) return 0
  // `Math.round` on the product, not on the input: 3.2 * 100 is 320.00000000000006 in
  // binary floating point, and truncating it would charge a family one agora less.
  return Math.round(value * 100)
}
