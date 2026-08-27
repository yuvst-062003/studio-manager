"""SPEC §4.3's structure, as a service. G6 -- the router parses, calls, and returns.

Everything here runs inside a `TenantSession`, so the tenant filter is already applied to
every query and the stamping already applied to every insert. That is why nothing below
passes `studio_id` around: doing so by hand would be a second, weaker copy of a guarantee
`app/core/tenancy.py` already makes, and the two could disagree.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.person import Person, RoleAssignment
from app.models.structure import Class, Group, GroupStaff, Location


class DuplicateNameError(Exception):
    """A class or group name already in use within its own scope."""


class NotFoundError(LookupError):
    """A row the caller referenced that this studio cannot see.

    Deliberately not distinguished from "does not exist anywhere". The tenant filter
    makes another studio's row invisible, and a 403 would confirm it is real.
    """


def _paged[Row](
    stmt: Select[tuple[Row]], *, cursor: uuid.UUID | None, limit: int
) -> Select[tuple[Row]]:
    """G16 -- cursor pagination, keyed on the primary key.

    Keyset rather than OFFSET: an offset page shifts under you when a row is inserted
    ahead of it, which on the setup wizard's own screens means a class appearing twice or
    not at all while the manager is still typing.

    `limit + 1` is fetched so `_page_out` can tell "this is the last page" from "there is
    exactly one more row" without a second COUNT query.
    """
    if cursor is not None:
        stmt = stmt.where(stmt.column_descriptions[0]["entity"].id > cursor)
    return stmt.limit(limit + 1)


def _page_out[Row](rows: list[Row], limit: int) -> tuple[list[Row], uuid.UUID | None]:
    if len(rows) > limit:
        return rows[:limit], rows[limit - 1].id  # type: ignore[attr-defined]
    return rows, None


class StructureService:
    # -- classes --------------------------------------------------------------
    @staticmethod
    def list_classes(
        session: Session, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[Class], uuid.UUID | None]:
        stmt = _paged(select(Class).order_by(Class.id), cursor=cursor, limit=limit)
        return _page_out(list(session.execute(stmt).scalars().all()), limit)

    @staticmethod
    def create_class(
        session: Session,
        *,
        name: str,
        description: str | None,
        discipline: str | None,
        color: str | None,
        at: datetime,
    ) -> Class:
        if session.execute(select(Class.id).where(Class.name == name)).first() is not None:
            # Checked rather than caught: the partial unique index would raise an
            # IntegrityError that reads as a 500, and this is a name the manager typed.
            raise DuplicateNameError(name)
        row = Class(
            name=name,
            description=description,
            discipline=discipline,
            color=color,
            created_at=at,
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def get_class(session: Session, class_id: uuid.UUID) -> Class:
        row = session.get(Class, class_id)
        if row is None:
            raise NotFoundError(str(class_id))
        return row

    # -- groups ---------------------------------------------------------------
    @staticmethod
    def list_groups(
        session: Session,
        *,
        class_id: uuid.UUID | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Group], uuid.UUID | None]:
        stmt = select(Group).order_by(Group.id)
        if class_id is not None:
            stmt = stmt.where(Group.class_id == class_id)
        return _page_out(
            list(session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()), limit
        )

    @staticmethod
    def create_group(
        session: Session,
        *,
        class_id: uuid.UUID,
        name: str,
        description: str | None,
        age_min: int | None,
        age_max: int | None,
        at: datetime,
    ) -> Group:
        # The tenant filter makes another studio's class invisible here, so this
        # doubles as the cross-tenant check -- it is a 404, not a 403.
        parent = session.get(Class, class_id)
        if parent is None:
            raise NotFoundError(str(class_id))
        duplicate = session.execute(
            select(Group.id).where(Group.class_id == class_id, Group.name == name)
        ).first()
        if duplicate is not None:
            raise DuplicateNameError(name)
        row = Group(
            class_id=class_id,
            name=name,
            description=description,
            age_min=age_min,
            age_max=age_max,
            created_at=at,
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def get_group(session: Session, group_id: uuid.UUID) -> Group:
        row = session.get(Group, group_id)
        if row is None:
            raise NotFoundError(str(group_id))
        return row

    # -- locations ------------------------------------------------------------
    @staticmethod
    def list_locations(
        session: Session, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[Location], uuid.UUID | None]:
        stmt = _paged(select(Location).order_by(Location.id), cursor=cursor, limit=limit)
        return _page_out(list(session.execute(stmt).scalars().all()), limit)

    @staticmethod
    def update_group(
        session: Session,
        group_id: uuid.UUID,
        *,
        fields: dict[str, object],
        at: datetime,
    ) -> Group:
        """F4's rename/retire/revive. `fields` carries only what the caller SET --
        renaming to the same name is legal, renaming onto a sibling's name is not."""
        row = StructureService.get_group(session, group_id)
        if "name" in fields and fields["name"] != row.name:
            duplicate = session.execute(
                select(Group.id).where(
                    Group.class_id == row.class_id,
                    Group.name == fields["name"],
                    Group.id != group_id,
                )
            ).first()
            if duplicate is not None:
                raise DuplicateNameError(str(fields["name"]))
        for column in ("name", "description", "age_min", "age_max", "is_active"):
            if column in fields:
                setattr(row, column, fields[column])
        row.updated_at = at
        session.flush()
        return row

    @staticmethod
    def create_location(
        session: Session, *, name: str, address: str | None, notes: str | None, at: datetime
    ) -> Location:
        row = Location(name=name, address=address, notes=notes, created_at=at)
        session.add(row)
        session.flush()
        return row

    # -- staff ----------------------------------------------------------------
    @staticmethod
    def list_group_staff(session: Session, group_id: uuid.UUID) -> list[GroupStaff]:
        StructureService.get_group(session, group_id)
        return list(
            session.execute(
                select(GroupStaff)
                .where(GroupStaff.group_id == group_id, GroupStaff.to_date.is_(None))
                .order_by(GroupStaff.id)
            )
            .scalars()
            .all()
        )

    @staticmethod
    def assign_staff(
        session: Session,
        *,
        group_id: uuid.UUID,
        person_id: uuid.UUID,
        role: str,
        granted_by_person_id: uuid.UUID | None,
        from_date: date,
        at: datetime,
    ) -> tuple[GroupStaff, bool]:
        """§5.1's wizard step 5, and the reason it is one call and not two.

        A coach with a `group_staff` row and no `role_assignment` cannot sign into the
        staff app at all -- §6.1's access query asks for a role assignment, not for group
        membership. Two endpoints would mean a manager who did the first and forgot the
        second has a coach who is on the roster and cannot log in, with nothing anywhere
        saying why.

        The grant is scoped to the GROUP (§3.1: "lead_coach: A group"). A studio-scoped
        one would hand a coach of one group every group in the club.

        Returns `(row, created)`. The router needs the second half to answer 201 or 200
        honestly: 201 means Created, and re-assigning a coach who is already on the group
        creates nothing.
        """
        StructureService.get_group(session, group_id)
        if session.get(Person, person_id) is None:
            raise NotFoundError(str(person_id))

        existing = session.execute(
            select(GroupStaff).where(
                GroupStaff.group_id == group_id,
                GroupStaff.person_id == person_id,
                GroupStaff.to_date.is_(None),
            )
        ).scalar_one_or_none()
        if existing is not None:
            # Idempotent rather than a conflict: the wizard is resumable, and a manager
            # re-adding a coach they already added means "this should be true", which it
            # already is. A 409 would make a correct retry look like an error.
            return existing, False

        row = GroupStaff(
            group_id=group_id,
            person_id=person_id,
            role=role,
            from_date=from_date,
            created_at=at,
        )
        session.add(row)

        already_granted = session.execute(
            select(RoleAssignment.id).where(
                RoleAssignment.person_id == person_id,
                RoleAssignment.role == role,
                RoleAssignment.scope_type == "group",
                RoleAssignment.scope_id == group_id,
                RoleAssignment.revoked_at.is_(None),
            )
        ).first()
        if already_granted is None:
            session.add(
                RoleAssignment(
                    person_id=person_id,
                    role=role,
                    scope_type="group",
                    scope_id=group_id,
                    granted_by_person_id=granted_by_person_id,
                    granted_at=at,
                    created_at=at,
                )
            )
        session.flush()
        return row, True
