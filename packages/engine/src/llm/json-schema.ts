/**
 * zod → JSON schema for provider structured output. OpenAI strict mode needs every property in
 * `required` and `additionalProperties: false`; optional properties are therefore emitted as
 * nullable and `stripOptionalNulls` removes those nulls again before zod validation.
 */
import { z } from 'zod'

type Json = Record<string, unknown>

const DROP_KEYS = new Set([
  '$schema',
  'default',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'multipleOf',
  'propertyNames',
  'examples',
  'id',
  '$id',
])

const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x)

const allowsNull = (node: Json): boolean => {
  if (node.type === 'null') return true
  if (Array.isArray(node.type) && node.type.includes('null')) return true
  const variants = (node.anyOf ?? node.oneOf) as unknown
  return Array.isArray(variants) && variants.some((v) => isObj(v) && allowsNull(v))
}

/** Marker key: property names made nullable because they were optional in the zod schema. */
const OPTIONAL_KEY = '__optionalKeys'

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify)
  if (!isObj(node)) return node
  const out: Json = {}
  for (const [k, v] of Object.entries(node)) {
    if (DROP_KEYS.has(k)) continue
    out[k] = v
  }
  if (isObj(out.properties)) {
    const props: Json = {}
    const required = new Set(Array.isArray(out.required) ? (out.required as string[]) : [])
    const optional: string[] = []
    for (const [name, prop] of Object.entries(out.properties)) {
      let cleaned = strictify(prop)
      if (!required.has(name)) {
        optional.push(name)
        if (isObj(cleaned) && !allowsNull(cleaned)) {
          cleaned = { anyOf: [cleaned, { type: 'null' }] }
        }
      }
      props[name] = cleaned
    }
    out.properties = props
    out.required = Object.keys(props)
    out.additionalProperties = false
    if (optional.length > 0) out[OPTIONAL_KEY] = optional
    if (out.type === undefined) out.type = 'object'
  }
  for (const key of ['items', 'additionalProperties', 'not'] as const) {
    if (key in out && isObj(out[key])) out[key] = strictify(out[key])
  }
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(strictify)
  }
  for (const key of ['$defs', 'definitions'] as const) {
    if (isObj(out[key])) {
      const defs: Json = {}
      for (const [n, d] of Object.entries(out[key] as Json)) defs[n] = strictify(d)
      out[key] = defs
    }
  }
  return out
}

function withoutMarkers(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutMarkers)
  if (!isObj(node)) return node
  const out: Json = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === OPTIONAL_KEY) continue
    out[k] = withoutMarkers(v)
  }
  return out
}

export interface PreparedSchema {
  /** Strict JSON schema (all properties required, no additional properties). */
  jsonSchema: Json
  /** Removes `null` from properties that were optional in the zod schema. */
  stripOptionalNulls: (data: unknown) => unknown
}

/** zod → strict JSON schema plus the null-stripping companion. */
export function prepareSchema(schema: z.ZodType): PreparedSchema {
  const raw = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as Json
  const marked = strictify(raw) as Json
  const defs = (marked.$defs ?? marked.definitions ?? {}) as Json

  const resolve = (node: Json): Json => {
    const ref = node.$ref
    if (typeof ref === 'string') {
      const name = ref.split('/').pop() ?? ''
      const target = defs[name]
      return isObj(target) ? target : node
    }
    return node
  }

  const strip = (data: unknown, node: unknown, depth: number): unknown => {
    if (depth > 32 || !isObj(node)) return data
    const n = resolve(node)
    if (Array.isArray(data)) {
      const items = isObj(n.items) ? n.items : undefined
      return items ? data.map((d) => strip(d, items, depth + 1)) : data
    }
    if (isObj(data)) {
      const variants = (n.anyOf ?? n.oneOf) as unknown
      if (Array.isArray(variants)) {
        const objectVariant = variants.find((v) => isObj(v) && isObj(resolve(v).properties))
        if (objectVariant) return strip(data, objectVariant, depth + 1)
        return data
      }
      if (!isObj(n.properties)) return data
      const optional = new Set(Array.isArray(n[OPTIONAL_KEY]) ? (n[OPTIONAL_KEY] as string[]) : [])
      const out: Json = {}
      for (const [k, v] of Object.entries(data)) {
        if (v === null && optional.has(k)) continue
        const prop = (n.properties as Json)[k]
        out[k] = strip(v, prop, depth + 1)
      }
      return out
    }
    return data
  }

  return {
    jsonSchema: withoutMarkers(marked) as Json,
    stripOptionalNulls: (data) => strip(data, marked, 0),
  }
}
