import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Script } from 'node:vm'
import { buildTextDelta } from './offline-delta.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, 'deliverables/Murata-Step6-v2_6-offline')
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const base = await readFile(resolve(root, 'deliverables/Murata-Step5-v2_5_1-offline/Passive-PN-Translator-v2_5_1.html'))
const target = await readFile(resolve(directory, 'Passive-PN-Translator-v2_6.html'))
const baseSha256 = sha(base)
const targetSha256 = sha(target)
if (baseSha256 !== 'E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22' ||
    targetSha256 !== 'CF2D7A2617B4004D40DBFA934FFF277F8BFA8323ABFED1A8DEEC1C13BDA6D8F4') {
  throw new Error('Only the reviewed original v2.5.1 and v2.6 artifacts may be packaged.')
}
const html = target.toString('utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
if (scripts.length !== 2 || !html.includes("connect-src 'none'") || !html.includes('PNREP_V2_6_FILE_END')) throw new Error('Unexpected standalone HTML structure.')
for (const script of scripts) new Script(script[1])
const oldText = base.toString('utf8')
const newText = target.toString('utf8')
const operations = buildTextDelta(oldText, newText)
const reconstructed = operations.map(op => op.copy ? oldText.slice(op.copy[0], op.copy[0] + op.copy[1]) : op.insert).join('')
if (!Buffer.from(reconstructed).equals(target)) throw new Error('Delta reconstruction mismatch.')
const patch = Buffer.from(JSON.stringify({
  format: 'pnrep-text-delta-v1', baseVersion: 'v2.5.1', targetVersion: 'v2.6',
  baseSha256, targetSha256, baseByteLength: base.length, targetByteLength: target.length, operations
}) + '\n')
const patchName = 'Passive-PN-Translator-v2_5_1-to-v2_6.patch.json'
const updaterName = 'Upgrade-PassiveTranslator-v2_6.ps1'
let updater = await readFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_5_1.template.ps1'), 'utf8')
updater = updater.replaceAll('E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22', targetSha256)
  .replaceAll('38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC', baseSha256)
  .replaceAll('511208', String(target.length)).replaceAll('509010', String(base.length))
  .replaceAll('v2_5_1', 'v2_6').replaceAll('v2_5-to-v2_6', 'v2_5_1-to-v2_6')
  .replaceAll('v2.5', 'v2.5.1').replace('__PATCH_HASH__', sha(patch))
const converter = await readFile(resolve(root, 'scripts/Convert-MurataDatabase-v3_4.ps1'))
const prepareTemplate = await readFile(resolve(root, 'scripts/Prepare-MurataFullCatalog.template.ps1'), 'utf8')
const prepare = Buffer.from('\uFEFF' + prepareTemplate.replace('__CONVERTER_HASH__', sha(converter)))
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, patchName), patch)
await writeFile(resolve(directory, updaterName), updater)
await copyFile(resolve(root, 'scripts/Convert-MurataDatabase-v3_4.ps1'), resolve(directory, 'Convert-MurataDatabase-v3_4.ps1'))
await writeFile(resolve(directory, 'Prepare-MurataFullCatalog.ps1'), prepare)
const contents = [[patchName, patch], [updaterName, Buffer.from(updater)], ['Convert-MurataDatabase-v3_4.ps1', converter], ['Prepare-MurataFullCatalog.ps1', prepare], ['Passive-PN-Translator-v2_6.html', target]]
await writeFile(resolve(directory, 'SHA256SUMS.txt'), contents.map(([name, bytes]) => sha(bytes) + '  ' + name + '\n').join(''))
console.log(JSON.stringify({ patchBytes: patch.length, updaterBytes: Buffer.byteLength(updater), converterBytes: converter.length, prepareBytes: prepare.length, patchSha256: sha(patch), targetSha256, syntaxCheckedScripts: scripts.length }))
