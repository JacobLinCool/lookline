import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('./', import.meta.url)
const dist = new URL('dist/', root)
const types = { webp: 'image/webp', woff2: 'font/woff2' }

async function inlineAssets(text) {
  const references = [...new Set(text.match(/assets\/[\w.-]+\.(?:webp|woff2)/g) ?? [])]
  for (const reference of references) {
    const content = await readFile(new URL(reference, dist))
    const type = types[reference.split('.').at(-1)]
    text = text.replaceAll(reference, `data:${type};base64,${content.toString('base64')}`)
  }
  return text
}

let html = await readFile(new URL('index.html', dist), 'utf8')
const css = await inlineAssets(await readFile(new URL('styles.css', dist), 'utf8'))
const js = await readFile(new URL('deck.js', dist), 'utf8')
const license = await readFile(new URL('assets/FONT-LICENSE.txt', dist), 'utf8')
html = html
  .replace(/<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/, `<style>${css}</style>`)
  .replace(/<script\s+src="deck\.js"\s+defer><\/script>/, '')
  .replace('</body>', `<script>${js.replaceAll('</script', '<\\/script')}</script>\n</body>`)
  .replace(
    '</head>',
    `<!-- Bundled Geist font license:\n${license.replaceAll('--', '—')}-->\n</head>`,
  )
await writeFile(new URL('LookLine.html', root), await inlineAssets(html))
console.log('Created presentation/LookLine.html')
