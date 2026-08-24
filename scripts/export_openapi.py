"""Write the OpenAPI schema to openapi.json.

CI regenerates this and the TypeScript client, then fails on any uncommitted
diff -- so a breaking backend change fails the build rather than production
(SPEC §8.2).
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


def main() -> None:
    target = pathlib.Path(__file__).resolve().parents[1] / "openapi.json"
    target.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
