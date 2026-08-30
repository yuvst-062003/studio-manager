// The Israeli ת.ז. check digit, client half.
//
// Mirrors `app/core/national_id.py`, and is duplicated for the reason that module explains:
// **a mistyped ID is worse than a missing one.** A blank field is visibly blank and somebody
// chases it; a ת.ז. with one transposed pair looks exactly like a real identifier and is
// somebody else's, all the way onto an insurance list.
//
// The server validates too and is the authority. This copy exists so a parent learns at the
// field rather than after signing — a 422 at the end of a three-step form is a worse way to
// find out about a typo than the field going red under your thumb.
//
// It is a transposition detector, not proof that a person exists, which is all it needs to be.

const LENGTH = 9

/** Passes the arithmetic, is not an identity. Without this the empty string pads to it. */
const NOT_AN_IDENTITY = '0'.repeat(LENGTH)

/** Strip what people paste, pad what they abbreviate, refuse the rest. */
function digits(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replaceAll('-', '').replaceAll(' ', '')
  if (cleaned === '' || !/^\d+$/.test(cleaned) || cleaned.length > LENGTH) return null
  // Israelis write their ID without leading zeros and every official form accepts it.
  return cleaned.padStart(LENGTH, '0')
}

export function isValidNationalId(value: string | null | undefined): boolean {
  const padded = digits(value)
  if (padded === null || padded === NOT_AN_IDENTITY) return false
  let total = 0
  for (let index = 0; index < padded.length; index += 1) {
    const product = Number(padded[index]) * ((index % 2) + 1)
    total += product > 9 ? product - 9 : product
  }
  return total % 10 === 0
}
