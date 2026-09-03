import { describe, expect, it } from 'vitest'
import type { TemplateSchema } from '../health/healthClient'
import {
  conditionalDetailQuestionIds,
  emptyHealthDraft,
  healthAnswersComplete,
  markAllHealthyDraft,
} from './healthDraft'

// The clause question's id is 'clause_confirmed' on purpose, matching the real template
// (app/services/structure/health_templates.py) rather than a made-up id like the other
// fixture ids in this file. `../health/clauses.ts`'s NEUTRAL_QUESTIONS/CLAUSE_QUESTION_ID
// exclude the clause question from `declaresALimitation` BY THIS EXACT ID -- a differently
// named clause question would have its own confirmation value misread as a medical answer.
const schema: TemplateSchema = {
  sections: [
    {
      id: 's1',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'אסתמה', flag: true },
        {
          id: 'chronic_illness_details',
          type: 'text',
          label: 'פרטים',
          required: false,
          visible_if: { asthma: true },
        },
        { id: 'health_fund', type: 'text', label: 'קופת חולים', required: false },
        {
          id: 'emergency_contact',
          type: 'phone',
          label: 'טלפון חירום',
          required: true,
        },
        { id: 'clause_confirmed', type: 'clause', label: 'אני מאשר/ת', required: true },
      ],
    },
  ],
}

describe('conditionalDetailQuestionIds', () => {
  it('finds only text questions with a visible_if trigger', () => {
    expect(conditionalDetailQuestionIds(schema)).toEqual(['chronic_illness_details'])
  })
})

describe('healthAnswersComplete', () => {
  it('is false with no signature even if every answer is filled', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: {
        asthma: false,
        emergency_contact: '0501234567',
        clause_confirmed: 'none',
      },
      signatureBase64: null,
    }
    expect(healthAnswersComplete(schema, draft)).toBe(false)
  })

  it('is false when a visible conditional detail field is blank, even though the schema marks it optional', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: true, emergency_contact: '0501234567', clause_confirmed: 'limited' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(false)
  })

  it('is true once the visible detail field is filled', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: {
        asthma: true,
        chronic_illness_details: 'טיפול קבוע',
        emergency_contact: '0501234567',
        clause_confirmed: 'limited',
      },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  it('does not require the hidden detail field when the trigger is no', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: false, emergency_contact: '0501234567', clause_confirmed: 'none' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  it('leaves health_fund and other always-optional fields out of the requirement', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: false, emergency_contact: '0501234567', clause_confirmed: 'none' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(draft.answers).not.toHaveProperty('health_fund')
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  // F-clause-mismatch: a parent who confirms "no limitations" (clause.none) and THEN goes
  // back and flags a concern must not be able to sign against the now-stale confirmation.
  // The checkbox in JoinHealthStep re-renders unchecked when this happens (`clauseConfirmed`
  // is recomputed live), but until this test, nothing stopped `sign()` from firing anyway --
  // `unansweredRequired` only checks that SOME value is present, never that it still matches
  // what the current answers imply. This is `clause_mismatch` on the server
  // (app/services/health/clauses.py `verify_clause`), reachable purely by editing an answer
  // after ticking the box once.
  it('is false when the confirmed clause no longer matches what the answers imply', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: {
        // Confirmed against an all-clear answer set ...
        clause_confirmed: 'none',
        emergency_contact: '0501234567',
        // ... then a concern was flagged without re-confirming.
        asthma: true,
        chronic_illness_details: 'טיפול קבוע',
      },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(false)
  })

  it('is true again once the confirmation is retaken against the new answers', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: {
        clause_confirmed: 'limited',
        emergency_contact: '0501234567',
        asthma: true,
        chronic_illness_details: 'טיפול קבוע',
      },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })
})

describe('markAllHealthyDraft', () => {
  it('fills every blank boolean with false and leaves existing answers alone', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: true },
    }
    const next = markAllHealthyDraft(schema, draft)
    expect(next.answers.asthma).toBe(true)
    // no second boolean in this fixture schema besides asthma, so nothing else changes
    expect(Object.keys(next.answers)).toEqual(['asthma'])
  })
})
