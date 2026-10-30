import { build } from 'esbuild'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { makeOfflinePage } from './offline-page.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const result = await build({ entryPoints: [resolve(root, 'src/official-preview/main.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'none' })
const css = await readFile(resolve(root, 'src/official-preview/style.css'), 'utf8')
const html = makeOfflinePage(css, result.outputFiles[0].text, 'v2.6.7')
const directory = resolve(root, 'deliverables/Murata-Step6-v2_6_7-offline')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'Passive-PN-Translator-v2_6_7.html'), '\uFEFF' + html, 'utf8')
console.log('Saved offline webpage v2.6.7 with selected quotation clipboard rows. Previous versions are preserved.')
