"""The ת.ז. check digit, because a mistyped ID is worse than a missing one.

A blank field is visibly blank -- somebody chases it. A ת.ז. with a transposed pair looks
exactly like a real one and travels onto an insurance list, where it belongs to somebody
else. The paper form had a human reading it back; the app has this.
"""

from __future__ import annotations

import pytest
from app.core.national_id import (
    InvalidNationalIdError,
    is_valid_national_id,
    normalize_national_id,
)

# Computed against the standard algorithm, not copied from a real person.
VALID = ["100000009", "100000017", "100000025", "100000033"]


@pytest.mark.parametrize("value", VALID)
def test_valid_ids_pass(value):
    assert is_valid_national_id(value)


def test_a_transposed_pair_is_caught():
    """The failure this whole module exists for."""
    assert is_valid_national_id("100000017")
    assert not is_valid_national_id("100000071")


def test_short_ids_are_left_padded_not_rejected():
    """Israeli IDs are 9 digits, but people write theirs without the leading zeros and
    every official form accepts that. `18` is `000000018`."""
    assert is_valid_national_id("18")
    assert normalize_national_id("18") == "000000018"


def test_all_zeros_is_refused_even_though_the_check_digit_passes():
    """000000000 satisfies the arithmetic and is not an identity. Without this the empty
    string, once padded, becomes a 'valid' ID."""
    assert not is_valid_national_id("000000000")
    assert not is_valid_national_id("0")


@pytest.mark.parametrize("value", ["", "   ", None, "12345678901", "abcdefghi", "1234-5678"])
def test_junk_is_refused(value):
    assert not is_valid_national_id(value)


def test_surrounding_whitespace_and_hyphens_are_tolerated():
    """People paste from a contacts app. Refusing ' 100000009 ' teaches nothing."""
    assert is_valid_national_id(" 100000009 ")
    assert normalize_national_id(" 100000009 ") == "100000009"


def test_normalize_raises_on_an_invalid_id():
    with pytest.raises(InvalidNationalIdError):
        normalize_national_id("123456789")


def test_the_error_never_carries_the_id():
    """G7's reasoning applied to an identifier: an exception string reaches a log."""
    try:
        normalize_national_id("123456789")
    except InvalidNationalIdError as exc:
        assert "123456789" not in str(exc)
    else:
        raise AssertionError("expected InvalidNationalIdError")
