"""§5.9's belts. Lane EVENTS (M7) owns this package and `app/services/events/**` both.

**Belt colours are DATA, never brand (D3).** `belt_rank.color_hex` is per-studio,
per-class configuration, which is exactly why D3 rejected belt colours as a brand palette:
using them as brand would collide with rank display. This package validates the shape of
that data and never decides its value.

**The ring is not here.** G10/D7 -- a belt bar always carries a 1px ring in the current
foreground colour -- lives in `BeltBar`, which has no prop that turns it off. This package
stores the colour; the component is what guarantees it is never rendered fill-only.
"""
