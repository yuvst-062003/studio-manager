"""Model discovery. Seam 2 -- never edited to register a model.

Importing this package imports every module beside it, so a lane adding
app/models/attendance.py gets its tables registered without touching a shared
file. app/models/__init__.py conflicting on every merge is exactly what this
replaces.
"""

import importlib
import pkgutil

for _module in pkgutil.iter_modules(__path__):
    if not _module.name.startswith("_"):
        importlib.import_module(f"{__name__}.{_module.name}")
