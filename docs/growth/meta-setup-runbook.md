# Switching Meta on — the account runbook

> **Who does this: the owner, not an agent.** Every step here is a form, a document upload
> or a review queue. None of it is code, none of it can be automated, and all of it blocks
> Levels 3 and 4 of [`docs/superpowers/plans/2026-09-14-growth-system.md`](../superpowers/plans/2026-09-14-growth-system.md).
>
> **Start it on day one.** The engineering in Levels 1 and 2 takes about two weeks and needs
> none of this. Business verification takes 1–5 working days and App Review takes days to
> weeks, so if this track starts when the code is finished, the code waits. If it starts
> today, it finishes first and costs nothing while it waits.
>
> Menu labels inside Meta's Business Suite move every few months. **The concepts and the
> permission names below are stable; the exact click path may not be.** Where a label has
> moved, search Business Settings for the noun — "Verification", "System users", "Webhooks".

---

## What the club has, and what it does not

| | Today |
|---|---|
| Facebook Page | exists — **not** connected to a Business portfolio |
| Instagram | exists — a **personal** account, not Business |
| Meta Business portfolio | **none** |
| Business verification | **none** |
| Ads account | **none**, and no ad has ever run |
| WhatsApp Business API number | **none** |
| Privacy policy URL | ✅ published and reviewed — Meta will ask for it |

## The facts you will be asked for

Have these open before starting. Verification fails on a mismatched character, and a failed
verification costs another 1–5 working days.

| Field | Value |
|---|---|
| Legal entity name | **בריין בילדינג (ע"ר)** — exactly as registered, including the `(ע"ר)` |
| Registration number | **580647295** |
| Entity type | עמותה / non-profit association |
| Registered address | as it appears on the רשם העמותות certificate — **not** the dojo address if they differ |
| Business phone | a number that can receive a call or SMS, and that is listed somewhere public |
| Business email | on the club's own domain if one exists; a Gmail address weakens the application |
| Website | the club's landing page |
| Privacy policy URL | the published policy page |

**The documents.** Meta asks for one or two of: the תעודת רישום עמותה (registration
certificate), an אישור ניהול תקין, a recent utility bill or bank statement in the entity's
name, or a tax document. Scan them at full page, in colour, unedited and uncropped. A
photograph taken at an angle is the single most common rejection.

---

## The order, and why it is this order

```
M1  Business portfolio ─┬─> M2  Business verification ──┬─> M7  App + system user ──> M8  Webhook ──> M9  App Review
                        │                               │
                        ├─> M3  Facebook Page           ├─> M6  WABA + display name
                        │      claimed into the portfolio│         ▲
                        ├─> M4  Instagram → Business ────┘         │
                        │      linked to the Page             M5  A dedicated number
                        └─> M10 Ads account ──> M11  First Click-to-WhatsApp campaign
```

M2 gates almost everything. M5 can be done on day one — it is a trip to a phone shop, and
it is on the critical path for M6.

---

## M1 · Create the Business portfolio

Free, about an hour.

1. Go to `business.facebook.com` signed in as the personal Facebook account that will own
   this. **That account is a permanent dependency** — if it is disabled, the portfolio goes
   with it. Use the owner's own account, with two-factor authentication switched on, not a
   staff member's.
2. Create a portfolio. Name it the legal entity name, not the club's brand name — this is
   the name verification will check.
3. Add the business email and confirm it from the inbox.

**Add a second admin immediately.** One person with one Facebook account is how clubs lose
their Page. A second admin costs nothing and is the only recovery path that works.

## M2 · Business verification

1–5 working days. **This is the long pole for everything except the ads account.**

1. Business Settings → Security Centre (or Business Info) → **Start verification**.
2. Enter the legal name, registration number, address and phone exactly as they appear on
   the documents.
3. Upload the documents from the table above.
4. Verify the phone number by the call or SMS Meta places.

If it is rejected, read the stated reason before resubmitting — the usual causes are a
brand name where the legal name was asked for, a cropped document, or an address that does
not match the registry. Resubmission is free and takes the same 1–5 days.

## M3 · Claim the Facebook Page

An afternoon, and it can run while M2 is in the queue.

1. Business Settings → Accounts → Pages → **Add → Claim a Page**. Claim, do not "request
   access" — request access is for an agency working on someone else's Page.
2. If the Page was created under a personal account, the owner must already be its admin.
3. Set the Page category to a sports club / sports and fitness category, add the address,
   the phone, the opening hours and the privacy policy URL.

## M4 · Convert Instagram to a Business account and link it

Required before a single post can be published through the API.

1. In the Instagram app: Settings → Account type and tools → **Switch to professional
   account** → **Business** (not Creator — Creator accounts cannot use the Content
   Publishing API).
2. Link it to the Facebook Page from Instagram's settings.
3. Back in Business Settings → Accounts → Instagram accounts → **Add**, and connect it to
   the portfolio and to the Page.
4. Record the **Instagram user id** (a numeric id, visible in the Graph API Explorer as
   `instagram_business_account` on the Page). The app needs it as `META_IG_USER_ID`.

**Check before moving on:** a Business Instagram account that is not linked to a Page looks
connected in the Instagram app and is invisible to the API. If `instagram_business_account`
is absent when you query the Page, the link did not take.

## M5 · Get a dedicated phone number

Do this on day one — it has a lead time and it blocks M6.

- It must be a number **not currently registered on consumer WhatsApp**. If it is, delete
  the WhatsApp account on it first and wait for the deletion to complete.
- **Not the owner's personal number.** Once a number is on the Business Platform it answers
  to the API, and the club's marketing number should outlive any one person's phone.
- A cheap prepaid SIM works. So does a landline that can receive a voice call — WhatsApp
  verifies by SMS **or** by voice call, which is what makes a landline usable.
- **Coexistence** means the club can keep using the WhatsApp **Business app** on this number
  alongside the API, keeping the chat history. What it permanently disables on that number:
  broadcast lists, disappearing messages, view once, and 1:1 live location.

## M6 · WhatsApp Business Account and display name

After M2 clears.

1. Business Settings → WhatsApp accounts → **Add**. This creates the WABA.
2. Add the phone number from M5 and verify it by SMS or voice call.
3. Set the **display name** — this is what parents see. It is reviewed by Meta and it must
   plausibly relate to the business name. "מועדון ג'ודו גלדיאטור" will pass; "הרשמה" will
   not.
4. Record the **phone number id** and the **WABA id**. These are not the phone number — they
   are numeric ids in the WhatsApp Manager, and the app needs both.

## M7 · The Meta app, a system user, and a permanent token

1. `developers.facebook.com` → Create App → type **Business**, and attach it to the
   portfolio from M1.
2. Add the products: **WhatsApp**, **Facebook Login for Business**, **Webhooks**, and
   **Instagram** / **Pages** as needed.
3. Business Settings → Users → **System users** → Add. Name it something like
   `studio-manager-api`. Give it **Admin** on the app, the Page, the Instagram account and
   the WABA.
4. Generate a token for the system user with the permissions below and **no expiry**.

> **A user token expires and takes the integration down with it, silently.** A system user
> token does not. This is the single most common way a working Meta integration dies two
> months after launch.

### The permissions, and what each one is for

| Permission | Needed for |
|---|---|
| `whatsapp_business_messaging` | sending and receiving on the club's number (L3 approval loop, L4 bot) |
| `whatsapp_business_management` | reading the number's configuration and templates |
| `pages_show_list` | finding the Page the token may act for |
| `pages_read_engagement` | reading the Page's own posts and metadata |
| `pages_manage_posts` | publishing a post to the Page |
| `pages_manage_metadata` | subscribing the Page to webhooks |
| `instagram_basic` | reading the linked Instagram Business account |
| `instagram_content_publish` | publishing a feed post, Reel or Story |
| `leads_retrieval` | pulling a lead form submission into the app |
| `ads_management` | reading the ad account the lead forms belong to |
| `business_management` | acting on assets owned by the portfolio |

5. Record `META_APP_ID` and `META_APP_SECRET` (App Settings → Basic).

## M8 · Webhook

1. In the app's WhatsApp product → Configuration → **Webhook**, set the callback URL to the
   production API's webhook path and a **verify token** you invent (any long random string —
   it is a shared secret, not something Meta issues).
2. Subscribe to the `messages` field for WhatsApp, and to `leadgen` on the Page for lead
   forms.
3. Meta calls the URL with a `GET` handshake carrying `hub.challenge`. The endpoint must
   echo it **only** when the verify token matches.

**Set the verify token in Railway before pressing Verify**, or the handshake fails and the
subscription silently does not save.

## M9 · App Review

Days to weeks. **Start it the day the webhook first answers**, not when the feature is
finished — the queue runs while you keep building.

What Meta asks for, per permission:

1. **A written use case.** Two or three sentences, concrete: *"Parents enquire about trial
   lessons through the club's WhatsApp number. The app books the lesson into the club's
   schedule and sends the confirmation."* Vague answers are rejected.
2. **A screencast** showing a real person using the real flow end to end, including the
   Facebook Login step if the app has one.
3. **Reviewers testing the live webhook.** It must be up and answering during the review.
4. The **privacy policy URL**, and a **data deletion** instructions URL or callback.

Budget for **one resubmission** and do not promise anyone a date before it clears.

> Meta keeps lead data for **90 days only**. An integration that stops quietly does not
> delay leads — it destroys them. The red light in L3 (`/ops` signal on last successful
> delivery) is not optional.

## M10 · The ads account

Free to create. Creating it commits nothing — money is only spent by a campaign with a
budget you set.

1. Business Settings → Accounts → Ad accounts → **Create**.
2. Currency **ILS**, time zone **Asia/Jerusalem**. **Neither can be changed later** —
   getting the time zone wrong means every report is read three hours out.
3. Add a payment method (Billing → Payment settings).
4. Set an **account spending limit** — a hard ceiling Meta will not spend past, independent
   of any campaign budget. Set it to the month's maximum before the first campaign runs.
   This is the one control that cannot be undone by a mistake in a campaign.

## M11 · The first Click-to-WhatsApp campaign

Run this only once M5/M6 are live, so the ad has somewhere to land.

| | |
|---|---|
| **Objective** | Engagement → **Messaging** → destination **WhatsApp** |
| **Why this objective** | a click opens a **72-hour** free messaging window, three times the ordinary 24 — so the bot's whole conversation, and a next-day follow-up, cost nothing |
| **Budget** | start at **₪20–30/day** for 7 days. Below ~₪20/day Meta cannot exit the learning phase and the results mean nothing |
| **Audience** | 5–10 km around ששת הימים 4, נתניה. Parents of children 4–14. **Do not** add interest targeting on top — at this radius the audience is already small, and stacking interests starves delivery |
| **Placements** | Advantage+ (automatic). Manual placement selection at this budget is a way to spend more per result |
| **Creative** | a real photograph or a 10–20s clip **of consented children only** — L1's filmability check answers who. A stock image of a judo class will underperform a real one from this dojo, every time |
| **Primary text** | one sentence about the trial being free, one about the age groups, and the ask. Hebrew, RTL |
| **CTA** | שליחת הודעה |
| **The welcome message** | Meta lets you set the pre-filled first message. Set it to something the bot can route — e.g. *"היי, ראיתי את המודעה. אפשר פרטים על שיעור ניסיון?"* |

**The stop rule, decided before the money is spent.** After seven days, compare the number
of conversations started against the number of trials actually booked. If the ad produced
conversations and the club converted them, raise the budget. If it produced conversations
nobody answered, **the problem is not the budget** — pause the campaign and fix the answering
before spending again. If it produced neither, the creative is wrong; change the photograph
before changing anything else.

---

## What to hand back to the app

These go into Railway secrets on the `api` service, per
[`docs/deploy/railway-runbook.md`](../deploy/railway-runbook.md). Every one of them is unset
today, and every feature that reads one is designed to switch itself **off** when it is
unset rather than crash.

```
META_APP_ID                  # M7
META_APP_SECRET              # M7 — also the X-Hub-Signature-256 key
META_PAGE_ID                 # M3
META_IG_USER_ID              # M4
META_SYSTEM_USER_TOKEN       # M7 — permanent, system user, never a user token
WHATSAPP_PHONE_NUMBER_ID     # M6 — not the phone number
WHATSAPP_WABA_ID             # M6
WHATSAPP_VERIFY_TOKEN        # M8 — invented by us, set here BEFORE pressing Verify
WHATSAPP_API_VERSION         # defaults to v21.0; bump deliberately
```

## Where this goes wrong

| | |
|---|---|
| **A user token instead of a system user token** | works for 60 days, then stops with no error anywhere. Publishing stops and lead delivery stops; leads are destroyed after 90 days |
| **Instagram switched to Creator, not Business** | the Content Publishing API is not available to Creator accounts, and nothing says so until a publish fails |
| **Instagram not linked to the Page** | looks fine in the app; `instagram_business_account` is simply absent from the API |
| **Legal name vs brand name in verification** | the most common rejection, and it costs another 1–5 days |
| **Ad account time zone** | unchangeable after creation; a wrong one makes every report read three hours off, which is the same class of bug the cron schedules already had |
| **The number was on consumer WhatsApp** | registration fails until the old account is deleted, and deletion is not instant |
| **Promising a launch date before App Review clears** | it is a person watching a screencast, and it can be rejected for a reason nobody predicted |
