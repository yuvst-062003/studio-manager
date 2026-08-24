---
paths:
  - "app/routers/**"
  - "app/schemas/**"
---
- Every request body and query param is validated by a Pydantic schema. No raw dicts.
- Every endpoint declares an explicit `response_model`.
- Authorization is checked in the router via a dependency, never inside a service.
- Errors return our `ApiError` shape: `{code, message, details?}`. Never leak stack traces.
- Any endpoint touching student data must filter by the caller's `studio_id`. Tenancy is
  enforced by `TenantMixin` / `TenantSession` (SPEC §4.2) — every tenant-scoped table carries
  a non-null `studio_id` with a leading composite index. Bypassing it requires the explicit
  `.with_all_tenants()` escape hatch, which is never valid in a request-scoped path.
