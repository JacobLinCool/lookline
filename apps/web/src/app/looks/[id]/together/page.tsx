import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button, Container, Field, Input, LookCard, Notice, Section, Select } from '@/components/ui'
import {
  first,
  loadLookById,
  loadNetworkPeople,
  loadUserLooks,
  OCCASION_OPTIONS,
  presetOptions,
} from '@/components/social/data'
import { PeoplePicker } from '@/components/social/people-picker'
import { ProductLine } from '@/components/social/product-option'
import { createTogetherAction } from '@/server/actions/together'
import { requireUser } from '@/server/auth'

export const metadata: Metadata = { title: 'Together' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ERRORS: Record<string, string> = {
  occasion: 'Choose an occasion.',
  participants: 'Add at least one other person.',
  token: 'That link is not a shared Look. Paste the /l/… link or its token.',
  products: 'The chosen Looks have no pieces.',
}

/**
 * `/looks/[id]/together` — a shared Look for an occasion. The viewer's Look [id] plus the Looks
 * of the people they pick (or a friend's Look by share link); the products are unioned and the
 * engine records TOGETHER interactions between every participant.
 */
export default async function TogetherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const path = `/looks/${encodeURIComponent(id)}/together`
  const user = await requireUser(path)
  const source = await loadLookById(id)
  if (!source) notFound()

  const network = await loadNetworkPeople(user.id)
  const people = network.people.filter((p) => p.id !== source.owner.id)
  const looksByPerson = new Map(
    await Promise.all(people.map(async (p) => [p.id, await loadUserLooks(p.id, 6)] as const)),
  )

  const error = first(query.error)
  const presets = presetOptions()
  const notMine = source.owner.id !== user.id

  return (
    <Container className="pb-16">
      <div className="flex flex-col gap-1 pt-8 pb-6 md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">Together</h1>
        <p className="text-[14px] text-muted">
          Combine Looks for an occasion
          {notMine ? ` · starting from ${source.owner.displayName}'s Look` : ''}
        </p>
      </div>

      {error && ERRORS[error] ? (
        <Notice tone="error" className="mb-6">
          {ERRORS[error]}
        </Notice>
      ) : null}
      {error === 'no-look' ? (
        <Notice tone="error" className="mb-6">
          {first(query.who) ?? 'That person'} has no Look yet.
        </Notice>
      ) : null}
      {error === 'look' ? (
        <Notice tone="warning" className="mb-6">
          The Look was not saved. Try again.
        </Notice>
      ) : null}

      <div className="grid gap-8 md:grid-cols-12 md:gap-12">
        <aside className="flex flex-col gap-5 md:col-span-4">
          <div className="max-w-xs">
            <LookCard look={source.look} owner={source.owner} href={`/looks/${source.look.id}`} />
          </div>
          {source.products.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {source.products.map((product) => (
                <li key={product.id}>
                  <ProductLine product={product} href={`/p/${product.id}`} />
                </li>
              ))}
            </ul>
          ) : null}
        </aside>

        <form action={createTogetherAction} className="flex flex-col gap-8 md:col-span-8">
          <input type="hidden" name="sourceLookId" value={source.look.id} />

          <Section title="Who" rule={false}>
            {network.error ? (
              <Notice tone="warning" className="mb-4">
                Your people could not be loaded. Add a friend by their Look link instead.
              </Notice>
            ) : null}
            {people.length > 0 ? (
              <PeoplePicker
                people={people}
                name="participantId"
                renderExtra={(person) => {
                  const theirLooks = looksByPerson.get(person.id) ?? []
                  if (theirLooks.length === 0) {
                    return <p className="text-[12px] text-muted">No Looks yet</p>
                  }
                  return (
                    <Select
                      name={`look-${person.id}`}
                      aria-label={`${person.displayName}'s Look`}
                      options={theirLooks.map((l) => ({ value: l.id, label: l.title }))}
                      className="h-9 text-[13px]"
                    />
                  )
                }}
              />
            ) : !network.error ? (
              <p className="text-[13px] text-muted">
                No one in your network yet. Paste a friend's Look link below.
              </p>
            ) : null}
            <Field label="Or a friend's Look link" htmlFor="token" className="mt-5 max-w-lg">
              <Input id="token" name="token" placeholder="https://…/l/abc123" maxLength={400} />
            </Field>
          </Section>

          <Section title="Occasion">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Occasion" htmlFor="occasion">
                <Select
                  id="occasion"
                  name="occasion"
                  placeholder="Choose an occasion"
                  defaultValue=""
                  required
                >
                  {OCCASION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note (optional)" htmlFor="note">
                <Input
                  id="note"
                  name="note"
                  placeholder="Kenting in October / 台南婚禮，白天戶外"
                  maxLength={280}
                />
              </Field>
              <Field label="Style (optional)" htmlFor="stylePreset">
                <Select
                  id="stylePreset"
                  name="stylePreset"
                  options={presets}
                  defaultValue={source.look.stylePreset}
                />
              </Field>
              <Field label="Title (optional)" htmlFor="title">
                <Input
                  id="title"
                  name="title"
                  maxLength={120}
                  placeholder={`${user.displayName} & … · Travel`}
                />
              </Field>
            </div>
          </Section>

          <div>
            <Button type="submit" size="lg">
              Create Together
            </Button>
          </div>
        </form>
      </div>
    </Container>
  )
}
