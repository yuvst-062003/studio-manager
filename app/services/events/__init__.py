"""§5.8's events. Lane EVENTS (M7).

**Nothing in this package writes a billing table.** An event's `fee_agorot` is a price -- a
setting on the event -- and what a family owes is a `charge`, created through
`BillingService.create_charge(kind='event')` in `fees.py` and reached from a registration by
`event_registration.charge_id`. That single call is the whole of M7's dependency on M6, and
`fees.py` is the only module here that imports anything from `app.services.billing`.

**D9.2 -- no weight, no category, no weigh-in class**, in this package or anywhere else.
§2.2 defers weight categories to v2 and they imply `student` fields §4.3 does not carry.
"""
