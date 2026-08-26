"""Who may READ a health form template -- the blank questions, never anyone's answers.

Ship-audit follow-on to B3. The moment the §6.1 gate was mounted, the first family it
stopped could not load the form behind it: both template reads -- the list in
app/routers/structure.py and the questions in app/routers/health_templates.py -- answered
403 to the exact person §5.5 exists for. Nothing could ever hit that while the gate was
unmounted, the component tests mock the client, and E2E-1 files the declaration through
the manager's door -- so the only caller who would have noticed was a real parent, in
production, locked out of the whole app.

The rule the two routes now share: manager and owner (they edit it), and a guardian (they
must read the questions to answer them). A coach still has no route here -- §5.5 gives
them `derived_flags` and nothing else -- and §5.5's secrecy is untouched, because a blank
template holds no answer about anyone.
"""

from __future__ import annotations


def test_a_guardian_reads_the_template_list(client, as_guardian_of, a_student, a_full_template):
    parent = as_guardian_of(a_student)
    response = client.get("/api/v1/health-templates?kind=full", headers=parent.headers)
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()["items"]] == [str(a_full_template)]


def test_a_guardian_reads_the_questions_they_must_answer(
    client, as_guardian_of, a_student, a_full_template
):
    parent = as_guardian_of(a_student)
    response = client.get(f"/api/v1/health-templates/{a_full_template}", headers=parent.headers)
    assert response.status_code == 200, response.text
    assert response.json()["schema"]["sections"]


def test_a_manager_still_reads_both(client, as_manager, a_full_template):
    assert client.get("/api/v1/health-templates", headers=as_manager.headers).status_code == 200
    assert (
        client.get(
            f"/api/v1/health-templates/{a_full_template}", headers=as_manager.headers
        ).status_code
        == 200
    )


def test_a_coach_is_still_refused_both(client, as_lead_coach, a_full_template):
    """§5.5 -- a coach sees derived_flags and nothing else. Widening the read to guardians
    must not have widened it to staff."""
    assert client.get("/api/v1/health-templates", headers=as_lead_coach.headers).status_code == 403
    assert (
        client.get(
            f"/api/v1/health-templates/{a_full_template}", headers=as_lead_coach.headers
        ).status_code
        == 403
    )
