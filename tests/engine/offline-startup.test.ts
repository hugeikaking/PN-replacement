import { describe, expect, it } from 'vitest'
import { runInNewContext, Script } from 'node:vm'
// @ts-expect-error Build helpers are native ESM JavaScript.
import { makeOfflinePage } from '../../scripts/offline-page.mjs'

function run(bundle: string, hasUI = true) {
  const nodes = { 'startup-state': { hidden: false }, 'startup-detail': { textContent: '' }, app: { hidden: false, hasChildNodes: () => hasUI } }
  const listeners: Record<string, (event: { message: string }) => void> = {}
  const window = { addEventListener: (event: string, listener: (e: { message: string }) => void) => { listeners[event] = listener } }
  const context = { window, document: { getElementById: (id: keyof typeof nodes) => nodes[id] } }
  const html = makeOfflinePage('', bundle)
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1])
  for (const script of scripts) {
    try { new Script(script); runInNewContext(script, context) }
    catch (error) { listeners.error({ message: String(error) }) }
  }
  return { nodes, html }
}

describe('standalone startup diagnostics', () => {
  it('hides the fallback only after the interface is generated', () => {
    expect(run('').nodes['startup-state'].hidden).toBe(true)
    const missing = run('', false)
    expect(missing.nodes['startup-state'].hidden).toBe(false)
    expect(missing.nodes['startup-detail'].textContent).toContain('主界面未生成')
  })
  it('reports syntax and runtime failures instead of leaving an empty page', () => {
    for (const script of ['var broken = ;', 'throw new Error("SYNTHETIC_STARTUP_ERROR")']) {
      const failed = run(script)
      expect(failed.nodes['startup-state'].hidden).toBe(false)
      expect(failed.nodes['startup-detail'].textContent).toContain('页面启动失败')
      expect(failed.nodes.app.hidden).toBe(true)
    }
  })
  it('includes a visible static fallback when scripts do not run and keeps the original network restrictions', () => {
    const { html } = run('')
    expect(html).toContain('<section id="startup-state" class=')
    expect(html).toContain('如果一直显示此提示')
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain('PNREP_V2_4_1_FILE_END')
  })
})
