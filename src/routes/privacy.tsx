import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy Policy — Life Planner' }],
  }),
  component: PrivacyPage,
})

const CONTACT_EMAIL = 'oskar.wennstrom@gmail.com'
const OPERATOR_NAME = 'Oskar Wennström'

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Link to="/sign-in" className="underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Life Planner. Last updated September 15, 2026.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Who runs this app</h2>
          <p>
            Life Planner is a personal productivity app operated by{' '}
            {OPERATOR_NAME}, as an individual, not a company. For privacy
            questions or data requests, email{' '}
            <a
              className="underline underline-offset-4"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What we collect</h2>
          <p>
            We collect only what we need to run your account and the planner:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Google account (sign-in).</strong> When you sign in with
              Google through Clerk, we receive your name, email address, and
              profile information (such as a profile photo if Google provides
              one).
            </li>
            <li>
              <strong>Authentication.</strong> Clerk stores your login session
              and identity so you can stay signed in.
            </li>
            <li>
              <strong>App data.</strong> Convex stores the content you create
              in Life Planner, including tasks, projects, board columns, day
              notes, and calendar time blocks (titles, times, and related
              metadata).
            </li>
            <li>
              <strong>Device preferences.</strong> The app may save small
              settings in your browser (for example, whether the sidebar is
              collapsed). These stay on your device.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Google Calendar</h2>
          <p>
            If you choose to connect Google Calendar, we request access to read
            and write events so we can sync Life Planner time blocks with your
            calendar. That includes creating, updating, and deleting events
            that correspond to those blocks, and reading calendar events so
            they can appear in the app.
          </p>
          <p>
            We do not sell your Google Calendar data. We do not use it for
            advertising. We do not share it with anyone except the services
            listed below that are required to operate the sync.
          </p>
          <p>
            Connecting Calendar is optional. You can use Life Planner without
            granting calendar access.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Where data is stored</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Clerk</strong> stores your account, sign-in session, and
              Google OAuth tokens used for authentication and (if you connect
              it) Calendar.
            </li>
            <li>
              <strong>Convex</strong> stores your planner data and a small
              Google Calendar connection record (so we know the account is
              connected and can keep sync working).
            </li>
            <li>
              <strong>Google</strong> stores your Google account and the
              calendar events themselves.
            </li>
          </ul>
          <p>
            The website is hosted on Netlify. Netlify serves the application;
            it is not where we keep your tasks, projects, or calendar data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sharing</h2>
          <p>
            We share data only with the processors above (Clerk, Convex, and
            Google) so the app can authenticate you, store your planner, and
            sync your calendar when you ask it to.
          </p>
          <p>
            We do not sell personal data. We do not show third-party ads. We
            do not use advertising trackers or analytics products in the app
            today.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Disconnect Google Calendar and delete your account
          </h2>
          <p>
            To stop calendar sync, open Life Planner while signed in and use{' '}
            <strong>Disconnect Google Calendar</strong> (in the sidebar on
            desktop, or the Google control in the top bar on a phone). That
            removes our connection record in Convex and stops the app from
            reading or writing your calendar.
          </p>
          <p>
            Disconnecting in the app does not always revoke Google’s
            permission grant. To revoke Calendar access completely, also
            remove Life Planner (or Clerk) from your Google Account
            permissions at{' '}
            <a
              className="underline underline-offset-4"
              href="https://myaccount.google.com/permissions"
              rel="noreferrer"
              target="_blank"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
          <p>
            To delete your login, open the account menu in the app (your
            avatar) and use Clerk’s account settings to delete the account, if
            that option is available. There is not yet a one-click wipe of
            Convex planner data inside the app. Email{' '}
            <a
              className="underline underline-offset-4"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>{' '}
            and I will delete your remaining Life Planner data from Convex.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Changes</h2>
          <p>
            If this policy changes in a meaningful way, I will update this
            page and the “Last updated” date. Continued use of the app after
            an update means you are using the service under the revised
            policy.
          </p>
          <p>
            Questions or requests: {OPERATOR_NAME},{' '}
            <a
              className="underline underline-offset-4"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  )
}
