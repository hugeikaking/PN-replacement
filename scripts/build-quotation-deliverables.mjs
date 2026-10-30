import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Script } from 'node:vm'
import { buildTextDelta } from './offline-delta.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, 'deliverables/Murata-Step6-v2_6_7-offline')
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const base = await readFile(resolve(root, 'deliverables/Murata-Step6-v2_6_6-offline/Passive-PN-Translator-v2_6_6.html'))
const target = await readFile(resolve(directory, 'Passive-PN-Translator-v2_6_7.html'))
const baseSha256 = sha(base), targetSha256 = sha(target)
if (baseSha256 !== '376F4DD1CB98B2EDC8D49669B937A0E6F77BFD7F8982E26A1B0DCC8D1F2CD1BC') throw new Error('Original v2.6.6 base changed.')
const html = target.toString('utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
if (scripts.length !== 2 || !html.includes("connect-src 'none'") || !html.includes('PNREP_V2_6_7_FILE_END') || !html.includes('<title>物料与料号互译 · v2.6.7</title>')) throw new Error('Unexpected standalone structure/version.')
for (const script of scripts) new Script(script[1])
const oldText = base.toString('utf8'), newText = target.toString('utf8')
const operations = buildTextDelta(oldText, newText)
const reconstructed = operations.map(op => op.copy ? oldText.slice(op.copy[0], op.copy[0] + op.copy[1]) : op.insert).join('')
if (!Buffer.from(reconstructed).equals(target)) throw new Error('Delta reconstruction mismatch.')
const patch = Buffer.from(JSON.stringify({ format: 'pnrep-text-delta-v1', baseVersion: 'v2.6.6', targetVersion: 'v2.6.7', baseSha256, targetSha256, baseByteLength: base.length, targetByteLength: target.length, operations }) + '\n')
const patchName = 'Passive-PN-Translator-v2_6_6-to-v2_6_7.patch.json'
const updaterName = 'Upgrade-PassiveTranslator-v2_6_7.ps1'
let updater = await readFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_5_1.template.ps1'), 'utf8')
updater = updater.replaceAll('38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC', baseSha256)
 .replaceAll('E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22', targetSha256)
 .replaceAll('509010', String(base.length)).replaceAll('511208', String(target.length))
 .replaceAll('Passive-PN-Translator-v2_5-to-v2_5_1.patch.json', patchName)
 .replaceAll('Passive-PN-Translator-v2_5_1.html', 'Passive-PN-Translator-v2_6_7.html')
 .replaceAll('v2.5', 'v2.6.6').replace('__PATCH_HASH__', sha(patch))
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, patchName), patch)
await writeFile(resolve(directory, updaterName), updater)
await writeFile(resolve(directory, '升级说明.txt'), '\uFEFF' + await readFile(resolve(root, 'docs/MURATA_QUOTATION_V2_6_7.md'), 'utf8'))
const contents = [[patchName, patch], [updaterName, Buffer.from(updater)], ['Passive-PN-Translator-v2_6_7.html', target]]
await writeFile(resolve(directory, 'SHA256SUMS.txt'), contents.map(([name, bytes]) => sha(bytes) + '  ' + name + '\n').join(''))
let tests = await readFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_6_6.Tests.ps1'), 'utf8')
tests = tests.replaceAll('v2_6_6', '__NEW_RELEASE__').replaceAll('v2_6_5', 'v2_6_6').replaceAll('__NEW_RELEASE__', 'v2_6_7')
 .replaceAll('v2.6.6', '__NEW_DOT_RELEASE__').replaceAll('v2.6.5', 'v2.6.6').replaceAll('__NEW_DOT_RELEASE__', 'v2.6.7')
 .replaceAll(baseSha256, targetSha256)
await writeFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_6_7.Tests.ps1'), tests)
console.log(JSON.stringify({ patchBytes: patch.length, updaterBytes: Buffer.byteLength(updater), targetBytes: target.length, targetSha256, patchSha256: sha(patch), syntaxCheckedScripts: scripts.length }))
