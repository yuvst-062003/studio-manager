"""§6.5's install list — "the office can see exactly who it needs to call".

"On iOS, Web Push exists only for a home-screen web app... so an iPhone parent who never
installs receives **no push at all** — and §5.11 permits no email or SMS fallback, so that
parent is reachable only by telephone. ... The dashboard lists guardians who have not
installed, alongside the push-delivery report (§5.11)."

**This is a different question from the delivery report, and both are needed.** The report
answers "did THIS message land". This answers "can this family be reached at all, by any
message, ever" — which is the question that decides whether the club can rely on push for a
cancellation in the first place. A family that is on this list will be on every delivery
report from now until somebody phones them.

**On iOS the two questions are the same one.** A registration existing at all means the app
is on the home screen, because a Safari tab has no Push API to register from. On Android it
means only that they granted a permission in a normal tab. Same column, two different facts,
so the platform is reported rather than collapsed into a count.
"""

from __future__ import annotations


def _report(client, caller):
    return client.get("/api/v1/comms/install-state", headers=caller.headers)


def test_a_guardian_with_a_parent_app_token_counts_as_installed(
    client, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    parent = a_guardian_for(an_enrolled_student, name="התקינה")
    a_push_token(parent, app="parent", platform="ios")

    body = _report(client, as_manager).json()
    assert body["installed_count"] == 1
    assert body["not_installed_count"] == 0
    assert body["not_installed"] == []


def test_a_guardian_with_no_token_is_on_the_list_the_office_phones(
    client, app_session, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """§5.11 permits no email and no SMS fallback. A parent who is neither installed nor
    reading the inbox is reachable only by telephone, and the product's job is to make that
    list visible rather than to pretend it is empty."""
    from app.models.person import Person

    parent = a_guardian_for(an_enrolled_student, name="יעל")
    body = _report(client, as_manager).json()
    assert body["installed_count"] == 0
    assert body["not_installed_count"] == 1

    row = body["not_installed"][0]
    stored = app_session.get(Person, parent)
    assert row["person_id"] == str(parent)
    assert row["name"] == f"{stored.first_name} {stored.last_name}"
    assert row["phone"] == stored.phone


def test_ios_and_android_are_counted_apart(
    client, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """§6.5: on iOS a registration means the app is on the home screen; on Android it does
    not. Collapsing them would hide the number the install walkthrough is judged on."""
    iphone = a_guardian_for(an_enrolled_student, name="אייפון")
    android = a_guardian_for(an_enrolled_student, name="אנדרואיד")
    a_push_token(iphone, app="parent", platform="ios")
    a_push_token(android, app="parent", platform="android")

    body = _report(client, as_manager).json()
    assert body["installed_count"] == 2
    assert body["by_platform"] == {"ios": 1, "android": 1, "web": 0}


def test_a_staff_token_does_not_make_a_guardian_installed(
    client, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """`push_token.app` is (staff|parent). A coach who is also a parent has two apps and two
    answers -- merging them would report a family as reachable because their father coaches
    on Tuesdays, and the parent app is where a cancellation lands."""
    parent = a_guardian_for(an_enrolled_student, name="מאמן והורה")
    a_push_token(parent, app="staff", platform="ios")

    body = _report(client, as_manager).json()
    assert body["installed_count"] == 0
    assert [row["person_id"] for row in body["not_installed"]] == [str(parent)]


def test_a_family_who_left_is_not_on_the_list(
    client, app_session, studio, as_manager, a_guardian_for, a_group
) -> None:
    """The list exists to be phoned. A family who left three months ago on it is a call the
    office should not make, and the same rule the announcement audience uses."""
    from app.models.people import Student
    from app.models.person import Person
    from tests.comms.conftest import YEAR_STARTS

    person = Person(studio_id=studio.id, first_name="ילד", last_name="עזב")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="left", joined_on=YEAR_STARTS
    )
    app_session.add(student)
    app_session.commit()
    a_guardian_for(student.id, name="הורה שעזב")

    assert _report(client, as_manager).json()["not_installed_count"] == 0


def test_the_list_is_empty_and_says_so_when_everybody_installed(client, as_manager) -> None:
    """`install.emptyGood` -- כל המשפחות התקינו את האפליקציה. Zero is a real and good answer,
    not an empty state to apologise for."""
    body = _report(client, as_manager).json()
    assert body["installed_count"] == 0
    assert body["not_installed_count"] == 0


def test_the_list_is_managers_only(client, as_lead_coach) -> None:
    """It is a list of families' telephone numbers. §3.2 gives a coach the roster, not the
    household directory -- the same line the delivery report draws."""
    assert _report(client, as_lead_coach).status_code == 403


def test_a_guardian_cannot_read_it(client, as_guardian_of, a_student) -> None:
    assert _report(client, as_guardian_of(a_student)).status_code == 403
