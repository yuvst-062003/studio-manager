# Voice attendance — a coach speaks, the register fills

A coach on the mat holds a button, says *"היום חסרים סשה, רוני ונועה"*, and sees three
marks staged on screen ready to confirm.

The register already has `סמן הכל נוכח`. A twenty-five-child class where twenty-two turned
up is one tap plus three, and SPEC §1's stated goal — twenty-five kids in under ten
seconds — is met today by buttons. **This feature is therefore not about speed**, and any
version of it justified by speed is not worth the money it costs. It exists for the coach
whose hands are on a child mid-throw, for the manager watching the mat rather than holding
a phone, and for marking children as they trickle in over ten minutes rather than in one
batch at the door.

---

## 1 · Scope

**In:** one button on the session roster. Hold, speak Hebrew naturally, release. The server
transcribes, resolves the names against this session's roster, and returns proposed marks.
The coach reviews what it heard and confirms. Marks commit through the register's existing
write path.

**Out, deliberately:**

- **Offline.** This is the one screen SPEC §10 guarantees works without a connection, and
  the guarantee is untouched: with no signal the mic button is not offered and the coach
  taps, exactly as today. Voice degrades to the current product, which is the whole reason
  it is allowed to depend on a network at all. Decided explicitly rather than inherited.
- **The spoken roll call** — the inverted design where the app says each name and the coach
  answers כן/לא. It survives every objection raised here and is fully hands-free, but it is
  a different interaction with a different justification. §11 records why it was set aside
  rather than rejected.
- **Event attendance by voice.** `POST /events/{id}/attendance` exists and the register for
  an event has no mark control at all (state.yaml, W8C). Voice cannot lead there.
- **Voice for session notes or injury reports**, even though the record-transcribe-confirm
  plumbing would generalise to both without modification.
- **Any use of `attendance.bulk` by voice.** The bulk button stays a button.

**Vertical:** `attendance`. The gate is `./scripts/lane-check.sh attendance`.

---

## 2 · Why this cannot be built in a lane

Recorded first because it changes who may do the work, not merely how.

The feature appears in **no SPEC.md section** and in **no piece of `docs/plan/state.yaml`**.
Voice, speech, transcription and LLM appear nowhere in either file, and there is no speech
or model dependency in `pyproject.toml` or any `package.json`. It also needs two new tables.

Per CLAUDE.md, a lane never authors a migration. This needs, in order:

1. A SPEC section — SPEC §5.7 is the natural home, as §5.7.1.
2. A piece in a wave in `state.yaml`.
3. One Alembic revision in that wave's **contract commit on `main`**, carrying both tables.

Only then can a lane build the router, the service and the screen.

---

## 3 · What was considered and rejected

The design space was walked properly, because three of the four candidates fail on a
requirement that only surfaced late.

| | Hearing | Understanding | Verdict |
|---|---|---|---|
| **A** Spoken roll call | phone, כן/לא only | nothing to understand | Deferred — §11 |
| **B** Browser dictation | phone | local fuzzy rules | **Rejected** |
| **C** Server transcription | server | local fuzzy rules | **Rejected** |
| **D** Server transcription + model | server | Claude | **Chosen** |

### Why B and C fail

Two requirements killed them, and both came from the club rather than from engineering.

**Names arrive in three languages.** `Person.first_name` and `last_name` are plain
`String(80)` — one spelling per child, whatever the manager typed at enrolment. A child
enrolled as **אלכסנדר** is called *Sasha*, *סשה*, *Саша* and *אלכס*. Alexander and
Александр and אלכסנדר are the same name in three alphabets sharing no characters, and — the
harder half — **Russian diminutives are not abbreviations**: Саша does not derive from
Александр, Женя does not derive from Евгений, Дима does not derive from Дмитрий. No string
algorithm computes that mapping. It is cultural knowledge.

A per-student alias list (§6) reduces this to a data problem a fuzzy matcher can solve, and
that alone would have rescued C. The second requirement is what finished it.

**The coach speaks naturally, in both directions.** *"א, ב, ג לא הגיעו"* and *"רק הם הגיעו"*
name the same children and mean opposite things. Rules that extract names from a transcript
get the first right and the second **exactly backwards** — silently marking the one child
who came as the one who did not. A directional button (*"who is missing?"*) was proposed to
sidestep this and was rejected by the club: the requirement is that a native speaker talks
like a native speaker, including self-corrections mid-sentence.

That is a comprehension problem, and comprehension is what a model is for.

### Why not open models on our own hardware

Researched rather than assumed, because for a Hebrew product the Israeli open models are
genuinely strong and the question deserved a real answer.

- **[ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo)** — Whisper fine-tuned
  on ~500 hours of Hebrew (crowd-transcribed speech, recitals, Knesset), shipped in `ggml`
  and CTranslate2 builds that run without a GPU. Its language detection was deliberately
  degraded for mostly-Hebrew audio, which fits our one-language decision exactly.
- **[DictaLM 3.0](https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct)** — Apache-2.0,
  Hebrew and English, 1.7B instruct, claiming state of the art for its weight class.

Both are good. The blocker is the platform. **Railway offers no GPUs**, and bills
**$20/vCPU/month and $10/GB RAM/month**. A model held in memory is billed around the clock:

| | Container | Monthly |
|---|---|---|
| Hosted transcription + hosted Claude | none | **₪4–18** |
| Self-hosted ivrit.ai + hosted Claude | ~2 vCPU, 3 GB | **~₪250** |
| Fully self-hosted | ~4 vCPU, 6 GB | **~₪500** |

**The models are free; the memory to hold them is not.** Self-hosting to avoid a bill of
four to eighteen shekels a month costs between two hundred and fifty and five hundred, adds
five to twenty seconds of a coach standing still on a mat, and puts the quality of a child's
record under our own tuning. It buys exactly one thing — nothing leaves our servers — and
that is a sovereignty argument, not a cost one. Revisit it if sovereignty ever becomes a
requirement; it is not one today.

Free API tiers were also rejected: Google's free Gemini tier uses submitted content to
improve its products and permits human review, and only the paid tier commits not to train.
That is a normal trade for a hobby project and the wrong one for the attendance records of
named children.

---

## 4 · The flow

Seven steps, and the split at step 2 is the one that matters: **proposing is not writing.**

1. The coach holds the mic button on the roster and speaks. `MediaRecorder` captures
   Opus audio; a hard cap of 30 seconds stops a pocket recording.
2. `POST /api/v1/sessions/{id}/attendance/voice` receives the clip. **It writes no
   attendance.** It is a read-shaped endpoint that happens to take a body.
3. The service transcribes through the vendor, priming it with this session's roster names
   and their aliases as a vocabulary hint — the single highest-leverage accuracy move
   available, because the recogniser stops guessing at open-vocabulary Hebrew and starts
   choosing from twenty-five known words.
4. One Claude call (§7) receives the transcript, the roster with ids, each child's aliases
   and each family's `locale`, and returns proposals under a strict schema.
5. The response carries **the transcript** and the proposals back to the phone.
6. The screen shows what it heard above what it will write. The coach edits any row,
   resolves any ambiguity, and confirms.
7. Confirm goes through the **existing** `queueMark` → `POST /attendance/batch` path.

Step 7 is deliberate and load-bearing. No new write path means no new conflict rules, no
second idempotency story, no new offline behaviour, and no second place where SPEC §5.7's
rule about never overwriting a parent's advance notice could be got wrong.

```
נוכחות · ג'ודו/מתחילים · א' 17:00
─────────────────────────────────
שמעתי: "היום חסרים סשה, רוני ונועה"

  אלכסנדר פטרוב   →  נעדר      ✎
  רוני ברק        →  נעדר      ✎
  נועה כהן        →  נעדרת     ✎

  ⚠ "דני" — שני חניכים מתאימים
     [ דני לוי ]  [ דניאל אבו ]

        [  אישור  ]   [  ביטול  ]
```

---

## 5 · The endpoint

```
POST /api/v1/sessions/{id}/attendance/voice     multipart: audio
  → 200 { transcript, proposals[], unresolved[] }
  → 422 { code: "unintelligible" | "no_names_found", message }
  → 503 { code: "voice_unavailable" }   vendor or model unreachable
```

`proposals[]` carries `{ student_id, status, reason?, confidence, matched_text }`.
`matched_text` is what the coach actually said for that child, so the confirm screen can
show *"סשה → אלכסנדר פטרוב"* rather than asking anyone to take the mapping on faith.

`unresolved[]` carries `{ spoken_text, candidates[] }` — every case the system refuses to
decide, rendered as the ambiguity row above.

Router stays thin per G6: parse, call `app/services/attendance/voice.py`, return. Every rule
lives in the service, alongside the conflict rules it must not contradict.

**Permissions:** any staff role, matching the register itself. SPEC §3.2 gives an assistant
coach "Mark attendance" outright, and SPEC §5.7's whole point is that the register belongs to
whoever is on the mat. The router carries the `coach` tag, so `tests/invariants/test_03`
holds it to the no-financial-fields rule like every other coach endpoint.

**Tenancy:** `TenantSessionDep`, and both new tables inherit `TenantMixin`. The roster the
model sees is one session's twenty-five children and never the studio's whole register —
which is a privacy property and an accuracy one at the same time.

---

## 6 · Data — the contract commit

Two tables, one revision.

### `person_alias`

```
person_alias    person_id, alias, source(manual|learned), created_by_person_id, created_at
                TenantMixin · unique (studio_id, person_id, alias)
```

What a child is actually called, in any script, any number of entries. Asked once at
enrolment — *"איך קוראים לו?"* — and editable by a manager afterwards.

`source = 'learned'` is the interesting half. When a coach corrects a wrong match on the
confirm screen, the app offers to remember it. The club's own vocabulary then builds itself
over a few weeks with nobody doing data entry, and it captures what no model can ever know
— that this particular club calls one boy דובי.

### `voice_attendance_attempt`

```
voice_attendance_attempt   session_id, spoken_by_person_id, transcript,
                           model_id, model_output(JSONB), committed_client_mark_ids(UUID[]),
                           created_at
                           TenantMixin
```

The audit trail. A model that proposes marks on a child's record must leave an answer to
"why is my daughter marked absent on the 14th" that is better than *the model said so*.
Written whether or not the coach confirms — a rejected proposal is exactly the record worth
having when tuning this later.

### `attendance.source` is left alone

Considered and rejected. Adding a fifth value to the CHECK at `app/models/attendance.py:75`
means every place that switches on `source` must learn it, and SPEC §5.7's conflict rules are
reached from three entry points. It also misdescribes what happened: a coach who read the
proposals and confirmed them **is** the author of those marks. Provenance lives in
`voice_attendance_attempt.committed_client_mark_ids`, which joins back to the exact rows.

### i18n

New keys go in the existing `attendance` namespace, mirrored in `en/` and `ru/`.
**No new namespace**, so `web/packages/i18n/index.ts` is untouched and no lane is serialised
behind it.

---

## 7 · The model call

One request. No tool loop, no session state, no agent framework — when the club said
"agent" the thing that fits is a single structured call, which is a far smaller build than
the word suggests.

- **Model:** `claude-opus-5`, adaptive thinking. Sonnet 5 and Haiku 4.5 are the cost levers
  if the eval (§9) shows headroom; that is a measured decision, not a default.
- **Output:** a strict schema — `{ proposals: [...], unresolved: [...] }` — via
  `output_config.format`, so a malformed response is impossible rather than merely unlikely.
- **Input:** the transcript, plus for each child on this roster their id, name as stored,
  aliases, and family `locale`. `Person.locale` already exists on the model and is a strong
  prior: knowing a family speaks Russian is most of what it takes to read *"סשה"*.
- **Caching:** the system prompt and the roster are stable within a session, so the prefix
  caches and only the transcript varies. Volatile content goes last.

The prompt's job is narrow and should stay narrow: map spoken text to students on **this
roster only**, decide present or absent, distinguish an excused absence (*"חולה"*,
*"הודיעו מראש"*) from an unexcused one, and refuse when uncertain.

---

## 8 · Refusing rather than guessing

CLAUDE.md's rule — *refuse rather than accept, when accepting creates a dead end* — is the
governing principle of this feature, because the dead end here is a child wrongly recorded
absent and a parent who cannot find out why.

- **Two children could match** → an `unresolved` row asking which. Never a coin flip. Two
  boys called Sasha in one group is not an edge case in an Israeli judo club.
- **Confidence below threshold** → `unresolved`.
- **A name that is not on this roster** → reported as heard, never mapped to the nearest
  thing. A child who has left the group must not be marked in it.
- **A blanket reversal never reaches the collapsed section.** *"רק סשה הגיע"* marks every
  other child absent, and it is by far the highest-blast-radius sentence in this design —
  one utterance writing twenty-four rows. It must obey the same boundary `סמן הכל נוכח`
  does: SPEC §5.7 puts students who are enrolled but **not expected today** (C12,
  `enrollment.attends_weekdays`) in a separate collapsed section that the bulk button never
  touches and whose rows never count toward `לא סומן`. A blanket absent must not touch them
  either — a child who was never asked to come today has not missed anything, and marking
  them absent corrupts the §5.14 denominator and can trip the at-risk rule. The service
  therefore applies a reversal only across the **expected** roster, and the confirm screen
  states how many rows a reversal will write before the coach taps it.
- **Empty or unintelligible transcript** → 422 naming the problem. A 422 costs one round
  trip; a silent success that fails later costs a coach repeating themselves with nothing
  on screen to read.
- **The transcript is always shown.** When it is wrong, the coach sees *why* it was wrong.
  That is what makes a system like this trusted — or correctly distrusted.

Nothing here auto-commits. The confirm tap is not friction to be optimised away later; it is
the reason a non-deterministic system is allowed near this table at all.

---

## 9 · Testing

The eval is the real test, and it is a fixture set rather than a live call — no network in
CI, and a recorded model response per case:

| Sentence | Expected |
|---|---|
| *"א, ב, ג לא הגיעו"* | three absent |
| *"רק סשה הגיע"* | Sasha present, **all others expected today absent** |
| *"רק סשה הגיע"*, one child not expected today | that child stays `unmarked` |
| *"סשה חולה"* | `absent_excused` |
| *"רוני — לא, סליחה, ליאם"* | Liam only; the correction wins |
| *"דני לא הגיע"* with two Danis | zero marks, one `unresolved` |
| *"יוסי לא הגיע"* with no Yossi | zero marks, reported unmatched |

Plus:

- **Unit** — the prompt builder, the proposal mapper, the alias resolver, the refusal
  predicate.
- **The seam.** `fetch → state → component`, asserted end to end. CLAUDE.md records that a
  hard gate once shipped never firing because a field added to an API was "proven" by a test
  that built the component's props by hand. `transcript` and `unresolved` are exactly the
  fields that would vanish silently in between.
- **Degradation** — offline, microphone permission denied, vendor 503. Each must land the
  coach on the working manual roster, never on a dead end.
- `./scripts/lane-check.sh attendance`. If `app/services/attendance/voice.py` and the new
  router path are not reached by the existing `case` branch, the branch gets them — a
  silently skipped gate reads as covered, which is worse than red.

---

## 10 · Privacy

- **Audio is never written to disk.** It is streamed to the vendor and discarded. "We do not
  keep recordings" is a sentence that can be said to a parent; "we keep them thirty days"
  starts a conversation nobody wants to have.
- **The transcript is stored** and contains children's names. It is personal data about
  minors and belongs in SPEC §11.3's export bundle and §11.4's purge paths — which
  `state.yaml` records as seams that currently raise rather than run, so this design depends
  on that blocker being closed.
- **Logged with `extra=`, never interpolated.** An f-string has no key for the scrubber to
  match, and this payload is a list of children's names.
- **The transcription vendor must carry a no-training commitment.** This is a selection
  criterion, not a preference, and it is what rules out the free tiers.
- **Opt-in per studio**, through the settings mechanism the vertical already has in
  `app/services/attendance/settings.py`.

---

## 11 · The road not taken, kept open

Design A — the app speaks each name aloud and the coach answers כן/לא — is the only option
immune to every naming problem in §3, because nothing ever has to recognise a name. It
transmits no child's name anywhere, needs no vendor, no migration and no model, and is the
only fully hands-free option in the set. It costs ninety seconds per class instead of eight.

It was set aside because the club's requirement was natural speech, and A is the opposite of
natural speech. It is not refuted. If voice proves useful and the hands-full case turns out
to be the one that actually matters, A is a small feature that shares this design's roster,
staging and commit path and would cost a fraction of it.

---

## 12 · What to measure before building

Two numbers, and both change the design if they come back badly:

1. **How accurately a roster-primed transcription hears Hebraised Russian names.** If it is
   poor, the alias list stops being an optimisation and becomes mandatory data entry, and
   the enrolment flow needs a required field it does not have.
2. **Whether Claude at low effort handles the reversal case reliably.** *"רק הם הגיעו"* is
   the sentence the whole design rests on. If it needs high effort, the cost estimate in §3
   moves — though not far enough to change the conclusion.

Neither blocks writing the implementation plan. Both belong in the first commit's test
fixtures rather than in a separate throwaway probe.
