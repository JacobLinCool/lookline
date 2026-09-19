'use client'

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDollarSign,
  Download,
  LockKeyhole,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Avatar,
  Button,
  Container,
  Field,
  Notice,
  PageHeader,
  Price,
  ProductImage,
  Select,
  Tag,
  Textarea,
} from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { facetLabel } from '@/i18n/taxonomy'
import { cn } from '@/lib/cn'
import { formatTwd } from '@/server/format'

export interface JourneyProduct {
  id: string
  imagePath: string | null
  name: string
  brandName: string
  price: number
  colorName: string
  colorHex: string
  material: string
  pattern: string
  subcategory: string
}

export interface JourneyLook {
  id: string
  title: string
  ownerName: string
  ownerHandle: string
  ownerAvatarSeed: number
}

type ScenarioKey = 'ready' | 'custom' | 'borrow'

const SCENARIO_KEYS: readonly ScenarioKey[] = ['ready', 'custom', 'borrow']

function productAt(products: JourneyProduct[], index: number): JourneyProduct | null {
  return products[index] ?? products[0] ?? null
}

function ProductFacts({ product }: { product: JourneyProduct }) {
  const { t, locale } = useI18n()
  const facts = t.social.tour.facts
  return (
    <dl className="grid grid-cols-2 border-y border-line text-[13px] sm:grid-cols-4">
      {[
        [facts.color, product.colorName],
        [facts.material, facetLabel(locale, product.material)],
        [facts.pattern, facetLabel(locale, product.pattern)],
      ].map(([term, value]) => (
        <div key={term} className="border-r border-line px-3 py-3 last:border-r-0">
          <dt className="text-[11px] text-muted">{term}</dt>
          <dd className="mt-1 truncate font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProductChooser({
  products,
  selectedId,
  onSelect,
}: {
  products: JourneyProduct[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {products.slice(0, 3).map((product) => {
        const selected = product.id === selectedId
        return (
          <button
            key={product.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(product.id)}
            className={cn(
              'group relative rounded-md p-2 text-left transition-colors hover:bg-mist/70',
              selected && 'bg-mist ring-2 ring-ink ring-offset-2 ring-offset-paper',
            )}
          >
            <ProductImage
              articleId={product.id}
              imagePath={product.imagePath}
              alt={product.name}
              priority
              className="mb-3"
            />
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <p className="mt-1 text-[14px] leading-snug font-medium">{product.name}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Price amount={product.price} size="sm" />
              {selected ? (
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Check className="size-3" /> {t.social.tour.selected}
                </span>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PreviewFrame({
  product,
  look,
  owner,
}: {
  product: JourneyProduct
  look: JourneyLook | null
  owner?: string
}) {
  const { t } = useI18n()
  const copy = t.social.tour.preview
  return (
    <figure className="relative overflow-hidden rounded-md bg-mist">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-xs border border-line bg-card px-2 py-1 text-[12px] font-medium">
        <LockKeyhole className="size-3" /> {copy.notOwned}
      </div>
      <div className="grid min-h-[26rem] grid-cols-[minmax(0,1.25fr)_minmax(8rem,.75fr)]">
        {look ? (
          <img
            src={`/api/looks/${look.id}/image`}
            alt={copy.alt(look.title)}
            width={720}
            height={960}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center bg-mist p-8">
            <ProductImage
              articleId={product.id}
              imagePath={product.imagePath}
              alt={product.name}
              className="w-full max-w-72"
            />
          </div>
        )}
        <figcaption className="flex flex-col justify-between border-l border-line bg-card p-5">
          <div>
            <p className="text-[12px] text-muted">{copy.styledFor}</p>
            <p className="mt-1 font-display text-xl">{owner ?? copy.you}</p>
          </div>
          <div>
            <span
              aria-hidden
              className="mb-3 block size-7 rounded-full border border-line"
              style={{ backgroundColor: product.colorHex }}
            />
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <p className="mt-1 font-display text-xl leading-tight">{product.name}</p>
            <p className="mt-2 text-[12px] text-muted">{copy.catalogColour(product.colorName)}</p>
          </div>
        </figcaption>
      </div>
    </figure>
  )
}

function LookCardArtifact({
  product,
  look,
  edition,
  variant,
}: {
  product: JourneyProduct
  look: JourneyLook | null
  edition: string
  variant: string
}) {
  const { t } = useI18n()
  const copy = t.social.tour.card
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'exported'>('idle')
  const [consent, setConsent] = useState(false)
  const exportHref = look ? `/api/looks/${look.id}/image` : `/api/articles/${product.id}/image`

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1fr)]">
      <figure className="relative rounded-md bg-ink p-2 text-paper">
        <div className="relative aspect-3/4 overflow-hidden bg-mist">
          {look ? (
            <img
              src={`/api/looks/${look.id}/image`}
              alt={copy.alt(product.name)}
              width={720}
              height={960}
              className="size-full object-cover"
            />
          ) : (
            <ProductImage
              articleId={product.id}
              imagePath={product.imagePath}
              alt={product.name}
              className="size-full"
            />
          )}
          <span className="absolute top-3 left-3 rounded-xs bg-card px-2 py-1 text-[12px] font-medium text-ink">
            {copy.owned}
          </span>
        </div>
        <figcaption className="flex items-end justify-between gap-4 p-3">
          <div>
            <p className="text-[11px] text-paper/70">{copy.lookCard}</p>
            <p className="mt-1 font-display text-2xl leading-none">{product.name}</p>
          </div>
          <span className="text-right text-[10px] text-paper/65">
            {edition}
            <br />
            {variant}
          </span>
        </figcaption>
      </figure>

      <div className="flex flex-col justify-center gap-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">
            <Check className="size-4" />
          </span>
          <div className="flex items-center gap-2">
            <p className="font-medium">{copy.orderConfirmed}</p>
            <Tag tone="outline">{t.social.tour.sample}</Tag>
          </div>
        </div>
        <label className="flex items-start gap-3 border-y border-line py-3 text-[13px]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-4 accent-ink"
          />
          {copy.shareWithCircle}
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            icon={<Users />}
            variant="secondary"
            full
            disabled={!consent}
            onClick={() => setShareStatus('shared')}
          >
            {copy.shareToCircle}
          </Button>
          <Button
            href={exportHref}
            download={`lookline-${product.id}.svg`}
            icon={<Download />}
            full
            onClick={() => setShareStatus('exported')}
          >
            {copy.exportImage}
          </Button>
        </div>
        {shareStatus === 'shared' ? <Notice tone="success">{copy.shared}</Notice> : null}
        {shareStatus === 'exported' ? <Notice tone="success">{copy.downloadStarted}</Notice> : null}
      </div>
    </div>
  )
}

function CustomCardIssuing({ product }: { product: JourneyProduct }) {
  const { t } = useI18n()
  const copy = t.social.tour.custom
  return (
    <div className="grid gap-7 md:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="rounded-md bg-mist p-3">
        <ProductImage
          articleId={product.id}
          imagePath={product.imagePath}
          alt={copy.baseAlt(product.name)}
          priority
        />
        <p className="mt-3 text-[12px] text-muted">{copy.confirmedBase}</p>
      </div>
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">
            <Sparkles className="size-4" />
          </span>
          <div className="flex items-center gap-2">
            <p className="font-medium">{copy.issuing}</p>
            <Tag tone="outline">{t.social.tour.sample}</Tag>
          </div>
        </div>
        <h3 className="mt-6 font-display text-2xl">{copy.cardFollows}</h3>
        <dl className="mt-6 divide-y divide-line border-y border-line text-[13px]">
          {[
            [copy.cardSpec.base, product.name],
            [copy.spec.finish, copy.spec.finishValue],
            [copy.spec.graphic, copy.cardSpec.graphicValue],
            [copy.spec.edition, copy.spec.editionValue],
          ].map(([term, value]) => (
            <div key={term} className="grid grid-cols-[5rem_1fr] gap-3 py-3">
              <dt className="text-muted">{term}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function ReadyStage({
  step,
  products,
  product,
  look,
  selectedId,
  onSelect,
  query,
  onQuery,
  selectedSize,
  onSelectedSize,
}: {
  step: number
  products: JourneyProduct[]
  product: JourneyProduct
  look: JourneyLook | null
  selectedId: string
  onSelect: (id: string) => void
  query: string
  onQuery: (value: string) => void
  selectedSize: string
  onSelectedSize: (value: string) => void
}) {
  const { t } = useI18n()
  const tour = t.social.tour
  const copy = tour.ready

  if (step === 0) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,.8fr)]">
        <Field label={copy.queryLabel} htmlFor="ready-query">
          <Textarea
            id="ready-query"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            rows={5}
            placeholder={copy.queryPlaceholder}
          />
        </Field>
        <div className="border-l border-line pl-5">
          <p className="text-[13px] font-medium">{copy.examples}</p>
          <div className="mt-4 flex flex-col divide-y divide-line border-y border-line">
            {tour.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onQuery(example)}
                className="py-3 text-left text-[13px] text-muted transition-colors hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            {copy.results(query || (tour.examples[0] ?? ''))}
          </p>
          <Tag tone="outline">{copy.liveCatalog}</Tag>
        </div>
        <ProductChooser products={products} selectedId={selectedId} onSelect={onSelect} />
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="space-y-5">
        <PreviewFrame product={product} look={look} />
        <ProductFacts product={product} />
      </div>
    )
  }

  if (step === 3) {
    const sizes = [copy.oneSize]
    return (
      <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <ProductImage
          articleId={product.id}
          imagePath={product.imagePath}
          alt={product.name}
          priority
        />
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <Price amount={product.price} size="lg" className="mt-2" />
          </div>
          <Field label={copy.size} htmlFor="ready-size">
            <Select
              id="ready-size"
              value={selectedSize}
              onChange={(event) => onSelectedSize(event.target.value)}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-start gap-3 border-y border-line py-3 text-[13px]">
            <input type="checkbox" defaultChecked className="mt-0.5 size-4 accent-ink" />
            {copy.keepPrivate}
          </label>
        </div>
      </div>
    )
  }

  return (
    <LookCardArtifact
      product={product}
      look={look}
      edition={copy.edition}
      variant={`${product.colorName} · ${selectedSize}`}
    />
  )
}

function CustomStage({
  step,
  product,
  brief,
  onBrief,
  referenceName,
  onReference,
}: {
  step: number
  product: JourneyProduct
  brief: string
  onBrief: (value: string) => void
  referenceName: string | null
  onReference: (name: string | null) => void
}) {
  const { t, locale } = useI18n()
  const tour = t.social.tour
  const copy = tour.custom
  const customPrice = product.price + 2800

  if (step === 0) {
    return (
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,.85fr)]">
        <div className="space-y-5">
          <Field label={copy.briefLabel} htmlFor="custom-brief">
            <Textarea
              id="custom-brief"
              value={brief}
              onChange={(event) => onBrief(event.target.value)}
              rows={5}
              placeholder={copy.briefPlaceholder}
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-dashed border-line p-4 hover:bg-mist/50">
            <span className="flex items-center gap-3">
              <Upload className="size-5" />
              <span>
                <span className="block text-[13px] font-medium">
                  {referenceName ?? copy.addImage}
                </span>
                <span className="block text-[11px] text-muted">{copy.imageHint}</span>
              </span>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => onReference(event.target.files?.[0]?.name ?? null)}
            />
            <span className="text-[12px] underline underline-offset-4">{copy.choose}</span>
          </label>
        </div>
        <div className="rounded-md bg-mist p-5">
          <h3 className="text-[15px]">{copy.nextTitle}</h3>
          <ol className="mt-3 space-y-2 text-[13px] text-muted">
            {copy.nextSteps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="grid gap-7 md:grid-cols-[12rem_minmax(0,1fr)]">
        <ProductImage
          articleId={product.id}
          imagePath={product.imagePath}
          alt={product.name}
          priority
        />
        <div className="space-y-5">
          <div>
            <Tag tone="outline">{copy.basePattern}</Tag>
            <h3 className="mt-3 font-display text-3xl">{product.name}</h3>
            <p className="mt-2 text-[13px] text-muted">
              {product.brandName} · {facetLabel(locale, product.subcategory)} ·{' '}
              {facetLabel(locale, product.material)}
            </p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {copy.adjustments.map((row) => (
              <label key={row.label} className="flex items-center gap-3 py-3 text-[13px]">
                <input type="checkbox" defaultChecked className="size-4 accent-ink" />
                <span className="w-20 text-muted">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </label>
            ))}
          </div>
          <Notice tone="info">{copy.reviewNotice}</Notice>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">
              <Check className="size-4" />
            </span>
            <div>
              <p className="font-medium">{copy.feasible}</p>
              <Tag tone="outline">{tour.sample}</Tag>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-line border-y border-line text-[13px]">
            {[
              [copy.spec.base, product.name],
              [copy.spec.finish, copy.spec.finishValue],
              [copy.spec.graphic, copy.spec.graphicValue],
              [copy.spec.production, copy.spec.productionValue],
              [copy.spec.edition, copy.spec.editionValue],
            ].map(([term, value]) => (
              <div key={term} className="grid grid-cols-[7rem_1fr] gap-4 py-3">
                <dt className="text-muted">{term}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-md bg-mist p-5">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            {copy.quote} <Tag tone="outline">{tour.sample}</Tag>
          </div>
          <Price amount={customPrice} size="lg" className="mt-2" />
          <p className="mt-3 text-[12px] text-muted">{copy.quoteNote}</p>
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <h3 className="font-display text-2xl">{copy.fixed}</h3>
          <p className="mt-2 text-[13px] text-muted">{copy.fixedNote}</p>
          <label className="mt-6 flex items-start gap-3 border-y border-line py-4 text-[13px]">
            <input type="checkbox" defaultChecked className="mt-0.5 size-4 accent-ink" />
            {copy.rights}
          </label>
        </div>
        <div className="rounded-md bg-mist p-5">
          <p className="text-[12px] text-muted">{copy.total}</p>
          <Price amount={customPrice} size="lg" className="mt-2" />
          <p className="mt-5 text-[12px] text-muted">{copy.delivery}</p>
        </div>
      </div>
    )
  }

  return <CustomCardIssuing product={product} />
}

function BorrowStage({
  step,
  product,
  look,
  selectedSize,
  onSelectedSize,
}: {
  step: number
  product: JourneyProduct
  look: JourneyLook | null
  selectedSize: string
  onSelectedSize: (value: string) => void
}) {
  const { t } = useI18n()
  const tour = t.social.tour
  const copy = tour.borrow
  const discounted = Math.round(product.price * 0.9)
  const saved = product.price - discounted
  const friendName = look?.ownerName ?? copy.member
  const friendHandle = look?.ownerHandle ?? 'circle'

  if (step === 0) {
    return (
      <div className="grid gap-7 md:grid-cols-[13rem_minmax(0,1fr)]">
        <ProductImage
          articleId={product.id}
          imagePath={product.imagePath}
          alt={product.name}
          priority
        />
        <div className="flex flex-col justify-center gap-5">
          <div className="flex items-center gap-3">
            <Avatar seed={look?.ownerAvatarSeed ?? 4107} name={friendName} size="md" />
            <div>
              <p className="font-medium">{friendName}</p>
              <p className="text-[12px] text-muted">{copy.sharedWithCircle(friendHandle)}</p>
            </div>
          </div>
          <div>
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <div className="mt-2 flex items-center gap-3">
              <Price amount={product.price} size="md" />
              <span className="text-[12px] text-muted">
                {copy.purchasedItem(product.colorName)}
              </span>
            </div>
          </div>
          <Notice tone="info">{copy.digitalBorrow(friendName)}</Notice>
        </div>
      </div>
    )
  }

  if (step === 1) return <PreviewFrame product={product} look={look} owner={copy.borrowedPreview} />

  if (step === 2) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <CircleDollarSign className="size-7" />
          <h3 className="mt-4 font-display text-3xl">{copy.offerTitle}</h3>
          <p className="mt-2 text-[13px] text-muted">{copy.offerNote}</p>
        </div>
        <div className="rounded-md bg-mist p-5">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            {copy.circlePrice} <Tag tone="outline">{tour.sample}</Tag>
          </div>
          <Price amount={discounted} size="lg" className="mt-2" />
          <p className="mt-2 text-[12px] text-muted line-through">{formatTwd(product.price)}</p>
          <p className="mt-5 border-t border-line pt-4 text-[12px]">
            {copy.save(formatTwd(saved))}
          </p>
        </div>
      </div>
    )
  }

  if (step === 3) {
    const sizes = [tour.ready.oneSize]
    return (
      <div className="grid gap-8 md:grid-cols-[10rem_minmax(0,1fr)]">
        <ProductImage articleId={product.id} imagePath={product.imagePath} alt={product.name} />
        <div className="space-y-5">
          <div>
            <p className="text-[12px] text-muted">{copy.yourOrder}</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <Price amount={discounted} size="lg" className="mt-2" />
          </div>
          <Field label={tour.ready.size} htmlFor="borrow-size">
            <Select
              id="borrow-size"
              value={selectedSize}
              onChange={(event) => onSelectedSize(event.target.value)}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </Field>
          <p className="border-t border-line pt-4 text-[12px] text-muted">
            {copy.friendKeeps(friendName)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <LookCardArtifact
      product={product}
      look={look}
      edition={copy.edition}
      variant={`${product.colorName} · ${selectedSize}`}
    />
  )
}

function OutcomeStrip({ scenario, step }: { scenario: ScenarioKey; step: number }) {
  const { t } = useI18n()
  const labels = t.social.tour.milestones
  const milestones = [
    { key: 'product', label: labels.product, active: scenario === 'custom' ? step >= 2 : true },
    {
      key: 'preview',
      label: labels.preview,
      active: scenario === 'custom' ? step >= 2 : step >= 1,
    },
    { key: 'order', label: labels.order, active: step >= 3 },
    { key: 'card', label: labels.card, active: step >= 4 },
    { key: 'circle', label: labels.circle, active: scenario === 'borrow' || step >= 4 },
  ]
  return (
    <ol
      className="grid grid-cols-5 overflow-hidden rounded-sm border border-line"
      aria-label={t.social.tour.milestonesLabel}
    >
      {milestones.map((milestone, index) => (
        <li
          key={milestone.key}
          className={cn(
            'relative border-r border-line px-2 py-3 text-center text-[10px] sm:text-[11px]',
            index === milestones.length - 1 && 'border-r-0',
            milestone.active ? 'bg-ink text-paper' : 'bg-paper text-muted',
          )}
        >
          {milestone.label}
        </li>
      ))}
    </ol>
  )
}

export function JourneyPrototype({
  products,
  sampleLook,
  error,
}: {
  products: JourneyProduct[]
  sampleLook: JourneyLook | null
  error: string | null
}) {
  const { t } = useI18n()
  const tour = t.social.tour
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('ready')
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState<string>(tour.examples[0] ?? '')
  const [brief, setBrief] = useState(tour.custom.briefDefault)
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(products[0]?.id ?? null)
  const [readySize, setReadySize] = useState(tour.ready.oneSize)
  const [borrowSize, setBorrowSize] = useState(tour.ready.oneSize)
  const [unlocked, setUnlocked] = useState<Record<ScenarioKey, number>>({
    ready: 0,
    custom: 0,
    borrow: 0,
  })

  const scenario = tour.scenarios[scenarioKey]
  const readyProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? productAt(products, 0),
    [products, selectedId],
  )
  const customProduct = productAt(products, 2)
  const borrowProduct = productAt(products, 1)
  const hasCatalog = products.length > 0 && readyProduct && customProduct && borrowProduct

  function chooseScenario(next: ScenarioKey) {
    setScenarioKey(next)
    setStep(0)
  }

  function advance() {
    if (step >= 4) {
      setUnlocked((current) => ({ ...current, [scenarioKey]: 0 }))
      setStep(0)
      return
    }
    const next = step + 1
    setUnlocked((current) => ({
      ...current,
      [scenarioKey]: Math.max(current[scenarioKey], next),
    }))
    setStep(next)
  }

  function selectReadyProduct(id: string) {
    setSelectedId(id)
    setReadySize(tour.ready.oneSize)
    setUnlocked((current) => ({ ...current, ready: Math.min(current.ready, 1) }))
    if (scenarioKey === 'ready' && step > 1) setStep(1)
  }

  if (!hasCatalog) {
    return (
      <Container className="py-16">
        <Notice tone="error" title={tour.needsCatalog}>
          {error ?? tour.noProducts}
        </Notice>
      </Container>
    )
  }

  return (
    <div className="pb-24">
      <Container>
        <PageHeader
          title={tour.title}
          description={tour.description}
          actions={
            <Tag tone="outline" size="md">
              {tour.sampleStates}
            </Tag>
          }
        />

        {error ? (
          <Notice tone="warning" className="mb-6">
            {error}
          </Notice>
        ) : null}

        <div role="tablist" aria-label={tour.paths} className="flex flex-wrap gap-1.5">
          {SCENARIO_KEYS.map((key) => {
            const active = key === scenarioKey
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseScenario(key)}
                className={cn(
                  'inline-flex h-9 items-center rounded-sm border px-3 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-card text-ink hover:border-ink',
                )}
              >
                {tour.scenarios[key].name}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-muted">{scenario.description}</p>

        <section className="mt-6">
          <ol
            className="hairline flex items-center gap-1 overflow-x-auto pt-4"
            aria-label={tour.stepsLabel(scenario.name)}
          >
            {scenario.steps.map((item, index) => {
              const locked = index > unlocked[scenarioKey]
              return (
                <li key={item.label} className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStep(index)}
                    disabled={locked}
                    aria-current={index === step ? 'step' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-2 rounded-sm px-2 text-[12px] font-medium transition-colors',
                      index === step ? 'bg-ink text-paper' : 'text-muted hover:bg-mist',
                      locked && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                    )}
                  >
                    <span
                      className={cn(
                        'tabular inline-flex size-5 items-center justify-center rounded-full border text-[11px]',
                        index === step ? 'border-paper/40' : 'border-line',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                  {index < scenario.steps.length - 1 ? (
                    <span aria-hidden className="h-px w-4 bg-line" />
                  ) : null}
                </li>
              )
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="display text-2xl md:text-3xl">{scenario.steps[step]?.title}</h2>
            <p className="text-[13px] text-muted">{scenario.steps[step]?.description}</p>
          </div>

          <div className="mt-5 min-h-[20rem]">
            {scenarioKey === 'ready' ? (
              <ReadyStage
                step={step}
                products={products}
                product={readyProduct}
                look={sampleLook}
                selectedId={readyProduct.id}
                onSelect={selectReadyProduct}
                query={query}
                onQuery={setQuery}
                selectedSize={readySize}
                onSelectedSize={setReadySize}
              />
            ) : null}
            {scenarioKey === 'custom' ? (
              <CustomStage
                step={step}
                product={customProduct}
                brief={brief}
                onBrief={setBrief}
                referenceName={referenceName}
                onReference={setReferenceName}
              />
            ) : null}
            {scenarioKey === 'borrow' ? (
              <BorrowStage
                step={step}
                product={borrowProduct}
                look={sampleLook}
                selectedSize={borrowSize}
                onSelectedSize={setBorrowSize}
              />
            ) : null}
          </div>

          <div className="hairline mt-6 flex flex-wrap items-center justify-between gap-4 pt-4">
            <Button
              variant="ghost"
              icon={<ArrowLeft />}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
            >
              {t.common.back}
            </Button>
            <Button iconEnd={<ArrowRight />} onClick={advance}>
              {scenario.actions[step]}
            </Button>
          </div>
          <div className="mt-4">
            <OutcomeStrip scenario={scenarioKey} step={step} />
          </div>
        </section>

        <div className="hairline mt-10 grid gap-4 pt-6 md:grid-cols-3">
          {tour.outcomes.map((outcome) => (
            <div key={outcome.title}>
              <p className="text-[14px] font-medium">{outcome.title}</p>
              <p className="text-[13px] text-muted">{outcome.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Button href="/me" variant="secondary">
            {tour.wardrobe}
          </Button>
        </div>
      </Container>
    </div>
  )
}
