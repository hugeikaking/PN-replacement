import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Script } from 'node:vm'
import { buildTextDelta } from './offline-delta.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, 'deliverables/Murata-Step6-v2_6_2-offline')
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const base = await readFile(resolve(root, 'deliverables/Murata-Step6-v2_6_1-offline/Passive-PN-Translator-v2_6_1.html'))
const target = await readFile(resolve(directory, 'Passive-PN-Translator-v2_6_2.html'))
const baseSha256 = sha(base), targetSha256 = sha(target)
if (baseSha256 !== 'A0299EA42168DC659F906324C8A9DE3C3CE151C867FEC014929B7A5E606E2061') throw new Error('Original v2.6.1 base changed.')
const html = target.toString('utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
if (scripts.length !== 2 || !html.includes("connect-src 'none'") || !html.includes('PNREP_V2_6_2_FILE_END') || !html.includes('<title>物料与料号互译 · v2.6.2</title>')) throw new Error('Unexpected standalone structure/version.')
for (const script of scripts) new Script(script[1])
const oldText = base.toString('utf8'), newText = target.toString('utf8')
const operations = buildTextDelta(oldText, newText)
const reconstructed = operations.map(op => op.copy ? oldText.slice(op.copy[0], op.copy[0] + op.copy[1]) : op.insert).join('')
if (!Buffer.from(reconstructed).equals(target)) throw new Error('Delta reconstruction mismatch.')
const patch = Buffer.from(JSON.stringify({ format: 'pnrep-text-delta-v1', baseVersion: 'v2.6.1', targetVersion: 'v2.6.2', baseSha256, targetSha256, baseByteLength: base.length, targetByteLength: target.length, operations }) + '\n')
const patchName = 'Passive-PN-Translator-v2_6_1-to-v2_6_2.patch.json'
const updaterName = 'Upgrade-PassiveTranslator-v2_6_2.ps1'
let updater = await readFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_5_1.template.ps1'), 'utf8')
updater = updater.replaceAll('38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC', baseSha256)
 .replaceAll('E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22', targetSha256)
 .replaceAll('509010', String(base.length)).replaceAll('511208', String(target.length))
 .replaceAll('Passive-PN-Translator-v2_5-to-v2_5_1.patch.json', patchName)
 .replaceAll('Passive-PN-Translator-v2_5_1.html', 'Passive-PN-Translator-v2_6_2.html')
 .replaceAll('v2.5', 'v2.6.1').replace('__PATCH_HASH__', sha(patch))
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, patchName), patch)
await writeFile(resolve(directory, updaterName), updater)
await writeFile(resolve(directory, '升级说明.txt'), '\uFEFF' + await readFile(resolve(root, 'docs/MURATA_COMPACT_RESULTS_V2_6_2.md'), 'utf8'))
const contents = [[patchName, patch], [updaterName, Buffer.from(updater)], ['Passive-PN-Translator-v2_6_2.html', target]]
await writeFile(resolve(directory, 'SHA256SUMS.txt'), contents.map(([name, bytes]) => sha(bytes) + '  ' + name + '\n').join(''))
console.log(JSON.stringify({ patchBytes: patch.length, updaterBytes: Buffer.byteLength(updater), targetBytes: target.length, targetSha256, patchSha256: sha(patch), syntaxCheckedScripts: scripts.length }))
