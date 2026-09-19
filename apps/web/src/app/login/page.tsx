import type { Metadata } from 'next'
import { asc, eq, users, type User } from '@lookline/db'
import {
  Avatar,
  Button,
  Container,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
} from '@/components/ui'
import { guestLoginAction, loginAsAction } from '@/server/actions/auth'
import { safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'

export const metadata: Metadata = { title: 'Choose a profile' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The first sentence of a persona bio, so every card carries one complete thought. */
function firstSentence(bio: string): string {
  const match = /^[^.!?。！？]+[.!?。！？]?/.exec(bio.trim())
  return (match?.[0] ?? bio).trim()
}

const ERRORS: Record<string, string> = {
  missing: 'Choose a profile to continue.',
  unknown: 'That profile no longer exists. Choose another one.',
  guest: 'Sign-in did not go through. Enter your name and continue again.',
}

const DEPARTMENT: Record<string, string> = {
  women: 'Women',
  men: 'Men',
  unisex: 'Unisex',
  kids: 'Kids',
}

async function loadPersonas(): Promise<{ personas: User[]; error: string | null }> {
  try {
    const personas = await getDb()
      .db.select()
      .from(users)
      .where(eq(users.isPersona, true))
      .orderBy(asc(users.handle))
    return { personas, error: null }
  } catch (error) {
    console.warn('[login] profiles unavailable', error)
    return { personas: [], error: 'Profiles are unavailable right now.' }
  }
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  const errorKey = typeof params.error === 'string' ? params.error : null
  const { personas, error: dbError } = await loadPersonas()

  return (
    <Container className="pb-24">
      <PageHeader title="Choose a profile" />

      {errorKey && ERRORS[errorKey] ? (
        <Notice tone="error" className="mb-6">
          {ERRORS[errorKey]}
        </Notice>
      ) : null}

      {dbError ? (
        <Notice tone="error" title={dbError} />
      ) : personas.length === 0 ? (
        <EmptyState title="No profiles yet." description="Continue with your name below." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <li key={persona.id}>
              <form action={loginAsAction} className="h-full">
                <input type="hidden" name="userId" value={persona.id} />
                <input type="hidden" name="next" value={next} />
                <button
                  type="submit"
                  className="flex h-full w-full items-center gap-3 rounded-md border border-line bg-card p-3 text-left transition-colors hover:border-ink focus-visible:border-ink"
                >
                  <Avatar seed={persona.avatarSeed} name={persona.displayName} size="lg" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="display truncate text-[17px]">{persona.displayName}</span>
                    {persona.bio ? (
                      <span className="line-clamp-1 text-[12px] text-muted">
                        {firstSentence(persona.bio)}
                      </span>
                    ) : null}
                    <span className="truncate text-[11px] text-muted">
                      {DEPARTMENT[persona.department] ?? persona.department} · @{persona.handle}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={guestLoginAction}
        className="hairline mt-10 flex max-w-lg flex-col gap-3 pt-8 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="next" value={next} />
        <Field label="Your name" htmlFor="displayName" className="flex-1">
          <Input id="displayName" name="displayName" maxLength={40} autoComplete="name" required />
        </Field>
        <Button type="submit" variant="secondary">
          Continue
        </Button>
      </form>
    </Container>
  )
}
