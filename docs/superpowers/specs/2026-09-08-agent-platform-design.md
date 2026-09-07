# The agent platform — proposals a manager approves

> Design agreed 2026-09-08. **Planning only** — nothing in this document is implemented.
>
> The feature appears in neither SPEC.md nor `docs/plan/state.yaml`. It is not a v2 item
> and it is not one of §17.3's deliberate omissions: SPEC.md rejects a *drip-campaign /
> automation builder* on the grounds that "a fixed trigger table (§5.11) covers the cases
> that matter without a rules engine", and this is not a rules engine. §5.11's triggers
> stay exactly as they are. What this adds is the work those triggers cannot do — the
> judgement a manager applies to a list, and the writing they never have time for.

## 1. What this is

A studio-level queue of **proposals**. A scheduled agent reads the club's own data, decides
nothing, and writes rows saying *"I would send this message to this family, and here is
why."* The manager approves, edits and approves, or dismisses with a reason. Approval —
and only approval — calls the same service the dashboard's own button already calls.

The product goal is the manager's evenings. The club's data already knows who is overdue,
who is drifting and which session has no coach. What it has never had is somebody to write
the eleven messages.

**Vertical:** `agents` — new. `./scripts/lane-check.sh agents`

**The first agent is collections** (§8). The platform is designed for six (§13), and one
is built.

## 2. Decisions taken, and what they rule out

Each was chosen deliberately during the design conversation, and is recorded with its
consequence so a later reader can tell whether the reasoning still holds.

| Decision | Consequence |
|---|---|
| **An agent may only propose what a manager could already do.** `kind` names an action, and approval dispatches to the service behind an existing endpoint. | No agent has a privileged path. Tenancy still fails closed and permissions are still checked where they already are. A new agent capability requires a new registered handler, which is a code review. |
| **The queue is inert.** Nothing is sent at draft time. | An agent that behaves badly produces a queue nobody approves. The blast radius of a bug is wasted reading, not a message to a family. |
| **Selection is SQL. The model only writes words.** | The model never chooses who is contacted and never sees the ledger. It also means the platform degrades to a good non-AI feature: with no model configured, agents still propose, with a template draft. |
| **The model never touches the health vertical.** | Enforced by an invariant test, not a policy (§10). Rules out any future agent that reasons about a medical restriction. |
| **`payload` is not editable; `draft` is.** | A manager rewrites the words, never the action. "Edit and approve" cannot become an arbitrary-action escape hatch. |
| **One pending proposal per (agent, kind, subject).** | A daily job supersedes rather than stacks. Rules out two agents proposing about one family at once without one of them being visibly superseded. |
| **The manager is the audit actor; the agent is recorded as proposer.** | "Who sent this?" always answers with a person. Rules out an audit log that says the AI did it. |

## 3. Data model

One new table, owned by `agents`, carrying `TenantMixin`.

A proposal names families, so it cannot live in `app/models/ops.py`: that module's docstring
is explicit that both its tables are global and that **nothing there may carry a person**.
Agent runs are still `JobRun` rows like every other job's; only the proposals are tenanted.

```
agent_proposal                     TenantMixin · UUIDPrimaryKey · TimestampColumns
  agent             varchar(32)   not null   collections | retention | funnel |
                                             scheduling | books | briefing
  run_id            uuid          null       → job_run.id, the run that produced it
  kind              varchar(40)   not null   the ACTION — 'comms.send_debt_reminder'
  subject_type      varchar(32)   not null   person | student | session | payment
  subject_id        uuid          not null   what it concerns, and what dedupes it
  payload           JSONB         not null   the action's arguments. NOT editable.
  draft             text          null       the Hebrew the manager reads. Editable.
  evidence          JSONB         not null   structured refs. Never prose, never health.
  confidence        smallint      not null   0-100
  status            varchar(16)   not null   pending | approved | dismissed |
                                             expired | superseded | failed
  expires_at        timestamptz   not null
  decided_at        timestamptz   null
  decided_by_person_id uuid       null       → person.id
  dismissed_reason  varchar(24)   null       the fixed enum below
  drafted_by        varchar(16)   not null   'model' | 'template' — which wrote `draft`

  CHECK  (status IN ('pending','approved','dismissed','expired','superseded','failed'))
  CHECK  (subject_type IN ('person','student','session','payment'))
  CHECK  (drafted_by IN ('model','template'))
  CHECK  (confidence BETWEEN 0 AND 100)
  CHECK  (dismissed_reason IS NULL OR status = 'dismissed')

  UNIQUE (studio_id, agent, kind, subject_id) WHERE status = 'pending'
  INDEX  (studio_id, status, agent)                    the queue's own read
  INDEX  (studio_id, status, expires_at)               the expiry sweep
```

### Why the partial unique index is the feature and not a nicety

Without it, a daily agent that still finds a family overdue on Tuesday, Wednesday and
Thursday leaves three identical pending rows by Friday, and the queue becomes something a
manager scrolls past. With it, a re-run has exactly two honest options: leave the existing
proposal alone, or supersede it with fresher facts. Both are visible.

This is the same reasoning `escalate_debt` gives for bounding itself to an exact day
(`app/workers/billing.py:141`) — *"a daily job asking 'is this more than three days
overdue' would send the day-3 reminder on days 3, 4, 5, 6 and 7."* The ladder solves it
with a date bound. An agent whose selection is not a single date solves it with this index.

### Why `expires_at` is not nullable

The most likely way this ships broken is a manager approving, on Thursday, a message about
Tuesday. Every kind declares its own lifetime in the registry (§4) — a debt chase is worth
a few days, a coverage offer for tomorrow's session is worth hours. A nullable column would
let a kind forget to say.

### Why `draft` is nullable and `payload` is not

Not every action is a message. A `books.match_payment` proposal has arguments and evidence
and no prose at all. `draft` is null there, and the screen renders the reconciliation
instead.

### Why there is no `sent_at`, no `result`, and no second copy of anything

`app/services/comms/actions.py` states the doctrine this follows: **"Resolved on read, never
written… A column would be a second source of truth for a fact the club's own records
already hold, and the two would drift the first time it was changed by a route that forgot
to update it."** An approved proposal's outcome is the notification row the service wrote,
found by the ids in `payload`. Storing it twice buys a screen one query and costs the
product a class of bug it has already reasoned itself out of once.

### The dismissal enum, and why it is not free text

```
wrong_facts · bad_timing · wrong_tone · already_handled · not_worth_it · never_this_family
```

Two of these are machine-actionable and that is the point of fixing the vocabulary.
`already_handled` means the selection SQL missed a signal the manager can see — it is a
bug report arriving through the product. `never_this_family` should write a suppression the
agent reads on its next run. The other four are a monthly read. Free text would be neither.

## 4. The kind registry — the seam that makes this safe

A `kind` is not a category. It is the name of an action with a registered handler:

```python
# app/services/agents/kinds.py
@dataclass(frozen=True)
class Kind:
    name: str                       # 'comms.send_debt_reminder'
    payload_schema: type[BaseModel] # validated on write AND again on approve
    lifetime: timedelta             # becomes expires_at
    money: bool                     # True → never batch-approved (§6)
    handler: Callable               # what approval calls
```

Three rules the registry enforces, each of which is a test rather than a convention:

1. **A proposal whose `kind` is not registered cannot be written.** The service refuses.
2. **The payload is validated twice** — once when the agent writes it, and again at approval,
   against the schema in force at that moment. A proposal written before a deploy that
   changed a schema fails closed rather than being handed to a handler that cannot read it.
3. **A handler is a call to an existing service**, not new behaviour. The review question
   for any new kind is "which endpoint does a manager press to do this today?" A kind with
   no answer to that question is a feature request, not a kind.

## 5. API

`app/routers/agents.py`, mounted by discovery. **Manager only** — `ManagerOrOwner`
(`app/core/auth_context.py:116`). No coach surface: approving a chase is not a coach's job,
and the staff app has no screen for it.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/agents/proposals` | the queue — filter by `agent`, `status`; pending by default |
| `GET` | `/api/v1/agents/proposals/{id}` | one proposal with its evidence expanded |
| `POST` | `/api/v1/agents/proposals/{id}/approve` | optional `draft` override; dispatches the handler |
| `POST` | `/api/v1/agents/proposals/{id}/dismiss` | requires a `reason` from the enum |
| `POST` | `/api/v1/agents/proposals/approve` | batch — refused if any member is `money: true` |
| `GET` | `/api/v1/agents` | the agents, whether each is enabled, and its last run |
| `PUT` | `/api/v1/agents/{agent}` | enable, disable, set the per-run cap |

**No public surface, and nothing in the parent or staff apps.**

`POST /approve` is the only route that acts, and what it does is call a handler. Every
failure mode of that handler is the failure mode it already has — a `QuietHoursError` from
`ReminderService` comes back as a 409 naming quiet hours, and the proposal stays `pending`
so the manager can approve it in the morning rather than losing it.

Agent settings live in `studio.settings['agents']`, which needs no migration: the studio
already carries `settings['billing']['run_day']` and the billing worker reads it
(`infra/railway/jobs.json`, `billing-run.why`).

## 6. The guardrail that actually matters

The dangerous failure is not a rogue agent. It is **a queue of forty that gets
rubber-stamped**, at which point the agent is unsupervised and nobody knows it.

- **A cap per agent per run**, default ten, in `studio.settings['agents'][name]['cap']`.
  It bounds the runaway and the rubber stamp with one number.
- **`money: true` kinds are never batch-approved.** `POST /agents/proposals/approve`
  refuses the whole batch — a 422 naming the offending ids, not a partial success.
- **Evidence renders in the row**, so approving is reading. A proposal whose evidence does
  not fit in a row is a proposal whose kind is too coarse.
- **A kill switch per agent per studio**, and a global one in config for the model call.

### Audit

`AuditService.record(...)` on approve and on dismiss, with:

```
actor_person_id = the manager           ← always a person
action          = 'agents.proposal_approved'
entity_type     = 'agent_proposal'
diff            = {'agent': ..., 'kind': ..., 'proposal_id': ..., 'edited': bool}
```

`diff` is written verbatim (`app/services/audit.py:70`), so it carries the agent's name and
the proposal id and **never the draft's text** — a debt message names a family, and an
audit entry has a wider audience than the message does. The handler's own audit row is
written too, unchanged: `remind_debt` already records `billing.reminder_sent` with counts
and never names (`app/services/comms/reminders.py:127`).

## 7. How an agent runs, and how the model is called

An agent is a worker. Nothing new:

```python
with Session(get_engine()) as session, record_run(session, "agent-collections") as run:
    for studio_id, slug in active_non_demo_studios():
        with use_studio(studio_id), TenantSession(bind=get_engine()) as scoped:
            proposals = select_candidates(scoped, at=now())   # ← SQL. Deterministic.
            for candidate in proposals[:cap]:
                draft = write_draft(candidate)                # ← model, or template
                upsert_proposal(scoped, candidate, draft)
            scoped.commit()
    run.detail = {"studios": n, "proposed": m, "superseded": k, "drafted_by_model": j}
```

This is the shape `app/workers/at_risk.py` already uses, and it inherits the whole harness:
a `jobs.json` entry with `max_silence_minutes`, `tests/ops/test_job_heartbeat.py` asserting
the heartbeat is filed under the declared name, and `tests/config/test_jobs_config.py`
catching a runnable module nothing declares.

### What the model is given

Per proposal, a brief that was *constructed* — never a slice of the database:

```json
{
  "task": "debt_reminder",
  "tone": "firm",
  "parent_first_name": "יעל",
  "child_first_name": "נועה",
  "amount_ils": 300,
  "days_overdue": 22,
  "reminders_already_sent": 3,
  "locale": "he"
}
```

No ids, no surnames, no ledger, no roster, no health — **because none of it is in the brief
to begin with.** The privacy question is closed by construction rather than by filtering,
which is the difference between a rule and a hope.

The model returns a body. That body is stored in `draft` and shown to a human before it can
reach anybody. It is not parsed, not trusted for facts, and never used to choose a
recipient.

### When the model is unavailable

`write_draft` falls back to a per-kind template and sets `drafted_by = 'template'`. The run
succeeds, the queue fills, the manager reads slightly duller Hebrew. **No agent's
correctness depends on the model being up, in budget, or configured at all.**

### Timeouts, cost and the log

One call per proposal, capped by the per-run cap, so a run's model cost is bounded by
construction. A timeout is a template draft, not a failed run. And per §18.3, the brief and
the draft are **never logged** — the tally is counts only, exactly as `at_risk.py` does it
(`app/workers/at_risk.py`, "Counts only (G7) — never a student's name").

## 8. The collections agent

### What the club has today, and what is actually missing

`escalate_debt` (`app/workers/billing.py:137`) fires §5.10's ladder on days 3, 7 and 14,
bounded to the exact day so each rung means something. It works. But every message it sends
is this, to every family, every time:

```
title  תזכורת תשלום
body   נרשם חוב פתוח
```

and `ReminderService.remind_debt` — the manager's own button — sends this, to every family,
every time:

```
body   יש חוב פתוח במועדון. אפשר לשלם דרך מסך התשלומים.
```

So the club has a ladder that is punctual and mute, and a button that is manual and mute.
What is missing is **the fourteenth day onward**, where the ladder stops and the debt does
not, and **a message that says something** — the difference between a form letter and a
sentence a parent answers.

### Selection — SQL, and every rule it inherits

Candidates are payers with open charges past the ladder's last rung:

```
Charge.status == 'open'
Charge.amount_agorot > 0          ← never chase a credit. The ladder's own rule
                                    (app/workers/billing.py:159) and the most
                                    avoidable message in the product.
Charge.due_date < today - 14      ← the ladder owns days 3-14. This starts after.
grouped by Charge.payer_person_id ← §6.3, one message per household, to the payer
```

and then four exclusions, each of which is a family the club would be wrong to chase:

1. **An open `payment_promise` over any of those charges.** The parent has already said
   "I'm bringing cash on Sunday." Chasing them is the product forgetting a conversation it
   is holding.
2. **A suppression from a `never_this_family` dismissal.**
3. **Reminded within 24 hours** — and this is the collision below.
4. **No payer, or a payer with no reachable person row.** `_chase` already handles the
   equivalent (`app/workers/billing.py:173`): the charge still shows on `3e`; there is
   simply nobody to message.

### The collision that would have shipped this broken

`ReminderService._recently_reminded` filters on `Notification.kind == kind`
(`app/services/comms/reminders.py:84`), and `remind_debt` passes
`DEBT_KIND = "billing.reminder"`. The automatic ladder does **not** go through
`ReminderService` at all — `_chase` calls `NotificationService.enqueue` directly with
`f"billing.overdue.day{offset}"` (`app/workers/billing.py:179`).

**The two kinds are invisible to each other's rate limit.** A family can receive the
automatic day-14 notice at 08:30 and an agent-drafted chase at 10:00, on the same morning,
about the same money. The 24-hour rate limit will not stop it, because it is not looking at
the other kind.

So the collections agent's selection must exclude anyone with a notification of **either**
`billing.reminder` or `billing.overdue.*` inside the window — a rule that belongs in
selection, where it is one query, rather than in `ReminderService`, where widening
`_recently_reminded` to a prefix would change the behaviour of every existing caller.

The codebase has already refused that widening once, for the same reason, in the inbox
query: *"An exact match, not a prefix… a prefix filter would quietly widen to every future
`attendance.*` kind somebody adds — a card that started rendering notifications it was
never designed for"* (`app/services/comms/notifications.py:186`). The fix here follows that
precedent rather than reopening it: the agent's selection asks the broader question, and
`ReminderService` keeps answering the exact one.

### The action, and the one seam that has to open

`kind: 'comms.send_debt_reminder'` → `ReminderService.remind_debt(...)`.

That method's body is a hardcoded constant (`reminders.py:152`). An agent whose entire value
is a better sentence cannot use it as it stands, and reaching past it into `_send` is
precisely the second delivery path the module's own docstring forbids — *"one service over
the existing comms layer, because a second delivery path is how one product grows two
answers about what was sent."*

So `remind_debt` gains **one optional parameter**:

```python
def remind_debt(self, payer_person_ids, *, actor_person_id, at, body: str | None = None):
    ...
    body=body or "יש חוב פתוח במועדון. אפשר לשלם דרך מסך התשלומים.",
```

Additive, defaulted, every existing caller unchanged — and still a **contract item** (§9),
because it changes a service two verticals read.

### The proposal a manager sees

```
  גבייה                                              8 הצעות · 4 ממתינות

  ┌──────────────────────────────────────────────────────────────┐
  │  משפחת כהן — יעל כהן                          ₪300 · 22 יום  │
  │                                                              │
  │  למה: נובמבר פתוח מ-01/11 · נשלחו 3 תזכורות · אין התחייבות   │
  │       תשלום פתוחה · שילמו ב-12 לחודש ב-4 מהחודשים האחרונים   │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ היי יעל, החוב על נובמבר עדיין פתוח (₪300).             │  │
  │  │ אם נוח לכם לשלם ב-12 כמו בחודשים הקודמים — מצוין,      │  │
  │  │ רק תעדכנו אותי. אם משהו הסתבך, דברו איתי.              │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │   [ אשר ושלח ]   [ עריכה ]   [ דחייה ▾ ]                     │
  └──────────────────────────────────────────────────────────────┘
```

The evidence line is the design. A manager who reads it can tell in two seconds whether the
agent is right, and *"שילמו ב-12 לחודש"* is the texture a ledger report cannot hold and a
person can act on.

### What this agent may never do

Invent a discount. Promise anything. Confirm a payment. State a balance without the ledger
behind it. Write to a family with an open promise. Mention a child's health. Contact anyone
during quiet hours — and that last one it cannot do even by mistake, because the drain
refuses between 21:00 and 08:00 regardless of when the caller enqueued (§13.11,
`app/workers/notify.py:144`).

## 9. What must land in a contract commit on `main`

Per §2 of the `feature` skill, a lane may author **none** of these.

| # | Change | Why it is contract |
|---|---|---|
| 1 | One alembic revision — `agent_proposal`, with its partial unique index | a new table |
| 2 | `web/packages/i18n/types.ts` + `index.ts` — the namespace `agents` | authored once, never by a lane |
| 3 | `scripts/lane-check.sh` — an `agents` case branch | a path not listed is a gate that skips silently and still prints green |
| 4 | `ReminderService.remind_debt` gains an optional `body` parameter, defaulting to `None` | a service `billing` and `comms` both read |
| 5 | `infra/railway/jobs.json` — `agent-collections`, with `max_silence_minutes` and a `why` | a job outside the registry is a job nothing monitors |
| 6 | `pyproject.toml` — the model SDK | a runtime dependency, not a lane's to add |

Item 4 is additive and defaulted, so it cannot change any existing caller's behaviour.

The `lane-check.sh` branch, written out because that script's own comments insist a gate's
coverage should be a statement somebody made rather than an accident of a default:

```bash
agents)
    py_candidates=(app/services/agents app/routers/agents.py app/models/agents.py \
                   app/workers/agent_collections.py)
    test_candidates=(tests/agents)
    # Owns nothing under web/packages/core.
    core_dirs=()
    ;;
```

## 10. Privacy, and the boundary made mechanical

The decision taken during design: **health never leaves; everything else may.**

The codebase already draws this line and draws it well. Health answers are `EncryptedJSON`,
manager-only, every read audit-logged; `derived_flags` is **plaintext booleans only** —
`{"asthma": true}` — deliberately, so that rendering a roster does not mean decrypting a
child's medical form (`app/models/health.py:100-110`). The agent platform sits on the far
side of both: it sees neither the answers nor the flags.

That is enforced as a test, not a policy, in `tests/invariants/` alongside the existing
unscoped invariants:

```
test_agents_cannot_reach_health.py
  no module under app/services/agents, app/workers/agent_*.py or app/routers/agents.py
  imports from app.models.health or app.services.health, at any depth.
```

An import graph check is worth more than a review convention, because the thing it is
guarding against is not malice — it is a future agent that needs *one* medical fact and a
reviewer who does not remember why it was forbidden.

Two further facts, recorded so a later reader starts from what is true:

- **The brief is constructed, not filtered.** There is no query whose result is narrowed
  before the model sees it; there is a dictionary with six keys built by hand (§7). A
  filter can leak by omission. A constructor cannot.
- `REQUIRED_CONSENT_TYPES` is `("terms", "privacy")` (`app/services/privacy/policy.py:51`).
  Nothing in this design needs a new consent: an agent-drafted debt reminder is the same
  communication, to the same person, through the same channel, as the one the manager's
  own button sends today. Said out loud because a feature with "AI" in it invites the
  assumption that it needs one, and here it genuinely does not.

## 11. Testing

**The seam, not the ends** — CLAUDE.md: *"A field added to an API is not proven by a test
that constructs the component's props by hand."*

- `tests/agents/test_registry.py` — an unregistered `kind` is refused on write; a payload
  failing its schema is refused on write **and** again on approve; every registered kind's
  handler resolves to a callable.
- `tests/agents/test_queue.py` — the partial unique index holds: a second run over an
  unchanged candidate supersedes rather than inserting; tenancy (studio B cannot read,
  approve or dismiss studio A's proposal); a `money: true` kind is refused by the batch
  route with a 422 naming the ids; an expired proposal cannot be approved.
- `tests/agents/test_approve_dispatches.py` — **the seam.** Approving a
  `comms.send_debt_reminder` results in a `Notification` row for the payer carrying the
  edited body, and an `audit_log` row whose actor is the manager and whose `diff` names the
  agent and the proposal id and contains no message text. Not a mock of the handler — the
  real service, the real rows.
- `tests/agents/test_collections_selection.py` — the exclusions, one test each: a credit
  (`amount_agorot < 0`) is never a candidate; a charge inside the ladder's 3-14 day window
  is never a candidate; a payer with an open `payment_promise` over the charge is excluded;
  **a payer who received `billing.overdue.day14` this morning is excluded** — the §8
  collision, as its own named test, because it is the defect this design exists to have
  caught.
- `tests/agents/test_degrades_without_model.py` — with the model unconfigured, a run
  completes, proposals are written, and `drafted_by == 'template'`.
- `tests/invariants/test_agents_cannot_reach_health.py` — §10, unscoped, every lane.
- `tests/ops/test_job_heartbeat.py` — already asserts this for every declared job; adding
  `agent-collections` to `jobs.json` brings it under that check for free.
- `AgentQueue.test.tsx` — the whole `fetch → state → approve payload` mapping: an edited
  draft reaches the request body while `payload` does not; a dismissal cannot be submitted
  without a reason from the enum; a `money: true` row offers no batch checkbox.

## 12. Done when

- `agent-collections` runs at its declared hour, files a heartbeat, and writes proposals
  for exactly the families past day 14 that the four exclusions do not remove.
- A manager opens the dashboard queue, reads the evidence line, edits one draft, approves
  it, and the parent's phone shows **that** message rather than "נרשם חוב פתוח".
- The audit log for that send names the manager as actor and the agent as proposer, and
  carries no message text.
- A second run the next morning supersedes the untouched proposals rather than adding to
  them, and the queue is the same length.
- The model is switched off in config; the run still succeeds and the queue still fills.
- A family that received the automatic day-14 notice at 08:30 gets **no** agent proposal
  that day.
- `./scripts/lane-check.sh agents` green.

## 13. Deliberately not in v1

The other five agents — retention, funnel, scheduling, books, briefing · any agent that
sends without approval · a scheduling rule engine or user-authored agents · the WhatsApp
channel as a delivery route for approved drafts · learning from dismissals automatically
(they are recorded and read by a human) · confidence used to auto-approve anything · a
staff-app surface · per-agent tone configuration beyond the three the collections agent uses.

The model is shaped so the second agent is additive: a new agent is a new worker, a new
`agent` value, and one or more registered kinds. No table changes.

## 14. Open — a delivery-plan question, not a code one

This feature is in neither SPEC.md nor `docs/plan/state.yaml`. Every wave from W0 to W9S is
shipped or active, so there is no open piece to tick. It needs either a new wave or a piece
appended to `W8C` — and it shares that question with the flyers design of the same date
(`2026-09-08-flyers-design.md` §13), which is probably a sign the two should be placed
together. `state.yaml` is machine-written by the cockpit, so the placement is a call about
the delivery plan and is left open here.

## 15. The rest of the brainstorm this came out of

Recorded so the discarded options are not re-argued, and so the ideas that were not chosen
are not lost. Full reasoning is in the session; the shortlist:

**Reframed, and worth revisiting.** SPEC §5.11 rejects a WhatsApp channel because it
"would require Meta verification plus roughly 48 pre-approved templates across three
languages." That cost is the cost of **business-initiated** messages. A parent who messages
the club opens a 24-hour service window in which free-form replies need no template at all —
so an **inbound-first bot** (answering "יש אימון מחר?", taking an absence report, catching a
lead) walks past the entire stated objection. §12's finding that WhatsApp *groups* cannot be
automated is unaffected and remains true.

**Considered, not chosen.** Prepay offers and a family sibling rate · a collections
workspace screen · coach payroll from `session_staff` · coverage offers built on
`GET /staff/available` · per-parent referral attribution and rewards on top of the flyer
board · the funnel report, which SPEC §17.4 claims exists natively and which is **not in
`app/` at all** · the monthly parent recap, which §2.2 files as *email* although the comms
layer has exactly two channels, `push` and `inapp` · attendance streaks and milestones ·
home practice per group, which needs a name other than `training_plan` because that already
means the paid tier.

**Ruled out on a constraint.** Anything reusing the IJF 3D animations: their `robots.txt`
carries `use=reference, ai-train=no` and an express copyright reservation, which is why
`IjfSheet.tsx` frames their page rather than embedding the model. Any bespoke animation
must be ours. And facial recognition to route competition photos to families — minors,
תיקון 13, not a fight worth having for a convenience.
