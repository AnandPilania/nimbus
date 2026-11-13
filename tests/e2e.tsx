import React, { act } from 'react'
import { JSDOM } from 'jsdom'

import { createServer } from 'vite'

const BASE = 'http://localhost:5199'
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'silent' })
await server.listen()
// the reference API stores bundles under ./metadata of the cwd: run from a scratch dir so tests never touch (or depend on) the real ones
const scratch = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'nimbus-e2e-'))
process.chdir(scratch)
const dom = new JSDOM('<!doctype html><body></body>', { url: BASE, pretendToBeVisual: true })
const w = dom.window as any
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Node', 'MouseEvent', 'KeyboardEvent', 'Event', 'File', 'FormData', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'getComputedStyle', 'requestAnimationFrame'])
  Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true })
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true })
;(globalThis as any).confirm = () => true
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const errors: string[] = []
console.error = (...a: any[]) => { const s = String(a[0]); if (!/not wrapped in act|ReactDOMTestUtils/.test(s)) errors.push(s.slice(0, 200)) }

// react-dom must load after the DOM globals exist (it feature-detects input events at import time)
const { createRoot } = await import('react-dom/client')
const { BundleView } = await import('@/nimbus/runtime')
const { NimbusProvider, defaultEnv } = await import('@/nimbus/context')
const { samples } = await import('@/bundles/samples')
const { Builder } = await import('@/builder/Builder')
import type { Bundle } from '@/nimbus/types'
import fs from 'node:fs'
import { tmpdir } from 'node:os'

let fail = 0
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra) }
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
// act() defers renders until it exits, so debounce -> effect -> fetch -> render needs several passes
const settle = async () => { for (let i = 0; i < 4; i++) await wait(350) }
const setVal = (el: any, v: string) => {
  if (el.tagName === 'SELECT') { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })) }
  else { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })) }
}
const click = (el: any) => act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
async function mount(name: string | Bundle) {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => root.render(<NimbusProvider value={{ ...defaultEnv, api: { baseUrl: BASE, metaPath: '/api/meta/objects' } }}><BundleView bundle={typeof name === 'string' ? samples[name] : name} bundles={samples} /></NimbusProvider>))
  return el
}
const rows = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '')
const footer = (el: HTMLElement) => el.querySelector('[aria-live=polite]')?.textContent ?? ''
const btn = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLElement
const byLabel = (el: HTMLElement, text: string) => { const l = [...el.querySelectorAll('label')].find((x) => x.textContent?.startsWith(text)); return (l?.htmlFor ? el.querySelector('[id="' + l.htmlFor + '"]') : l?.querySelector('input')) as any }

// ---------- server-side DataTable ----------
let el = await mount('customerDirectory')
await settle()
ok('table: first page loads from server', rows(el).length === 10 && footer(el).startsWith('1-10 of 237'), footer(el))
const first = rows(el)[0]
await click(el.querySelector('button[aria-label="Next page"]')); await wait(700)
ok('table: next page', rows(el)[0] !== first && footer(el).startsWith('11-20 of 237'), footer(el))
await click(el.querySelector('button[aria-label="First page"]')); await wait(600)
await click(btn(el, 'Revenue')); await wait(700); await click(btn(el, 'Revenue')); await wait(700)
ok('table: sort desc sends to server', /\$99\dM/.test(rows(el)[0]), rows(el)[0].slice(0, 80))
setVal(el.querySelector('select[aria-label="Filter Industry"]'), 'Energy'); await settle()
ok('table: server-side filter', footer(el).includes('of 40'), footer(el))
setVal(el.querySelector('input[aria-label="Search"]'), 'acme'); await settle()
// every 'Acme' account is in Manufacturing, so Energy + 'acme' must be empty
ok('table: filter + search combine (empty state)', footer(el) === '0 results' && /No records found/.test(el.textContent ?? ''), footer(el))
setVal(el.querySelector('input[aria-label="Search"]'), ''); await settle()
const cb = el.querySelectorAll('tbody input[type=checkbox]')[0] as HTMLElement
await click(cb); await wait(50)
ok('table: row selection raises select event', /1 selected/.test(el.textContent ?? ''))
await click(btn(el, 'Delete')); await settle()
ok('table: row action -> fetch DELETE -> refresh', footer(el).includes('of 39'), footer(el))
await click(btn(el, 'View')); await wait(50)
ok('modal: opens from row action', !!el.querySelector('[role=dialog]'))
await click(btn(el, 'Close')); await wait(50)
ok('modal: closes', !el.querySelector('[role=dialog]'))

// ---------- validated form ----------
el = await mount('signupForm')
await wait(100)
await click(btn(el, 'Create account')); await wait(100)
const errs = el.querySelectorAll('[role=alert]')
ok('form: submit blocked, required errors shown', errs.length >= 6 && !/You are all set/.test(el.textContent ?? ''), String(errs.length))
setVal(byLabel(el, 'Full name'), 'Ada Lovelace'); setVal(byLabel(el, 'Email'), 'taken@example.com')
setVal(byLabel(el, 'Password'), 'longenough'); await wait(50)
setVal(byLabel(el, 'Confirm password'), 'different'); await wait(50)
ok('form: cross-field validation message', /Passwords must match/.test(el.textContent ?? ''))
setVal(byLabel(el, 'Confirm password'), 'longenough')
setVal(byLabel(el, 'Country'), 'India')
await act(async () => { byLabel(el, 'Interests').focus?.(); byLabel(el, 'Interests').dispatchEvent(new w.Event('focus')) })
await click(byLabel(el, 'Interests')); await wait(50)
const opt = el.querySelector('[role=option]') as HTMLElement
await act(async () => { opt.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })) })
ok('multiselect: option picked as chip', /Analytics/.test(byLabel(el, 'Interests').parentElement?.textContent ?? ''))
await click(byLabel(el, 'I accept the terms')); await wait(50)
ok('progress: completion reaches 100', el.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '100')
await click(btn(el, 'Create account')); await settle()
ok('form: server 422 errors map onto the field', /That email is already registered/.test(el.textContent ?? '') && !/You are all set/.test(el.textContent ?? ''))
setVal(byLabel(el, 'Email'), 'ada@example.com'); await wait(50)
await click(btn(el, 'Create account')); await settle()
ok('form: successful submit -> done state', /You are all set/.test(el.textContent ?? ''))

// ---------- object-driven UI (metadata from the server) ----------
el = await mount('objectDemo'); await wait(800)
ok('record form: fields generated from object metadata', !!byLabel(el, 'Account name') && !!byLabel(el, 'Industry') && /Annual revenue/.test(el.textContent ?? ''))


// ---------- file upload ----------
const up: Bundle = {
  apiName: 'up', label: 'up', props: [], state: { files: [], err: '' }, data: {},
  handlers: { ch: [{ type: 'set', key: 'files', value: '{!$event.value}' }], er: [{ type: 'set', key: 'err', value: '{!$event.message}' }] },
  template: { id: 'r', type: 'Stack', children: [
    { id: 'u', type: 'FileUpload', props: { label: 'Docs', name: 'files', uploadUrl: '/api/files', multiple: true, maxSize: 1, accept: '.txt,image/*', value: '{!state.files}' }, on: { change: 'ch', error: 'er' } },
    { id: 'c', type: 'Text', props: { text: 'count={!len(state.files)} err={!state.err} url={!join(pluck(state.files, "url"))}' } },
  ] },
}
el = await mount(up); await wait(50)
const pick = async (name: string, content: string | ArrayBuffer, type = 'text/plain') => {
  const input = el.querySelector('input[type=file]') as any
  Object.defineProperty(input, 'files', { value: [new w.File([content], name, { type })], configurable: true })
  await act(async () => { input.dispatchEvent(new w.Event('change', { bubbles: true })) }); await settle()
}
await pick('hello.txt', 'hello world')
ok('upload: file uploaded and value reported', /count=1/.test(el.textContent ?? '') && /hello\.txt/.test(el.textContent ?? '') && !!btn(el, 'Download'), el.textContent?.slice(0, 120))
const url = /url=(\S+)/.exec(el.textContent ?? '')?.[1] ?? ''
ok('upload: stored on the server, downloadable', (await (await fetch(BASE + url)).text()) === 'hello world', url)
await pick('evil.exe', 'x', 'application/octet-stream')
ok('upload: wrong type rejected with message', /Not an accepted file type/.test(el.textContent ?? '') && /count=1/.test(el.textContent ?? ''))
await pick('big.txt', 'x'.repeat(1.5 * 1048576))
ok('upload: oversize rejected with message', /Larger than 1 MB/.test(el.textContent ?? '') && /count=1/.test(el.textContent ?? ''))
await click(el.querySelector('button[aria-label="Remove hello.txt"]')); await wait(100)
ok('upload: removing a file updates the value', /count=0/.test(el.textContent ?? ''))


// ---------- second component batch ----------
const xb: Bundle = {
  apiName: 'xb', label: 'xb', props: [], state: { sel: '', page: 1, menu: '' }, data: {},
  handlers: { tr: [{ type: 'set', key: 'sel', value: '{!$event.value}' }], pg: [{ type: 'set', key: 'page', value: '{!$event.page}' }], mn: [{ type: 'set', key: 'menu', value: '{!$event.value}' }] },
  template: { id: 'r', type: 'Stack', children: [
    { id: 't', type: 'Tree', props: { items: [{ value: 'a', label: 'Parent', children: [{ value: 'a1', label: 'Child' }] }], selected: '{!state.sel}' }, on: { select: 'tr' } },
    { id: 'p', type: 'Pagination', props: { page: '{!state.page}', pages: 5 }, on: { change: 'pg' } },
    { id: 'm', type: 'ButtonMenu', props: { label: 'Actions', items: 'Edit, Clone' }, on: { select: 'mn' } },
    { id: 'a', type: 'Accordion', props: { sections: 'Alpha,Beta', open: '' }, children: [{ id: 'a1', type: 'Text', props: { text: 'panel-alpha' } }, { id: 'a2', type: 'Text', props: { text: 'panel-beta' } }] },
    { id: 's', type: 'Text', props: { text: 'sel={!state.sel} page={!state.page} menu={!state.menu}' } },
  ] },
}
el = await mount(xb); await wait(50)
await click(el.querySelector('button[aria-label="Expand"]')); await click(btn(el, 'Child')); await wait(50)
ok('tree: expand and select a child', /sel=a1/.test(el.textContent ?? ''))
await click(btn(el, 'Next')); await wait(50)
ok('pagination: next', /page=2/.test(el.textContent ?? ''))
await click(btn(el, '5')); await wait(50)
ok('pagination: jump to page', /page=5/.test(el.textContent ?? ''))
await click(btn(el, 'Actions')); await click(el.querySelector('[role=menuitem]:nth-child(1) button') ?? [...el.querySelectorAll('[role=menuitem]')].find((x) => x.textContent === 'Clone')); await wait(50)
ok('button menu: select fires event', /menu=(edit|clone|Edit|Clone)/i.test(el.textContent ?? ''), el.textContent?.slice(-40))
ok('accordion: sections start closed', !/panel-alpha/.test(el.textContent ?? ''))
await click(btn(el, 'Alpha')); await wait(50)
ok('accordion: opens a section', /panel-alpha/.test(el.textContent ?? '') && !/panel-beta/.test(el.textContent ?? ''))
await click(btn(el, 'Beta')); await wait(50)
ok('accordion: single mode closes the other', !/panel-alpha/.test(el.textContent ?? '') && /panel-beta/.test(el.textContent ?? ''))

// ---------- Studio: server persistence, undo/redo, handler editor, tenants ----------
;(defaultEnv.api as any).baseUrl = BASE
const meta = (t: string) => fs.existsSync(`metadata/${t}`) ? fs.readdirSync(`metadata/${t}`).sort() : []
el = document.createElement('div'); document.body.appendChild(el)
await act(async () => createRoot(el).render(<Builder />)); await settle()
ok('studio: empty server is seeded with the sample bundles', meta('default').length === 6 && /Saved to server/.test(el.textContent ?? ''), meta('default').join(','))
const items = () => el.querySelectorAll('[role=treeitem]').length
const before = items()
await click(btn(el, 'Heading')); await wait(50)
ok('studio: click-to-add inserts a node', items() === before + 1, `${before} -> ${items()}`)
await click(el.querySelector('button[aria-label="Undo"]')); await wait(50)
ok('studio: undo removes it', items() === before)
await click(el.querySelector('button[aria-label="Redo"]')); await wait(50)
ok('studio: redo restores it', items() === before + 1)
await settle(); await wait(900)
const nodeCount = (n: any): number => 1 + (n.children ?? []).reduce((a: number, c: any) => a + nodeCount(c), 0)
const saved = JSON.parse(fs.readFileSync('metadata/default/customerDirectory.json', 'utf8'))
ok('studio: edit autosaved to the server', nodeCount(saved.template) === before + 1, String(nodeCount(saved.template)))
await click(btn(el, 'Logic')); await wait(50)
const hInput = el.querySelector('input[placeholder="New handler name"]') as any
setVal(hInput, 'ping'); await act(async () => { hInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await wait(50)
const adders = el.querySelectorAll('select[aria-label="Add action"]') // the new handler is last
setVal(adders[adders.length - 1], 'toast'); await wait(50)
await settle(); await wait(900)
const saved2 = JSON.parse(fs.readFileSync('metadata/default/customerDirectory.json', 'utf8'))
ok('studio: visual handler editor adds handler + action', saved2.handlers.ping?.[0]?.type === 'toast', JSON.stringify(saved2.handlers.ping))
await click(btn(el, 'Context')); await wait(50)
const tenantInput = [...el.querySelectorAll('input')].find((i: any) => i.closest('label, div')?.textContent?.includes('Tenant') && i.type !== 'password') as any
setVal(tenantInput, 'acme'); await act(async () => { tenantInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await settle(); await wait(900)
ok('studio: switching tenant loads and seeds that tenant separately', meta('acme').length === 6 && meta('default').length === 6, `${meta('acme').length}/${meta('default').length}`)
const dflt = JSON.parse(fs.readFileSync('metadata/default/customerDirectory.json', 'utf8'))
const acme = JSON.parse(fs.readFileSync('metadata/acme/customerDirectory.json', 'utf8'))
ok('studio: tenants are isolated (edit stays in default)', nodeCount(dflt.template) === before + 1 && nodeCount(acme.template) === before)

ok('no unexpected React/console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(fail ? `\n${fail} FAILED` : '\nall passed')
await server.close()
process.chdir(tmpdir()); fs.rmSync(scratch, { recursive: true, force: true })
process.exit(fail ? 1 : 0)
