"""§11.7's rate limit on the one public write in this lane.

**What this is.** A fixed-window counter, keyed by caller IP and separately by
authenticated identity, held in this process's memory. It stops a naive scripted flood
against one replica, which is the shape of abuse a public booking link actually attracts.

**What this is not, stated plainly rather than discovered later.** It is per-process, so a
deployment running two API replicas offers twice the budget, and a restart clears it. A
correct implementation needs a shared store; Redis is the natural one, and §8.1a already
scopes Redis for "ephemeral only, nothing durable", which is exactly this. That change
needs a `REDIS_URL` in `app/core/config.py`, which this lane does not own -- so the limit
lives here, honest about its ceiling, rather than being skipped.

**There is no captcha.** §7 marks the endpoint "captcha + rate-limited" and §11.7 repeats
it, and no captcha provider is configured anywhere in this repo. The endpoint is
**sign-in-first** (§5.4a): the caller has completed a Google or Apple OAuth round trip
before reaching it, which is a materially stronger bot barrier than a checkbox and is the
reason the flow was designed that way. The captcha remains outstanding and is recorded as
such rather than quietly dropped.

`at` is a parameter and never read from the wall clock: `app.core.clock.now()` is the only
clock (§19.5), a test fails the build on any other `datetime.now()` in `app/`, and
`X-Dev-Now` has to be able to drive this like everything else.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

#: Generous per IP, because a family on a shared school or office network must not lock out
#: the next family that afternoon. Tight enough that a script gets nowhere.
PUBLIC_BOOKING_LIMIT = 10
PUBLIC_BOOKING_WINDOW = timedelta(minutes=10)

#: Per identity, and much tighter: one signed-in person booking eleven times in ten minutes
#: is not a family, and §5.4a takes several children in ONE booking anyway.
PER_IDENTITY_LIMIT = 3


class FixedWindowLimiter:
    """Count per key per window.

    Expired windows are evicted as they roll over, so the map cannot grow without bound --
    an in-process limiter that never forgets is a memory leak with a security
    justification attached.
    """

    def __init__(self, *, limit: int, window: timedelta) -> None:
        self.limit = limit
        self.window = window
        self._windows: dict[datetime, dict[str, int]] = defaultdict(dict)

    def _bucket(self, at: datetime) -> datetime:
        epoch = datetime.fromtimestamp(0, tz=at.tzinfo)
        elapsed = (at - epoch) // self.window
        return epoch + elapsed * self.window

    def allow(self, key: str, *, at: datetime) -> bool:
        bucket = self._bucket(at)
        for expired in [b for b in self._windows if b < bucket]:
            del self._windows[expired]
        counts = self._windows[bucket]
        if counts.get(key, 0) >= self.limit:
            return False
        counts[key] = counts.get(key, 0) + 1
        return True


#: Module-level, because the budget is per process: a per-request instance would give every
#: caller their own and limit nothing.
public_booking_ip_limiter = FixedWindowLimiter(
    limit=PUBLIC_BOOKING_LIMIT, window=PUBLIC_BOOKING_WINDOW
)
public_booking_identity_limiter = FixedWindowLimiter(
    limit=PER_IDENTITY_LIMIT, window=PUBLIC_BOOKING_WINDOW
)
