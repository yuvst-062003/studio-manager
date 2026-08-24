"""Task 1 review round 2: the permission deny list cannot express "all .env.* except
.env.example", so this test exists to be the substitute.

`.gitignore` states the real rule in three lines that mean "every `.env.*` file is a
secret except `.env.example`" -- `.env`, `.env.*`, `!.env.example` -- because gitignore
patterns support negation (`!`). Claude Code's permission rule syntax does not: per
https://code.claude.com/docs/en/permissions.md ("Read and Edit"), a path rule supports
only `*`/`**` wildcards, nothing else, so `Read(./.env.*)` cannot be paired with an
exception for `Read(./.env.example)`. That same doc's "Manage permissions" section
states deny rules are evaluated before allow rules regardless of specificity --
"rule specificity doesn't change the order" -- so an explicit
`"allow": ["Read(./.env.example)"]` sitting next to a wildcard deny would not have
worked either. Enumeration in `.claude/settings.json`'s deny list is therefore the only
mechanism the tool offers, and an enumeration is exactly the kind of thing that silently
stops matching reality the day someone adds a `.env.ci` or a `.env.e2e`. This file is
the backstop the config itself cannot provide: source-level by necessity, because the
config format has no notion of "and everything else like this too."

This can only see what is actually on disk in a given checkout -- a `.env` variant a
developer creates locally is exactly the case this guards, since it will never appear in
a fresh clone or CI to be caught any other way.
"""

from __future__ import annotations

import fnmatch
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# `Read(./.env)`, `Read(./.env.local)`, `Read(./.env.*.local)`, ... -- every deny rule
# this repo writes for a dotenv file is `Read(./` + something starting with `.env` + `)`.
_ENV_DENY_RULE = re.compile(r"^Read\(\./(\.env[^)]*)\)$")


def _denied_env_patterns(deny: list[str]) -> list[str]:
    """The bare glob each `Read(./.env...)` deny rule protects, with the `Read(./...)`
    wrapper stripped so it compares directly against a bare filename."""
    matches = (_ENV_DENY_RULE.match(rule) for rule in deny)
    return [m.group(1) for m in matches if m]


def _env_file_candidates(root: Path) -> list[str]:
    """Every `.env*` file actually present at the repo root, `.env.example` excluded --
    it is the one deliberate carve-out, mandated by
    test_env_example_documents_every_setting_the_backend_reads in
    tests/config/test_database_config.py."""
    return sorted(p.name for p in root.glob(".env*") if p.is_file() and p.name != ".env.example")


def _uncovered(candidates: list[str], patterns: list[str]) -> list[str]:
    return [name for name in candidates if not any(fnmatch.fnmatch(name, p) for p in patterns)]


def _deny_list() -> list[str]:
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    deny_list: list[str] = settings["permissions"]["deny"]
    return deny_list


def test_every_env_file_on_disk_other_than_the_example_is_denied():
    missing = _uncovered(_env_file_candidates(ROOT), _denied_env_patterns(_deny_list()))
    assert missing == [], (
        f"{missing} exist under the repo root with no matching Read() deny entry in "
        ".claude/settings.json -- add one (the enumeration cannot be a wildcard; see "
        "this file's module docstring for why)."
    )


def test_the_example_carve_out_is_not_itself_denied():
    patterns = _denied_env_patterns(_deny_list())
    assert not any(fnmatch.fnmatch(".env.example", p) for p in patterns), (
        ".env.example must stay Read/Edit-able -- "
        "test_env_example_documents_every_setting_the_backend_reads requires it"
    )


def test_gitignore_still_states_the_open_ended_rule():
    """The rule this test file stands in for. If .gitignore ever narrows this back to
    an enumeration too, a `.env.ci` a developer creates locally would be committed by
    accident on top of not being covered by the deny list."""
    lines = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert ".env" in lines
    assert ".env.*" in lines
    assert "!.env.example" in lines


# -- the detector is proven to fire ---------------------------------------------------
def test_the_coverage_check_flags_a_variant_the_deny_list_forgot():
    assert _uncovered([".env.local", ".env.staging"], [".env.local"]) == [".env.staging"]


def test_the_coverage_check_accepts_a_wildcard_deny_entry():
    assert _uncovered([".env.foo.local"], [".env.*.local"]) == []


def test_the_pattern_extractor_ignores_deny_rules_that_are_not_dotenv_reads():
    assert _denied_env_patterns(["Bash(rm -rf:*)", "Read(./.env.local)", "Read(./secret)"]) == [
        ".env.local"
    ]


def test_the_candidate_scan_excludes_the_example_and_non_dotenv_files(tmp_path: Path):
    for name in (".env", ".env.local", ".env.example", "env.md", "README.md"):
        (tmp_path / name).write_text("x", encoding="utf-8")
    assert _env_file_candidates(tmp_path) == [".env", ".env.local"]
