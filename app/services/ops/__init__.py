"""Operational health: whether the jobs ran, and whether the product is behaving.

Read by `app/routers/ops.py` for the platform console and by `app/workers/ops_check.py`
for the alert email. One module of checks, two callers -- a screen that computed its own
answers would eventually disagree with the email, and an operator who has been told two
different things stops trusting both.
"""
