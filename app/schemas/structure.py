"""Request and response shapes for /classes, /groups, /locations.

**No money field appears anywhere here.** §5.1's wizard has a price step and it is M6's;
invariant 3 forbids any coach-reachable endpoint returning a financial field, and a price
on a group would be the shortest route to violating it.
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, model_validator

#: §4.3 -- group_staff role(lead_coach|assistant_coach). A manager is not group staff:
#: a manager already sees every student in the studio (§3.2), so a row here would be a
#: second, weaker path to the same thing.
GROUP_STAFF_ROLE_PATTERN = r"^(lead_coach|assistant_coach)$"

#: G16 -- 'Every list endpoint is cursor-paginated.'
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    discipline: str | None = Field(default=None, max_length=60)
    #: G13 -- a token name, never a hex literal. The wizard offers the palette.
    color: str | None = Field(default=None, max_length=40)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    discipline: str | None = Field(default=None, max_length=60)
    color: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None


class ClassOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    discipline: str | None
    color: str | None
    is_active: bool


class ClassListResponse(BaseModel):
    items: list[ClassOut]
    next_cursor: uuid.UUID | None = None


class GroupPatch(BaseModel):
    """F4 -- rename / retire / revive outside the rollover wizard. Every field optional;
    absence leaves the column alone (`model_fields_set` decides, like SessionPatch).
    A club that opens a Tuesday beginners group in November should not have to run a
    yearly wizard out of season to rename one."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)
    is_active: bool | None = None


class GroupCreate(BaseModel):
    class_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)

    @model_validator(mode="after")
    def _age_range_is_the_right_way_round(self) -> GroupCreate:
        # Rejected here rather than only by the CHECK constraint, so the caller gets a
        # 422 naming the field instead of a 500 from an IntegrityError.
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError("age_min must not exceed age_max")
        return self


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)
    is_active: bool | None = None


class GroupOut(BaseModel):
    id: uuid.UUID
    class_id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    is_active: bool


class GroupListResponse(BaseModel):
    items: list[GroupOut]
    next_cursor: uuid.UUID | None = None


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)


class LocationOut(BaseModel):
    id: uuid.UUID
    name: str
    address: str | None
    notes: str | None


class LocationListResponse(BaseModel):
    items: list[LocationOut]
    next_cursor: uuid.UUID | None = None


class GroupStaffCreate(BaseModel):
    person_id: uuid.UUID
    role: str = Field(pattern=GROUP_STAFF_ROLE_PATTERN)
    from_date: date | None = None


class GroupStaffOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    person_id: uuid.UUID
    role: str
    from_date: date
    to_date: date | None


class GroupStaffListResponse(BaseModel):
    items: list[GroupStaffOut]


class HealthTemplateOut(BaseModel):
    """Conflict C3. The questions, never an answer -- M4 owns anything that could hold
    one."""

    id: uuid.UUID
    kind: str
    version: int


class HealthTemplateListResponse(BaseModel):
    items: list[HealthTemplateOut]
