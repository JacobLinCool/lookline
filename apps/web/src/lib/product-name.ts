/**
 * The name to print for an article: `articles.display_name` where the import wrote one, and
 * `prod_name` otherwise. H&M's own string is a merchandising string — `Tilly (1)` is the second
 * cut of a style and `RICHIE HOOD` is shouted — so every surface reads through here rather than
 * each one remembering which column to take.
 */
export function articleName(
  article: { name: string; displayName?: string | null },
  brandName?: string | null,
): string {
  return displayName(article.displayName || article.name, brandName)
}

/**
 * Catalog names carry the brand as a prefix ("Arlo Basics Aurora Mid-Rise Jeans"). When the brand
 * is already shown beside the name, drop the prefix so the name reads once.
 */
export function displayName(name: string, brandName?: string | null): string {
  if (!brandName) return name
  const brand = brandName.trim()
  if (!brand) return name
  const lower = name.toLowerCase()
  const prefix = brand.toLowerCase()
  if (lower.startsWith(prefix + ' ') && name.length > brand.length + 1) {
    return name.slice(brand.length + 1).trim()
  }
  return name
}
