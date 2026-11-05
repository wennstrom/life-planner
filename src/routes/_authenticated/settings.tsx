import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { ReactNode } from 'react'
import { ConnectGoogleCalendar } from '~/components/auth/ConnectGoogleCalendar'
import { AgentsSettings } from '~/components/settings/AgentsSettings'
import { LabelsSettings } from '~/components/settings/LabelsSettings'
import { prefetchConvexQueries } from '~/lib/prefetchConvexQueries'

export const Route = createFileRoute('/_authenticated/settings')({
  loader: async ({ context: { queryClient } }) => {
    await prefetchConvexQueries(queryClient, [
      convexQuery(api.userSettings.get, {}),
      convexQuery(api.apiTokens.list, {}),
      convexQuery(api.users.viewer, {}),
      convexQuery(api.labels.list, {}),
    ])
  },
  component: SettingsPage,
})

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-t border-border py-7 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="mb-4 text-lg font-medium tracking-[-0.4px]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SettingsPage() {
  const { data: settings } = useSuspenseQuery(
    convexQuery(api.userSettings.get, {}),
  )
  const { data: tokens } = useSuspenseQuery(convexQuery(api.apiTokens.list, {}))
  const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}))
  const { data: labels } = useSuspenseQuery(convexQuery(api.labels.list, {}))

  return (
    <div className="max-w-[860px]">
      <h1 className="mb-8 text-[30px] font-medium tracking-[-1.1px] md:text-[33px]">
        Settings
      </h1>

      <Section id="settings-general" title="General">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Timezone</dt>
          <dd>
            {settings.timezone ?? 'Not detected yet'}
            <p className="text-xs text-muted-foreground">
              Detected from your browser. Agents see times in this zone.
            </p>
          </dd>
        </dl>
      </Section>

      <Section id="settings-labels" title="Labels">
        <LabelsSettings labels={labels} />
      </Section>

      <Section id="settings-agents" title="Agents & MCP">
        <AgentsSettings
          tokens={tokens}
          agentsCanMarkDone={settings.agentsCanMarkDone}
        />
      </Section>

      <Section id="settings-google" title="Google Calendar">
        <div className="flex max-w-[260px] flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {viewer.googleConnected
              ? 'Your calendar is connected. Blocks sync to Google Calendar.'
              : 'Connect Google Calendar to sync blocks and see your events.'}
          </p>
          <ConnectGoogleCalendar googleConnected={viewer.googleConnected} />
        </div>
      </Section>
    </div>
  )
}
