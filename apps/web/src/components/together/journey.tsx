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
import { cn } from '@/lib/cn'

export interface JourneyProduct {
  id: string
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

interface Scenario {
  key: ScenarioKey
  name: string
  short: string
  description: string
  steps: Array<{ label: string; title: string; description: string }>
  actions: string[]
}

const SCENARIOS: Scenario[] = [
  {
    key: 'ready',
    name: 'Ready Now',
    short: 'Find it. Try it. Own it.',
    description: 'A real piece, previewed, bought, then a card.',
    steps: [
      {
        label: 'Ask',
        title: 'Say what you want',
        description: 'Natural language starts the search.',
      },
      {
        label: 'Choose',
        title: 'Pick an exact product',
        description: 'Every option is a real catalog item.',
      },
      {
        label: 'Preview',
        title: 'See it on your terms',
        description: 'The image is useful, but not owned yet.',
      },
      {
        label: 'Buy',
        title: 'Confirm the real variant',
        description: 'Size, price and availability stay attached.',
      },
      {
        label: 'Collect',
        title: 'Unlock your Look Card',
        description: 'Ownership creates the collectible.',
      },
    ],
    actions: [
      'Find exact articles',
      'Open virtual preview',
      'Continue to checkout',
      'Confirm sample order',
      'Restart this path',
    ],
  },
  {
    key: 'custom',
    name: 'Made for You',
    short: 'Turn unmet intent into a product.',
    description: 'Orderable only after a base pattern and a review.',
    steps: [
      {
        label: 'Brief',
        title: 'Describe the difference',
        description: 'Text and references capture intent.',
      },
      {
        label: 'Ground',
        title: 'Choose a real base pattern',
        description: 'The request starts from something manufacturable.',
      },
      {
        label: 'Confirm',
        title: 'Review feasibility and quote',
        description: 'Approved details replace guesswork.',
      },
      {
        label: 'Order',
        title: 'Approve the custom SKU',
        description: 'The specification is fixed before payment.',
      },
      {
        label: 'Edition',
        title: 'Receive a distinct card',
        description: 'The card reflects the real production promise.',
      },
    ],
    actions: [
      'Create the brief',
      'Review the base pattern',
      'Accept the sample quote',
      'Confirm custom order',
      'Restart this path',
    ],
  },
  {
    key: 'borrow',
    name: 'Borrow a Look',
    short: 'Try what your Circle already loves.',
    description: 'Borrow a friend’s purchased piece digitally, then buy your own.',
    steps: [
      {
        label: 'Wardrobe',
        title: 'Enter the Circle Wardrobe',
        description: 'Only owner-shared purchases appear.',
      },
      {
        label: 'Borrow',
        title: 'Wear it digitally',
        description: 'The exact product enters your preview.',
      },
      {
        label: 'Offer',
        title: 'Get a Circle opportunity',
        description: 'A clear saving follows a useful try-on.',
      },
      {
        label: 'Own',
        title: 'Buy your own piece',
        description: 'Your order never changes your friend’s ownership.',
      },
      {
        label: 'Continue',
        title: 'Make the trend yours',
        description: 'Your card can move through another Circle.',
      },
    ],
    actions: [
      'Borrow this item',
      'Open digital try-on',
      'Use the Circle offer',
      'Confirm sample purchase',
      'Restart this path',
    ],
  },
]

const EXAMPLES = [
  'A sharp black layer for a gallery opening',
  'Something relaxed for a late flight',
  'A coordinated look for a seaside wedding',
] as const

function scenarioByKey(key: ScenarioKey): Scenario {
  return SCENARIOS.find((scenario) => scenario.key === key) ?? SCENARIOS[0]!
}

function productAt(articles: JourneyProduct[], index: number): JourneyProduct | null {
  return articles[index] ?? articles[0] ?? null
}

function ProductFacts({ product }: { product: JourneyProduct }) {
  return (
    <dl className="grid grid-cols-2 border-y border-line text-[13px] sm:grid-cols-4">
      {[
        ['Color', product.colorName],
        ['Material', product.material],
        ['Pattern', product.pattern],
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
  articles,
  selectedId,
  onSelect,
}: {
  articles: JourneyProduct[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {articles.slice(0, 3).map((product) => {
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
            <ProductImage articleId={product.id} alt={product.name} priority className="mb-3" />
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <p className="mt-1 text-[14px] leading-snug font-medium">{product.name}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Price amount={product.price} size="sm" />
              {selected ? (
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Check className="size-3" /> Selected
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
  owner = 'You',
}: {
  product: JourneyProduct
  look: JourneyLook | null
  owner?: string
}) {
  return (
    <figure className="relative overflow-hidden rounded-md bg-mist">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-xs border border-line bg-card px-2 py-1 text-[12px] font-medium">
        <LockKeyhole className="size-3" /> Preview · not owned
      </div>
      <div className="grid min-h-[26rem] grid-cols-[minmax(0,1.25fr)_minmax(8rem,.75fr)]">
        {look ? (
          <img
            src={`/api/looks/${look.id}/image`}
            alt={`${look.title} styled preview`}
            width={720}
            height={960}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center bg-mist p-8">
            <ProductImage articleId={product.id} alt={product.name} className="w-full max-w-72" />
          </div>
        )}
        <figcaption className="flex flex-col justify-between border-l border-line bg-card p-5">
          <div>
            <p className="text-[12px] text-muted">Styled for</p>
            <p className="mt-1 font-display text-xl">{owner}</p>
          </div>
          <div>
            <span
              aria-hidden
              className="mb-3 block size-7 rounded-full border border-line"
              style={{ backgroundColor: product.colorHex }}
            />
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <p className="mt-1 font-display text-xl leading-tight">{product.name}</p>
            <p className="mt-2 text-[12px] text-muted">Catalog colour · {product.colorName}</p>
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
              alt={`Look Card for ${product.name}`}
              width={720}
              height={960}
              className="size-full object-cover"
            />
          ) : (
            <ProductImage articleId={product.id} alt={product.name} className="size-full" />
          )}
          <span className="absolute top-3 left-3 rounded-xs bg-card px-2 py-1 text-[12px] font-medium text-ink">
            Owned
          </span>
        </div>
        <figcaption className="flex items-end justify-between gap-4 p-3">
          <div>
            <p className="text-[11px] text-paper/70">Look Card</p>
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
            <p className="font-medium">Order confirmed</p>
            <Tag tone="outline">Sample</Tag>
          </div>
        </div>
        <label className="flex items-start gap-3 border-y border-line py-3 text-[13px]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-4 accent-ink"
          />
          Share this card with my Circle
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            icon={<Users />}
            variant="secondary"
            full
            disabled={!consent}
            onClick={() => setShareStatus('shared')}
          >
            Share to Circle
          </Button>
          <Button
            href={exportHref}
            download={`lookline-${product.id}.svg`}
            icon={<Download />}
            full
            onClick={() => setShareStatus('exported')}
          >
            Export image
          </Button>
        </div>
        {shareStatus === 'shared' ? <Notice tone="success">Shared with your Circle.</Notice> : null}
        {shareStatus === 'exported' ? <Notice tone="success">Download started.</Notice> : null}
      </div>
    </div>
  )
}

function CustomCardIssuing({ product }: { product: JourneyProduct }) {
  return (
    <div className="grid gap-7 md:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="rounded-md bg-mist p-3">
        <ProductImage articleId={product.id} alt={`${product.name} base pattern`} priority />
        <p className="mt-3 text-[12px] text-muted">Confirmed base pattern</p>
      </div>
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">
            <Sparkles className="size-4" />
          </span>
          <div className="flex items-center gap-2">
            <p className="font-medium">Custom order confirmed · card issuing</p>
            <Tag tone="outline">Sample</Tag>
          </div>
        </div>
        <h3 className="mt-6 font-display text-2xl">
          The card follows the confirmed specification.
        </h3>
        <dl className="mt-6 divide-y divide-line border-y border-line text-[13px]">
          {[
            ['Base', product.name],
            ['Finish', 'Atelier-confirmed deep red treatment'],
            ['Graphic', 'Original one-color back embroidery'],
            ['Edition', 'Single-order custom production'],
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
  articles,
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
  articles: JourneyProduct[]
  product: JourneyProduct
  look: JourneyLook | null
  selectedId: string
  onSelect: (id: string) => void
  query: string
  onQuery: (value: string) => void
  selectedSize: string
  onSelectedSize: (value: string) => void
}) {
  if (step === 0) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,.8fr)]">
        <Field label="What are you dressing for?" htmlFor="ready-query">
          <Textarea
            id="ready-query"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            rows={5}
            placeholder="Occasion, mood, colour, budget"
          />
        </Field>
        <div className="border-l border-line pl-5">
          <p className="text-[13px] font-medium">Examples</p>
          <div className="mt-4 flex flex-col divide-y divide-line border-y border-line">
            {EXAMPLES.map((example) => (
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
            Live catalog results for “{query || EXAMPLES[0]}”
          </p>
          <Tag tone="outline">Live catalog</Tag>
        </div>
        <ProductChooser articles={articles} selectedId={selectedId} onSelect={onSelect} />
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
    const sizes = ['One size']
    return (
      <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <ProductImage articleId={product.id} alt={product.name} priority />
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <Price amount={product.price} size="lg" className="mt-2" />
          </div>
          <Field label="Size" htmlFor="ready-size">
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
            Keep private until I share it
          </label>
        </div>
      </div>
    )
  }

  return (
    <LookCardArtifact
      product={product}
      look={look}
      edition="Ready Now · owned SKU"
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
  const customPrice = product.price + 2800

  if (step === 0) {
    return (
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,.85fr)]">
        <div className="space-y-5">
          <Field label="What is missing from the catalog?" htmlFor="custom-brief">
            <Textarea
              id="custom-brief"
              value={brief}
              onChange={(event) => onBrief(event.target.value)}
              rows={5}
              placeholder="Keep the relaxed shape, but explore an embroidered back graphic and a deeper red finish."
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-dashed border-line p-4 hover:bg-mist/50">
            <span className="flex items-center gap-3">
              <Upload className="size-5" />
              <span>
                <span className="block text-[13px] font-medium">
                  {referenceName ?? 'Add an inspiration image'}
                </span>
                <span className="block text-[11px] text-muted">JPG or PNG · inspiration only</span>
              </span>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => onReference(event.target.files?.[0]?.name ?? null)}
            />
            <span className="text-[12px] underline underline-offset-4">Choose</span>
          </label>
        </div>
        <div className="rounded-md bg-mist p-5">
          <h3 className="text-[15px]">What happens next</h3>
          <ol className="mt-3 space-y-2 text-[13px] text-muted">
            <li>1. Match to a real base pattern</li>
            <li>2. Review material, finish, graphic</li>
            <li>3. Confirm rights, price, lead time</li>
          </ol>
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="grid gap-7 md:grid-cols-[12rem_minmax(0,1fr)]">
        <ProductImage articleId={product.id} alt={product.name} priority />
        <div className="space-y-5">
          <div>
            <Tag tone="outline">Base pattern · live catalog</Tag>
            <h3 className="mt-3 font-display text-3xl">{product.name}</h3>
            <p className="mt-2 text-[13px] text-muted">
              {product.brandName} · {product.subcategory} · {product.material}
            </p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {[
              ['Shape', 'Keep the existing base pattern'],
              ['Finish', 'Request an atelier palette review'],
              ['Graphic', 'Back placement · embroidery review'],
              ['Sizing', 'Use the base product size system'],
            ].map(([label, value]) => (
              <label key={label} className="flex items-center gap-3 py-3 text-[13px]">
                <input type="checkbox" defaultChecked className="size-4 accent-ink" />
                <span className="w-20 text-muted">{label}</span>
                <span className="font-medium">{value}</span>
              </label>
            ))}
          </div>
          <Notice tone="info">Review requests · confirmed by the atelier before purchase.</Notice>
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
              <p className="font-medium">Feasible with confirmed details</p>
              <Tag tone="outline">Sample</Tag>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-line border-y border-line text-[13px]">
            {[
              ['Base pattern', product.name],
              ['Finish', 'Atelier-confirmed deep red treatment'],
              ['Graphic', 'One-color back embroidery · original artwork only'],
              ['Production', '6–8 weeks after final artwork approval'],
              ['Edition', 'Single-order custom production'],
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
            Quote <Tag tone="outline">Sample</Tag>
          </div>
          <Price amount={customPrice} size="lg" className="mt-2" />
          <p className="mt-3 text-[12px] text-muted">Base garment, finish and embroidery</p>
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <h3 className="font-display text-2xl">Specification fixed.</h3>
          <p className="mt-2 text-[13px] text-muted">Changing a detail starts a new review.</p>
          <label className="mt-6 flex items-start gap-3 border-y border-line py-4 text-[13px]">
            <input type="checkbox" defaultChecked className="mt-0.5 size-4 accent-ink" />
            I own or may use the supplied graphic and references
          </label>
        </div>
        <div className="rounded-md bg-mist p-5">
          <p className="text-[12px] text-muted">Total</p>
          <Price amount={customPrice} size="lg" className="mt-2" />
          <p className="mt-5 text-[12px] text-muted">Estimated delivery · 6–8 weeks</p>
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
  const discounted = Math.round(product.price * 0.9)
  const saved = product.price - discounted
  const friendName = look?.ownerName ?? 'A Circle member'
  const friendHandle = look?.ownerHandle ?? 'circle'

  if (step === 0) {
    return (
      <div className="grid gap-7 md:grid-cols-[13rem_minmax(0,1fr)]">
        <ProductImage articleId={product.id} alt={product.name} priority />
        <div className="flex flex-col justify-center gap-5">
          <div className="flex items-center gap-3">
            <Avatar seed={look?.ownerAvatarSeed ?? 4107} name={friendName} size="md" />
            <div>
              <p className="font-medium">{friendName}</p>
              <p className="text-[12px] text-muted">@{friendHandle} shared this with your Circle</p>
            </div>
          </div>
          <div>
            <p className="text-[12px] text-muted">{product.brandName}</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <div className="mt-2 flex items-center gap-3">
              <Price amount={product.price} size="md" />
              <span className="text-[12px] text-muted">{product.colorName} · purchased item</span>
            </div>
          </div>
          <Notice tone="info">Digital borrow · {friendName} keeps the item.</Notice>
        </div>
      </div>
    )
  }

  if (step === 1)
    return <PreviewFrame product={product} look={look} owner="You · borrowed digitally" />

  if (step === 2) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <CircleDollarSign className="size-7" />
          <h3 className="mt-4 font-display text-3xl">Make it yours for 10% less.</h3>
          <p className="mt-2 text-[13px] text-muted">
            The exact product, its available variants only.
          </p>
        </div>
        <div className="rounded-md bg-mist p-5">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            Circle price <Tag tone="outline">Sample</Tag>
          </div>
          <Price amount={discounted} size="lg" className="mt-2" />
          <p className="mt-2 text-[12px] text-muted line-through">
            NT${product.price.toLocaleString('en-US')}
          </p>
          <p className="mt-5 border-t border-line pt-4 text-[12px]">
            Save NT${saved.toLocaleString('en-US')} · expires in 48 hours
          </p>
        </div>
      </div>
    )
  }

  if (step === 3) {
    const sizes = ['One size']
    return (
      <div className="grid gap-8 md:grid-cols-[10rem_minmax(0,1fr)]">
        <ProductImage articleId={product.id} alt={product.name} />
        <div className="space-y-5">
          <div>
            <p className="text-[12px] text-muted">Your own order</p>
            <h3 className="mt-1 font-display text-2xl">{product.name}</h3>
            <Price amount={discounted} size="lg" className="mt-2" />
          </div>
          <Field label="Size" htmlFor="borrow-size">
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
            {friendName} keeps theirs; this is your own order.
          </p>
        </div>
      </div>
    )
  }

  return (
    <LookCardArtifact
      product={product}
      look={look}
      edition="Circle path · owned SKU"
      variant={`${product.colorName} · ${selectedSize}`}
    />
  )
}

function OutcomeStrip({ scenario, step }: { scenario: ScenarioKey; step: number }) {
  const milestones = [
    { label: 'Physical product', active: scenario === 'custom' ? step >= 2 : true },
    { label: 'Preview', active: scenario === 'custom' ? step >= 2 : step >= 1 },
    { label: 'Order', active: step >= 3 },
    { label: 'Look Card', active: step >= 4 },
    { label: 'Circle', active: scenario === 'borrow' || step >= 4 },
  ]
  return (
    <ol
      className="grid grid-cols-5 overflow-hidden rounded-sm border border-line"
      aria-label="Physical-to-social milestones"
    >
      {milestones.map((milestone, index) => (
        <li
          key={milestone.label}
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
  articles,
  sampleLook,
  error,
}: {
  articles: JourneyProduct[]
  sampleLook: JourneyLook | null
  error: string | null
}) {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('ready')
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState<string>(EXAMPLES[0])
  const [brief, setBrief] = useState(
    'Keep the relaxed shape, but explore an original embroidered back graphic and a deeper red finish.',
  )
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(articles[0]?.id ?? null)
  const [readySize, setReadySize] = useState('One size')
  const [borrowSize, setBorrowSize] = useState('One size')
  const [unlocked, setUnlocked] = useState<Record<ScenarioKey, number>>({
    ready: 0,
    custom: 0,
    borrow: 0,
  })

  const scenario = scenarioByKey(scenarioKey)
  const readyProduct = useMemo(
    () => articles.find((product) => product.id === selectedId) ?? productAt(articles, 0),
    [articles, selectedId],
  )
  const customProduct = productAt(articles, 2)
  const borrowProduct = productAt(articles, 1)
  const hasCatalog = articles.length > 0 && readyProduct && customProduct && borrowProduct

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
    setReadySize('One size')
    setUnlocked((current) => ({ ...current, ready: Math.min(current.ready, 1) }))
    if (scenarioKey === 'ready' && step > 1) setStep(1)
  }

  if (!hasCatalog) {
    return (
      <Container className="py-16">
        <Notice tone="error" title="The journey prototype needs the live catalog.">
          {error ?? 'No purchasable catalog articles were found. Seed the catalog and reload.'}
        </Notice>
      </Container>
    )
  }

  return (
    <div className="pb-24">
      <Container>
        <PageHeader
          title="Prototype tour"
          description="Ready Now · Made for You · Borrow a Look, on live catalog data"
          actions={
            <Tag tone="outline" size="md">
              Sample states
            </Tag>
          }
        />

        {error ? (
          <Notice tone="warning" className="mb-6">
            {error}
          </Notice>
        ) : null}

        <div role="tablist" aria-label="Journey paths" className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((item) => {
            const active = item.key === scenarioKey
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseScenario(item.key)}
                className={cn(
                  'inline-flex h-9 items-center rounded-sm border px-3 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-card text-ink hover:border-ink',
                )}
              >
                {item.name}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-muted">{scenario.description}</p>

        <section className="mt-6">
          <ol
            className="hairline flex items-center gap-1 overflow-x-auto pt-4"
            aria-label={`${scenario.name} steps`}
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
                articles={articles}
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
              Back
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
          {[
            ['Before purchase', 'Preview only. Nothing is owned yet.'],
            ['After purchase', 'The confirmed order issues a Look Card.'],
            ['With a Circle', 'Owners share; friends borrow, then buy their own.'],
          ].map(([title, copy]) => (
            <div key={title}>
              <p className="text-[14px] font-medium">{title}</p>
              <p className="text-[13px] text-muted">{copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Button href="/me" variant="secondary">
            Open your wardrobe
          </Button>
        </div>
      </Container>
    </div>
  )
}
