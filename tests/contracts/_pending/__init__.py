"""Model assertions waiting for their wave, beside the models they assert about.

`pyproject.toml` sets `norecursedirs` so pytest does not collect this package. Every test
here reads `Base.metadata`, and the tables they name live in `app/models/_pending/` --
deliberately out of the metadata until their wave's contract commit creates them (see that
package's docstring for why). A test asserting a table we have decided not to create yet
is not a gate; it is a red mark that teaches people to ignore red marks.

**Each wave moves its own file up, in the same commit as its model.** W3 moves
`test_w3_models.py` beside `test_w2_models.py` as it moves `_pending/attendance.py` and
`_pending/health.py` into `app/models/`. The two moves are one commit or the wave has
models with nothing checking them.

The schema tests are NOT here. `test_w3_schemas.py` and `test_w5_schemas.py` assert
Pydantic shapes, which have no table behind them and run today.
"""
