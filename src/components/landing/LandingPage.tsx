import { Link } from '@tanstack/react-router'
import {
  CalendarDays,
  Check,
  FolderKanban,
  ListTodo,
  NotebookPen,
  Smartphone,
  Sun,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandMark } from '~/components/landing/BrandMark'
import {
  PreviewBlock,
  PreviewCheck,
  TodayPreview,
} from '~/components/landing/TodayPreview'
import { cn } from '~/lib/utils'

const pill =
  'inline-flex items-center justify-center gap-2 rounded-full border border-transparent font-semibold whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
const pillPrimary = cn(pill, 'bg-foreground text-white hover:bg-black')
const pillGhost = cn(pill, 'border-border hover:bg-muted')
const pillSm = 'px-[18px] py-2.5 text-sm'
const pillLg = 'px-6 py-[13px] text-[15px]'

const sectionNav = [
  { href: '#how', label: 'How it works' },
  { href: '#concepts', label: 'Tasks & blocks' },
  { href: '#google', label: 'Google Calendar' },
  { href: '#features', label: 'Features' },
]

const loopSteps: Array<{
  title: string
  body: string
  visual: ReactNode
}> = [
  {
    title: 'Plan',
    body: 'Capture work as projects and tasks with estimates, due dates, priorities, and checklists.',
    visual: (
      <>
        <MiniBar width="80%" />
        <MiniBar width="60%" />
        <MiniBar width="70%" />
      </>
    ),
  },
  {
    title: 'Schedule',
    body: 'Drag tasks onto your day as time blocks. Move and resize them as the day changes.',
    visual: (
      <>
        <MiniBlock className="w-[85%] bg-event-work">09:00 Deep work</MiniBlock>
        <MiniBlock className="w-[55%] bg-event-personal">12:00 Run</MiniBlock>
        <MiniBlock className="w-[70%] bg-event-work">13:00 Email</MiniBlock>
      </>
    ),
  },
  {
    title: 'Review',
    body: "After each block, record how it went: time spent, focus, and what's next.",
    visual: (
      <>
        <div className="flex gap-1">
          {['Done', 'Partial', 'Missed'].map((label, i) => (
            <span
              key={label}
              className={cn(
                'flex-1 rounded-md bg-background py-1 text-center text-[11px] font-semibold text-muted-foreground',
                i === 0 && 'bg-status-success-fill text-success',
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <MiniBar width="65%" className="bg-[#c7c7cc]" />
      </>
    ),
  },
  {
    title: 'Shut down',
    body: 'End the day with a short note, so tomorrow starts where today stopped.',
    visual: (
      <div className="rounded-lg bg-background px-2.5 py-2 text-[11.5px] text-muted-foreground italic">
        “Pricing page shipped. Pick up launch email first thing.”
      </div>
    ),
  },
]

const features = [
  {
    icon: ListTodo,
    title: 'Kanban backlog',
    body: 'Columns you can rename and reorder, with a table view when you need one.',
  },
  {
    icon: FolderKanban,
    title: 'Projects with health',
    body: 'Colors, goal dates, on-track / at-risk status, and progress from real tasks.',
  },
  {
    icon: CalendarDays,
    title: 'Week calendar',
    body: 'Drag to move, pull to resize. See the whole week before it starts.',
  },
  {
    icon: Sun,
    title: 'Daily intention',
    body: 'One line at the top of the day that sets what matters.',
  },
  {
    icon: NotebookPen,
    title: 'Shutdown notes',
    body: 'A short daily journal you build as you go, one evening at a time.',
  },
  {
    icon: Smartphone,
    title: 'Phone friendly',
    body: 'A bottom nav and a touch-friendly day rail for planning on the go.',
  },
]

const googlePoints = [
  'Google events show up on Today and in the week view.',
  'Planner blocks can sync back to your Google Calendar.',
  "Planner never edits events it didn't create.",
  'Optional: you can connect or disconnect it any time.',
]

const googleRows: Array<{
  time: string
  title: string
  kind: 'work' | 'personal' | 'google'
}> = [
  { time: '09:00', title: 'Deep work: pricing page', kind: 'work' },
  { time: '11:00', title: 'Design sync', kind: 'google' },
  { time: '12:00', title: 'Lunch run, 5k', kind: 'personal' },
  { time: '15:00', title: '1:1 with Sara', kind: 'google' },
]

function MiniBar({ width, className }: { width: string; className?: string }) {
  return (
    <div
      className={cn('h-2.5 rounded bg-[#d2d2d7]', className)}
      style={{ width }}
    />
  )
}

function MiniBlock({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex h-[18px] items-center rounded-[5px] px-2 text-[10px] font-semibold text-white',
        className,
      )}
    >
      {children}
    </div>
  )
}

function SectionHead({
  id,
  kicker,
  title,
  children,
  className,
}: {
  id?: string
  kicker: string
  title: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-12 max-w-[640px]', className)}>
      <span className="text-[13px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
        {kicker}
      </span>
      <h2
        id={id}
        className="mt-2.5 mb-3 text-[clamp(28px,4vw,40px)] leading-[1.1] font-bold tracking-[-0.03em]"
      >
        {title}
      </h2>
      {children && (
        <p className="m-0 text-[17px] text-muted-foreground">{children}</p>
      )}
    </div>
  )
}

function Chip({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-muted px-[9px] py-[3px] text-[11.5px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12.5px] text-muted-foreground">
      <span>{label}</span>
      <b className="font-semibold text-foreground">{value}</b>
    </div>
  )
}

const section = 'scroll-mt-[60px] py-24'
const wrap = 'mx-auto max-w-[1120px] px-6'

export function LandingPage() {
  return (
    <div className="leading-normal">
      <header className="sticky top-0 z-10 border-b bg-white/85 backdrop-blur-md backdrop-saturate-[1.8]">
        <div className={cn(wrap, 'flex h-[60px] items-center gap-6')}>
          <Link to="/" className="flex items-center gap-2.5 text-[17px] font-bold">
            <BrandMark />
            Planner
          </Link>
          <nav className="ml-3 hidden gap-[22px] lg:flex" aria-label="Sections">
            {sectionNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <Link
              to="/sign-in"
              className={cn(pillGhost, pillSm, 'hidden sm:inline-flex')}
            >
              Sign in
            </Link>
            <Link to="/sign-up" className={cn(pillPrimary, pillSm)}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-14 pb-10 text-center sm:pt-[88px]">
          <div className={wrap}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-[5px] text-[13px] font-medium text-muted-foreground">
              <span className="size-[7px] rounded-full bg-event-google" />
              Works with Google Calendar
            </span>
            <h1 className="mx-auto mb-5 max-w-[820px] text-[clamp(38px,6vw,64px)] leading-[1.05] font-bold tracking-[-0.035em]">
              Plan the day.
              <br />
              Live the blocks.
              <br />
              <span className="text-muted-foreground">Shut it down.</span>
            </h1>
            <p className="mx-auto mb-8 max-w-[600px] text-[19px] text-muted-foreground">
              Planner turns your projects and tasks into time on the calendar,
              and closes every day with an honest review, so tomorrow starts
              clear.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Link to="/sign-up" className={cn(pillPrimary, pillLg)}>
                Start planning, it's free
              </Link>
              <a href="#how" className={cn(pillGhost, pillLg)}>
                See how it works
              </a>
            </div>
            <p className="mt-3.5 text-[13px] text-muted-foreground">
              Sign in with Google · No credit card
            </p>

            <TodayPreview />
          </div>
        </section>

        <section
          id="how"
          aria-labelledby="how-title"
          className={cn(section, 'bg-muted')}
        >
          <div className={wrap}>
            <SectionHead
              id="how-title"
              kicker="How it works"
              title="One loop, every day."
            >
              Planner is more than a to-do list. You plan the work, put it on
              the calendar, check how it actually went, and close the day.
            </SectionHead>

            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {loopSteps.map((step, i) => (
                <li
                  key={step.title}
                  className={cn(
                    'relative rounded-[14px] border bg-background p-[22px]',
                    i < loopSteps.length - 1 &&
                      "lg:after:absolute lg:after:top-[54px] lg:after:-right-3.5 lg:after:z-[1] lg:after:grid lg:after:size-[22px] lg:after:place-items-center lg:after:rounded-full lg:after:border lg:after:bg-background lg:after:text-[11px] lg:after:text-muted-foreground lg:after:content-['→']",
                  )}
                >
                  <div
                    aria-hidden
                    className="mb-[18px] flex h-[92px] flex-col justify-center gap-1.5 rounded-[10px] bg-muted p-3"
                  >
                    {step.visual}
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-1.5 mb-2 text-lg font-semibold tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="m-0 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="concepts" aria-labelledby="concepts-title" className={section}>
          <div className={wrap}>
            <SectionHead
              id="concepts-title"
              kicker="Two ideas"
              title={
                <>
                  Tasks are <em>what</em>.
                  <br />
                  Time blocks are <em>when</em>.
                </>
              }
            >
              Keep everything you need to do in one place, and only commit the
              time you actually have.
            </SectionHead>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[18px] border bg-background p-7">
                <span className="mb-3.5 inline-block rounded-full bg-status-progress-fill px-2.5 py-[3px] text-xs font-semibold text-event-work">
                  Task
                </span>
                <h3 className="mb-1.5 text-2xl font-semibold tracking-[-0.02em]">
                  Work you still need to do
                </h3>
                <p className="mb-5 text-muted-foreground">
                  It lives on your backlog board or inside a project until
                  you're ready for it.
                </p>
                <div
                  aria-hidden
                  className="flex flex-col gap-2.5 rounded-xl border px-4 py-3.5 text-[13.5px]"
                >
                  <div className="text-[15px] font-semibold">
                    Build comparison table
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>
                      <span className="size-[7px] rounded-[2px] bg-event-work" />
                      Website relaunch
                    </Chip>
                    <Chip>Est. 1h 30m</Chip>
                    <Chip>Due Fri</Chip>
                    <Chip>High</Chip>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[12.5px]">
                    <div className="flex items-center gap-2.5">
                      <PreviewCheck done />
                      <span className="text-muted-foreground line-through">
                        List features per tier
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <PreviewCheck done={false} />
                      <span>Mobile layout</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] border bg-background p-7">
                <span className="mb-3.5 inline-block rounded-full bg-status-success-fill px-2.5 py-[3px] text-xs font-semibold text-success">
                  Time block
                </span>
                <h3 className="mb-1.5 text-2xl font-semibold tracking-[-0.02em]">
                  Time on your calendar
                </h3>
                <p className="mb-5 text-muted-foreground">
                  Each block has an intent, a start and end, and the tasks you
                  plan to do in it.
                </p>
                <div
                  aria-hidden
                  className="flex flex-col gap-2.5 rounded-xl border px-4 py-3.5 text-[13.5px]"
                >
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span>09:00</span>
                    <div className="flex h-[26px] flex-1 items-center rounded-[7px] bg-event-work px-2.5 text-xs font-semibold text-white">
                      Deep work: pricing page
                    </div>
                    <span>11:00</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>2 tasks attached</Chip>
                    <Chip className="bg-status-success-fill text-success">
                      Reviewed · Done
                    </Chip>
                  </div>
                  <ReviewRow label="Time spent" value="1h 50m" />
                  <ReviewRow label="Focus" value="●●●●○" />
                  <ReviewRow label="Next step" value="Mobile layout" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="google"
          aria-labelledby="google-title"
          className={cn(section, 'bg-muted')}
        >
          <div className={cn(wrap, 'grid items-center gap-14 lg:grid-cols-2')}>
            <div>
              <SectionHead
                id="google-title"
                kicker="Google Calendar"
                title="Your meetings and your plan, side by side."
                className="mb-0"
              >
                Connect Google Calendar to see your existing events next to the
                time you plan.
              </SectionHead>
              <ul className="mt-6 flex flex-col gap-3.5">
                {googlePoints.map((point) => (
                  <li key={point} className="flex gap-3 text-[15px]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-status-success-fill text-success">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div
              aria-hidden
              className="flex flex-col gap-2 rounded-[18px] border bg-background p-[18px]"
            >
              {googleRows.map((row) => (
                <div
                  key={row.time}
                  className="grid grid-cols-[44px_1fr] items-center gap-2.5 text-[11px] text-muted-foreground"
                >
                  <span>{row.time}</span>
                  <PreviewBlock
                    title={row.title}
                    meta={row.kind === 'google' ? 'From Google' : 'Planner'}
                    kind={row.kind}
                    className="h-[34px]"
                  />
                </div>
              ))}
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px] bg-event-work" />
                  Planner block
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px] border-[1.5px] border-event-google bg-white" />
                  Google event (read-only)
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className={section}>
          <div className={wrap}>
            <SectionHead
              id="features-title"
              kicker="Also inside"
              title="Everything you need, nothing you don't."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-[14px] border bg-background p-[22px]"
                >
                  <div className="mb-3.5 grid size-9 place-items-center rounded-[10px] bg-muted">
                    <Icon className="size-[17px]" aria-hidden />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
                  <p className="m-0 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted py-[110px] text-center">
          <div className={wrap}>
            <h2 className="mb-4 text-[clamp(32px,5vw,52px)] leading-[1.05] font-bold tracking-[-0.035em]">
              Tomorrow starts tonight.
            </h2>
            <p className="mb-[30px] text-lg text-muted-foreground">
              Set up your first day in under two minutes.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Link to="/sign-up" className={cn(pillPrimary, pillLg)}>
                Get started, it's free
              </Link>
              <Link to="/sign-in" className={cn(pillGhost, pillLg)}>
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-7 text-[13px] text-muted-foreground">
        <div className={cn(wrap, 'flex flex-wrap items-center gap-5')}>
          <span className="flex items-center gap-2.5 text-sm font-bold text-foreground">
            <BrandMark className="size-[22px] rounded-md" />
            Planner
          </span>
          <span>© {new Date().getFullYear()}</span>
          <div className="ml-auto flex gap-[18px]">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link
              to="/privacy"
              hash="google-calendar"
              className="hover:text-foreground"
            >
              Google data use
            </Link>
            <Link to="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
