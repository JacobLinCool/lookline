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
import { getI18n } from '@/i18n/server'
import { departmentLabel } from '@/i18n/taxonomy'
import { guestLoginAction, loginAsAction } from '@/server/actions/auth'
import { safeNextPath } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.auth.metaTitle }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The first sentence of a persona bio, so every card carries one complete thought. */
function firstSentence(bio: string): string {
  const match = /^[^.!?。！？]+[.!?。！？]?/.exec(bio.trim())
  return (match?.[0] ?? bio).trim()
}

async function loadPersonas(): Promise<{ personas: User[]; failed: boolean }> {
  try {
    const personas = await getDb()
      .db.select()
      .from(users)
      .where(eq(users.isPersona, true))
      .orderBy(asc(users.handle))
    return { personas, failed: false }
  } catch (error) {
    console.warn('[login] profiles unavailable', error)
    return { personas: [], failed: true }
  }
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, { t, locale }, { personas, failed }] = await Promise.all([
    searchParams,
    getI18n(),
    loadPersonas(),
  ])
  const next = safeNextPath(params.next)
  const errorKey = typeof params.error === 'string' ? params.error : null
  const error = errorKey ? t.auth.errors[errorKey] : undefined

  return (
    <Container className="pb-24">
      <PageHeader title={t.auth.title} />

      {error ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}

      {failed ? (
        <Notice tone="error" title={t.auth.profilesUnavailable} />
      ) : personas.length === 0 ? (
        <EmptyState title={t.auth.noProfiles} description={t.auth.noProfilesNote} />
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
                      {departmentLabel(locale, persona.department)} · @{persona.handle}
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
        <Field label={t.auth.nameLabel} htmlFor="displayName" className="flex-1">
          <Input id="displayName" name="displayName" maxLength={40} autoComplete="name" required />
        </Field>
        <Button type="submit" variant="secondary">
          {t.common.continue}
        </Button>
      </form>
    </Container>
  )
}
