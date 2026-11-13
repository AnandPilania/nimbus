import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Action } from '@/nimbus/types'
import { Field, selectCls } from './ui'

type F = { key: string; label: string; kind?: 'handler' | 'select' | 'json'; options?: string[]; hint?: string }
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const ACTIONS: Record<Action['type'], { label: string; blank: Action; fields: F[] }> = {
  set: { label: 'Set state', blank: { type: 'set', key: '', value: '' }, fields: [{ key: 'key', label: 'State path', hint: 'form.email' }, { key: 'value', label: 'Value', kind: 'json', hint: '{!$event.value}' }] },
  toggle: { label: 'Toggle state', blank: { type: 'toggle', key: '' }, fields: [{ key: 'key', label: 'State path' }] },
  push: { label: 'Append to list', blank: { type: 'push', key: '', value: '' }, fields: [{ key: 'key', label: 'List path' }, { key: 'value', label: 'Value', kind: 'json' }] },
  remove: { label: 'Remove from list', blank: { type: 'remove', key: '', index: '{!$event.index}' }, fields: [{ key: 'key', label: 'List path' }, { key: 'index', label: 'Index', kind: 'json' }] },
  fetch: {
    label: 'Call API', blank: { type: 'fetch', url: '', method: 'GET' },
    fields: [
      { key: 'url', label: 'URL', hint: '/api/demo/accounts' }, { key: 'method', label: 'Method', kind: 'select', options: METHODS },
      { key: 'body', label: 'Body', kind: 'json', hint: '{!state.form}' }, { key: 'into', label: 'Store result in' },
      { key: 'loading', label: 'Loading flag path' }, { key: 'error', label: 'Error message path' },
      { key: 'then', label: 'On success, run', kind: 'handler' }, { key: 'catch', label: 'On error, run', kind: 'handler' },
    ],
  },
  call: { label: 'Run handler', blank: { type: 'call', handler: '' }, fields: [{ key: 'handler', label: 'Handler', kind: 'handler' }] },
  if: { label: 'If / else', blank: { type: 'if', cond: '' }, fields: [{ key: 'cond', label: 'Condition', hint: 'state.count > 3' }, { key: 'then', label: 'Then run', kind: 'handler' }, { key: 'else', label: 'Else run', kind: 'handler' }] },
  emit: { label: 'Emit event', blank: { type: 'emit', event: '' }, fields: [{ key: 'event', label: 'Event name' }, { key: 'detail', label: 'Detail', kind: 'json' }] },
  toast: { label: 'Show toast', blank: { type: 'toast', message: '' }, fields: [{ key: 'message', label: 'Message' }, { key: 'variant', label: 'Style', kind: 'select', options: ['default', 'success', 'error'] }] },
  download: { label: 'Download file', blank: { type: 'download', filename: 'file.txt' }, fields: [{ key: 'url', label: 'URL' }, { key: 'content', label: 'Or inline content' }, { key: 'filename', label: 'File name' }] },
}

const show = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
/** Numbers, booleans, null, objects and arrays are stored typed; anything else stays a string (including {!bindings}). */
const loose = (s: string) => { try { const v = JSON.parse(s); return typeof v === 'string' ? s : v } catch { return s } }

function ActionRow({ a, names, onChange, onMove, onDelete }: { a: Action; names: string[]; onChange: (a: Action) => void; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const spec = ACTIONS[a.type]
  const set = (k: string, v: unknown) => onChange({ ...a, [k]: v === '' ? undefined : v } as Action)
  return (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1">
        <select aria-label="Action type" className={selectCls + ' h-8 flex-1'} value={a.type} onChange={(e) => onChange(structuredClone(ACTIONS[e.target.value as Action['type']].blank))}>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Move up" onClick={() => onMove(-1)}><ArrowUp /></Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Move down" onClick={() => onMove(1)}><ArrowDown /></Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Delete action" onClick={onDelete}><Trash2 /></Button>
      </div>
      {spec.fields.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.kind === 'handler' ? (
            <select className={selectCls + ' h-8'} value={show((a as any)[f.key])} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">(none)</option>{names.map((n) => <option key={n}>{n}</option>)}
            </select>
          ) : f.kind === 'select' ? (
            <select className={selectCls + ' h-8'} value={show((a as any)[f.key]) || f.options![0]} onChange={(e) => set(f.key, e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
          ) : (
            <Input className="h-8" placeholder={f.hint} value={show((a as any)[f.key])} onChange={(e) => set(f.key, f.kind === 'json' ? loose(e.target.value) : e.target.value)} />
          )}
        </Field>
      ))}
    </div>
  )
}

/** Visual editor for a bundle's handlers: ordered action lists, no JSON required. Handler `init` runs on mount. */
export function HandlerEditor({ handlers, onChange }: { handlers: Record<string, Action[]>; onChange: (h: Record<string, Action[]>) => void }) {
  const [name, setName] = useState('')
  const names = Object.keys(handlers)
  const setActs = (h: string, fn: (a: Action[]) => Action[]) => onChange({ ...handlers, [h]: fn(handlers[h]) })
  const add = () => {
    const n = name.trim()
    if (!/^\w+$/.test(n) || handlers[n]) return
    onChange({ ...handlers, [n]: [] }); setName('')
  }
  return (
    <div className="grid gap-3">
      {names.map((h) => (
        <details key={h} open className="rounded-md border">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium">
            <span>{h}{h === 'init' && <span className="ml-2 text-xs font-normal text-muted-foreground">runs on load</span>}</span>
            <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete handler ${h}`} onClick={(e) => { e.preventDefault(); const { [h]: _x, ...rest } = handlers; onChange(rest) }}><Trash2 /></Button>
          </summary>
          <div className="grid gap-2 p-2">
            {handlers[h].map((a, i) => (
              <ActionRow key={i} a={a} names={names}
                onChange={(x) => setActs(h, (l) => l.map((y, k) => (k === i ? x : y)))}
                onDelete={() => setActs(h, (l) => l.filter((_, k) => k !== i))}
                onMove={(d) => setActs(h, (l) => { const c = [...l], j = i + d; if (j >= 0 && j < c.length) [c[i], c[j]] = [c[j], c[i]]; return c })} />
            ))}
            <select aria-label="Add action" className={selectCls + ' h-8'} value="" onChange={(e) => e.target.value && setActs(h, (l) => [...l, structuredClone(ACTIONS[e.target.value as Action['type']].blank)])}>
              <option value="">Add action...</option>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </details>
      ))}
      <div className="flex gap-2">
        <Input placeholder="New handler name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" variant="outline" onClick={add}><Plus />Add</Button>
      </div>
    </div>
  )
}
