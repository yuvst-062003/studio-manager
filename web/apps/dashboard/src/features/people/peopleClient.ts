// The dashboard's endpoint paths, in one file.
import type { components } from '@studio/api-client'

export type StudentSummary = components['schemas']['StudentSummaryOut']
export type StudentDetail = components['schemas']['StudentDetailOut']
export type StudentPricePlan = components['schemas']['StudentPricePlanOut']
export type EnrollmentOut = components['schemas']['EnrollmentOut']
export type WeekdayOptions = components['schemas']['EnrollmentWeekdayOptionsOut']
export type RegistrationRequestOut = components['schemas']['RegistrationRequestOut']
export type TrialBookingRow = components['schemas']['TrialBookingRow']
/** Task 4a's manager queue: one row per pending `Enrollment` the join wizard's health
 *  gate held. Mirrors `PendingReviewOut` exactly — snake case on the wire, kept snake
 *  case here, same as `TrialBookingRow` above. */
export type PendingReviewRow = components['schemas']['PendingReviewOut']
export type StatusHistoryOut = components['schemas']['StudentStatusHistoryOut']
/** One attendance mark, as `GET /students/{id}/attendance` returns it. */
export type AttendanceMarkRow = components['schemas']['AttendanceOut']
/** Only what `3c`'s picker renders. M1 owns `GroupOut`; naming the two fields this screen
 *  reads keeps the form independent of fields another lane may add or move. */
/** `class_id` is here because the BELT LADDER hangs off the class, not off the group
 *  (§5.9): the add-students screen can only offer a belt once a group has been chosen,
 *  and it is this field that tells it which ladder to load. */
export type GroupOption = { id: string; name: string; class_id?: string | null }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type StudentFilters = {
  q?: string
  status?: string
  group_id?: string
  /** "Who trains judo" — every group of one class at once, each child listed once. The
   *  server does the de-duplication; a client-side filter over a cursor-paginated list
   *  would drop the children who live on a later page. */
  class_id?: string
  health_status?: string
  after?: string
}

export function makeDashboardPeopleClient(fetcher: Fetcher) {
  return {
    /** Dashboard `3b`. Cursor-paginated (G16) — `after` is the previous page's cursor. */
    students: (filters: StudentFilters = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
      return fetcher(`/api/v1/students?${query.toString()}`).then(
        json<{ items: StudentSummary[]; next_cursor: string | null; has_more: boolean }>,
      )
    },

    student: (id: string) => fetcher(`/api/v1/students/${id}`).then(json<StudentDetail>),

    /**
     * C11's two numbers, manager-scoped. Never coach-reachable — `price_plan_id` is what
     * invariant 3's detector reads as a financial field, which is why it lives behind its
     * own route instead of on the card.
     */
    pricePlan: (id: string) =>
      fetcher(`/api/v1/students/${id}/price-plan`).then(json<StudentPricePlan>),

    /**
     * The club's live price plans, for the picker on the convert step.
     *
     * **Why this exists (2026-09-12).** `convert` has always accepted a `price_plan_id` and
     * the dashboard never sent one, so every child a manager converted came out UNPRICED —
     * active, enrolled, training, billed nothing. The billing screen listed them and could
     * not fix them. A manager who knows the plan had nowhere to say so.
     *
     * Closed plans are filtered out at the call site rather than here: this is the same
     * route `5a` renders, and that screen legitimately shows last year's plans below the
     * current ones.
     */
    pricePlans: () =>
      fetcher('/api/v1/price-plans').then(
        json<{ items: { id: string; name: string; monthly_amount_agorot: number; active_to: string | null }[] }>,
      ),

    enrollments: (studentId: string) =>
      fetcher(`/api/v1/enrollments?student_id=${studentId}`).then(json<EnrollmentOut[]>),

    statusHistory: (studentId: string) =>
      fetcher(`/api/v1/students/${studentId}/status-history`).then(
        json<{ items: StatusHistoryOut[] }>,
      ),

    /**
     * `4a`'s attendance strip. Built, manager-scoped, and called by NOTHING until now — the
     * card carried four sections and could not answer "has she been coming?", which is the
     * question a manager asks about a child immediately before telephoning their parent.
     *
     * The default page is taken as-is rather than asking for `4a`'s twelve: `2d` and `4a`
     * disagree on the window (2d finding 9) and the route deliberately bakes neither in, so
     * the screen trims what it draws instead of the server deciding for both surfaces.
     */
    attendance: (studentId: string) =>
      fetcher(`/api/v1/students/${studentId}/attendance`).then(
        json<{ items: AttendanceMarkRow[]; next_cursor: string | null; has_more: boolean }>,
      ),

    /** M1's group list. `3c` needs it because §5.4(a)'s form asks for a group, and the
     *  enrolment it creates has to name one that exists. */
    groups: () => fetcher('/api/v1/groups').then(json<{ items: GroupOption[] }>),

    /** §5.9's ladder for one class. The belt a manager can set on a child arriving from
     *  another club comes from here — a rank id, never a colour name. */
    beltRanks: (classId: string) =>
      fetcher(`/api/v1/belt-ranks?class_id=${encodeURIComponent(classId)}`).then(
        json<{ items: { id: string; name: string; color_hex?: string | null }[] }>,
      ),

    /** §5.9's award outside an exam. Used here for the belt a child ALREADY holds when
     *  they arrive, which is a fact about them on the day the club learns it — so it is
     *  dated today and carries a note saying where it came from, rather than pretending
     *  the club examined them. */
    awardBelt: (studentId: string, body: { belt_rank_id: string; awarded_on: string; note?: string }) =>
      fetcher(`/api/v1/students/${studentId}/belts`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    weekdayOptions: (groupId: string) =>
      fetcher(`/api/v1/enrollments/weekday-options?group_id=${groupId}`).then(
        json<WeekdayOptions>,
      ),

    /** §5.4(a) — `+ תלמיד חדש`. One request: parent details AND child details (`3c`). */
    createStudent: (body: {
      first_name: string
      last_name: string
      birthdate?: string | null
      /** §5.4(a) — 'child details AND GROUP ... creates everything immediately'. Absent
       *  leaves a lead with no enrollment, which is the phone-enquiry case. */
      group_id?: string | null
      /** C12 — NULL means every session of that group, which is the default. */
      attends_weekdays?: number[] | null
      guardian: {
        //: Optional (decision 20, 2026-09-03 onboarding doors spec) — the dashboard's
        //: 3-field add-student form sends a guardian email with no name at all;
        //: `GuardianCreate` (`app/schemas/people.py`) accepts that. Every existing
        //: caller (`ImportStudentsPanel`) still sends both, so this widening is
        //: backward compatible.
        first_name?: string
        last_name?: string
        email?: string | null
        phone?: string | null
        relation?: string
      }
    }) =>
      fetcher('/api/v1/students', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    /** §5.4a step 5 — group, price and start date, in one decision. */
    convert: (
      studentId: string,
      body: {
        group_id: string
        started_on: string
        price_plan_id?: string | null
        attends_weekdays?: number[] | null
        //: **How the family already paid**, in the club's own three words. Records an
        //: `already_paid` promise of that method over the first charge and sets the
        //: student's payment method — together, what stops the parent's wizard asking how
        //: they intend to pay money they have already handed over.
        //:
        //: No card: a card payment arrives through uPay and closes its own charge, so
        //: there is nothing here for a human to mark. The server refuses it with a 422.
        payment_received?: 'cash' | 'cheque' | 'standing_order' | null
      },
    ) =>
      fetcher(`/api/v1/students/${studentId}/convert`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    markLost: (studentId: string, reason: string) =>
      fetcher(`/api/v1/students/${studentId}/mark-lost`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason }),
      }),

    freeze: (studentId: string, body: { from_date: string; to_date?: string | null }) =>
      fetcher(`/api/v1/students/${studentId}/freeze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    // -- 6c's queue -----------------------------------------------------------
    // The registration approval queue is gone (2026-08-30): nothing produces a pending row
    // any more, so a list read and two decision posts stood over something that could never
    // fill. The trial queue below is the funnel's remaining decision.
    trialBookings: (outcome?: string) =>
      fetcher(`/api/v1/trial-bookings${outcome ? `?outcome=${outcome}` : ''}`).then(
        json<{ items: TrialBookingRow[] }>,
      ),

    // -- Task 4b's queue -------------------------------------------------------
    // Task 4a's health gate holds an enrolment rather than refusing it; this is the
    // manager's view of every hold, and the decision that clears one. The route itself
    // returns a bare array (`response_model=list[PendingReviewOut]`) -- wrapped in
    // `items` here, the same shape every other list on this client hands its caller.
    pendingHealthReviews: () =>
      fetcher('/api/v1/enrollments/pending-review')
        .then(json<PendingReviewRow[]>)
        .then((items) => ({ items })),

    /** Activates the enrolment and raises the month -- the manager's decision on a
     *  hold task 4a's health gate created. No body: the route reads only the id. */
    approvePendingReview: (enrollmentId: string) =>
      fetcher(`/api/v1/enrollments/${enrollmentId}/approve`, { method: 'POST' }),
  }
}

export type DashboardPeopleClient = ReturnType<typeof makeDashboardPeopleClient>
