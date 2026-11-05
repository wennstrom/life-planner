import { describe, expect, it } from 'vitest'
import { AGENT_CONTEXT_MAX_LENGTH, agentContextCounter } from './agent-context'

describe('agentContextCounter', () => {
  it('counts trimmed characters against the limit', () => {
    expect(agentContextCounter('  hello \n')).toEqual({
      text: '5 / 10,000',
      over: false,
    })
  })

  it('is over only past the limit', () => {
    const atLimit = 'x'.repeat(AGENT_CONTEXT_MAX_LENGTH)
    expect(agentContextCounter(atLimit)).toEqual({
      text: '10,000 / 10,000',
      over: false,
    })
    expect(agentContextCounter(`${atLimit}x`).over).toBe(true)
  })
})
