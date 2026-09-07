# The WhatsApp bot — inbound, answering, and priced

> Design agreed 2026-09-08. **Planning only** — nothing in this document is implemented.
>
> Companion to `2026-09-08-agent-platform-design.md`, which this reuses: the tool registry
> here is the same shape as that document's kind registry, and for the same reason.

## 1. What this is, and what it is not

A WhatsApp number the club owns, with software behind it that **answers parents**. A parent
writes *"יש אימון מחר?"* or *"נועה לא מגיעה"* and gets a correct answer, or an absence
recorded, without anyone at the club touching a phone.

**It is not a broadcast channel.** SPEC §5.11 permits exactly two delivery levels, push and
a one-way inbox, and `DELIVERY_CHANNELS` is `("push", "inapp")` with a CHECK constraint
(`app/models/comms.py:53`). Nothing here adds a third. Announcements, recaps and milestones
continue to go out over push and the inbox exactly as they do today. §11 explains why that
is also the cheap answer.

**It is not two-way chat.** §2.3 puts "in-app two-way chat" out of scope, and this builds no
chat surface: the conversation lives in WhatsApp, which is where it already lives today,
unmanaged, on the manager's personal phone.

**Vertical:** `whatsapp` — new. `./scripts/lane-check.sh whatsapp`

## 2. The pricing reality, and a correction

SPEC §5.11 rejects WhatsApp because it "would require Meta verification plus roughly 48
pre-approved templates across three languages," and §17.3 repeats it. **That cost is the
cost of business-initiated messages.** Template approval has never applied to a reply sent
inside an open customer-service window. So an inbound-first bot does not pay it, and the
spec's stated objection does not reach this design.

But the economics underneath that argument changed, and this document is being written
**three weeks before the change lands.**

### What is true today (September 2026)

A customer message opens a **24-hour customer service window**. Inside it, Meta's own
documentation says: *"All non-template messages are free (`"type":"text"`, `"type":"image"`,
and so on)"*, and *"Non-template messages can only be sent within an open customer service
window."* Utility templates delivered inside an open window are also free.

### What changes on 1 October 2026

Meta announced on 1 July 2026, alongside its Business Agent platform, that from
**1 October 2026** every non-template message a business sends — *"powered by people or
third-party AI"* — becomes billable per message. The 24-hour window itself does not go away
and customer→business messages stay free; what stops being free is **our replies**.

The published terms of that change:

- Service messages are priced **at the same rate as utility and authentication templates for
  the recipient's country**.
- **No volume tiers.** Meta's page is explicit: *"Meta does not offer volume tiers for
  service messages,"* while utility and authentication keep theirs.
- Messages inside the **72-hour free entry point window** (Click-to-WhatsApp ads, a Facebook
  Page "Send Message" button) remain free.
- Meta said final country rates would be published by 1 September 2026.

**So the correction to my earlier claim: inbound replies are free now and will not be free
after 1 October.** The reframe still holds — inbound is far cheaper than templates and needs
no template approval — but "free" was true for three more weeks, and a design that assumed
it permanently would have been wrong.

### The Israel rate

**Not established.** Israel has a standalone rate card (calling code 972), but Meta
publishes it as a downloadable file rather than on the page, and no secondary source checked
carries it. It must be read off Meta's rate card before this is committed to.

What is known is the global band for the utility/authentication rates that service messages
will be priced against: **USD 0.004 – 0.0456 per message.** §11 models the club's bill at
both ends, which brackets the answer regardless of where Israel lands.

**Sources:** [Meta — WhatsApp Business Platform pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) ·
[Meta — upcoming pricing for non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages) ·
[Zendesk — announcing upcoming WhatsApp pricing changes](https://support.zendesk.com/hc/en-us/articles/11113277351322-Announcing-upcoming-changes-to-WhatsApp-Business-messaging-pricing) ·
[SendPulse — service message pricing changes, October 2026](https://sendpulse.com/blog/whatsapp-service-message-pricing) ·
[EngageLab — WhatsApp Business API pricing guide](https://www.engagelab.com/blog/whatsapp-business-api-pricing)

### The design consequence, which is not obvious

After 1 October, **every message the bot sends costs money, so terseness is an
architectural requirement rather than a matter of taste.** A bot that answers in three
messages where one would do triples the bill for no benefit. Three rules fall out, and they
are enforced in code rather than left to the model:

1. **One outbound message per inbound turn.** No acknowledgements, no "let me check that",
   no split replies. The transport refuses a second send inside one turn.
2. **Confirmations use interactive reply buttons, not a question.** *"לרשום שנועה לא מגיעה
   מחר?"* followed by a second message on the answer is two charges; one interactive message
   carrying two buttons is one charge and is clearer to read.
3. **A per-number daily inbound cap.** An unknown number that writes forty times is a bill.
   Beyond the cap the bot stops replying and raises a manager task.

## 3. Decisions taken, and what they rule out

| Decision | Consequence |
|---|---|
| **Inbound only. The bot never starts a conversation.** | No template approval, no marketing category, and §5.11's channel rule is untouched. Rules out delivering the monthly recap or a milestone over WhatsApp in v1 — those stay on push and the inbox. |
| **The model chooses a tool. It never supplies a fact.** | The bot cannot invent Tuesday's training time, because no club data is in its prompt. Rules out any answer for which no tool exists — those become a handoff. |
| **The tenant resolves from the club's own `phone_number_id`, not from the sender.** | Tenancy stays intact and `TenantSession` still fails closed. Requires one WhatsApp number per studio, which is true anyway. |
| **Writes are confirmed by a tapped button, never by parsed prose.** | "לא, התכוונתי ליום ראשון" cannot silently cancel the wrong session. Costs one interactive message and buys an unambiguous record. |
| **The message body is stored encrypted.** | We do not control what a parent types. §10 explains why this does not make the health boundary a lie. |
| **The bot replies at any hour; it initiates at none.** | A deliberate departure from the 21:00–08:00 rule, argued in §9. |

## 4. Data model

Three tables, owned by `whatsapp`.

```
whatsapp_number                   TenantMixin · UUIDPrimaryKey · TimestampColumns
  phone_number_id   varchar(32)  not null   Meta's id for the club's number
  display_number    varchar(32)  not null   E.164, for the manager's screen
  waba_id           varchar(32)  not null
  status            varchar(12)  not null   active | paused

  UNIQUE (phone_number_id)                  GLOBALLY unique — see §5
```

```
whatsapp_conversation             TenantMixin · UUIDPrimaryKey · TimestampColumns
  wa_phone          varchar(32)  not null   the E.164 number that wrote to us
  person_id         uuid         null       → person.id, null while unresolved
  state             varchar(20)  not null   active | awaiting_verification |
                                            handed_off | capped | blocked
  window_opens_at   timestamptz  null       last inbound; +24h is the window
  verified_at       timestamptz  null       §8's step-up
  inbound_today     smallint     not null   the §2 cap, reset by date
  inbound_day       date         null

  UNIQUE (studio_id, wa_phone)
  INDEX  (studio_id, state)
```

```
whatsapp_message                  TenantMixin · UUIDPrimaryKey · TimestampColumns
  conversation_id   uuid         not null  → whatsapp_conversation.id
  wamid             varchar(128) not null  Meta's message id
  direction         varchar(3)   not null  in | out
  body_encrypted    EncryptedBytes         the text. Never plaintext at rest.
  kind              varchar(16)  not null  text | interactive | button_reply | system
  tool_calls        JSONB        not null  which tools ran, with their arguments
  billable          boolean      not null  false before 2026-10-01, true after
  handled_at        timestamptz  null      null = not yet processed by the worker

  UNIQUE (wamid)                           the retry guard — see §5
  INDEX  (studio_id, conversation_id, created_at)
  INDEX  (handled_at) WHERE handled_at IS NULL     the worker's queue
```

### Why `wamid` is uniquely indexed and why it matters more than it looks

Meta retries a delivery it did not get a 200 for. Without this constraint a retry is a
second answer to the same question — which after 1 October is also a second charge, and
before it is a parent receiving the same sentence twice. The insert is the deduplication;
there is no "have we seen this?" query to race against.

### Why `billable` is a stored boolean rather than derived

The 1 October cutover means the same message shape costs nothing on 30 September and costs
money on 1 October. A cost report that derives billability from today's rules would rewrite
history every time Meta changes them. This is the same argument `price_plan` makes with
`active_from`/`active_to` — *"a price change never rewrites history"* (SPEC §5.10).

## 5. The webhook

`app/routers/whatsapp_webhook.py`, mounted by discovery. **Unauthenticated by necessity —
Meta calls it.** The house already has one of these and its reasoning transfers almost
whole: `app/routers/webhooks.py` is the uPay IPN, and its docstring is the pattern.

```
GET  /webhooks/whatsapp    the subscription handshake — echo `hub.challenge` as text/plain
                           when `hub.verify_token` matches, 403 otherwise
POST /webhooks/whatsapp    events
```

### One place this is better than the uPay precedent, and the design should say so

uPay's callback has **no cryptographic signature** (§12), which is why that router treats the
order reference as the credential and answers 200 to everything including a forgery.

**WhatsApp signs.** Every delivery carries `X-Hub-Signature-256: sha256=<hmac>`, an
HMAC-SHA256 of the **raw request body** under the app secret. So this endpoint can do what
the uPay one cannot: refuse. A bad signature is a `403` and nothing is written, and that is
safe precisely because a genuine Meta delivery never produces one.

Two implementation details that decide whether the check works at all:

- The HMAC is over the **raw bytes**, so the body must be read with `await request.body()`
  and verified before any parsing. Re-serialising the parsed JSON produces different bytes
  and a signature that never matches.
- Compared with `hmac.compare_digest`, never `==`.

### Everything else follows uPay exactly

**Write the bytes down first, answer 200, process in a worker.** The uPay router's own words:
*"the bytes are written down first, the answer is always 200, and every verdict is reached
afterwards against a row that already exists."* A slow model call inside a webhook is a
timeout, and a timeout is a retry, and a retry is a duplicate answer.

So `POST` does exactly four things: verify the signature, resolve the studio, insert
`whatsapp_message` rows with `handled_at = NULL`, return 200. The worker does the rest.

### Tenancy, resolved from our number and not from the sender

The payload carries `entry[].changes[].value.metadata.phone_number_id` — **the club's
number, not the parent's.** That is the tenant key, and `whatsapp_number.phone_number_id` is
globally unique for exactly the reason `payment_order.public_ref` is: it is the one
deliberate cross-tenant read, after which `use_studio` opens the scope and everything
downstream is normally tenanted.

This is why the sender's number is never the tenancy key. A phone number is not unique
across studios, is supplied by an untrusted caller, and would need `with_all_tenants` to
look up — a hatch `app/core/tenancy.py:82` reserves for platform-admin code and deliberate
cross-studio jobs, which a parent's inbound message is neither.

`SessionDep`, not `TenantSessionDep`, for the same reason the uPay router gives: there is no
authenticated caller, so the tenant-scoped dependency would 401 every real message.

**A test must assert this router carries no auth dependency**, exactly as one already does
for the uPay webhook, so that nobody later "fixes" the missing dependency and silently stops
every parent message in the club from being answered.

## 6. The reply path

### The transport, following the shape already in the house

`app/services/comms/push.py` defines a `PushSender` Protocol with a recording fake and a
real sender. WhatsApp gets the same three pieces, for the same reason — a test must be able
to assert what was addressed without a network:

```python
class WhatsAppTransport(Protocol):
    def send_text(self, *, to: str, body: str) -> str: ...
    def send_buttons(self, *, to: str, body: str, buttons: list[Button]) -> str: ...

class RecordingWhatsAppTransport:   # default; dev, tests, and any studio without config
class CloudApiTransport:            # POST graph.facebook.com/v21.0/{id}/messages
```

`httpx` is already a declared dependency (`requirements-dev.txt`), so the transport adds
none.

Neither the body nor the parent's number is logged, following `RecordingPushSender`'s own
note — *"Neither `title` nor `body` is stored on the instance and neither is logged — §18.3."*

### The turn

```
worker: whatsapp-replies, every minute
  ↓
unhandled inbound messages, oldest first
  ↓
resolve conversation → person (§8)
  ↓
build the brief: the question + who is asking + which children they have
  ↓
model picks a tool  ──────────────► no tool fits ──► handoff
  ↓
tool runs — an ordinary service call under TenantSession
  ↓
model phrases the result
  ↓
ONE outbound message. handled_at set. Charge recorded.
```

The worker is the existing pattern — `record_run(session, "whatsapp-replies")`, a
`jobs.json` entry with `max_silence_minutes`, and the heartbeat test that comes with it for
free.

**Every-minute cadence, not every fifteen.** `comms-notify` runs at `*/15` and that is right
for an announcement. A parent who asks a question and waits eleven minutes has been failed by
the product; they will message the manager instead, which is the thing this exists to stop.

## 7. The tools — how it answers without lying

The same registry shape as the agent platform's kinds, and the same rule: **a tool is a call
to an existing service, and a question no tool answers is a handoff, not an improvisation.**

| Tool | Reads | Needs verification | Notes |
|---|---|---|---|
| `next_session(student)` | schedule | no | "יש אימון מחר?" — the most asked question in the club |
| `group_of(student)` | structure | no | |
| `my_children()` | people | no | scoped to the resolved guardian |
| `upcoming_events()` | events | no | |
| `balance()` | billing | **yes** | amount only, as of a stated moment |
| `payment_link()` | billing | **yes** | the existing uPay order flow |
| `report_absence(student, session)` | attendance | **yes** | a WRITE, and confirmed by a button |
| `book_trial(...)` | people | n/a | the only tool an *unresolved* number may reach |
| `handoff(reason)` | — | no | always available, and the answer to everything else |

Because there is no club data in the prompt, there is nothing to answer *from*. The model's
only moves are to call a tool or to hand off. This is the same property the agent platform
relies on, and it is structural rather than a matter of instruction.

### Writes are confirmed by a button

`report_absence` never fires on prose. The bot sends one interactive message —

```
  לרשום שנועה לא מגיעה לאימון מחר (יום ג׳, 17:00)?
  [ כן, לרשום ]   [ לא ]
```

— and the write happens on the button reply, whose payload carries the session and student
ids the bot chose. *"לא, התכוונתי ליום ראשון"* cannot cancel the wrong session, because
prose is never the trigger. One message, one charge, no ambiguity.

## 8. Identity, and the failure mode that will actually bite

The number is the claim. `person.phone` is indexed for this —
`ix_person_studio_id_phone`, whose own comment says the match *"always happens inside one
studio"* (`app/models/person.py:62`).

| The number… | The bot… |
|---|---|
| matches one guardian | answers, at that guardian's permissions and no more |
| matches nobody | is a lead — `book_trial` only, and it leaks nothing |
| matches a coach | answers the staff questions, not the parent ones |
| matches two people | refuses and hands off |

### Recycled numbers

Israeli mobile numbers churn. A family leaves, the number is reassigned eight months later,
and the new owner writes to the club and reads a stranger's balance. This is the one
identity failure that is certain to happen eventually rather than theoretically.

So: **a first contact from any number is unverified**, and unverified means the low-sensitivity
reads only — is there training tomorrow, which group, when is the event. Money and writes
require a step-up:

> "כדי לראות פרטי תשלום אני צריך לוודא שזה את — שלחתי קוד לאפליקציה."

The code goes over **push and the inbox**, which are already authenticated to that person.
That is the whole trick: it proves the WhatsApp number is held by someone who controls the
app account, using a channel we already trust, and it costs one inbound-window message.

Two fallbacks, because a parent with push off who never opens the app is precisely the
parent this feature is for: the **manager confirms the number** in the dashboard with one
click, and any change to `person.phone` clears `verified_at`.

Verification lasts 180 days.

## 9. Quiet hours — a deliberate departure, argued

`ReminderService` refuses to send between 21:00 and 08:00 Jerusalem, and since §13.11 the
drain enforces it for every caller regardless of when they enqueued
(`app/workers/notify.py:144`). The module's docstring is emphatic: *"A refusal, not a queue…
The refusal is the feature."*

**The bot replies at 22:40 anyway, and should.**

That rule exists so the club does not *initiate* contact at night — its own example is a
debt reminder that "would land at 08:00 looking like the manager got up early to dun a
family." A parent who writes to the club at 22:40 has initiated; answering them is not the
thing the rule forbids, and staying silent until morning would make the bot worse than the
manager it replaces.

The rule this design adopts, stated so it cannot be misread as an oversight:

> **The bot never initiates, at any hour. It always replies, at any hour, inside a window the
> parent opened.**

Nothing about `ReminderService` changes. The bot does not route through it, does not send
notifications, and never has a recipient it chose itself.

## 10. Privacy — the sharpest tension in this design, stated rather than glossed

The agent platform took the boundary **health never leaves; everything else may**, and closed
it by construction: the model is handed a brief built by hand, so there is no query whose
result could leak.

**A WhatsApp bot cannot have that property**, because a parent may type
*"נועה חולה, לא מגיעה השבוע"* and the model must read the sentence to understand it. Three
things make this defensible, and they should be read together rather than separately:

1. **The message already reached Meta before it reached us.** A parent typing health
   information into WhatsApp has disclosed it to WhatsApp. The marginal disclosure created by
   our own model reading the same sentence is small, and pretending otherwise would be the
   dishonest version of this section.
2. **The app still never sends health records to the model.** The boundary as agreed governs
   *data the club holds* — declarations, answers, `derived_flags`. None of it is ever put in
   a prompt, and the same invariant test that guards the agent platform guards this vertical:
   no module under `app/services/whatsapp` imports from `app.models.health` or
   `app.services.health`.
3. **Health topics are a handoff, not an answer.** *"אפשר שנועה תתאמן עם האסתמה?"* returns
   `handoff` and creates a manager task. The bot reads the sentence; it does not act on it,
   look anything up, or reply about it.

And the storage assumes the worst: `body_encrypted` is `EncryptedBytes`, because we do not
control what a parent types and a plaintext column holding arbitrary parent prose is a
health-data leak waiting for one unlucky message.

**A first-contact disclosure** is required, once per number, before any answer:

> "היי! אני העוזר הדיגיטלי של המועדון. ההודעות כאן נקראות על ידי מערכת אוטומטית.
> לשאלות רפואיות או אישיות — אעביר אתכם למנהל."

`REQUIRED_CONSENT_TYPES` is `("terms", "privacy")` (`app/services/privacy/policy.py:51`) and
this design adds neither. A parent choosing to write to a published business number is the
consent; the disclosure is what makes the choice informed.

## 11. What it costs

### The message bill

Assumptions for Gladiator, stated so they can be argued with: **~100 families**, each
writing on **1–3 occasions a month**, each occasion resolved in **~2 outbound messages**
(one answer, or one interactive confirm plus one acknowledgement).

| | messages/month | at USD 0.004 | at USD 0.0456 |
|---|---|---|---|
| Quiet month (100 conversations) | 200 | **$0.80** | **$9.12** |
| Busy month (300 conversations) | 600 | **$2.40** | **$27.36** |

Before 1 October 2026 all of it is **$0**.

The honest reading: **somewhere between one and thirty dollars a month**, and the uncertainty
is entirely Israel's position in the rate card, not the volume. Even the pessimistic corner
is not a number that decides anything.

### The model bill

One call per turn, roughly 2,000 tokens in and 200 out with tool definitions. At 600
outbound messages a month that is on the order of **$5–15/month** on a mid-tier model, less
on a small one — and the tool-calling job here is easy, so a small model is the right default.

### What it replaces, and one number worth noticing

Meta's own **Business Agent** — its hosted answer to this problem — is priced at **$2.00 per
1M tokens**, which Meta's documentation puts at *"4–5 cents (USD) per message."* At 600
messages that is **$24–30/month**, more than our model and message costs combined, and it
would mean the club's conversations running through Meta's agent rather than our own tools.
Building this is cheaper than buying it, which is not the usual direction and is worth
recording.

**All in: roughly $10–45 a month.** Against the thing it replaces — a manager answering
"יש אימון מחר?" at 22:40 on their personal number, for ever — the cost is not the deciding
question. §12 is.

### The costs that are not per-message

Meta business verification is unpaid work rather than a fee. A dedicated phone number. And
whichever way §12's build-or-buy question is answered, a BSP's markup (typically
$0.003–0.010 per message) applies on top if one is used.

## 12. What Meta actually requires

The real cost of this feature is here, not in §11.

1. **A Meta Business Account, verified** — company registration documents that match the
   business name. This is the long pole; it is a review, not a form.
2. **A WhatsApp Business Account (WABA)** under it.
3. **A phone number not currently registered on WhatsApp.** A number in use on the WhatsApp
   app must be deleted from it first — which means **not the manager's personal number**, and
   that is a feature rather than a constraint (§16).
4. **A display name review.** The name shown to parents is approved by Meta.
5. **A Meta app** with `whatsapp_business_messaging`, a **system user** and a permanent
   access token — a user token expires and takes the bot down with it.
6. **Webhook subscription** to the `messages` field, pointing at §5's endpoint over HTTPS.
7. **Messaging limits and quality rating.** Tiers cap *business-initiated* conversations per
   24h, so an inbound-only bot is barely touched by them. The quality rating still matters:
   blocks and reports throttle a number. Another argument for never initiating.

### Configuration

Following `app/core/config.py`'s existing shape — `SecretStr | None = None`, so an unset
value disables the feature rather than crashing the app:

```python
WHATSAPP_APP_SECRET:    SecretStr | None = None   # the X-Hub-Signature-256 key
WHATSAPP_ACCESS_TOKEN:  SecretStr | None = None   # system user, permanent
WHATSAPP_VERIFY_TOKEN:  SecretStr | None = None   # the GET handshake
WHATSAPP_API_VERSION:   str = "v21.0"
```

With any of the first three unset, the webhook 403s and the transport is the recording fake.
The feature is off, and nothing else in the app notices.

## 13. What must land in a contract commit on `main`

| # | Change | Why it is contract |
|---|---|---|
| 1 | One alembic revision — `whatsapp_number`, `whatsapp_conversation`, `whatsapp_message` | new tables |
| 2 | `web/packages/i18n/types.ts` + `index.ts` — a `whatsapp` namespace for the dashboard screens | authored once, never by a lane |
| 3 | `scripts/lane-check.sh` — a `whatsapp` case branch | a path not listed is a gate that skips silently and still prints green |
| 4 | `infra/railway/jobs.json` — `whatsapp-replies`, every minute, with its `max_silence_minutes` and `why` | a job outside the registry is a job nothing monitors |
| 5 | `app/core/config.py` — the four settings above | read by the webhook, the worker and the transport |

**Not contract, and worth saying so:** no change to `DELIVERY_CHANNELS`, no change to
`ReminderService`, no new consent type, and no new dependency — `httpx` is already declared.
This design touches less shared surface than the agent platform does.

```bash
whatsapp)
    py_candidates=(app/services/whatsapp app/routers/whatsapp_webhook.py \
                   app/routers/whatsapp.py app/models/whatsapp.py \
                   app/workers/whatsapp_replies.py)
    test_candidates=(tests/whatsapp)
    # Owns nothing under web/packages/core.
    core_dirs=()
    ;;
```

## 14. Testing

- `tests/whatsapp/test_webhook_security.py` — the handshake echoes `hub.challenge` only on a
  matching verify token; a body whose signature does not match is 403 and **writes nothing**;
  the HMAC is computed over raw bytes, proven by a payload whose re-serialisation differs
  (key order, whitespace) and which must still verify.
- `tests/whatsapp/test_webhook_idempotency.py` — **the retry guard.** The same `wamid`
  delivered twice produces one row and one reply. This is the defect that would otherwise
  reach a parent as a duplicate answer and reach the club as a duplicate charge.
- `tests/whatsapp/test_tenancy.py` — an unknown `phone_number_id` is refused; studio B's
  number never resolves into studio A's data; the router carries no auth dependency
  (asserted, so a later "fix" cannot silently break every message).
- `tests/whatsapp/test_identity.py` — an unverified number gets schedule answers and is
  refused `balance()`; a number matching nobody reaches only `book_trial`; a number matching
  two people hands off; changing `person.phone` clears `verified_at`.
- `tests/whatsapp/test_turn.py` — **the seam.** An inbound "נועה לא מגיעה מחר" runs
  `report_absence` only after the button reply, writes the absence row the existing endpoint
  writes, and sends **exactly one** outbound message. Not a mocked service — the real one.
- `tests/whatsapp/test_cost_controls.py` — a second send inside one turn is refused; the
  per-number daily cap stops replies and raises a task; `billable` is false for a message
  dated before 2026-10-01 and true after.
- `tests/whatsapp/test_quiet_hours.py` — a reply at 22:40 is sent (§9), and nothing in this
  vertical can enqueue a notification.
- `tests/invariants/test_whatsapp_cannot_reach_health.py` — §10, unscoped, every lane.
- A **manual** check that cannot be automated: a real message from a real Israeli number to
  the live sandbox number, answered correctly, with the Hebrew rendering right-to-left in
  WhatsApp itself.

## 15. Done when

- A parent messages the club's number *"יש אימון מחר?"* and gets the correct session inside
  a minute.
- *"נועה לא מגיעה מחר"* produces one interactive message, and the tapped confirmation writes
  the same absence row the app's own button writes.
- An unverified number is answered about the schedule and refused about money, with the
  step-up code arriving in the app.
- A health question is not answered and appears as a manager task.
- Meta redelivers a message; the parent receives nothing twice.
- A reply sent at 22:40 arrives; no notification is enqueued by this vertical at any hour.
- The dashboard shows the month's message count and its cost at the configured rate.
- `./scripts/lane-check.sh whatsapp` green.

## 16. Deliberately not in v1

Any outbound-initiated message, which is the entire template question · the monthly recap,
milestones and announcements over WhatsApp — they stay on push and the inbox, per §5.11 ·
media in either direction (a parent's photo of a doctor's note is §10's hardest case and is
not opened here) · voice notes · Russian and English replies, though the tool layer is
language-agnostic and the model already is · a manager reply-from-the-dashboard surface,
which is §2.3's chat by another name and needs its own decision · Click-to-WhatsApp ads,
which would bring the 72-hour free entry point window and a marketing budget with it ·
group messaging, which §12 of SPEC.md establishes is impossible at any price.

One consequence worth stating plainly, because it is a benefit rather than a limitation:
requirement 3 in §12 means the club's number **cannot be the manager's personal number.**
The manager stops being the club's support line at 22:40. That is the most valuable thing
this feature does and it is a side effect of a Meta rule.

## 17. Open questions

1. **The Israel rate.** §2 could not establish it. Meta said final 1 October rates would be
   published by 1 September 2026, so it should be readable now, and it must be read before
   this is committed to. The bracket in §11 says the answer probably does not change the
   decision — but "probably" is not the same as knowing.
2. **Cloud API direct, or through a BSP?** Direct is cheaper (no markup) and this design
   assumes it. A BSP buys an easier onboarding and a support contact for the verification in
   §12, at $0.003–0.010 per message. At this volume the markup is a few dollars a month, so
   the question is really about who does the Meta paperwork.
3. **Which model.** The tool-calling here is easy and the latency matters, so a small fast
   model is the right default — but this is the first model call in the repository and the
   choice should be made once, for both this and the agent platform, rather than twice.
4. **Placement in the delivery plan.** Like the flyers and agent-platform designs of the same
   date, this is in neither SPEC.md nor `docs/plan/state.yaml`, and every wave from W0 to W9S
   is shipped or active. Three planning documents now share this question, which is itself an
   argument for one new wave rather than three appended pieces.
5. **§5.11 and §17.3 will read as wrong once this ships.** They say there is no WhatsApp
   channel and give a reason that this design does not pay. Strictly they remain true —
   this adds no *delivery channel* — but a future reader will need §2's argument to see why.
   The spec should be amended in the same wave, not left to be rediscovered.
