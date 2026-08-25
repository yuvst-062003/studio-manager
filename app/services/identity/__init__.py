"""SPEC §5.2 and §6.1 -- authentication, identity resolution, and the platform console.

Four modules, split by what each one is allowed to touch:

* `tokens`    -- pure. Mints and verifies the access JWT over a key and an instant.
* `refresh`   -- the database. Rotation, reuse detection and §5.2's denylist.
* `providers` -- the network. The ONLY module here that opens a socket, which is what
                 makes every other one testable without one.
* `resolution`-- the cross-tenant reads. §3.3 requires one identity to reach several
                 studios, so this is the one request-scoped path that legitimately opens
                 §4.2's escape hatch, and every query in it carries its reason.
"""
