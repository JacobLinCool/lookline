/**
 * Read `articles.csv` into the fields the recommender actually uses.
 *
 * The file ships 25 columns; 11 of them are numeric codes duplicating a name column we keep, and
 * `department_no`/`department_name` describe H&M's buying organisation (299 codes sharing 250
 * names, so the name is not even a key) rather than the garment — `garment_group_name` already
 * carries the fabric-and-construction signal those two would add. Both groups are dropped.
 */
import { readFileSync } from 'node:fs'
import {
  COLOUR_HEX,
  type Department,
  type OutfitRole,
  canonicalType,
  department,
  orNull,
  outfitRole,
} from './taxonomy'

export interface Article {
  /** 10 characters, always leading-zero padded (`0108775015`). Never parse as a number. */
  articleId: string
  /** First 7 characters of `article_id`: one garment, its colourways share it. */
  productCode: string
  name: string
  /** Missing on 416 rows. */
  description: string | null
  /** `product_type_name`, spelling variants merged. */
  productType: string
  productGroup: string
  /** Fabric and construction (`Jersey Basic`, `Knitwear`, `Trousers Denim`); `Unknown` on 3873. */
  garmentGroup: string | null
  /** Merchandising shelf (`Womens Everyday Basics`), useful for style clustering. */
  section: string | null
  /** The only size signal in the file: child rows read `Children Sizes 92-140`. */
  indexName: string
  /** Kept raw as well as mapped: `Sport` is how sportswear is identified. */
  indexGroupName: string
  /** Derived from `index_group_name`, the file's only gender signal. */
  department: Department
  /** Derived from `product_group_name` + `product_type_name`. */
  outfitRole: OutfitRole
  colourName: string | null
  colourHex: string | null
  /** `perceived_colour_master_name`: 20 coarse families, for "something blue". */
  colourFamily: string | null
  /** `perceived_colour_value_name`: Dark / Light / Bright …, for light-vs-dark pairing. */
  colourValue: string | null
  /** `graphical_appearance_name`: Solid, Stripe, Check … */
  pattern: string | null
}

/** RFC 4180 row split. No field in articles.csv spans lines, so one line is one row. */
function parseRow(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (line[i + 1] === '"') {
        field += '"'
        i += 1
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

/** Map one raw row (keyed by the CSV header) to an `Article`. */
export function toArticle(raw: Record<string, string | undefined>): Article {
  const at = (column: string): string => raw[column] ?? ''
  const colourName = orNull(at('colour_group_name'))
  return {
    articleId: at('article_id'),
    productCode: at('product_code'),
    name: at('prod_name'),
    description: orNull(at('detail_desc')),
    productType: canonicalType(at('product_type_name')),
    productGroup: at('product_group_name'),
    garmentGroup: orNull(at('garment_group_name')),
    section: orNull(at('section_name')),
    indexName: at('index_name'),
    indexGroupName: at('index_group_name'),
    department: department(at('index_group_name')),
    outfitRole: outfitRole(at('product_group_name'), at('product_type_name')),
    colourName,
    colourHex: colourName ? (COLOUR_HEX[colourName] ?? null) : null,
    colourFamily: orNull(at('perceived_colour_master_name')),
    colourValue: orNull(at('perceived_colour_value_name')),
    pattern: orNull(at('graphical_appearance_name')),
  }
}

/** ponytail: whole file in memory — 36 MB. transactions_train.csv is aggregated offline instead. */
export function loadArticles(path: string): Article[] {
  const lines = readFileSync(path, 'utf8').split('\n')
  const header = parseRow(lines[0] ?? '')
  const articles: Article[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.replace(/\r$/, '')
    if (!line) continue
    const cells = parseRow(line)
    const row: Record<string, string> = {}
    for (let c = 0; c < header.length; c += 1) row[header[c] ?? ''] = cells[c] ?? ''
    articles.push(toArticle(row))
  }
  return articles
}

/** `images/010/0108775015.jpg` — the folder is the id's first three characters. */
export function imagePath(articleId: string): string {
  return `images/${articleId.slice(0, 3)}/${articleId}.jpg`
}
