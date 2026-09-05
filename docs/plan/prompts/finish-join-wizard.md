Finish the parent join wizard and declare it done, so we can move on to the parent app itself.

## Read these first

- `docs/superpowers/specs/2026-09-05-join-wizard-redesign-design.md` — the four screens, every
  string and rule. Built and reviewed already.
- `docs/superpowers/specs/2026-09-05-wizard-completion-and-trial-door-design.md` — what is left.
  Its §8 is the order of work. Follow it.

Both are agreed. Do not redesign them. If something in them is wrong, say so and stop rather
than quietly doing something else.

## Where things are

Branch `feat/join-wizard-redesign`, five commits, pushed. The wizard lives in
`web/apps/parent/src/features/onboarding/wizard/`. Door B (`/join/<token>`) already runs on it
via `WizardJoinFlow`, mounted in `App.tsx`. The old `JoinFlow`, `SelfServeJoinFlow` and
`BookingFlow` are still on disk and still serve doors A, C and D — retire each as its door lands.

`wizard-preview.html` / `wizard-preview.tsx` / `wizard-preview-fixtures.ts` are a review harness,
not shipped code. Delete all three once the wizard is mounted for real.

## The work, in order

1. **Payment methods act on the choice** (completion spec §2). Two phase behind one button:
   register, read the open charges it created, then one uPay order for the card children, one
   promise per method for cash and cheque, and a promise plus a mandate for standing orders.
   This is the only item where the product currently misleads a family — they pick cash and are
   charged anyway.
2. **Group cards** (§4). Add coaches, location and lesson length to `OnboardingGroupOut` and the
   studio's public catalogue, then delete the honest degradation in `adapters.ts::toWizardGroup`.
3. **Doors C and D onto the wizard** (§5). `SelfServeJoinFlow` retires. Door D must show only the
   child being added — that is today's behaviour and needs a test pinning it.
4. **The manager-review gate** (§6, and the first spec's §8). Backend, then the badges the screens
   already draw.
5. **Door A** (§1). A landing form, two emails, an invitation token. Blocked on SMTP in
   production — check before starting; if it is still unset, do the other items and say so.
6. **Strings into `web/packages/i18n`** (§7), mirrored into `en/` and `ru/`. Last, so nothing is
   translated twice. This is the one item safe to hand to a subagent, file to file.

## Who does what

**Opus plans, reviews and owns every checkpoint. Sonnet writes the code.**

Dispatch Sonnet with a named source file and a named target file, and a task small enough to
state in a sentence — "port this component's markup into that file, replace these constants with
these props, keep every class". Never hand Sonnet a screen to build from prose: the previous
wizard was rejected after exactly that, because each handoff re-interprets the words and nobody
looked at a rendered screen until the end.

Opus reads every diff before it lands, runs the verification itself, and is the one who looks at
the screenshots. A green subagent report is not evidence.

## Finish what you start

Keep a todo list for the six items and work them in order. Before you claim any item is done,
invoke **`superpowers:verification-before-completion`** and follow it: run the check, show the
output, then make the claim. "Typecheck clean" is true only of the tree you ran it on — if you
edit after running it, you have not checked that edit.

Do not move to the next item with the previous one partly done. If you have to leave something,
say so explicitly and list it; silence is what turns an unfinished item into a bug nobody knows
about.

## When something conflicts

If the two specs disagree with each other, or a spec disagrees with the code, or an instruction
here disagrees with what you find — **stop and use the AskUserQuestion tool.** Give the real
options with their trade-offs and let the owner choose.

Do not resolve a conflict by picking whichever reading is easier to build, and do not quietly do
something halfway between the two. Several of the decisions in these specs look arbitrary and are
not: they were made against live probes of a payment provider with no sandbox, and against rules
about a minor's medical data.

## How to work

**Show a rendered screen at every checkpoint and wait for a yes.** The unit is a whole wizard
step or a whole door, never a fragment. Screenshots go in
`docs/screenshots/wizard-checkpoints/<step-or-door>/` — composed comparison on top, raw captures
under `raw/`, named by what they show. Never leave PNGs in the repo root. Playwright writes to
the working directory, so move them after capturing.

The previous wizard was rejected after a fully green build because nobody looked at a screen
until the end. Tests cannot see that a screen is wrong.

## Rules that will bite you

- **Verify from `web/`, not from a subdirectory.** `npm run typecheck` and `npm run lint` resolve
  the wrong tsconfig if you run them inside `apps/parent`.
- **No string inlined in a component.** A lint rule enforces it. Wizard strings currently sit in
  `wizard/content.ts` as an interim home; item 6 moves them.
- **No new UI dependency without asking** (`.claude/rules/ui-rtl-a11y.md`). The confetti is CSS
  for this reason.
- **Money is integer agorot.** Never a float, never a division by 100 outside a formatter.
- **Health data never reaches a log line or an `audit_log.diff`.** This applies to the manager
  notification in §1.2 and the reason code in §6.
- **`nationalId.ts` is the check-digit validator.** Counting digits accepts a transposed pair,
  which is somebody else's identity.
- **Tailwind's theme and the design system share ten variable names.** `tailwind.css` restores
  Tailwind's nine inside `.tw-scope`; eight tests hold that contract. Do not "tidy" them.
- **uPay has no sandbox.** Every form the code builds is live against a live merchant account.
  A demo studio is refused a form outright; use the IPN simulator.
- Other sessions commit to this repo. Stage by explicit path, never `-A`.

## Done means

All four doors run the new wizard. A family can complete a registration and their payment choice
is recorded. Strings are in `@studio/i18n` with Hebrew, English and Russian. The preview harness
and the three old flows are deleted. Typecheck, lint and the parent suite are green, and each
door has been looked at as a rendered screen.

Before saying any of that, invoke `superpowers:verification-before-completion` and run the
checks with the output on screen. Then say the wizard is finished, list anything deliberately
left undone and why, and stop.

If anything on the list above is NOT done, do not say the wizard is finished. Say which items
remain and what blocks each one.
