import { beforeEach, describe, expect, it } from 'vitest'
import { clearSlot, useSlot } from '../slots'
import { DEV_TOOL_ORDER, PENDING_TOOLS, devToolKeys, registerDevTool } from './tools'

const Stub = () => null

describe('the dev-bar tool registry (seam 4)', () => {
  beforeEach(() => clearSlot('dev-bar'))

  it('registers through the dev-bar slot, not a second registry', () => {
    registerDevTool('timeTravel', Stub)
    expect(useSlot('dev-bar').map((e) => e.key)).toEqual(['timeTravel'])
  })

  it('orders tools by §19.4s layout, not by registration order', () => {
    registerDevTool('simulateIpn', Stub)
    registerDevTool('offline', Stub)
    registerDevTool('timeTravel', Stub)
    expect(devToolKeys()).toEqual(['offline', 'timeTravel', 'simulateIpn'])
  })

  it('lets a later lane replace a tool without reopening the container', () => {
    registerDevTool('offline', Stub)
    const Replacement = () => null
    registerDevTool('offline', Replacement)
    const entries = useSlot('dev-bar')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.render).toBe(Replacement)
  })

  it('names every §19.4 tool exactly once', () => {
    expect(Object.keys(DEV_TOOL_ORDER).sort()).toEqual(
      ['offline', 'runJob', 'simulateIpn', 'slow', 'timeTravel'].sort(),
    )
  })

  it('records which milestone fills each unbuilt tool', () => {
    expect(PENDING_TOOLS.map((p) => p.key).sort()).toEqual(['offline', 'runJob', 'slow'])
    for (const pending of PENDING_TOOLS) expect(pending.milestone).toMatch(/^M\d+$/)
  })

  it('never lists a tool as both pending and registered', () => {
    registerDevTool('offline', Stub)
    const registered = new Set(devToolKeys())
    const stillPending = PENDING_TOOLS.filter((p) => !registered.has(p.key)).map((p) => p.key)
    expect(stillPending).not.toContain('offline')
  })
})
