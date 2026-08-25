"""Developer tooling. Not part of the product, never imported by `app` or `web`.

A package rather than a bare directory so `tools.cockpit` resolves to one module
name: without this, mypy sees the same file as both `cockpit` and `tools.cockpit`
and refuses to check either.
"""
