// `toWizardGroup` is the seam task 2 finished: the API gained three facts the group card
// always drew but never had, and this is where a missing/old-server field must not become
// a crash on the wizard's first screen rather than an empty label.
import { describe, expect, it } from 'vitest'
import type { ApiGroup } from './adapters'
import { toWizardGroup } from './adapters'

const FULL_GROUP: ApiGroup = {
  id: 'g1',
  name: 'קבוצת בוקר',
  class_name: 'מתחילים',
  weekdays: [3, 0],
  training_durations_min: [60],
  coaches: ['דנה לוי', 'אבי כהן'],
  locations: ['אולם א'],
}

describe('toWizardGroup', () => {
  it('a full ApiGroup maps to a WizardGroup with every label populated', () => {
    const group = toWizardGroup(FULL_GROUP)
    expect(group.id).toBe('g1')
    expect(group.name).toBe('קבוצת בוקר')
    // The LEVEL line -- the class name, not the session count that used to sit here.
    expect(group.trackLabel).toBe('מתחילים')
    // Exactly one duration -- the one real number.
    expect(group.durationMin).toBe(60)
    // Sorted (weekdays arrive unsorted above) with the session count appended.
    expect(group.scheduleLabel).toBe('ראשון · רביעי · 2 אימונים בשבוע')
    expect(group.coachesLabel).toBe('דנה לוי · אבי כהן')
    expect(group.locationLabel).toBe('אולם א')
  })

  it('two different lesson lengths produce durationMin: 0, not one of the two', () => {
    const group = toWizardGroup({ ...FULL_GROUP, training_durations_min: [60, 90] })
    expect(group.durationMin).toBe(0)
  })

  it('no lesson length at all is also durationMin: 0 -- the same "do not draw this line" value', () => {
    const group = toWizardGroup({ ...FULL_GROUP, training_durations_min: [] })
    expect(group.durationMin).toBe(0)
  })

  it('a response with none of the new fields present still maps without throwing, with empty labels', () => {
    const legacy: ApiGroup = { id: 'g2', name: 'קבוצת ערב', weekdays: [1] }
    expect(() => toWizardGroup(legacy)).not.toThrow()
    const group = toWizardGroup(legacy)
    expect(group.trackLabel).toBe('')
    expect(group.durationMin).toBe(0)
    expect(group.scheduleLabel).toBe('שני · 1 אימונים בשבוע')
    expect(group.coachesLabel).toBe('')
    expect(group.locationLabel).toBe('')
  })

  it('a group with no training days at all gets an empty schedule label, not a lone session count', () => {
    const group = toWizardGroup({ ...FULL_GROUP, weekdays: [] })
    expect(group.scheduleLabel).toBe('')
  })
})
