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
