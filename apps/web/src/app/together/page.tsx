/**
 * /together — the judges' prototype tour: Ready Now, Made for You and Borrow a Look walked on live
 * catalog products with sample fulfilment states. Reached from the footer, not the primary nav.
 */
import type { Metadata } from 'next'
import { brands, desc, eq, gt, lookProducts, looks, products, users } from '@lookline/db'
import {
  JourneyPrototype,
  type JourneyLook,
  type JourneyProduct,
} from '@/components/together/journey'
import { getI18n } from '@/i18n/server'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.social.tour.title, description: t.social.tour.metaDescription }
}

interface JourneyData {
  products: JourneyProduct[]
  sampleLook: JourneyLook | null
  error: string | null
}

async function loadJourneyData(unavailable: string): Promise<JourneyData> {
  const { db } = getDb()
  try {
    const [lookRow] = await db
      .select({
        id: looks.id,
        title: looks.title,
        ownerName: users.displayName,
        ownerHandle: users.handle,
        ownerAvatarSeed: users.avatarSeed,
      })
      .from(looks)
      .innerJoin(users, eq(looks.ownerId, users.id))
      .orderBy(desc(looks.createdAt))
      .limit(1)

    const lookRows = lookRow
      ? await db
          .select({ product: products, brandName: brands.name, position: lookProducts.position })
          .from(lookProducts)
          .innerJoin(products, eq(lookProducts.productId, products.id))
          .innerJoin(brands, eq(products.brandId, brands.id))
          .where(eq(lookProducts.lookId, lookRow.id))
          .orderBy(lookProducts.position)
      : []

    const catalogRows = await db
      .select({ product: products, brandName: brands.name })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(gt(products.stock, 0))
      .orderBy(desc(products.trendScore), desc(products.popularity))
      .limit(8)

    const deduped = new Map<number, JourneyProduct>()
    for (const row of [...lookRows, ...catalogRows]) {
      if (deduped.has(row.product.id)) continue
      deduped.set(row.product.id, {
        id: row.product.id,
        name: row.product.name,
        brandName: row.brandName,
        price: row.product.price,
        colorName: row.product.colorName,
        colorHex: row.product.colorHex,
        material: row.product.material,
        pattern: row.product.pattern,
        subcategory: row.product.subcategory,
        sizes: row.product.sizes,
        stock: row.product.stock,
      })
    }

    return {
      products: [...deduped.values()].slice(0, 6),
      sampleLook: lookRow
        ? {
            id: lookRow.id,
            title: lookRow.title,
            ownerName: lookRow.ownerName,
            ownerHandle: lookRow.ownerHandle,
            ownerAvatarSeed: lookRow.ownerAvatarSeed,
          }
        : null,
      error: null,
    }
  } catch (error) {
    console.error('[together] could not load journey catalog', error)
    return {
      products: [],
      sampleLook: null,
      error: unavailable,
    }
  }
}

export default async function TogetherHubPage() {
  const { t } = await getI18n()
  const data = await loadJourneyData(t.social.tour.catalogUnavailable)
  return <JourneyPrototype {...data} />
}
