import { Button, Field, Input } from '@/components/ui'
import { guestLoginAction } from '@/server/actions/auth'

export interface GuestGateProps {
  /** Where to land after the guest is created (the current page URL, with its query). */
  next: string
  /** Heading, e.g. "Make it mine". */
  title: string
  /** One short line under the heading. */
  description: string
  /** Submit label. */
  cta?: string
  className?: string
}

/**
 * Inline guest sign-in: a name, no account. Creates a `users` row with `isGuest = true` through
 * the shared `guestLoginAction` and returns to `next`.
 */
export function GuestGate({
  next,
  title,
  description,
  cta = 'Continue',
  className,
}: GuestGateProps) {
  return (
    <form action={guestLoginAction} className={className}>
      <input type="hidden" name="next" value={next} />
      <div className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px]">{title}</h2>
          <p className="text-[13px] text-muted">{description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Your name" htmlFor="guest-name" className="flex-1">
            <Input
              id="guest-name"
              name="displayName"
              placeholder="Alice / 小美"
              maxLength={40}
              autoComplete="name"
              required
            />
          </Field>
          <Button type="submit">{cta}</Button>
        </div>
        <p className="text-[12px] text-muted">
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            className="underline decoration-line underline-offset-4 hover:text-ink"
          >
            Sign in with a profile
          </a>
        </p>
      </div>
    </form>
  )
}
