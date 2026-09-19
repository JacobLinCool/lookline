import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button, Container, Field, Input, LookCard, Notice, Section, Select } from '@/components/ui'
import {
  first,
  loadLookById,
  loadNetworkPeople,
  loadUserLooks,
  occasionOptions,
  presetOptions,
} from '@/components/social/data'
import { PeoplePicker } from '@/components/social/people-picker'
import { ProductLine } from '@/components/social/product-option'
import { getI18n } from '@/i18n/server'
import { facetLabel } from '@/i18n/taxonomy'
import { createTogetherAction } from '@/server/actions/together'
import { requireUser } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.together.title }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

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
  const [{ id }, query, { t, locale }] = await Promise.all([params, searchParams, getI18n()])
  const copy = t.social.together
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
  const errors: Record<string, string | undefined> = {
    occasion: copy.errors.occasion,
    participants: copy.errors.participants,
    token: copy.errors.token,
    products: copy.errors.products,
  }
  const presets = presetOptions(locale)
  const notMine = source.owner.id !== user.id

  return (
    <Container className="pb-16">
      <div className="flex flex-col gap-1 pt-8 pb-6 md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">{copy.title}</h1>
        <p className="text-[14px] text-muted">
          {copy.description(notMine ? source.owner.displayName : null)}
        </p>
      </div>

      {error && errors[error] ? (
        <Notice tone="error" className="mb-6">
          {errors[error]}
        </Notice>
      ) : null}
      {error === 'no-look' ? (
        <Notice tone="error" className="mb-6">
          {copy.errors.noLook(first(query.who) ?? copy.errors.thatPerson)}
        </Notice>
      ) : null}
      {error === 'look' ? (
        <Notice tone="warning" className="mb-6">
          {copy.errors.look}
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

          <Section title={copy.who} rule={false}>
            {network.error ? (
              <Notice tone="warning" className="mb-4">
                {copy.errors.people}
              </Notice>
            ) : null}
            {people.length > 0 ? (
              <PeoplePicker
                people={people}
                name="participantId"
                renderExtra={(person) => {
                  const theirLooks = looksByPerson.get(person.id) ?? []
                  if (theirLooks.length === 0) {
                    return <p className="text-[12px] text-muted">{copy.noLooks}</p>
                  }
                  return (
                    <Select
                      name={`look-${person.id}`}
                      aria-label={copy.personLook(person.displayName)}
                      options={theirLooks.map((l) => ({ value: l.id, label: l.title }))}
                      className="h-9 text-[13px]"
                    />
                  )
                }}
              />
            ) : !network.error ? (
              <p className="text-[13px] text-muted">{copy.noNetwork}</p>
            ) : null}
            <Field label={copy.lookLink} htmlFor="token" className="mt-5 max-w-lg">
              <Input id="token" name="token" placeholder="https://…/l/abc123" maxLength={400} />
            </Field>
          </Section>

          <Section title={copy.occasion}>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label={copy.occasion} htmlFor="occasion">
                <Select
                  id="occasion"
                  name="occasion"
                  placeholder={copy.occasionPlaceholder}
                  defaultValue=""
                  required
                  options={occasionOptions(locale, t.social.occasions)}
                />
              </Field>
              <Field label={copy.note} htmlFor="note">
                <Input id="note" name="note" placeholder={copy.notePlaceholder} maxLength={280} />
              </Field>
              <Field label={copy.style} htmlFor="stylePreset">
                <Select
                  id="stylePreset"
                  name="stylePreset"
                  options={presets}
                  defaultValue={source.look.stylePreset}
                />
              </Field>
              <Field label={copy.titleField} htmlFor="title">
                <Input
                  id="title"
                  name="title"
                  maxLength={120}
                  placeholder={copy.titlePlaceholder(
                    user.displayName,
                    facetLabel(locale, 'travel'),
                  )}
                />
              </Field>
            </div>
          </Section>

          <div>
            <Button type="submit" size="lg">
              {copy.create}
            </Button>
          </div>
        </form>
      </div>
    </Container>
  )
}
