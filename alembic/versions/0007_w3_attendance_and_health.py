"""w3 attendance and health (M4 || M5)

SPEC 4.3's attendance block, and the two health tables conflict C3 left for M4:
`attendance` and `absence_report` from a new app/models/attendance.py, `health_declaration`
and `consent_record` APPENDED to the existing app/models/health.py. W3's contract commit,
authored on main before either worktree exists -- a lane never runs `alembic revision`.

**health_form_template is NOT created here.** Revision 0005 created it and M1 seeded the
kind='trial' form, which is what unblocked M3's trial booking without pulling M4 forward
(conflict C3). A CREATE TABLE for it here would fail on every database that has ever run
0005, which is all of them. Promoting app/models/_pending/health.py wholesale would have
produced exactly that, and would have deleted HealthFormTemplate on the way past.

What this revision does add for that table is D11's default `full` question set, seeded per
studio at the bottom of upgrade(). D11: "ship a standard Israeli sports health declaration
as the default health_form_template question set, seeded by migration." The bundled set is
a STARTING POINT and the app says so where a manager edits it; it is not a compliance
artefact and must not be presented as one. `is_bundled_default` in the seeded schema is the
machine-readable half of that caveat, `template.disclaimer` in the i18n bundle the visible
one. Studios provisioned after this revision get theirs from
app/services/structure/health_templates.py::ensure_full_template -- a migration-only seed
would have reached only the studios that existed on the day it ran.

`attendance` carries TWO unique indexes and they are not redundant. (session_id, student_id)
is the domain rule -- two rows for one student in one session are two different answers to
"were they here", and no report can choose between them. client_mark_id alone is the
OFFLINE rule (10.5): the queue replays a mark the server may already hold, and the
client-generated id is the only thing identifying it as the SAME mark rather than a
corrected second opinion. A constraint on the pair alone would make a replay look like a
conflicting second opinion. Dropping either loses a different guarantee.

`attendance.status` includes 'unmarked' as a real, storable state (5.14) -- not a NULL and
not an absent row. "Nobody opened the register" and "someone opened it and left this child
undecided" are different facts, and 5.14's sessions-held-vs-planned report is wrong the
moment they collapse -- wrong in the direction that blames a coach.

`attendance` carries device_marked_at AND marked_at, both timestamptz (G3). 10.5 resolves a
two-coach conflict on device_marked_at, because resolving on the server clock would let
whoever reconnected second overwrite the earlier mark. A single timestamp cannot express
"marked at 17:05, synced at 19:00", and that gap is the normal case in a basement dojo.

health_declaration.answers_encrypted is EncryptedJSON and signature_image_encrypted is
EncryptedBytes (11.1) -- not JSONB and not LargeBinary. alembic/env.py::_render_item renders
them with the `aad` they require; autogenerate's own rendering drops it and the revision
raises TypeError the first time it runs. derived_flags is deliberately NOT encrypted: a
coach reads it on every roster render (5.5), and encrypting it would mean decrypting a
minor's medical record to draw a badge -- the exact outcome 11.1 and 11.2 exist to prevent.
The column type cannot enforce "booleans only"; app/schemas/health.py rejects a non-boolean
in mode='before', and nothing here should imply the database is the guard.

No GRANT statements, for health_declaration or anything else. Revision 0001 set ALTER
DEFAULT PRIVILEGES IN SCHEMA public, so every table created here inherits the runtime grant.
This revision does not touch audit_log, so 0002's REVOKE stands untouched. The protection on
health data is 11.1's encryption and the audit log, not a table-level grant.

W4's and W5's models are NOT here. They sit in app/models/_pending/, out of Base.metadata,
until each wave's own contract commit moves its files up and autogenerates 0008 and 0009.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-26

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import app.core.encryption

# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, Sequence[str], None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: D11's default `full` health question set, **frozen at revision 0007**.
#:
#: A copy of app/services/structure/health_templates.py::FULL_TEMPLATE_SCHEMA as it stood on
#: 2026-08-26, deliberately not an import. D11 makes rewording the questions a manager's
#: right and lane HEALTH builds the editor for it, so the live constant is expected to move;
#: a migration that followed it would silently rewrite what it did to databases that ran it
#: months ago. `template_version` on health_declaration is what records which questions a
#: given signature actually answered (§4.3), and that column is meaningless if version 1
#: does not stay version 1.
#:
#: `is_bundled_default` carries D11's caveat: this is a STARTING POINT, the app says so
#: where a manager edits it (`template.disclaimer` in the i18n bundle), and it is not a
#: compliance artefact.
_FULL_TEMPLATE_SCHEMA_V1 = {'version': 1,
 'kind': 'full',
 'is_bundled_default': True,
 'title': 'הצהרת בריאות',
 'sections': [{'id': 'medical_history',
               'title': 'רקע רפואי',
               'questions': [{'id': 'chronic_illness',
                              'type': 'boolean',
                              'label': 'האם קיימת מחלה כרונית?'},
                             {'id': 'chronic_illness_details',
                              'type': 'text',
                              'label': 'פירוט המחלה הכרונית',
                              'required': False,
                              'visible_if': {'chronic_illness': True}},
                             {'id': 'asthma',
                              'type': 'boolean',
                              'label': 'האם יש אסתמה?',
                              'flag': True},
                             {'id': 'allergy',
                              'type': 'boolean',
                              'label': 'האם יש אלרגיה?',
                              'flag': True},
                             {'id': 'allergy_details',
                              'type': 'text',
                              'label': 'פירוט האלרגיה',
                              'required': False,
                              'visible_if': {'allergy': True}},
                             {'id': 'medication',
                              'type': 'boolean',
                              'label': 'האם התלמיד/ה נוטל/ת תרופות באופן קבוע?',
                              'flag': True},
                             {'id': 'medication_details',
                              'type': 'text',
                              'label': 'אילו תרופות',
                              'required': False,
                              'visible_if': {'medication': True}},
                             {'id': 'epilepsy',
                              'type': 'boolean',
                              'label': 'האם יש אפילפסיה או פרכוסים?',
                              'flag': True},
                             {'id': 'diabetes',
                              'type': 'boolean',
                              'label': 'האם יש סוכרת?',
                              'flag': True}]},
              {'id': 'cardiac',
               'title': 'לב ומאמץ',
               'questions': [{'id': 'heart',
                              'type': 'boolean',
                              'label': 'האם ידוע על מחלת לב, מום לבבי או ניתוח לב?',
                              'flag': True},
                             {'id': 'chest_pain',
                              'type': 'boolean',
                              'label': 'האם הופיעו כאבים בחזה במהלך מאמץ גופני?'},
                             {'id': 'fainting',
                              'type': 'boolean',
                              'label': 'האם הייתה התעלפות או סחרחורת במהלך מאמץ גופני?'},
                             {'id': 'family_sudden_death',
                              'type': 'boolean',
                              'label': 'האם היה במשפחה מקרה של מוות פתאומי לפני גיל 50?'}]},
              {'id': 'orthopaedic',
               'title': 'אורתופדיה ופציעות',
               'questions': [{'id': 'injury',
                              'type': 'boolean',
                              'label': 'האם קיימת פציעה פעילה או בעיה אורתופדית?',
                              'flag': True},
                             {'id': 'surgery_last_year',
                              'type': 'boolean',
                              'label': 'האם עבר/ה ניתוח בשנה האחרונה?'},
                             {'id': 'restrictions',
                              'type': 'text',
                              'label': 'מגבלות פעילות גופנית',
                              'required': False}]},
              {'id': 'other',
               'title': 'נוסף',
               'questions': [{'id': 'other',
                              'type': 'boolean',
                              'label': 'האם יש מצב רפואי נוסף שחשוב שנדע עליו?',
                              'flag': True},
                             {'id': 'other_details',
                              'type': 'text',
                              'label': 'פירוט',
                              'required': False,
                              'visible_if': {'other': True}},
                             {'id': 'health_fund',
                              'type': 'text',
                              'label': 'קופת חולים',
                              'required': False},
                             {'id': 'emergency_contact',
                              'type': 'phone',
                              'label': 'טלפון לשעת חירום',
                              'required': True}]},
              {'id': 'declaration',
               'title': 'הצהרה',
               'questions': [{'id': 'fit_to_train',
                              'type': 'boolean',
                              'label': 'אני מצהיר/ה שהתלמיד/ה כשיר/ה לפעילות גופנית ולאימוני '
                                       "ג'ודו",
                              'required': True},
                             {'id': 'notify_changes',
                              'type': 'boolean',
                              'label': 'אני מתחייב/ת לעדכן את המועדון בכל שינוי במצב '
                                       'הבריאותי',
                              'required': True}]}]}



def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('consent_record',
    sa.Column('subject_type', sa.String(length=10), nullable=False),
    sa.Column('subject_id', sa.UUID(), nullable=False),
    sa.Column('consent_type', sa.String(length=20), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('granted', sa.Boolean(), nullable=False),
    sa.Column('granted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ip', sa.String(length=45), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('studio_id', sa.UUID(), nullable=False),
    sa.CheckConstraint("consent_type IN ('terms', 'privacy', 'photo_video', 'medical_share', 'event')", name=op.f('ck_consent_record_consent_record_consent_type')),
    sa.CheckConstraint("subject_type IN ('person', 'student')", name=op.f('ck_consent_record_consent_record_subject_type')),
    sa.ForeignKeyConstraint(['studio_id'], ['studio.id'], name=op.f('fk_consent_record_studio_id_studio'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_consent_record'))
    )
    op.create_index('ix_consent_record_studio_id_id', 'consent_record', ['studio_id', 'id'], unique=False)
    op.create_index('ix_consent_record_subject', 'consent_record', ['studio_id', 'subject_type', 'subject_id', 'consent_type'], unique=False)
    op.create_table('health_declaration',
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('template_id', sa.UUID(), nullable=False),
    sa.Column('template_version', sa.Integer(), nullable=False),
    sa.Column('answers_encrypted', app.core.encryption.EncryptedJSON('health_declaration.answers_encrypted'), nullable=False),
    sa.Column('derived_flags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('signature_image_encrypted', app.core.encryption.EncryptedBytes('health_declaration.signature_image_encrypted'), nullable=True),
    sa.Column('signed_by_person_id', sa.UUID(), nullable=False),
    sa.Column('signed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('valid_until', sa.Date(), nullable=True),
    sa.Column('signed_ip', sa.String(length=45), nullable=True),
    sa.Column('signed_user_agent', sa.String(length=400), nullable=True),
    sa.Column('pdf_object_key', sa.String(length=500), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('studio_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['signed_by_person_id'], ['person.id'], name=op.f('fk_health_declaration_signed_by_person_id_person'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['student_id'], ['student.id'], name=op.f('fk_health_declaration_student_id_student'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['studio_id'], ['studio.id'], name=op.f('fk_health_declaration_studio_id_studio'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['template_id'], ['health_form_template.id'], name=op.f('fk_health_declaration_template_id_health_form_template'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_health_declaration'))
    )
    op.create_index('ix_health_declaration_studio_id_id', 'health_declaration', ['studio_id', 'id'], unique=False)
    op.create_index('ix_health_declaration_studio_id_signed_at', 'health_declaration', ['studio_id', 'signed_at'], unique=False)
    op.create_index('uq_health_declaration_student_id', 'health_declaration', ['student_id'], unique=True)
    op.create_table('absence_report',
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('reported_by_person_id', sa.UUID(), nullable=False),
    sa.Column('reason', sa.String(length=200), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('studio_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['reported_by_person_id'], ['person.id'], name=op.f('fk_absence_report_reported_by_person_id_person'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['session_id'], ['session.id'], name=op.f('fk_absence_report_session_id_session'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['student.id'], name=op.f('fk_absence_report_student_id_student'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['studio_id'], ['studio.id'], name=op.f('fk_absence_report_studio_id_studio'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_absence_report'))
    )
    op.create_index('ix_absence_report_session_id', 'absence_report', ['session_id'], unique=False)
    op.create_index('ix_absence_report_studio_id_id', 'absence_report', ['studio_id', 'id'], unique=False)
    op.create_index('uq_absence_report_student_id_session_id', 'absence_report', ['student_id', 'session_id'], unique=True)
    op.create_table('attendance',
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('source', sa.String(length=10), nullable=False),
    sa.Column('marked_by_person_id', sa.UUID(), nullable=True),
    sa.Column('marked_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('device_marked_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('client_mark_id', sa.UUID(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('studio_id', sa.UUID(), nullable=False),
    sa.CheckConstraint("source IN ('coach', 'parent', 'bulk', 'system')", name=op.f('ck_attendance_attendance_source')),
    sa.CheckConstraint("status IN ('unmarked', 'present', 'absent_excused', 'absent_unexcused')", name=op.f('ck_attendance_attendance_status')),
    sa.ForeignKeyConstraint(['marked_by_person_id'], ['person.id'], name=op.f('fk_attendance_marked_by_person_id_person'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['session_id'], ['session.id'], name=op.f('fk_attendance_session_id_session'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['student.id'], name=op.f('fk_attendance_student_id_student'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['studio_id'], ['studio.id'], name=op.f('fk_attendance_studio_id_studio'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_attendance'))
    )
    op.create_index('ix_attendance_studio_id_id', 'attendance', ['studio_id', 'id'], unique=False)
    op.create_index('ix_attendance_studio_id_student_id', 'attendance', ['studio_id', 'student_id'], unique=False)
    op.create_index('uq_attendance_client_mark_id', 'attendance', ['client_mark_id'], unique=True)
    op.create_index('uq_attendance_session_id_student_id', 'attendance', ['session_id', 'student_id'], unique=True)
    # -- D11's default `full` question set -------------------------------------------
    # "Ship a standard Israeli sports health declaration as the default
    # health_form_template question set, seeded by migration." §15 item 1 had made the
    # studio's own PDF a hard blocker on the whole M4 lane; this is what unblocks it.
    #
    # One row per studio, skipping any that already has a v1 `full` template. The guard is
    # not defensive dressing: app/services/structure/health_templates.py::ensure_full_template
    # seeds the same row for studios provisioned after this revision, and the demo fixture
    # layer re-seeds it after a reset -- so a database can genuinely arrive here with the
    # row already present, and the unique index on (studio_id, kind, version) would make
    # that an integrity error rather than a no-op.
    op.execute(
        sa.text(
            "INSERT INTO health_form_template "
            "(id, studio_id, kind, version, schema, published_at, created_at, updated_at) "
            "SELECT gen_random_uuid(), s.id, 'full', 1, CAST(:schema AS jsonb), "
            "       now(), now(), now() "
            "FROM studio s "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM health_form_template t "
            "  WHERE t.studio_id = s.id AND t.kind = 'full' AND t.version = 1"
            ")"
        ).bindparams(schema=json.dumps(_FULL_TEMPLATE_SCHEMA_V1, ensure_ascii=False))
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # D11's seed, removed before the tables it sits beside. Scoped to the bundled v1: a
    # studio that has since published its own v2 keeps it, because this revision did not
    # create that one and a downgrade must not destroy work it never did.
    op.execute("DELETE FROM health_form_template WHERE kind = 'full' AND version = 1")
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('uq_attendance_session_id_student_id', table_name='attendance')
    op.drop_index('uq_attendance_client_mark_id', table_name='attendance')
    op.drop_index('ix_attendance_studio_id_student_id', table_name='attendance')
    op.drop_index('ix_attendance_studio_id_id', table_name='attendance')
    op.drop_table('attendance')
    op.drop_index('uq_absence_report_student_id_session_id', table_name='absence_report')
    op.drop_index('ix_absence_report_studio_id_id', table_name='absence_report')
    op.drop_index('ix_absence_report_session_id', table_name='absence_report')
    op.drop_table('absence_report')
    op.drop_index('uq_health_declaration_student_id', table_name='health_declaration')
    op.drop_index('ix_health_declaration_studio_id_signed_at', table_name='health_declaration')
    op.drop_index('ix_health_declaration_studio_id_id', table_name='health_declaration')
    op.drop_table('health_declaration')
    op.drop_index('ix_consent_record_subject', table_name='consent_record')
    op.drop_index('ix_consent_record_studio_id_id', table_name='consent_record')
    op.drop_table('consent_record')
    # ### end Alembic commands ###
