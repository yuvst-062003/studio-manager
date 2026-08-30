"""The Israeli ת.ז. check digit.

The club's `טופס הרשמה` asks for three of these -- the student's and each parent's -- and
they travel onto insurance lists and עמותה returns. **A mistyped ID is worse than a missing
one.** A blank field is visibly blank and somebody chases it; a ת.ז. with one transposed
pair looks exactly like a real identifier and is somebody else's.

The algorithm is the standard one: pad to nine digits, weight alternately 1 and 2, cast the
two-digit products down by nine, and the sum is a multiple of ten. It is a transposition
detector, not proof that a person exists -- which is all we need it to be.

**G7's reasoning, applied to an identifier.** `InvalidNationalIdError` never carries the
value it rejected: an exception string reaches a log, and this module's whole subject is a
field that must not.
"""

from __future__ import annotations

_LENGTH = 9

#: Passes the arithmetic, is not an identity. Without an explicit refusal the empty string
#: pads to this and validates.
_NOT_AN_IDENTITY = "0" * _LENGTH


class InvalidNationalIdError(ValueError):
    """A ת.ז. that fails the check digit. Deliberately carries no value."""

    def __init__(self) -> None:
        super().__init__("national id failed its check digit")


def _digits(value: str | None) -> str | None:
    """Strip what people paste, pad what they abbreviate, refuse the rest."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip().replace("-", "").replace(" ", "")
    if not cleaned.isdigit() or len(cleaned) > _LENGTH:
        return None
    # Israelis write their ID without leading zeros and every official form accepts it.
    return cleaned.zfill(_LENGTH)


def is_valid_national_id(value: str | None) -> bool:
    padded = _digits(value)
    if padded is None or padded == _NOT_AN_IDENTITY:
        return False
    total = 0
    for index, char in enumerate(padded):
        product = int(char) * ((index % 2) + 1)
        total += product - 9 if product > 9 else product
    return total % 10 == 0


def normalize_national_id(value: str | None) -> str:
    """The nine-digit form to store, or `InvalidNationalIdError`.

    Storing the normalized form rather than what was typed is what makes the ID usable as
    a match key later: `18` and `000000018` are the same person, and two rows that disagree
    about which spelling to keep are two people as far as any lookup is concerned.
    """
    if not is_valid_national_id(value):
        raise InvalidNationalIdError
    padded = _digits(value)
    assert padded is not None  # is_valid_national_id already proved this
    return padded
