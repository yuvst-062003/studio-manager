"""SPEC §4.3's structure vertical -- classes, groups, locations and coach assignment.

M1 owns these because both W2 lanes import them: M2 hangs schedule rules and sessions off
`group`, and M5 hangs attendance off those sessions.

`health_templates` lives here by conflict C3 rather than by topic: §14 puts health in M4,
but M3's trial booking needs a `kind='trial'` declaration before that, and §4.3 already
types the column. M4 owns everything else about health.
"""
