"""M3's services. Lane PEOPLE (W2) owns everything under here.

The contract commit lands one thing in this package before the lane exists:
`attendance_pattern`, C11 and C12's shared reader. It is here rather than in
`app/services/schedule/` because the pattern belongs to `enrollment`, and enrollment is
M3's table -- but W3's roster and W4's billing run both **read** it, the same way M3 reads
sessions through `ScheduleService.materialize_sessions`. A reader crossing a lane boundary
is normal; a second copy of the rule is not.
"""
