-- Runs once, on a fresh volume, as studio_migrator (the POSTGRES_USER).
--
-- Two roles, because SPEC §11.2 requires the application role to hold INSERT on
-- audit_log and no UPDATE or DELETE. One role cannot both own the table and be denied
-- rights on it: an owner's privileges cannot be revoked from itself in any way that
-- survives, so append-only would be a comment rather than a grant.
--
--   studio_migrator  owns the schema, runs Alembic
--   studio_app       the runtime role the API connects as
--
-- No credential appears here: local auth is trust. Revision 0001 performs the same
-- role creation for environments that have no init hook — Railway, and GitHub
-- Actions service containers.
CREATE ROLE studio_app LOGIN;
GRANT CONNECT ON DATABASE studio_manager TO studio_app;
