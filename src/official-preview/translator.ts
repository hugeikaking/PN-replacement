import { createOfficialCatalog, readOfficialJsonLines } from '../engine/official/catalog'
import type { OfficialCatalog } from '../engine/official/catalog'
import type { OfficialMatch, OfficialMatchResult } from '../engine/official/matcher'
import { translateOfficialInput } from '../engine/official/translate'
import type { OfficialTranslationMode, OfficialTranslation } from '../engine/official/translate'
import type { KnowledgeRule } from '../stores/knowledge'
import { productClassification, applicationLabels } from '../engine/official/classification'
import type { ApplicationCategory } from '../engine/official/classification'
import { readBatchWorkbook, selectBatchRows, batchExportTables, encodeBatchCsv, encodeBatchExcel, batchTemplate } from '../utils/batch-files'
import { buildDatasheetPlan, selectedDatasheetLinks, nextDatasheetLink, datasheetMatches } from '../utils/datasheet-download'
import type { BatchWorkbook, BatchInputRow, BatchExportEntry } from '../utils/batch-files'
import { selectedQuotationItems, buildQuotationClipboard, writeQuotationClipboard, QUOTATION_Y40, QUOTATION_SET_QTY } from '../utils/quotation'
import type { QuotationY40 } from '../utils/quotation'

export interface TranslatorOptions {
  initialMode?: OfficialTranslationMode
  initialInput?: string
  catalog?: OfficialCatalog
  onCatalog?: (catalog?: OfficialCatalog) => void
  onMode?: (mode: OfficialTranslationMode) => void
  onInput?: (input: string) => void
  onComplete?: (results: OfficialTranslation[], mode: OfficialTranslationMode) => void
  onClear?: (mode: OfficialTranslationMode) => void
  getKnowledge?: () => KnowledgeRule[]
  batchOpen?: boolean
}

/** Shared browser UI for Vue H5 and the self-contained company page. */
export function mountOfficialTranslator(root: HTMLElement, options: TranslatorOptions = {}) {
root.classList.add('official-translator')
root.innerHTML = `
  <header><div><span class="eyebrow">被动件料号翻译</span><h1>物料与料号互译</h1></div><span class="version">v2.6.7</span></header>
  <section class="panel catalog-bar"><p id="catalog-status" role="status" aria-live="polite">尚未导入规格数据</p><details id="catalog-details" open><summary>数据详情 / 更换数据</summary><p class="note">在第二步生成的同一个结果文件夹里，选择 <strong>normalization-summary.json</strong> 和 <strong>normalized-products.jsonl</strong> 两个文件。文件仅在当前页面读取，不上传；刷新后需重新选择。</p>
    <label class="file-button" for="catalog-files">选择两个文件</label><input id="catalog-files" type="file" accept=".json,.jsonl" multiple>
    <div id="catalog-info" hidden></div>
  </details></section>
  <div class="translator-workspace"><section class="panel input-panel"><div class="mode-tabs" role="group" aria-label="翻译方式"><button type="button" data-mode="A">描述 → 村田料号</button><button type="button" data-mode="B">料号 → 规格描述</button></div>
    <div class="input-heading"><label id="input-title" class="input-title" for="description">输入物料描述</label><button type="button" id="clear-input" class="secondary">清除当前输入和结果</button></div><p id="input-hint"></p>
    <textarea id="description" rows="4" maxlength="100000" placeholder="例如：008004 10pF 16V C0G ±2%&#10;0805 10uF 16V X5R ±10%"></textarea>
    <details class="input-extras"><summary>批量导入、示例与填写说明</summary><details class="batch-import"><summary>批量导入 Excel / CSV</summary>
      <p class="note">支持 .xlsx、.xls、CSV UTF-8，文件不超过 5MB；每次最多 100 条，每格一个完整描述或料号。先预览再导入，文件只在当前页面读取。</p>
      <div class="selection-bar"><input id="batch-file" type="file" accept=".xlsx,.xls,.csv" aria-label="选择批量输入文件"><button type="button" id="batch-template" class="secondary">下载当前模式 CSV 模板</button></div>
      <div id="batch-mapping" hidden><div class="batch-columns"><label>工作表 <select id="batch-sheet"></select></label><label>输入列 <select id="batch-column"></select></label><label><input id="batch-header" type="checkbox" checked>首行为标题</label></div>
        <div id="batch-preview"></div><button type="button" id="batch-apply" class="secondary" disabled>导入到当前输入框</button>
      </div><p id="batch-status" class="note" role="status" aria-live="polite"></p>
    </details>
    <div class="examples"><button type="button" data-example="008004 10pF 16V C0G ±2%">小容值示例</button><button type="button" data-example="0805 10uF 16V X5R ±10%">10uF 示例</button><button type="button" data-example="100nF">部分参数搜索</button></div>
    <div id="writing-help"></div></details>
    <fieldset class="application-filter"><legend>应用范围（可多选）</legend>
      <div class="application-options">
        <label><input type="checkbox" data-application="infotainment">汽车[信息娱乐 / 舒适设备]</label>
        <label><input type="checkbox" data-application="general">民用设备 / 工业设备</label>
        <label><input type="checkbox" data-application="powertrain">汽车[动力总成 / 安全设备]</label>
      </div><p class="note">未勾选时默认民用设备 / 工业设备；多选时满足任一所选应用即可。</p>
    </fieldset>
    <fieldset class="application-filter aec-filter"><legend>产品特点</legend><div class="application-options"><label><input id="aec-characteristic" type="checkbox">仅 AEC-Q200 产品</label></div><details class="help"><summary>筛选依据</summary><p>仅查询 JSON 产品特点中明确标记 AEC-Q200 的记录；不区分 Grade 2 / Grade 3。未勾选时不限此条件。应用未知的记录仅供核查。</p></details></fieldset>
    <details class="help"><summary>参数怎么写</summary><p>封装默认英制，如 0402 或 CH0402；公制写 1005M。支持客户格式：CAP X5R 10uF +/-20% 6.3V CH0402 H0.7mm RO。H0.7mm 表示最大允许高度：目录最大厚度须 ≤0.7mm，可接受更薄的料；缺少最大厚度时不判定满足高度要求。不填写 H 时不限制高度。RO 含义待确认，保留提示，候选不标为精确参数匹配。实际尺寸写 2.2x1.25mm。普通电压 16V 默认 DC，交流明确写 250Vac；安规示例：X1 440Vac。精度支持 ±10%、+/-10% 或 ±0.5pF。指定工规 / 车规会筛选 AEC-Q200。</p></details>
    <button id="search" class="primary" disabled>查询官方料号</button>
  </section>
  <section class="panel results-panel" aria-label="查询结果"><div id="results"></div></section></div>
  <footer>仅查询已导入的记录，不拼接料号。没有结果不能据此判断官网不存在。参数匹配还需核对规格书、供货和实际应用。</footer>
`

const input = root.querySelector<HTMLInputElement>('#catalog-files')!
const catalogStatus = root.querySelector<HTMLParagraphElement>('#catalog-status')!
const catalogInfo = root.querySelector<HTMLDivElement>('#catalog-info')!
const catalogDetails = root.querySelector<HTMLDetailsElement>('#catalog-details')!
const description = root.querySelector<HTMLTextAreaElement>('#description')!
const search = root.querySelector<HTMLButtonElement>('#search')!
const resultHost = root.querySelector<HTMLDivElement>('#results')!
const batchFile = root.querySelector<HTMLInputElement>('#batch-file')!
const batchSheet = root.querySelector<HTMLSelectElement>('#batch-sheet')!
const batchColumn = root.querySelector<HTMLSelectElement>('#batch-column')!
const batchHeader = root.querySelector<HTMLInputElement>('#batch-header')!
const batchApply = root.querySelector<HTMLButtonElement>('#batch-apply')!
const batchPreview = root.querySelector<HTMLDivElement>('#batch-preview')!
const batchStatus = root.querySelector<HTMLParagraphElement>('#batch-status')!
root.querySelector('#writing-help')!.append(root.querySelector('.input-panel > .help')!)
if (options.batchOpen) { root.querySelector<HTMLDetailsElement>('.input-extras')!.open = true; root.querySelector<HTMLDetailsElement>('.batch-import')!.open = true }
const makeView = () => {
  const container = document.createElement('div')
  const heading = el('div', '', 'results-heading'); const queryCount = el('small', '尚未查询', 'meta'); heading.append(el('h2', '查询结果'), queryCount)
  const status = document.createElement('div'); status.className = 'search-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite')
  const bulk = document.createElement('div'); bulk.className = 'result-toolbar'
  const empty = el('div', '输入物料描述或料号，点击查询后在这里查看结果。', 'empty-results')
  const results = document.createElement('div')
  container.append(heading, bulk, status, empty, results); resultHost.append(container)
  return { container, status, bulk, results, empty, queryCount, quotationUsages: new Map<string, number>(), input: '', revision: 0, searching: false, applications: new Set<ApplicationCategory>(), aecCharacteristic: false, importedRows: [] as BatchInputRow[], entries: [] as BatchExportEntry[], book: undefined as BatchWorkbook | undefined, sheet: 0, column: 0, hasHeader: true, fileVersion: 0, fileStatus: '', readingFile: false }
}
const views = { A: makeView(), B: makeView() }
let catalog = options.catalog
let mode = options.initialMode || 'A'
views[mode].input = options.initialInput || ''
let searchStatus = views[mode].status
let disposed = false
let loading = false
let datasheetDialog: HTMLDialogElement | undefined
let quotationDialog: HTMLDialogElement | undefined
function closeQuotationDialog() {
  if (!quotationDialog) return
  quotationDialog.close(); quotationDialog.remove(); quotationDialog = undefined
}
function closeDatasheetDialog() {
  if (!datasheetDialog) return
  datasheetDialog.close(); datasheetDialog.remove(); datasheetDialog = undefined
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') {
  const node = document.createElement(tag)
  node.textContent = text
  if (cls) node.className = cls
  return node
}
function syncSearch() { search.disabled = loading || views[mode].searching || (mode === 'A' && !catalog) || !description.value.trim() }
function changeMode(next: OfficialTranslationMode) {
  closeDatasheetDialog()
  closeQuotationDialog()
  mode = next
  description.value = views[mode].input
  searchStatus = views[mode].status
  root.querySelectorAll<HTMLInputElement>('[data-application]').forEach(check => { check.checked = views[mode].applications.has(check.dataset.application as ApplicationCategory) })
  root.querySelector<HTMLInputElement>('#aec-characteristic')!.checked = views[mode].aecCharacteristic
  views.A.container.hidden = mode !== 'A'; views.B.container.hidden = mode !== 'B'
  root.querySelector('#input-title')!.textContent = mode === 'A' ? '输入物料描述' : '输入完整料号'
  root.querySelector('#input-hint')!.textContent = mode === 'A' ? '每行一个物料。至少有容值、电压、尺寸才能标为精确参数匹配；其他明确填写的条件也必须相符。' : '每行一个料号。支持三星 CL、TDK C、太阳诱电 MS 系列；村田从导入记录中直接读取。其他系列和旧料号不套用相近规则。'
  search.textContent = mode === 'A' ? '查询官方料号' : '解析规格并查询村田候选'
  description.placeholder = mode === 'A' ? '008004 10pF 16V C0G ±2%\n0805 10uF 16V X5R ±10%' : 'CL10B104KO8NNNC\nC1608X7R1H104K080AA\nMSASP063EB5475MFNA01'
  const examples = mode === 'A' ? ['008004 10pF 16V C0G ±2%', '0805 10uF 16V X5R ±10%', '100nF'] : ['CL10B104KO8NNNC', 'C1608X7R1H104K080AA', 'MSASP063EB5475MFNA01']
  root.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button, i) => { button.dataset.example = examples[i]; button.textContent = mode === 'A' ? ['小容值示例', '10uF 示例', '部分参数搜索'][i] : ['三星示例', 'TDK 示例', '太阳诱电示例'][i] })
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)))
  options.onMode?.(mode); options.onInput?.(description.value); syncSearch(); syncBatchPanel()
}
root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.mode as OfficialTranslationMode)))
buildToolbar(views.A); buildToolbar(views.B)
changeMode(mode)
if (catalog) showCatalogInfo()
const inputPanel = root.querySelector<HTMLElement>('.input-panel')!
// Only pin a sidebar that fits entirely; expanded help must never hide controls below the viewport.
const syncSidebar = () => inputPanel.classList.toggle('can-stick', window.innerWidth >= 981 && inputPanel.getBoundingClientRect().height + 32 <= window.innerHeight)
const sidebarObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncSidebar)
sidebarObserver?.observe(inputPanel); window.addEventListener('resize', syncSidebar); syncSidebar()
resultHost.addEventListener('change', event => { if ((event.target as HTMLElement).matches('.product input[type="checkbox"]')) syncToolbar(views[mode]) })
description.addEventListener('input', () => { views[mode].input = description.value; views[mode].importedRows = []; options.onInput?.(description.value); syncSearch() })
root.querySelectorAll<HTMLInputElement>('[data-application]').forEach(check => check.addEventListener('change', () => {
  const view = views[mode]; const category = check.dataset.application as ApplicationCategory
  if (check.checked) view.applications.add(category); else view.applications.delete(category)
  view.revision++; view.searching = false
  view.status.textContent = '应用条件已修改，请点击查询更新结果；下方保留的是上次查询结果。'
  syncSearch()
}))
root.querySelector<HTMLInputElement>('#aec-characteristic')!.addEventListener('change', event => {
  const view = views[mode]; view.aecCharacteristic = (event.target as HTMLInputElement).checked
  view.revision++; view.searching = false
  view.status.textContent = '产品特点条件已修改，请点击查询更新结果；下方保留的是上次查询结果。'
  syncSearch()
})
root.querySelectorAll<HTMLButtonElement>('[data-example]').forEach(button => button.addEventListener('click', () => {
  description.value = button.dataset.example!; views[mode].input = description.value; views[mode].importedRows = []; options.onInput?.(description.value); syncSearch(); description.focus()
}))

function resetView(view: typeof views.A) {
  closeDatasheetDialog()
  closeQuotationDialog()
  view.quotationUsages.clear()
  view.revision++; view.searching = false; view.entries = []; view.results.replaceChildren(); view.status.textContent = ''; view.empty.hidden = false; view.empty.textContent = '输入物料描述或料号，点击查询后在这里查看结果。'; buildToolbar(view)
}
root.querySelector('#clear-input')!.addEventListener('click', () => {
  resetView(views[mode]); views[mode].input = ''; description.value = ''
  views[mode].importedRows = []; views[mode].book = undefined; views[mode].fileVersion++; views[mode].readingFile = false; views[mode].fileStatus = ''; syncBatchPanel()
  options.onClear?.(mode); options.onInput?.(''); syncSearch(); description.focus()
})

function downloadFile(bytes: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = el('a'); link.href = url; link.download = fileName
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
function syncBatchPanel() {
  const view = views[mode], book = view.book
  root.querySelector<HTMLElement>('#batch-mapping')!.hidden = !book
  batchStatus.textContent = view.fileStatus; batchApply.disabled = true
  if (!book) { batchPreview.replaceChildren(); return }
  batchSheet.replaceChildren(...book.sheets.map((sheet, i) => { const option = el('option', sheet.name); option.value = String(i); return option }))
  batchSheet.value = String(view.sheet); batchHeader.checked = view.hasHeader
  const sheet = book.sheets[view.sheet]
  const count = Math.max(0, ...sheet.rows.map(row => row.length))
  batchColumn.replaceChildren(...Array.from({ length: count }, (_, i) => { const option = el('option', `${i + 1} 列${view.hasHeader && sheet.rows[0]?.[i]?.text ? ' · ' + sheet.rows[0][i].text.slice(0, 60) : ''}`); option.value = String(i); return option }))
  batchColumn.value = String(view.column)
  try {
    const rows = selectBatchRows(book, view.sheet, view.column, view.hasHeader)
    const table = el('table'), heading = el('tr'); heading.append(el('th', '原表行号'), el('th', '将导入的输入')); table.append(heading)
    rows.slice(0, 5).forEach(row => { const tr = el('tr'); tr.append(el('td', String(row.rowNumber)), el('td', row.input)); table.append(tr) })
    batchPreview.replaceChildren(el('p', `${book.fileName} · ${rows.length} 条输入，预览前 ${Math.min(rows.length, 5)} 条。导入会替换当前模式输入和结果。`, 'note'), table)
    batchApply.disabled = view.readingFile
  } catch (error) { batchPreview.replaceChildren(el('p', error instanceof Error ? error.message : '请检查输入列', 'error')) }
}
batchSheet.addEventListener('change', () => { views[mode].sheet = Number(batchSheet.value); views[mode].column = 0; syncBatchPanel() })
batchColumn.addEventListener('change', () => { views[mode].column = Number(batchColumn.value); syncBatchPanel() })
batchHeader.addEventListener('change', () => { views[mode].hasHeader = batchHeader.checked; syncBatchPanel() })
batchFile.addEventListener('change', async () => {
  const file = batchFile.files?.[0]; batchFile.value = ''; if (!file) return
  const view = views[mode], fileVersion = ++view.fileVersion
  view.readingFile = true; view.fileStatus = '正在读取输入文件…'; view.book = undefined; syncBatchPanel()
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('输入文件上限 5MB，请另存需要的输入区域')
    const book = readBatchWorkbook(file.name, await file.arrayBuffer())
    if (disposed || view.fileVersion !== fileVersion) return
    view.book = book; view.sheet = 0; view.column = 0; view.hasHeader = true; view.fileStatus = '请选择输入列，确认预览后再导入。'
  } catch (error) { if (view.fileVersion === fileVersion) view.fileStatus = error instanceof Error ? error.message : '读取失败，原输入未改变' }
  finally { if (view.fileVersion === fileVersion) { view.readingFile = false; if (!disposed && view === views[mode]) syncBatchPanel() } }
})
batchApply.addEventListener('click', () => {
  const view = views[mode]
  if (!view.book || view.readingFile) return
  try {
    const rows = selectBatchRows(view.book, view.sheet, view.column, view.hasHeader)
    resetView(view); view.importedRows = rows; view.input = rows.map(row => row.input).join('\n'); description.value = view.input
    options.onInput?.(view.input); view.fileStatus = `已导入 ${rows.length} 条到当前模式，请点击查询。`; syncBatchPanel(); syncSearch()
  } catch (error) { view.fileStatus = error instanceof Error ? error.message : '导入失败'; syncBatchPanel() }
})
root.querySelector('#batch-template')!.addEventListener('click', () => downloadFile(encodeBatchCsv(batchTemplate(mode)), mode === 'A' ? '物料描述导入模板.csv' : '料号导入模板.csv', 'text/csv;charset=utf-8'))

function collectViewEntries(view: typeof views.A) {
  return view.entries.map((entry, index) => ({ ...entry, selectedPartNumbers: new Set([...view.results.querySelectorAll<HTMLElement>(`[data-query-index="${index}"] [data-pn]`)].filter(card => card.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).map(card => card.dataset.pn!)) }))
}
function displayedPNs(view: typeof views.A, selectedOnly: boolean) {
  return [...new Set([...view.results.querySelectorAll<HTMLElement>('[data-pn]')]
    .filter(card => selectedOnly ? card.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked : card.dataset.normal === 'true')
    .map(card => card.dataset.pn!))]
}
function buildToolbar(view: typeof views.A) {
  const selectedCount = el('strong', '', 'selected-count'); selectedCount.setAttribute('aria-live', 'polite')
  const actions = el('div', '', 'toolbar-actions')
  const copySelected = copyButton('复制已选', () => displayedPNs(view, true).join('\n'), '个料号', view.status)
  const quoteSelected = quotationButton(view)
  const specsSelected = datasheetButton('打开已选规格书', view, true)
  const exportSelected = exportButton('导出已选 Excel', view, 'xlsx', true)
  for (const button of [copySelected, quoteSelected, specsSelected, exportSelected]) button.dataset.scope = 'selected'
  const more = el('details', '', 'more-actions'); more.append(el('summary', '更多操作'))
  const otherActions = el('div', '', 'selection-bar')
  const copyNormal = copyButton('复制当前正常生产料号', () => displayedPNs(view, false).join('\n'), '个料号', view.status)
  const specsNormal = datasheetButton('打开当前结果规格书', view, false)
  for (const button of [copyNormal, specsNormal]) button.dataset.scope = 'normal'
  const copyDescriptions = copyButton('复制全部规格描述', () => view.entries.map(x => x.translation.description).filter(Boolean).join('\n'), '条描述', view.status)
  copyDescriptions.dataset.scope = 'descriptions'
  otherActions.append(exportButton('导出当前结果 Excel', view, 'xlsx'), exportButton('导出当前结果 CSV', view, 'csv'), copyNormal, specsNormal, copyDescriptions)
  more.append(otherActions, el('p', '普通导出包含查询状态及当前显示的正常生产候选，不自动选料。待核查料号需明确勾选后使用“导出已选 Excel”。', 'note'))
  actions.append(copySelected, quoteSelected, specsSelected, exportSelected, more)
  view.bulk.replaceChildren(selectedCount, actions)
  syncToolbar(view)
}
function syncToolbar(view: typeof views.A) {
  const selected = displayedPNs(view, true).length, normal = displayedPNs(view, false).length
  view.bulk.querySelector('.selected-count')!.textContent = `已选 ${selected} 个料号`
  view.queryCount.textContent = view.entries.length ? `${view.entries.length} 条查询` : '尚未查询'
  view.bulk.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    const scope = button.dataset.scope
    button.disabled = view.searching || !view.entries.length || (scope === 'selected' && !selected) || (scope === 'normal' && !normal) || (scope === 'descriptions' && !view.entries.some(x => x.translation.description))
  })
}
function datasheetButton(label: string, view: typeof views.A, selectedOnly: boolean) {
  const button = el('button', label, 'secondary'); button.type = 'button'
  button.addEventListener('click', () => {
    try {
      closeDatasheetDialog()
      closeQuotationDialog()
      const rows = collectViewEntries(view)
      const plan = buildDatasheetPlan(rows, selectedOnly ? 'selected' : 'displayed-normal')
      if (!plan.partNumbers.length) { view.status.textContent = selectedOnly ? '请先勾选要打开规格书的村田料号' : '当前没有正常生产候选，请先查询'; return }
      const descriptions = new Map<string, Set<string>>()
      for (const match of datasheetMatches(rows, selectedOnly ? 'selected' : 'displayed-normal')) {
        const descriptionsForPart = descriptions.get(match.product.partNo!) || new Set<string>()
        descriptionsForPart.add(productBrief(match, match.product.lifecycle.category === 'active' && match.product.validation.status === 'consistent'))
        descriptions.set(match.product.partNo!, descriptionsForPart)
      }
      const dialog = el('dialog', '', 'datasheet-dialog'); datasheetDialog = dialog
      dialog.setAttribute('aria-labelledby', 'datasheet-dialog-title')
      const title = el('h2', '确认打开规格书'); title.id = 'datasheet-dialog-title'
      const count = el('p', '', 'success'); count.setAttribute('aria-live', 'polite')
      const note = el('p', '默认勾选有可用链接的料号，可再次取消。为适应浏览器限制，每次点击只打开一份；返回本弹窗后继续点击下一份。相同链接只排队一次，也可逐个点击料号下的链接。打开规格书不代表选型通过。', 'note')
      const feedback = el('p', '', 'note'); feedback.setAttribute('role', 'status')
      const list = el('div', '', 'datasheet-list')
      const selected = new Set(plan.partNumbers.filter(pn => !plan.missingPartNumbers.includes(pn)))
      const attempted = new Set<string>()
      const nextInfo = el('p', '', 'note')
      const rowStatuses = new Map<string, HTMLElement>()
      const confirm = el('button', '确认打开规格书链接', 'primary'); confirm.type = 'button'
      const sync = () => {
        const links = selectedDatasheetLinks(plan, selected)
        const pending = links.filter(entry => !attempted.has(entry.url))
        count.textContent = '已选 ' + selected.size + ' 个料号，共 ' + links.length + ' 份规格书 · 尚未请求 ' + pending.length + ' 份'
        confirm.disabled = !pending.length
        confirm.textContent = !pending.length ? '已请求全部选中链接' : attempted.size ? '打开下一份规格书（剩余 ' + pending.length + ' 份）' : '确认打开规格书链接'
        nextInfo.textContent = pending.length ? '下一份：' + pending[0].partNumbers.filter(pn => selected.has(pn)).join(' / ') : '没有待请求的链接。网页不能核验新标签页是否成功加载；需要重试时可点击料号下的规格书链接。'
        for (const [pn, status] of rowStatuses) {
          const links = plan.entries.filter(entry => entry.partNumbers.includes(pn))
          const requested = links.filter(entry => attempted.has(entry.url)).length
          status.textContent = requested ? '已请求 ' + requested + '/' + links.length + ' 份（未核验加载结果）' : '尚未请求'
        }
      }
      for (const pn of plan.partNumbers) {
        const urls = plan.entries.filter(entry => entry.partNumbers.includes(pn))
        const item = el('div', '', 'datasheet-item')
        const row = el('label', '', 'datasheet-choice')
        const check = el('input'); check.type = 'checkbox'; check.checked = selected.has(pn); check.disabled = !urls.length
        check.setAttribute('aria-label', '打开规格书 ' + pn)
        check.addEventListener('change', () => { if (check.checked) selected.add(pn); else selected.delete(pn); sync() })
        row.append(check, el('strong', pn), el('small', [...descriptions.get(pn)!].join('；其他已选查询：'), 'candidate-summary'))
        item.append(row)
        const links = el('div', '', 'datasheet-row-links')
        if (!urls.length) links.append(el('small', '暂无可用规格书链接', 'warning'))
        urls.forEach((entry, i) => {
          const link = el('a', '规格书' + (urls.length > 1 ? ' ' + (i + 1) : ''))
          link.href = entry.url; link.target = '_blank'; link.rel = 'noopener noreferrer'
          link.addEventListener('click', () => { attempted.add(entry.url); sync(); feedback.textContent = '已请求打开该链接；请在新标签页查看。' })
          links.append(link)
        })
        if (urls.length) { const status = el('small', '', 'meta'); rowStatuses.set(pn, status); links.append(status) }
        item.append(links); list.append(item)
      }
      confirm.addEventListener('click', () => {
        const entry = nextDatasheetLink(plan, selected, attempted)
        if (!entry) return
        try { window.open(entry.url, '_blank', 'noopener,noreferrer'); attempted.add(entry.url) }
        catch { feedback.textContent = '浏览器未能请求打开，请点击料号下的规格书链接。'; sync(); return }
        feedback.textContent = '已请求打开这一份规格书，请查看新标签页。返回此弹窗后可继续下一份；若没有出现标签页，请点击料号下的链接。'
        sync()
      })
      const cancel = el('button', '取消', 'secondary'); cancel.type = 'button'
      cancel.addEventListener('click', closeDatasheetDialog)
      const actions = el('div', '', 'datasheet-dialog-actions'); actions.append(cancel, confirm)
      dialog.append(title, count, note, list, feedback, nextInfo, actions)
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeDatasheetDialog() })
      root.append(dialog); sync(); dialog.showModal(); cancel.focus()
    } catch (error) { closeDatasheetDialog(); view.status.textContent = error instanceof Error ? error.message : '准备规格书链接失败，原查询结果已保留' }
  })
  return button
}

function quotationButton(view: typeof views.A) {
  const button = el('button', '复制报价需要数据', 'secondary'); button.type = 'button'
  button.addEventListener('click', () => {
    try {
      closeDatasheetDialog(); closeQuotationDialog()
      const items = selectedQuotationItems(collectViewEntries(view), view.quotationUsages)
      if (!items.length) { view.status.textContent = '请先勾选要申请报价的村田料号'; return }
      const dialog = el('dialog', '', 'datasheet-dialog quotation-dialog'); quotationDialog = dialog
      dialog.setAttribute('aria-labelledby', 'quotation-title')
      const title = el('h2', '复制报价需要数据'); title.id = 'quotation-title'
      const note = el('p', `共 ${items.length} 个已选料号，相同料号合并一行。C＝Y，J＝IoT module，K＝${QUOTATION_SET_QTY}，O＝pcs/month；P～T 留空。L 为生成的 1–100 随机整数，可修改，M＝K×L 的数值。随机用量不是客户真实需求，请核对。`, 'note')
      const pasteHint = el('p', '复制后在原申请表单击 A5（或下方一条空白数据行的 A 单元格）再粘贴，不要选整列，也不要在单元格编辑状态下粘贴。内容占 A～AR 共44列，空白列会覆盖目标范围原内容，M 的原公式会被计算数值替换；前四行不在复制内容中。', 'note')
      const rules = el('p', 'Y40 按你的报价规则预填：GCM → ADAS-OT；其他明确 AEC-Q200 产品 → IVI-OT；明确非 AEC-Q200 且属于民用/工业应用 → WLMD5G。分类未知或冲突时请手动选择，这些代码不代表新增产品认证。', 'note')
      const feedback = el('p', '', 'note'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite')
      const tableWrap = el('div', '', 'quotation-table-wrap')
      const table = el('table'), head = el('thead'), headRow = el('tr')
      for (const label of ['G · 村田料号 / 核对提示', 'I · Y40', 'L · Usage', 'M · Demand Qty']) { const th = el('th', label); th.scope = 'col'; headRow.append(th) }
      head.append(headRow); const body = el('tbody'); table.append(head, body); tableWrap.append(table)
      const manual = el('textarea'); manual.readOnly = true; manual.rows = 4; manual.setAttribute('aria-label', '报价粘贴内容（44列）')
      manual.addEventListener('focus', () => manual.select())
      const fallback = el('details', '', 'quotation-manual'); fallback.append(el('summary', '手动复制备用'), el('p', '若浏览器拒绝复制，可单击下框全选后按 Ctrl+C。不要删除开头的空白定位字符；粘贴仍从 A5 或下方空白行的 A 单元格开始。', 'note'), manual)
      const confirm = el('button', '确认复制报价数据', 'primary'); confirm.type = 'button'
      const sync = () => {
        try {
          const payload = buildQuotationClipboard(items)
          manual.value = payload.text; confirm.disabled = false; feedback.className = 'note'; feedback.textContent = ''
        } catch (error) {
          manual.value = ''; confirm.disabled = true; feedback.className = 'error'
          feedback.textContent = error instanceof Error ? error.message : '请先核对报价数据'
        }
      }
      for (const item of items) {
        const row = el('tr'); row.dataset.quotePn = item.partNo
        const part = el('td'); part.append(el('strong', item.partNo), el('small', item.descriptions.join('；'), 'candidate-summary'))
        if (item.warnings.length) part.append(el('small', item.warnings.join('；'), 'quotation-warning'))
        const classification = el('td'), select = el('select'); select.setAttribute('aria-label', `Y40 ${item.partNo}`)
        const unknown = el('option', '请选择 Y40'); unknown.value = ''; select.append(unknown)
        for (const code of QUOTATION_Y40) { const option = el('option', code); option.value = code; select.append(option) }
        select.value = item.y40
        select.addEventListener('change', () => { item.y40 = select.value as QuotationY40 | ''; sync() })
        classification.append(select)
        const usageCell = el('td'), usage = el('input'); usage.type = 'number'; usage.min = '1'; usage.max = '100'; usage.step = '1'; usage.value = String(item.usage); usage.setAttribute('aria-label', `Usage ${item.partNo}`)
        const demand = el('td', String(QUOTATION_SET_QTY * item.usage)); demand.dataset.quoteDemand = item.partNo
        usage.addEventListener('input', () => {
          item.usage = usage.value === '' ? NaN : Number(usage.value)
          const valid = Number.isInteger(item.usage) && item.usage >= 1 && item.usage <= 100
          demand.textContent = valid ? String(QUOTATION_SET_QTY * item.usage) : '待修正'
          if (valid) view.quotationUsages.set(item.partNo, item.usage)
          sync()
        })
        usageCell.append(usage); row.append(part, classification, usageCell, demand); body.append(row)
      }
      confirm.addEventListener('click', async () => {
        try {
          const payload = buildQuotationClipboard(items); confirm.disabled = true
          const copied = await writeQuotationClipboard(payload)
          if (quotationDialog !== dialog) return
          feedback.className = copied ? 'success' : 'error'
          feedback.textContent = copied ? `已复制 ${items.length} 行 × 44列。请在申请表 A5 或下方空白数据行的 A 单元格粘贴，核对列位置；L 用量与本次预览一致。` : '浏览器未完成复制，请展开“手动复制备用”，单击内容框后按 Ctrl+C。'
          if (!copied) { fallback.open = true; manual.focus(); manual.select() }
          view.status.textContent = feedback.textContent
        } catch (error) { feedback.className = 'error'; feedback.textContent = error instanceof Error ? error.message : '复制失败，原查询和选择已保留' }
        finally {
          if (quotationDialog === dialog) {
            try { buildQuotationClipboard(items); confirm.disabled = false }
            catch { confirm.disabled = true }
          }
        }
      })
      const cancel = el('button', '关闭', 'secondary'); cancel.type = 'button'
      cancel.addEventListener('click', () => { closeQuotationDialog(); button.focus() })
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeQuotationDialog(); button.focus() })
      const actions = el('div', '', 'datasheet-dialog-actions'); actions.append(cancel, confirm)
      dialog.append(title, note, pasteHint, rules, tableWrap, feedback, fallback, actions)
      root.append(dialog); sync(); dialog.showModal(); cancel.focus()
    } catch (error) { closeQuotationDialog(); view.status.textContent = error instanceof Error ? error.message : '准备报价数据失败，原查询结果已保留' }
  })
  return button
}

function exportButton(label: string, view: typeof views.A, format: 'xlsx' | 'csv', selectedOnly = false) {
  const button = el('button', label, 'secondary'); button.type = 'button'
  button.addEventListener('click', () => {
    const entries = collectViewEntries(view)
    const tables = batchExportTables(entries, selectedOnly)
    if (selectedOnly && tables.candidates.length === 1) { view.status.textContent = '请先勾选要导出的料号；待核查料号仅在明确勾选后导出'; return }
    try {
      downloadFile(format === 'xlsx' ? encodeBatchExcel(tables) : encodeBatchCsv(tables.flat), `料号查询-${selectedOnly ? '已选' : '当前显示'}-${new Date().toISOString().slice(0, 10)}.${format}`, format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8')
      view.status.textContent = `已生成 ${entries.length} 条查询的导出文件，包含 ${tables.candidates.length - 1} 条当前显示${selectedOnly ? '已选' : '正常生产'}候选；候选总数和显示数在汇总中分别记录。`
    } catch { view.status.textContent = '导出失败，原输入和查询结果已保留' }
  })
  return button
}

function showCatalogInfo() {
  if (!catalog) return
  const s = catalog.summary
  catalogStatus.textContent = `已导入 ${s.products.toLocaleString()} 条规格记录`
  catalogStatus.className = 'success'
  catalogInfo.replaceChildren(
    el('p', `${s.mode === 'Full' && s.fullDatabaseRead ? '已读完本次来源文件（不代表官网最新全部产品）' : '样本查询范围'} · 整理时间 ${s.generatedAt} · 数据工具 ${s.toolBuild || '未记录版本'}`),
    el('p', `字段一致 ${s.consistentProducts} 条，待核查 ${s.reviewProducts} 条。冲突或重复料号 ${catalog.blockedPartNumbers.size} 个，将从查询结果中排除。`),
  )
  catalogInfo.hidden = false; catalogDetails.open = false
}
input.addEventListener('change', async () => {
  catalog = undefined; options.onCatalog?.(undefined)
  // Results from a previous catalog must not be presented as current matches.
  resetView(views.A); resetView(views.B)
  catalogInfo.hidden = true; catalogStatus.className = ''; loading = true; syncSearch(); input.disabled = true
  try {
    const files = [...(input.files || [])]
    const summary = files.find(f => f.name === 'normalization-summary.json')
    const products = files.find(f => f.name === 'normalized-products.jsonl')
    if (files.length !== 2 || !summary || !products) throw new Error('请选择同一结果文件夹的 normalization-summary.json 和 normalized-products.jsonl 两个文件')
    if (summary.size > 1024 * 1024) throw new Error('汇总文件超过 1MB，请确认选择了第二步的汇总文件')
    catalogStatus.textContent = '正在读取规格数据…（上限 512MB / 250000 条；超限会停止，不截取）'
    const metadata: unknown = JSON.parse((await summary.text()).replace(/^\uFEFF/, ''))
    const rows = await readOfficialJsonLines(products, count => { catalogStatus.textContent = `已读取 ${count.toLocaleString()} 条，正在校验…` })
    if (disposed) return
    catalog = createOfficialCatalog(metadata, rows)
    options.onCatalog?.(catalog)
    showCatalogInfo()
  } catch (error) {
    catalogStatus.textContent = error instanceof Error ? error.message : '读取失败，请确认文件格式'
    catalogStatus.className = 'error'
    catalogDetails.open = true
    catalog = undefined
  } finally { loading = false; input.disabled = false; syncSearch() }
})

async function copy(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* Local file pages may not provide Clipboard API. */ }
  const area = el('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'
  document.body.append(area); area.select()
  const ok = document.execCommand('copy'); area.remove(); return ok
}
function copyButton(text: string, value: () => string, unit = '个料号', status: HTMLElement = searchStatus) {
  const button = el('button', text, 'secondary')
  button.type = 'button'
  button.addEventListener('click', async () => {
    const selected = value()
    if (!selected) { status.textContent = '当前没有可复制的结果，请先查询或勾选'; return }
    try { status.textContent = await copy(selected) ? `已复制 ${selected.split('\n').length} ${unit}，按换行分隔` : '复制未成功，请选中文字手动复制' }
    catch { status.textContent = '复制未成功，请选中文字手动复制' }
  })
  return button
}
function number(value: number | null, unit: string) { return value === null ? '待核查' : `${Number(value.toPrecision(12))}${unit}` }
function capacitance(value: number | null) {
  if (value === null) return '容值待核查'
  return value >= 1e6 ? number(value / 1e6, 'uF') : value >= 1000 ? number(value / 1000, 'nF') : number(value, 'pF')
}
let productDetailSequence = 0
function productBrief(match: OfficialMatch, normalGroup: boolean) {
  const s = match.product.spec
  const voltage = s.voltages.filter(v => v.state === 'consistent').map(v => [v.safetyClass, v.type, number(v.valueV, 'V')].filter(Boolean).join(' ')).join(' / ') || '电压待核查'
  return [s.sizeInch || '封装待核查', s.temperature, capacitance(s.capacitancePf), s.tolerance.value === null ? '精度待核查' : '±' + s.tolerance.value + s.tolerance.unit, voltage, '最大厚度 ' + number(s.thicknessMaxMm, 'mm'), match.kind === 'height-reference' ? '高度不符合，仅供参考' : match.kind === 'alternative' ? '替代候选（非精确匹配）' : match.kind === 'partial' ? '部分匹配 / 有条件待确认' : '', !normalGroup && match.kind !== 'alternative' && match.kind !== 'height-reference' ? '待核查（含状态或字段）' : '', (match.kind === 'alternative' || match.kind === 'height-reference') ? match.differences!.map(d => `${d.label}：${d.requested} → ${d.actual}`).join('；') : match.warnings.length ? '有提示，请展开核对' : ''].filter(Boolean).join(' · ')
}
function productCard(match: OfficialMatch, selected: Set<string>, status: HTMLElement, normalGroup = false) {
  const p = match.product; const s = p.spec
  const card = el('article', '', match.kind === 'height-reference' ? 'product height-reference-product' : match.kind === 'alternative' ? 'product alternative-product' : 'product')
  card.dataset.pn = p.partNo!
  card.dataset.normal = String(normalGroup)
  const top = el('div', '', 'product-top')
  const check = el('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `选择 ${p.partNo}`)
  check.checked = selected.has(p.partNo!)
  check.addEventListener('change', () => { if (check.checked) selected.add(p.partNo!); else selected.delete(p.partNo!) })
  const choice = el('label', '', 'choice'); choice.append(check)
  const detail = el('div', '', 'product-detail'); detail.hidden = true; detail.id = 'product-detail-' + (++productDetailSequence)
  const pnButton = el('button', p.partNo!, 'part-number'); pnButton.type = 'button'
  pnButton.setAttribute('aria-expanded', 'false'); pnButton.setAttribute('aria-controls', detail.id)
  pnButton.title = '点击料号展开或收起详情'
  pnButton.addEventListener('click', () => { detail.hidden = !detail.hidden; pnButton.setAttribute('aria-expanded', String(!detail.hidden)) })
  const summary = el('small', productBrief(match, normalGroup), match.kind === 'height-reference' ? 'candidate-summary height-reference-differences' : match.kind === 'alternative' ? 'candidate-summary alternative-differences' : 'candidate-summary')
  top.append(choice, pnButton, summary, copyButton('复制', () => p.partNo!, '个料号', status))
  card.append(top, detail)
  detail.append(el('p', `${match.kind === 'height-reference' ? '高度不符合，仅供参考' : match.kind === 'alternative' ? '替代候选（非精确匹配）' : match.kind === 'exact' ? '精确参数匹配' : '部分参数匹配'} · ${p.series || '系列未记录'} · ${p.lifecycle.rawStatus || '生命周期待确认'} · AEC-Q200 ${p.compliance.aecQ200 === true ? '是' : p.compliance.aecQ200 === false ? '否' : '待确认'}`, 'meta'))
  const volts = s.voltages.map(v => `${v.safetyClass ? v.safetyClass + ' ' : ''}${v.type} ${number(v.valueV, 'V')}${v.state === 'review' ? '（待核查）' : ''}`).join('；') || '电压待核查'
  const tolerance = s.tolerance.value === null ? '精度待确认' : `±${s.tolerance.value}${s.tolerance.unit}`
  detail.append(el('p', `${capacitance(s.capacitancePf)} · ${s.sizeInch ? '英制 ' + s.sizeInch : '封装未记录'}${s.sizeMetric ? ' / 公制 ' + s.sizeMetric : ''} · ${s.temperature || '温度特性未记录'} · ${tolerance}`))
  detail.append(el('p', volts))
  const classification = productClassification(p)
  const extra = el('dl', '', 'product-classification')
  for (const [label, value, basis] of [
    ['应用', classification.applicationText, classification.applicationBasis],
    ['标准（安全规格）', classification.standards, classification.standardBasis],
    ['特征', classification.features, classification.featureBasis],
  ]) {
    const cell = el('div'); cell.append(el('dt', label), el('dd', value))
    if (basis) cell.append(el('dd', basis, 'meta'))
    extra.append(cell)
  }
  detail.append(extra)
  if (s.lengthMm !== null && s.widthMm !== null) detail.append(el('p', `实际尺寸 ${number(s.lengthMm, 'mm')} × ${number(s.widthMm, 'mm')} · 厚度 ${number(s.thicknessMm, 'mm')} · 最大厚度 ${number(s.thicknessMaxMm, 'mm')}`, 'meta'))
  match.warnings.forEach(w => detail.append(el('p', w, 'warning')))
  const links = el('div', '', 'links')
  p.links.datasheets.forEach((href, i) => {
    const link = el('a', `规格书${p.links.datasheets.length > 1 ? ' ' + (i + 1) : ''}（未核验）`)
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link)
  })
  if (p.links.productDetail) {
    const link = el('a', '产品详情（未核验）'); link.href = p.links.productDetail; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link)
  }
  classification.safetyCertificateUrls.forEach((href, i) => {
    const link = el('a', `安全证书${classification.safetyCertificateUrls.length > 1 ? ' ' + (i + 1) : ''}（未核验）`)
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link)
  })
  detail.append(links)
  if (classification.referenceUrl) {
    const reference = el('a', '应用 / 标准 / 特征：村田系列资料'); reference.href = classification.referenceUrl; reference.target = '_blank'; reference.rel = 'noopener noreferrer'; detail.append(reference)
  }
  const provenance = el('details', '', 'help'); provenance.append(el('summary', '记录来源'), el('p', `${p.provenance.sourcePath}，源记录 ${p.provenance.sourceIndex}；核对文件 ${p.auditReference.file} 第 ${p.auditReference.line} 行`))
  detail.append(provenance)
  return card
}

function renderResult(result: OfficialMatchResult, section: HTMLElement, moreResults: () => void, limit: number, status: HTMLElement, selected: Set<string>) {
  const notices = el('details', '', 'query-notices'); notices.append(el('summary', result.totalMatches + result.totalReviewMatches ? '查看查询条件与提示' : '查看未匹配原因'))
  result.errors.forEach(e => notices.append(el('p', e, 'error')))
  result.warnings.forEach(w => notices.append(el('p', w, 'note')))
  if (result.alternativeNote) notices.append(el('p', result.alternativeNote, 'note'))
  section.append(notices)
  if (result.errors.length) return
  if (!result.totalMatches && !result.totalReviewMatches) {
    notices.append(el('p', '描述已识别，但当前导入范围没有同时符合全部条件的料号。', 'warning'))
    const d = result.diagnostics
    if (d) {
      const diagnosis = el('div', '', 'empty-diagnosis')
      diagnosis.append(el('h3', '为什么没有匹配结果？'), el('p', `本次检查已导入的 ${d.catalogRecords.toLocaleString()} 条记录；其中 ${d.eligibleRecords.toLocaleString()} 条可参与查询（含 NRND / 待核查记录，排除缺失或冲突料号）。`, 'note'))
      const table = el('table'); const heading = el('tr')
      ;['查询条件', '单独符合此条件', '同时符合本行及上方条件'].forEach(text => heading.append(el('th', text)))
      table.append(heading)
      d.conditions.forEach(c => {
        const row = el('tr'); [`${c.label}：${c.expected}`, `${c.matchingRecords} 条`, `${c.remainingRecords} 条`].forEach(text => row.append(el('td', text))); table.append(row)
      })
      diagnosis.append(table)
      const absent = d.conditions.filter(c => c.matchingRecords === 0)
      if (absent.length) diagnosis.append(el('p', `当前可查询记录中没有以下条件的记录：${absent.map(c => `${c.label} ${c.expected}`).join('、')}。`, 'warning'))
      else if (d.conditions.length) diagnosis.append(el('p', '各条件分别有记录，但没有一条记录同时满足全部条件。', 'warning'))
      d.conditions.filter(c => c.otherConditionsRecords > 0).forEach(c => diagnosis.append(el('p', `仅不限制“${c.label}”时，其余条件同时相符的记录有 ${c.otherConditionsRecords} 条。这些记录没有满足当前全部要求，未列为正常匹配；符合替代规则时另列替代候选。`, 'note')))
      diagnosis.append(el('p', result.scope === 'Full' ? '这只反映已导入的数据快照，不能代替官网当前数据核对。' : '当前为样本查询。样本没有记录不代表村田官网没有对应产品。', 'note'))
      notices.append(diagnosis)
    }
    if (!result.totalAlternatives && !result.totalHeightReferences) return
  }
  const selectionBar = el('div', '', 'selection-bar')
  selectionBar.append(copyButton('复制已选料号', () => [...selected].join('\n'), '个料号', status))
  if (result.matches.length) selectionBar.append(copyButton(`复制下方 ${result.matches.length} 个正常生产料号`, () => result.matches.map(x => x.product.partNo).join('\n'), '个料号', status))
  notices.append(selectionBar)
  section.append(el('p', `正常生产且字段一致：${result.totalMatches} 个（当前显示 ${result.matches.length} 个）。`, 'meta'))
  result.matches.forEach(match => section.append(productCard(match, selected, status, true)))
  if (result.totalReviewMatches) {
    const collapsed = el('details', '', 'review-group')
    collapsed.append(el('summary', `NRND / 状态、字段或应用待核查：${result.totalReviewMatches} 个（展开查看，默认不推荐）`))
    collapsed.append(el('p', '以下料号仅供核查。请确认警告后单独勾选或复制，不包含在上面的正常生产复制按钮中。', 'warning'))
    result.reviewMatches.forEach(match => collapsed.append(productCard(match, selected, status)))
    section.append(collapsed)
  }
  if (result.totalAlternatives) {
    const group = el('div', '', 'alternative-group')
    group.append(el('h3', `替代候选（非精确匹配）：${result.totalAlternatives} 个（当前显示 ${result.alternatives.length} 个）`), el('p', '以下料号与原描述不同，差异已逐条标出。可勾选后复制、导出或打开规格书；不包含在正常匹配的批量操作中。', 'note'))
    result.alternatives.forEach(match => group.append(productCard(match, selected, status)))
    section.append(group)
  }
  if (result.totalHeightReferences) {
    const group = el('div', '', 'height-reference-group')
    group.append(el('h3', `高度不符合，仅供参考：${result.totalHeightReferences} 个（当前显示 ${result.heightReferences.length} 个）`), el('p', '这些料号超过客户H最大高度，不是正常匹配或替代候选。需客户重新确认空间要求；仅在明确勾选后可复制、导出或打开规格书，超高差异会保留。', 'note'))
    result.heightReferences.forEach(match => group.append(productCard(match, selected, status)))
    section.append(group)
  }
  if (result.totalMatches > result.matches.length || result.totalReviewMatches > result.reviewMatches.length || result.totalAlternatives > result.alternatives.length || result.totalHeightReferences > result.heightReferences.length) {
    if (limit < 500) {
      const more = el('button', '显示更多结果', 'secondary')
      more.addEventListener('click', moreResults)
      section.append(more)
    } else section.append(el('p', '每组最多展示 500 个结果，请补充条件缩小范围。'))
  }
}

search.addEventListener('click', async () => {
  const view = views[mode]
  if ((mode === 'A' && !catalog) || loading || view.searching) return
  const searchStatus = view.status; const results = view.results
  const manualRows = description.value.split(/\r?\n/).map((input, index) => ({ input: input.trim(), fileName: '', sheetName: '', rowNumber: index + 1 })).filter(row => row.input)
  const rows = view.importedRows.length && view.importedRows.map(row => row.input).join('\n') === description.value ? view.importedRows : manualRows
  const lines = rows.map(row => row.input)
  if (!lines.length || lines.length > 100) { searchStatus.textContent = '请填写 1 到 100 行描述，每行一个物料'; return }
  const activeCatalog = catalog; const activeMode = mode; const version = ++view.revision
  const applications: ApplicationCategory[] = view.applications.size ? [...view.applications] : ['general']
  const aecCharacteristic = view.aecCharacteristic
  const translations: OfficialTranslation[] = []
  closeQuotationDialog(); view.quotationUsages.clear()
  view.entries = []; results.replaceChildren(); view.empty.hidden = true; view.searching = true; syncToolbar(view); syncSearch()
  try {
    for (const [index, line] of lines.entries()) {
      if (version !== view.revision || disposed) return
      searchStatus.textContent = `正在查询 ${index + 1} / ${lines.length}`
      const section = el('section', '', 'panel query-result')
      section.dataset.queryIndex = String(index)
      const selected = new Set<string>()
      function renderTranslation(limit: number) {
        if (version !== view.revision || disposed) return
        const translated = translateOfficialInput(line, activeMode, activeCatalog, options.getKnowledge?.(), limit, applications, aecCharacteristic)
        view.entries[index] = { row: rows[index], translation: translated, applications, selectedPartNumbers: selected }
        if (limit === 20) translations.push(translated)
        const heading = el('div', '', 'query-heading'); heading.append(el('h2', line))
        const total = translated.official ? translated.official.totalMatches + translated.official.totalReviewMatches : 0
        const failed = translated.errors.length || translated.official?.errors.length
        const diagnostic = translated.official?.diagnostics
        const condition = diagnostic?.conditions.find(c => c.remainingRecords === 0)
        const brief = failed ? [...translated.errors, ...(translated.official?.errors || [])].join('；') : (translated.official?.totalAlternatives || translated.official?.totalHeightReferences) ? `无正常匹配 · 替代候选 ${translated.official.totalAlternatives} 个 · 超高参考 ${translated.official.totalHeightReferences} 个 · 待核查 ${translated.official.totalReviewMatches} 个` : translated.official && !total ? '未匹配' + (condition ? ' · ' + condition.label + ' ' + condition.expected + ' 后无同时满足条件的记录' : ' · 当前目录无符合全部条件的记录') : translated.official ? '候选 ' + total + ' 个' : '尚未查询村田候选'
        heading.append(el('small', brief, failed || translated.official && !total ? 'query-summary warning' : 'query-summary'))
        section.replaceChildren(heading)
        const queryInfo = el('details', '', 'help query-context'); queryInfo.append(el('summary', '查看输入解析与筛选范围'))
        section.append(queryInfo)
        if (rows[index].fileName) queryInfo.append(el('p', `${rows[index].fileName} · ${rows[index].sheetName} · 原表第 ${rows[index].rowNumber} 行`, 'meta'))
        queryInfo.append(el('p', `本次应用范围：${applications.map(x => applicationLabels[x]).join(' 或 ')}${aecCharacteristic ? '；产品特点：AEC-Q200' : ''}`, 'meta'))
        translated.errors.forEach(e => queryInfo.append(el('p', e, 'error')))
        translated.warnings.forEach(w => queryInfo.append(el('p', w, 'note')))
        if (translated.description) {
          heading.append(el('small', translated.description, 'candidate-summary'), copyButton('复制规格描述', () => translated.description, '条描述', searchStatus))
        }
        if (translated.decoded) {
          const breakdown = el('details', '', 'help'); breakdown.append(el('summary', '查看料号字段拆解'))
          const table = el('table'); const heading = el('tr')
          ;['字段', '编码', '含义'].forEach(s => heading.append(el('th', s))); table.append(heading)
          translated.decoded.decodedParts.forEach(p => { const row = el('tr'); [p.label, p.code, p.value].forEach(s => row.append(el('td', s))); table.append(row) })
          breakdown.append(table); queryInfo.append(breakdown)
        }
        if (translated.official) {
          renderResult(translated.official, section, () => renderTranslation(limit + 20), limit, searchStatus, selected)
        }
        syncToolbar(view)
      }
      renderTranslation(20)
      results.append(section)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (version !== view.revision || disposed) return
    options.onComplete?.(translations, activeMode)
    searchStatus.textContent = `已完成 ${lines.length} 条查询。复制多个料号时按换行分隔。`
  } catch (error) { if (version === view.revision && !disposed) searchStatus.textContent = error instanceof Error ? error.message : '查询失败' }
  finally { if (version === view.revision) view.searching = false; if (!disposed) { syncToolbar(view); syncSearch() } }
})
return () => { disposed = true; sidebarObserver?.disconnect(); window.removeEventListener('resize', syncSidebar); resetView(views.A); resetView(views.B); root.replaceChildren() }
}
