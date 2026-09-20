import { createHash, createHmac } from 'node:crypto'

const PREFIX = 'looks/'
const apply = process.argv.includes('--apply')
const environment = valueAfter('--environment') ?? 'production'
const accountId = process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID
const accessKey = process.env.R2_ACCESS_KEY_ID
const secretKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET ?? 'lookline-media'

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (!accountId || !accessKey || !secretKey) {
  throw new Error(
    'Set R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.',
  )
}

const endpoint = `${accountId}.r2.cloudflarestorage.com`
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest()
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
const pathFor = (key = '') =>
  `/${encode(bucket)}${key ? `/${key.split('/').map(encode).join('/')}` : ''}`

function signedRequest(method: 'GET' | 'DELETE', path: string, query: URLSearchParams): Request {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const payloadHash = hash('')
  const canonicalQuery = [...query.entries()]
    .toSorted(
      ([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue),
    )
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&')
  const canonicalHeaders = `host:${endpoint}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonical = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${day}/auto/s3/aws4_request`
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonical)}`
  const dateKey = hmac(`AWS4${secretKey}`, day)
  const regionKey = hmac(dateKey, 'auto')
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const url = `https://${endpoint}${path}${canonicalQuery ? `?${canonicalQuery}` : ''}`
  return new Request(url, {
    method,
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  })
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

async function listKeys(): Promise<string[]> {
  const keys: string[] = []
  let continuation: string | undefined
  do {
    const query = new URLSearchParams({ 'list-type': '2', prefix: PREFIX })
    if (continuation) query.set('continuation-token', continuation)
    const response = await fetch(signedRequest('GET', pathFor(), query))
    const xml = await response.text()
    if (!response.ok) throw new Error(`R2 list failed (${response.status}): ${xml.slice(0, 300)}`)
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g))
      keys.push(decodeXml(match[1] ?? ''))
    continuation = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
    if (continuation) continuation = decodeXml(continuation)
  } while (continuation)
  return keys.filter((key) => key.startsWith(PREFIX))
}

async function deleteKey(key: string): Promise<void> {
  if (!key.startsWith(PREFIX)) throw new Error(`Refusing to delete key outside ${PREFIX}: ${key}`)
  const response = await fetch(signedRequest('DELETE', pathFor(key), new URLSearchParams()))
  if (!response.ok) throw new Error(`R2 delete failed for ${key} (${response.status})`)
}

const keys = await listKeys()
console.log(
  `environment=${environment} bucket=${bucket} prefix=${PREFIX} mode=${apply ? 'apply' : 'dry-run'}`,
)
for (const key of keys) console.log(`${apply ? 'delete' : 'would-delete'} ${key}`)
if (apply) for (const key of keys) await deleteKey(key)
console.log(`${apply ? 'deleted' : 'matched'}=${keys.length} environment=${environment}`)
