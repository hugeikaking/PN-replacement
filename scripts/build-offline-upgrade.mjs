import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const basePath = resolve(root, 'deliverables/Murata-Step5-v2_5-offline/Passive-PN-Translator-v2_5.html')
const targetPath = resolve(root, 'deliverables/Murata-Step5-v2_5_1-offline/Passive-PN-Translator-v2_5_1.html')
const directory = resolve(root, 'deliverables/Murata-Step5-v2_5_1-upgrade')
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const base = await readFile(basePath)
const target = await readFile(targetPath)
const baseSha256 = sha(base)
const targetSha256 = sha(target)
if (baseSha256 !== '38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC' ||
    targetSha256 !== 'E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22') {
  throw new Error('Build requires the reviewed original v2.5 and v2.5.1 HTML.')
}
const oldText = base.toString('utf8')
const newText = target.toString('utf8')
// Reuse unchanged text from the local HTML. Insertions remain ordinary readable
// JSON strings; no executable patch commands or encoded payloads are generated.
const anchorLength = 24
const index = new Map()
for (let offset = 0; offset + anchorLength <= oldText.length; offset += 1) {
  const anchor = oldText.slice(offset, offset + anchorLength)
  const entries = index.get(anchor) ?? []
  if (entries.length < 64) entries.push(offset)
  index.set(anchor, entries)
}
const operations = []
let position = 0
let pending = 0
while (position < newText.length) {
  let bestOffset = -1
  let bestLength = 0
  const entries = index.get(newText.slice(position, position + anchorLength)) ?? []
  for (const offset of entries) {
    let length = anchorLength
    while (offset + length < oldText.length && position + length < newText.length &&
           oldText.charCodeAt(offset + length) === newText.charCodeAt(position + length)) length++
    if (length > bestLength) { bestOffset = offset; bestLength = length }
  }
  if (bestLength >= anchorLength) {
    if (pending < position) operations.push({ insert: newText.slice(pending, position) })
    operations.push({ copy: [bestOffset, bestLength] })
    position += bestLength
    pending = position
  } else position++
}
if (pending < newText.length) operations.push({ insert: newText.slice(pending) })
const reconstructed = operations.map(op => op.copy ? oldText.slice(op.copy[0], op.copy[0] + op.copy[1]) : op.insert).join('')
if (!Buffer.from(reconstructed, 'utf8').equals(target)) throw new Error('Delta reconstruction differs.')
const patch = Buffer.from(JSON.stringify({
  format: 'pnrep-text-delta-v1', baseVersion: 'v2.5', targetVersion: 'v2.5.1',
  baseSha256, targetSha256, baseByteLength: base.length, targetByteLength: target.length,
  operations
}) + '\n', 'utf8')
const patchSha = sha(patch)
const template = await readFile(resolve(root, 'scripts/Upgrade-PassiveTranslator-v2_5_1.template.ps1'), 'utf8')
if ((template.match(/__PATCH_HASH__/g) ?? []).length !== 1) throw new Error('Expected one patch checksum placeholder.')
const updater = Buffer.from(template.replace('__PATCH_HASH__', patchSha), 'utf8')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'Passive-PN-Translator-v2_5-to-v2_5_1.patch.json'), patch)
await writeFile(resolve(directory, 'Upgrade-PassiveTranslator-v2_5_1.ps1'), updater)
await writeFile(resolve(directory, 'SHA256SUMS.txt'),
  patchSha + '  Passive-PN-Translator-v2_5-to-v2_5_1.patch.json\n' +
  sha(updater) + '  Upgrade-PassiveTranslator-v2_5_1.ps1\n' +
  targetSha256 + '  Passive-PN-Translator-v2_5_1.html\n', 'utf8')
console.log(JSON.stringify({ patchBytes: patch.length, updaterBytes: updater.length, operations: operations.length, patchSha256: patchSha, targetSha256 }))
