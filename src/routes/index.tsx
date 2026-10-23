import { createFileRoute, redirect } from '@tanstack/react-router'
import { LandingPage } from '~/components/landing/LandingPage'

const TITLE = 'Planner — Plan the day. Live the blocks. Shut it down.'
const DESCRIPTION =
  'Planner turns your projects and tasks into time on the calendar, and closes every day with an honest review, so tomorrow starts clear.'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Root beforeLoad supplies the Clerk session; signed-in users skip the landing page.
    if (context.userId) {
      throw redirect({ to: '/today' })
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: LandingPage,
})
