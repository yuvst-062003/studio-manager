# The trainee card and the plan screen, running

Taken 2026-09-08 against the demo studio on branch `feat/trainee-card-and-plan`, signed in
as the `parent1` persona through `/dev/sign-in-as`. iPhone-width viewport, Hebrew, RTL.

**The prices are 300 / 400 / 550 in these shots and that is deliberate.** `seed_money`
seeds the demo studio at 240 / 320 / 420, and the landing page hardcodes 300 / 400 / 550 —
so on a fresh checkout the plan cards' copy never matches and every card renders the derived
fallback. Spec §5.2 requires the checkpoint to be taken against a studio priced like the
club, or the reviewer signs off a design nobody chose. The demo was re-priced for these.

| | What it shows |
|---|---|
| `1-home-plan-pill.png` | **D1/D3.** Home said nothing about the plan and the plan screen had one link in the whole signed-in app, three taps deep. The pill names the current plan and its price at rest, and opens the plan screen. |
| `2-plan-screen.png` | **B1/B2/B5/B6/B7.** Titled after the child. Cards drawn like the landing page's tiers — the marketing name, the database name as the cadence, the database price, the club's own bullets. The cheaper plan says מעבר למסלול חסכוני, not שדרוג. The timetable is gone; the extras counter is `0 / 1` beside its heading. §5.1's not-offered reason keeps its button. |
| `3-downgrade-money-step.png` | **B3/C1/C2.** The scheduled-change banner names both plans and the date. The money step names the family's own route and, on הוראת קבע, gives two numbered steps: sign the new mandate, then cancel the old one — naming the old amount, ₪400, with the consequence in red. |
| `4-trainee-card.png` | **A1/A5/A6.** A way back, a belt-coloured avatar, belt · group under the name, and the ledger in the app's current design language. מסלול names the plan and its price rather than repeating the destination's title. |
| `5-adult-member-no-parents-row.png` | **A2.** The same card with `guardian.relation = 'self'`. The הורים row is not rendered at all — an adult member is no longer filed under his own name as his own parent. |
| `6-privacy-gains-a-way-back.png` | **Lane 3.** One of the five other screens that had no exit. Verified live in the app on all five: `#/calendar`, `#/privacy`, `#/directions`, `#/payments`, `#/techniques/<slug>` each render a `ScreenHeader` with a back control. |

Navigation was exercised end to end: home → plan pill → `#/plan/<id>` → back → home.
