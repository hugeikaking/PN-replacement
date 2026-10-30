// Headless, synthetic browser regression. No company files or remote requests.
// Optional argument: absolute package.json from an installed Playwright package.
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { makeOfflinePage } from './offline-page.mjs'

const require = createRequire(process.argv[2] ? resolve(process.argv[2]) : resolve('package.json'))
const { chromium } = require('playwright')
const folder = resolve('deliverables/.quotation-check')
await mkdir(folder, { recursive: true })
const products = ['GRM', 'GRT', 'GCM', 'UNKNOWN'].map((series, i) => ({
  schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: `SYNTHETIC_${series}`, partNoWithoutPackageCode: null, productName: null, series,
  classification: { applicationRaw: '民用设备,工业设备,汽车[信息娱乐/舒适设备]', characteristicsRaw: i === 1 || i === 2 ? ['AEC-Q200'] : ['High Q'] },
  spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0402', sizeMetric: '1005M', lengthMm: 1, widthMm: .5, thicknessMm: .5, thicknessMaxMm: .55, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
  compliance: { aecQ200: i === 3 ? null : Boolean(i), rohsRaw: null, reachRaw: null }, lifecycle: { category: 'active', rawStatus: '目前生产', newProductRaw: null },
  links: { datasheets: [], productDetail: null, verified: false }, validation: { status: 'consistent', issues: [], datasheetReviewed: false, companyAccepted: false },
  auditReference: { file: 'normalization-audit.jsonl', line: i + 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: i + 1 },
}))
const summary = { schemaVersion: 1, completed: true, products: 4, consistentProducts: 4, reviewProducts: 0, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic.json', sourceBytes: 100, sourceModifiedUtc: '', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts: {}, generatedAt: '' }
const code = `import {mountOfficialTranslator} from './src/official-preview/translator'; import {createOfficialCatalog} from './src/engine/official/catalog'; mountOfficialTranslator(document.querySelector('#app'),{catalog:createOfficialCatalog(${JSON.stringify(summary)},${JSON.stringify(products)})});`
const bundle = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true })
await writeFile(resolve(folder, 'index.html'), makeOfflinePage(await readFile('src/official-preview/style.css', 'utf8'), bundle.outputFiles[0].text, 'v2.6.7 SYNTHETIC TEST'))
const reports = []
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(pathToFileURL(resolve(folder, 'index.html')).href)
    const quote = page.getByRole('button', { name: '复制报价需要数据', exact: true })
    await assert.rejects(quote.click({ timeout: 400 }))
    await page.locator('#description').fill('0402 100nF 16V X7R ±10%')
    await page.locator('#search').click()
    await page.getByText('已完成 1 条查询。复制多个料号时按换行分隔。', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-pn]').count(), 4)
    for (const pn of ['SYNTHETIC_GRM', 'SYNTHETIC_GRT', 'SYNTHETIC_GCM']) await page.locator(`[data-pn="${pn}"] input[type=checkbox]`).check()
    await quote.click()
    const dialog = page.locator('.quotation-dialog')
    await dialog.waitFor({ state: 'visible' })
    for (const [pn, y40] of [['SYNTHETIC_GRM', 'WLMD5G'], ['SYNTHETIC_GRT', 'IVI-OT'], ['SYNTHETIC_GCM', 'ADAS-OT']]) assert.equal(await dialog.locator(`[data-quote-pn="${pn}"] select`).inputValue(), y40)
    const usage = dialog.getByRole('spinbutton', { name: 'Usage SYNTHETIC_GRM', exact: true })
    await usage.fill('37')
    assert.equal(await dialog.locator('[data-quote-demand="SYNTHETIC_GRM"]').innerText(), '3700000')
    const confirm = dialog.getByRole('button', { name: '确认复制报价数据', exact: true })
    await usage.fill('101'); assert.equal(await confirm.isDisabled(), true)
    await usage.fill('37'); await confirm.click()
    await dialog.getByText(/已复制 3 行 × 44列/).waitFor()
    const clipboard = await page.evaluate(async () => {
      const items = await navigator.clipboard.read(), result = {}
      for (const type of items[0].types) result[type] = await (await items[0].getType(type)).text()
      return result
    })
    const text = clipboard['text/plain'], rows = text.split(/\r?\n/).map(row => row.split('\t'))
    assert.equal(rows.length, 3)
    for (const row of rows) {
      assert.equal(row.length, 44); assert.equal(row[2], 'Y'); assert.equal(row[9], 'IoT module'); assert.equal(row[10], '100000'); assert.equal(row[12], String(100000 * Number(row[11]))); assert.equal(row[14], 'pcs/month')
      for (let i = 0; i < 44; i++) if (![2, 6, 8, 9, 10, 11, 12, 14].includes(i)) assert.equal(row[i], '')
    }
    assert.equal((clipboard['text/html'].match(/<td /g) || []).length, 132)
    await confirm.click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    assert.equal(await page.locator('[data-pn] input:checked').count(), 3)
    await quote.click(); assert.equal(await dialog.getByRole('spinbutton', { name: 'Usage SYNTHETIC_GRM', exact: true }).inputValue(), '37')
    await page.screenshot({ path: resolve('deliverables/Murata-Step6-v2_6_7-offline/quotation-preview-synthetic-' + channel + '.png') })
    await page.keyboard.press('Escape')
    await page.locator('[data-pn="SYNTHETIC_UNKNOWN"] input[type=checkbox]').check(); await quote.click()
    assert.equal(await confirm.isDisabled(), true)
    await dialog.locator('[data-quote-pn="SYNTHETIC_UNKNOWN"] select').selectOption('WLMD5G'); assert.equal(await confirm.isEnabled(), true)
    await page.keyboard.press('Escape')
    // Exercise the local-file fallback when the asynchronous API is denied.
    const originalClipboard = await page.evaluateHandle(() => navigator.clipboard)
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { throw new Error('Synthetic clipboard denial') } } }) })
    await quote.click(); await dialog.locator('[data-quote-pn="SYNTHETIC_UNKNOWN"] select').selectOption('WLMD5G'); await confirm.click()
    await dialog.getByText(/已复制 4 行 × 44列/).waitFor()
    await page.evaluate(original => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original }) }, originalClipboard)
    const fallbackRows = (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/).map(row => row.split('\t'))
    assert.deepEqual(fallbackRows.map(row => row.length), [44, 44, 44, 44])
    assert.equal(fallbackRows.find(row => row[6] === 'SYNTHETIC_GRM')[12], '3700000')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '料号 → 规格描述', exact: true }).click()
    assert.equal(await quote.isDisabled(), true)
    await page.getByRole('button', { name: '描述 → 村田料号', exact: true }).click()
    assert.equal(await page.locator('[data-pn] input:checked').count(), 4)
    await page.setViewportSize({ width: 390, height: 844 }); await quote.click()
    assert.equal(await dialog.isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.keyboard.press('Escape')
    await page.evaluate(() => { Math.random = () => .99 })
    await page.locator('#search').click()
    await page.getByText('已完成 1 条查询。复制多个料号时按换行分隔。', { exact: true }).waitFor()
    await page.locator('[data-pn="SYNTHETIC_GRM"] input[type=checkbox]').check(); await quote.click()
    assert.equal(await dialog.getByRole('spinbutton', { name: 'Usage SYNTHETIC_GRM', exact: true }).inputValue(), '100')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '清除当前输入和结果', exact: true }).click()
    assert.equal(await quote.isDisabled(), true)
    assert.deepEqual(errors, [])
    reports.push({ channel, clipboardRows: rows.length, columns: 44, htmlClipboard: true, actualClipboardRead: true, fallbackCopy: true, randomStable: true, unknownClassificationRequiresChoice: true, mobileNoPageOverflow: true, errors })
  } finally { await browser.close() }
}
await writeFile(resolve(folder, 'report.json'), JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports))
