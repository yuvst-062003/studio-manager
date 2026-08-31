// The parent's answer about one lesson: coming, not coming, or nothing said.
//
// Two endpoints and no local truth. The screen renders what the server last accepted,
// because the alternative — an optimistic flip that the server then refuses — is exactly
// the dead end §10.2 exists to avoid: a parent who believes they told the club, and a
// coach who was never told.
//
// **Online only, on purpose.** SPEC §10.2 says a pre-report "requires a connection on
// purpose: it is time-critical and worthless if it lands after the lesson", and the same
// is true of its opposite. Nothing here queues into `pending_ops`.

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** What the family has told the club about one child at one session. */
export type Intent = 'coming' | 'not_coming' | 'unanswered'

/** The refusal codes the server names, so the screen can say WHICH one happened. */
export type IntentRefusal = 'too_late' | 'already_marked' | 'unknown'

export class IntentError extends Error {
  constructor(readonly code: IntentRefusal) {
    super(code)
  }
}

async function refusalFrom(response: Response): Promise<IntentError> {
  try {
    const body = (await response.json()) as { detail?: { code?: string } }
    const code = body.detail?.code
    if (code === 'too_late' || code === 'already_marked') return new IntentError(code)
  } catch {
    // A refusal with no readable body is still a refusal; the generic message is better
    // than a crash on the one screen a parent is trying to tell the club something from.
  }
  return new IntentError('unknown')
}

export function makeIntentClient(fetcher: Fetcher) {
  return {
    /**
     * "My child WILL be there." PUT rather than POST: one answer per (session, student),
     * so a double-tapped button on a phone is the same answer and not a 409.
     */
    confirm: async (sessionId: string, studentId: string): Promise<void> => {
      const response = await fetcher(
        `/api/v1/attendance-confirmations/${sessionId}/${studentId}`,
        { method: 'PUT' },
      )
      if (!response.ok) throw await refusalFrom(response)
    },

    /** Back to having said nothing — NOT the same as reporting an absence. */
    withdraw: async (sessionId: string, studentId: string): Promise<void> => {
      const response = await fetcher(
        `/api/v1/attendance-confirmations/${sessionId}/${studentId}`,
        { method: 'DELETE' },
      )
      // 404 means there was nothing to withdraw, which is the state the caller wanted.
      if (!response.ok && response.status !== 404) throw await refusalFrom(response)
    },

    /**
     * "My child will NOT be there." The existing §5.7 pre-report, unchanged — it is what
     * writes the register mark a coach reads and what notifies the manager.
     */
    reportAbsence: async (
      sessionId: string,
      studentId: string,
      reason?: string,
    ): Promise<void> => {
      const response = await fetcher('/api/v1/absence-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          reason: reason ?? null,
        }),
      })
      if (!response.ok) throw await refusalFrom(response)
    },

    /** Undo an absence notice, returning the child to "nothing said". */
    cancelAbsence: async (sessionId: string, studentId: string): Promise<void> => {
      const response = await fetcher(`/api/v1/absence-reports/${sessionId}/${studentId}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 404) throw await refusalFrom(response)
    },
  }
}

export type IntentClient = ReturnType<typeof makeIntentClient>
