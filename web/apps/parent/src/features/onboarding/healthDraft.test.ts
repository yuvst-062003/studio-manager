import { describe, expect, it } from 'vitest'
import type { TemplateSchema } from '../health/healthClient'
import {
  conditionalDetailQuestionIds,
  emptyHealthDraft,
  healthAnswersComplete,
  markAllHealthyDraft,
} from './healthDraft'

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
        { id: 'clause1', type: 'clause', label: 'אני מאשר/ת' },
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
        clause1: 'clause-text',
      },
      signatureBase64: null,
    }
    expect(healthAnswersComplete(schema, draft)).toBe(false)
  })

  it('is false when a visible conditional detail field is blank, even though the schema marks it optional', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: true, emergency_contact: '0501234567', clause1: 'clause-text' },
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
        clause1: 'clause-text',
      },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  it('does not require the hidden detail field when the trigger is no', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: false, emergency_contact: '0501234567', clause1: 'clause-text' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  it('leaves health_fund and other always-optional fields out of the requirement', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: false, emergency_contact: '0501234567', clause1: 'clause-text' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(draft.answers).not.toHaveProperty('health_fund')
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
