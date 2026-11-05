import { AGENT_CONTEXT_MAX_LENGTH } from '../../convex/lib/agentContext'

export { AGENT_CONTEXT_MAX_LENGTH }

export const AGENT_CONTEXT_HINT = 'No secrets — say where to get them instead'

/** "1,234 / 10,000", counted on the trimmed text like the server does. */
export function agentContextCounter(value: string): {
  text: string
  over: boolean
} {
  const length = value.trim().length
  return {
    text: `${length.toLocaleString('en-US')} / ${AGENT_CONTEXT_MAX_LENGTH.toLocaleString('en-US')}`,
    over: length > AGENT_CONTEXT_MAX_LENGTH,
  }
}
