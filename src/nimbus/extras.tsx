// A second batch of Lightning-style base components: accordion, breadcrumbs, avatar, button menu, checkbox group, tree, pagination, formatted value.
import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { normOptions } from './fields'
import { FieldShell, rulesOf, useField } from './form'
import { fmtSize } from './util'
import type { ComponentDef, PropDef } from './registry'

const t = (name: string): PropDef => ({ name, kind: 'text' })
const b = (name: string): PropDef => ({ name, kind: 'boolean' })
const n = (name: string): PropDef => ({ name, kind: 'number' })
const j = (name: string): PropDef => ({ name, kind: 'json' })
const s = (name: string, ...options: string[]): PropDef => ({ name, kind: 'select', options })
type On = Record<string, (d?: any) => void>

function AccordionView({ p, children, design }: { p: Record<string, any>; children: ReactNode; design: boolean }) {
  const secs = normOptions(p.sections)
  const [open, setOpen] = useState<Set<number>>(() => new Set(p.open === '' || p.open == null ? [] : [+p.open]))
  const kids = Children.toArray(children)
  const toggle = (i: number) => setOpen((cur) => { const next = new Set(p.multiple ? cur : [...cur].filter((x) => x === i)); if (next.has(i)) next.delete(i); else next.add(i); return next })
  return (
    <div className="divide-y rounded-md border">
      {secs.map((sec, i) => {
        const isOpen = design || open.has(i)
        return (
          <section key={sec.value}>
            <h3><button aria-expanded={isOpen} onClick={() => toggle(i)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-accent/50">
              {sec.label}<ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button></h3>
            {isOpen && <div className="px-4 pb-4">{kids[i]}</div>}
          </section>
        )
      })}
    </div>
  )
}

const initials = (x: string) => x.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
const hue = (x: string) => [...x].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)

function MenuView({ p, on }: { p: Record<string, any>; on: On }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={box} className="relative inline-block" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <Button variant={p.variant || 'outline'} aria-haspopup="menu" aria-expanded={open} disabled={!!p.disabled} onClick={() => setOpen((o) => !o)}>{p.label}<ChevronDown /></Button>
      {open && (
        <ul role="menu" className="absolute left-0 z-30 mt-1 min-w-40 rounded-md border bg-background py-1 shadow-md">
          {normOptions(p.items).map((it) => (
            <li key={it.value} role="none"><button role="menuitem" className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { setOpen(false); on.select?.({ value: it.value, label: it.label }) }}>{it.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CheckGroup({ p, on }: { p: Record<string, any>; on: On }) {
  const f = useField(p.name, p.value, rulesOf(p), p.error)
  const sel: string[] = Array.isArray(p.value) ? p.value.map(String) : []
  const toggle = (v: string) => on.change?.({ name: p.name, value: sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v] })
  return (
    <FieldShell label={p.label} help={p.help} error={f.error} required={!!p.required}>
      <div role="group" className={cn('flex gap-4', p.direction !== 'row' && 'flex-col gap-2')}>
        {normOptions(p.options).map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={sel.includes(o.value)} disabled={!!p.disabled} onBlur={f.touch} onChange={() => toggle(o.value)} />{o.label}
          </label>
        ))}
      </div>
    </FieldShell>
  )
}

interface TNode { value: string; label: string; children?: TNode[] }
const flat = (nodes: TNode[]): string[] => nodes.flatMap((x) => (x.children?.length ? [x.value, ...flat(x.children)] : []))
function TreeView({ p, on }: { p: Record<string, any>; on: On }) {
  const items: TNode[] = Array.isArray(p.items) ? p.items : []
  const [open, setOpen] = useState<Set<string>>(() => new Set(p.expandAll ? flat(items) : []))
  const toggle = (v: string) => setOpen((cur) => { const next = new Set(cur); if (next.has(v)) next.delete(v); else next.add(v); return next })
  const rows = (nodes: TNode[], depth: number): ReactNode => (
    <ul role={depth ? 'group' : 'tree'} className="grid">
      {nodes.map((x) => {
        const kids = !!x.children?.length
        const isOpen = open.has(x.value)
        const picked = String(p.selected ?? '') === x.value
        return (
          <li key={x.value} role="treeitem" aria-expanded={kids ? isOpen : undefined} aria-selected={picked}>
            <div className={cn('flex items-center gap-1 rounded py-1 pr-2 text-sm hover:bg-accent', picked && 'bg-primary/10 text-primary')} style={{ paddingLeft: 4 + depth * 16 }}>
              {kids ? <button aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => toggle(x.value)}><ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} /></button> : <span className="size-4" />}
              <button className="flex-1 text-left" onClick={() => on.select?.({ value: x.value, label: x.label })}>{x.label}</button>
            </div>
            {kids && isOpen ? rows(x.children!, depth + 1) : null}
          </li>
        )
      })}
    </ul>
  )
  return items.length ? rows(items, 0) : <div className="text-sm text-muted-foreground">No items</div>
}

function format(v: any, p: Record<string, any>): string {
  const num = +v
  switch (p.format) {
    case 'number': return new Intl.NumberFormat(undefined, { notation: p.compact ? 'compact' : 'standard' }).format(num)
    case 'currency': return new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency || 'USD', notation: p.compact ? 'compact' : 'standard', minimumFractionDigits: 0, maximumFractionDigits: p.compact ? 1 : 2 }).format(num)
    case 'percent': return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(num)
    case 'date': return new Date(v).toLocaleDateString()
    case 'datetime': return new Date(v).toLocaleString()
    case 'bytes': return fmtSize(num)
    default: return String(v)
  }
}

export const extras: Record<string, ComponentDef> = {
  Accordion: {
    label: 'Accordion', group: 'Layout', container: true,
    props: [t('sections'), n('open'), b('multiple')],
    defaults: { sections: 'First,Second', open: 0, multiple: false },
    render: ({ props, children, design }) => <AccordionView p={props} design={design}>{children}</AccordionView>,
  },
  Breadcrumbs: {
    label: 'Breadcrumbs', group: 'Content', events: ['navigate'],
    props: [j('items')],
    defaults: { items: 'Home, Accounts, Details' },
    render: ({ props: p, on }) => {
      const items = normOptions(p.items)
      return (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm">
            {items.map((it, i) => {
              const last = i === items.length - 1
              const go = () => on.navigate?.({ value: it.value, label: it.label, index: i })
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {last ? <span aria-current="page" className="font-medium">{it.label}</span>
                    : /^(\/|https?:)/.test(it.value) ? <a href={it.value} onClick={go} className="text-muted-foreground hover:text-foreground">{it.label}</a>
                    : <button onClick={go} className="text-muted-foreground hover:text-foreground">{it.label}</button>}
                  {!last && <ChevronRight className="size-3.5 text-muted-foreground" />}
                </li>
              )
            })}
          </ol>
        </nav>
      )
    },
  },
  Avatar: {
    label: 'Avatar', group: 'Content',
    props: [t('name'), t('src'), n('size')],
    defaults: { name: 'Ada Lovelace', size: 36 },
    render: ({ props: p }) => {
      const size = +p.size || 36
      const name = String(p.name ?? '')
      return p.src
        ? <img src={p.src} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
        : <span role="img" aria-label={name} className="inline-grid shrink-0 place-items-center rounded-full font-medium" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue(name)} 55% 90%)`, color: `hsl(${hue(name)} 45% 28%)` }}>{initials(name) || '?'}</span>
    },
  },
  ButtonMenu: {
    label: 'Button menu', group: 'Actions', events: ['select'],
    props: [t('label'), j('items'), s('variant', 'outline', 'default', 'secondary', 'ghost'), b('disabled')],
    defaults: { label: 'Actions', items: 'Edit, Clone, Delete', variant: 'outline' },
    render: ({ props, on }) => <MenuView p={props} on={on} />,
  },
  CheckboxGroup: {
    label: 'Checkbox group', group: 'Inputs', events: ['change'],
    props: [t('label'), t('name'), t('value'), j('options'), s('direction', 'column', 'row'), b('required'), b('disabled'), t('help'), t('error')],
    defaults: { label: 'Label', name: 'choices', options: 'One, Two, Three', value: [], direction: 'column' },
    render: ({ props, on }) => <CheckGroup p={props} on={on} />,
  },
  Tree: {
    label: 'Tree', group: 'Data', events: ['select'],
    props: [j('items'), t('selected'), b('expandAll')],
    defaults: { items: [{ value: 'a', label: 'Parent', children: [{ value: 'a1', label: 'Child' }] }, { value: 'b', label: 'Another' }], expandAll: true },
    render: ({ props, on }) => <TreeView p={props} on={on} />,
  },
  Pagination: {
    label: 'Pagination', group: 'Data', events: ['change'],
    props: [n('page'), n('pages'), n('total'), n('pageSize')],
    defaults: { page: 1, pages: 10 },
    render: ({ props: p, on }) => {
      const pages = Math.max(1, +p.pages || Math.ceil((+p.total || 0) / (+p.pageSize || 10)) || 1)
      const page = Math.min(pages, Math.max(1, +p.page || 1))
      const go = (x: number) => on.change?.({ page: Math.min(pages, Math.max(1, x)) })
      const list = [...new Set([1, pages, page - 1, page, page + 1].filter((x) => x >= 1 && x <= pages))].sort((a, c) => a - c)
      return (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</Button>
          {list.map((x, i) => (
            <span key={x} className="flex items-center gap-1">
              {i > 0 && x - list[i - 1] > 1 && <span className="px-1 text-muted-foreground">...</span>}
              <Button size="sm" variant={x === page ? 'default' : 'ghost'} aria-current={x === page ? 'page' : undefined} onClick={() => go(x)}>{x}</Button>
            </span>
          ))}
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => go(page + 1)}>Next</Button>
        </nav>
      )
    },
  },
  Formatted: {
    label: 'Formatted value', group: 'Content',
    props: [t('value'), s('format', 'text', 'number', 'currency', 'percent', 'date', 'datetime', 'bytes'), t('currency'), b('compact')],
    defaults: { value: 1234567, format: 'number' },
    render: ({ props: p }) => {
      if (p.value == null || p.value === '') return <span className="text-muted-foreground">-</span>
      try { return <span>{format(p.value, p)}</span> } catch { return <span>{String(p.value)}</span> }
    },
  },
}
