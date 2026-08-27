"""Wire shapes for `/api/v1/studio`.

§4.3 pins the studio column list exactly as M0 built it, so `sport`, `address`, `phone`
and `parent_locales` are read and written through the JSONB `settings` column rather than
through new ones. §4.3's "settings includes:" is a description of what that column holds,
not a closed set -- which is what keeps M1.9 out of `alembic/versions/**`, a directory
main owns and a lane never touches.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator

#: §9 ships he, en and ru. A studio offering a fourth would render raw keys at a parent.
SUPPORTED_LOCALES: tuple[str, ...] = ("he", "en", "ru")


class StudioLogoOut(BaseModel):
    """What POST /studio/logo returns.

    A URL and not a key. The key is an internal address no client should learn, let alone
    send back -- §2.5 constructs every key server-side precisely so that no request ever
    carries one.
    """

    logo_url: str = Field(description="The scoped read route, cache-busted by updated_at.")


class StudioLandingContent(BaseModel):
    """The shop window's copy — landing decision 1 (2026-08-27): the club writes its own
    pitch. This is the WRITER the decision assumed and nobody built: the public landing
    read `settings.landing.*` while `PATCH /studio` wrote only top-level settings, so the
    content was unreachable by any screen."""

    headline: str | None = Field(default=None, max_length=200)
    about: str | None = Field(default=None, max_length=4000)
    #: Region 3's numbered steps, the club's own words. Six is a pitch; more is a manual.
    trial_steps: list[str] | None = Field(default=None, max_length=6)

    @field_validator("trial_steps")
    @classmethod
    def _steps_are_short_lines(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [step.strip() for step in value if step.strip()]
        for step in cleaned:
            if len(step) > 200:
                raise ValueError("a trial step is one short line, not a paragraph")
        return cleaned


class StudioOut(BaseModel):
    """The merged column-and-settings view both the wizard's step 1 and the dashboard's
    הגדרות panel read."""

    id: uuid.UUID
    name: str
    slug: str
    timezone: str
    default_locale: str
    logo_url: str | None = None
    sport: str | None = None
    address: str | None = None
    phone: str | None = None
    parent_locales: list[str]
    landing: StudioLandingContent = Field(default_factory=StudioLandingContent)


class StudioUpdate(BaseModel):
    """Every field optional -- the wizard writes what the owner filled in, and the
    הגדרות panel autosaves one field at a time. `exclude_unset` in the router is what
    turns that into a partial write rather than a blanking one."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    sport: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=40)
    parent_locales: list[str] | None = None
    #: Merged into `settings.landing`, key by key — never replacing the blob.
    landing: StudioLandingContent | None = None

    @field_validator("name")
    @classmethod
    def _name_is_not_blank(cls, value: str | None) -> str | None:
        """A name of spaces passes min_length and reads as an empty club everywhere it is
        rendered."""
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("a studio name cannot be blank")
        return stripped

    @field_validator("parent_locales")
    @classmethod
    def _known_locales_only(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        unknown = [locale for locale in value if locale not in SUPPORTED_LOCALES]
        if unknown:
            raise ValueError(f"unsupported locales: {unknown}. §9 ships {list(SUPPORTED_LOCALES)}")
        if not value:
            raise ValueError("a studio must offer parents at least one language")
        # Deduplicated, and ordered by §9's own order rather than by what the checkbox
        # column happened to emit -- the list is rendered to parents.
        return [locale for locale in SUPPORTED_LOCALES if locale in value]
