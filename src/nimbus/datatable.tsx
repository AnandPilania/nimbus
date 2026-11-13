import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, ChevronUp, Download, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { apiFetch, can, useNimbus, useObject } from './context'
import { downloadFile } from './util'
import type { Ev } from './fields'

interface Col {
  key: string; label?: string; sortable?: boolean; align?: 'left' | 'right'; currency?: string
  type?: 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'badge' | 'link'
  filter?: 'text' | { type: 'select'; options: string[] }
}
export interface TableQuery { page: number; pageSize: number; sort: string; dir: 'asc' | 'desc'; search: string; filters: Record<string, string> }

const TYPE_OF: Record<string, Col['type']> = { currency: 'currency', number: 'number', date: 'date', boolean: 'boolean', picklist: 'badge', url: 'link' }
const SIZES = [10, 25, 50, 100]

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

function Cell({ col, v }: { col: Col; v: any }) {
  if (v == null || v === '') return <span className="text-muted-foreground">-</span>
  switch (col.type) {
    case 'boolean': return v ? <Check className="size-4 text-primary" aria-label="Yes" /> : <X className="size-4 text-muted-foreground" aria-label="No" />
    case 'badge': return <Badge variant="secondary">{String(v)}</Badge>
    case 'currency': return <>{new Intl.NumberFormat(undefined, { style: 'currency', currency: col.currency || 'USD', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(+v)}</>
    case 'number': return <>{(+v).toLocaleString()}</>
    case 'date': return <>{new Date(v).toLocaleDateString()}</>
    case 'link': return <a href={String(v)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{String(v)}</a>
    default: return <>{String(v)}</>
  }
}

const csv = (cols: Col[], rows: any[]) =>
  [cols.map((c) => c.label ?? c.key), ...rows.map((r) => cols.map((c) => r?.[c.key]))]
    .map((l) => l.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')

/**
 * Three data modes, chosen by props:
 *  - `url`: the table fetches GET url?page&pageSize&sort&dir&q&filter[col] and expects { rows, total } (server-side paging/sorting/filtering).
 *  - `serverSide`: the table fires `query` events and shows the `rows`/`total`/`loading` you pass in (you own the fetching).
 *  - otherwise: `rows` are searched, filtered, sorted and paged in the browser.
 */
export function DataTable({ p, on }: { p: Record<string, any>; on: Ev }) {
  const env = useNimbus()
  const meta = useObject(p.object)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(+p.pageSize || 10)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [searchIn, setSearchIn] = useState('')
  const [filterIn, setFilterIn] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Map<string, any>>(new Map())
  const [retry, setRetry] = useState(0)
  const [rd, setRd] = useState({ rows: [] as any[], total: 0, loading: false, error: '' })
  const search = useDebounced(searchIn, 300)
  const filters = JSON.parse(useDebounced(JSON.stringify(filterIn), 300)) as Record<string, string>

  const cols: Col[] = useMemo(() => {
    let c: any = p.columns
    if (typeof c === 'string') c = c.split(',').map((s) => s.trim()).filter(Boolean).map((key) => ({ key }))
    if ((!Array.isArray(c) || !c.length) && meta) {
      c = meta.fields.map((f) => ({ key: f.apiName, label: f.label, type: TYPE_OF[f.type], sortable: true, ...(f.type === 'picklist' ? { filter: { type: 'select', options: f.options } } : {}) }))
    }
    return Array.isArray(c) ? c : []
  }, [JSON.stringify(p.columns), meta])

  const query: TableQuery = { page, pageSize, sort: sort?.key ?? '', dir: sort?.dir ?? 'asc', search, filters }
  const qKey = JSON.stringify(query)
  const remote = !!p.url
  const eventMode = !remote && !!p.serverSide

  useEffect(() => {
    if (!remote) return
    const ac = new AbortController()
    setRd((s) => ({ ...s, loading: true, error: '' }))
    const sp = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) })
    if (sort) { sp.set('sort', sort.key); sp.set('dir', sort.dir) }
    if (search) sp.set('q', search)
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(`filter[${k}]`, v)
    apiFetch(env, `${p.url}${p.url.includes('?') ? '&' : '?'}${sp}`, { signal: ac.signal })
      .then((r) => {
        const rows = Array.isArray(r) ? r : r?.[p.rowsKey || 'rows'] ?? []
        setRd({ rows, total: Array.isArray(r) ? rows.length : r?.[p.totalKey || 'total'] ?? rows.length, loading: false, error: '' })
      })
      .catch((e) => { if (e.name !== 'AbortError') setRd((s) => ({ ...s, loading: false, error: e.message })) })
    return () => ac.abort()
  }, [remote, p.url, qKey, p.version, retry, env.tenant])

  useEffect(() => { if (eventMode) on.query?.(query) }, [eventMode, qKey])

  const clientRows = useMemo(() => {
    if (remote || eventMode) return []
    let r: any[] = Array.isArray(p.rows) ? p.rows : []
    if (search) { const s = search.toLowerCase(); r = r.filter((x) => cols.some((c) => String(x?.[c.key] ?? '').toLowerCase().includes(s))) }
    for (const [k, v] of Object.entries(filters)) if (v) r = r.filter((x) => String(x?.[k] ?? '').toLowerCase().includes(v.toLowerCase()))
    if (sort) { const d = sort.dir === 'asc' ? 1 : -1; r = [...r].sort((a, b) => (a?.[sort.key] > b?.[sort.key] ? 1 : a?.[sort.key] < b?.[sort.key] ? -1 : 0) * d) }
    return r
  }, [remote, eventMode, p.rows, search, JSON.stringify(filters), sort, cols])

  const total = remote ? rd.total : eventMode ? +p.total || 0 : clientRows.length
  const rows: any[] = remote ? rd.rows : eventMode ? (Array.isArray(p.rows) ? p.rows : []) : clientRows.slice(page * pageSize, (page + 1) * pageSize)
  const loading = remote ? rd.loading : !!p.loading
  const error = remote ? rd.error : ''
  const pages = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [pages])

  const keyOf = (r: any, i: number) => String(r?.[p.rowKey || 'id'] ?? `${page}-${i}`)
  const commitPick = (next: Map<string, any>) => { setPicked(next); on.select?.({ rows: [...next.values()] }) }
  const pageAll = rows.length > 0 && rows.every((r, i) => picked.has(keyOf(r, i)))
  const actions: any[] = (Array.isArray(p.actions) ? p.actions : []).filter((a: any) => can(env, a.perm))
  const hasFilters = cols.some((c) => c.filter)
  const from = total ? page * pageSize + 1 : 0
  const to = Math.min(total, (page + 1) * pageSize)
  const cycle = (key: string) => { setSort(!sort || sort.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null); setPage(0) }
  const span = cols.length + (p.selectable ? 1 : 0) + (actions.length ? 1 : 0)

  return (
    <div className="grid gap-3">
      {(p.searchable !== false || p.exportable || (p.selectable && picked.size > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {p.searchable !== false && (
            <div className="relative w-64 max-w-full">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input aria-label="Search" placeholder="Search..." className="pl-8" value={searchIn} onChange={(e) => { setSearchIn(e.target.value); setPage(0) }} />
            </div>
          )}
          {p.selectable && picked.size > 0 && (
            <span className="text-sm text-muted-foreground">{picked.size} selected <button className="text-primary hover:underline" onClick={() => commitPick(new Map())}>Clear</button></span>
          )}
          {p.exportable && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => downloadFile({ content: csv(cols, rows), filename: (p.filename || 'export') + '.csv', mime: 'text/csv' })}><Download />Export CSV</Button>
          )}
        </div>
      )}

      <div className="relative overflow-x-auto rounded-md border">
        {loading && <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/20"><div className="nimbus-indet h-full w-2/5 bg-primary" /></div>}
        <table className="w-full text-sm" aria-busy={loading}>
          <thead className="bg-muted/60">
            <tr>
              {p.selectable && <th className="w-10 px-3"><input type="checkbox" aria-label="Select page" className="size-4 accent-primary" checked={pageAll} onChange={(e) => { const n = new Map(picked); rows.forEach((r, i) => (e.target.checked ? n.set(keyOf(r, i), r) : n.delete(keyOf(r, i)))); commitPick(n) }} /></th>}
              {cols.map((c) => (
                <th key={c.key} style={{ textAlign: c.align }} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="px-3 py-2 text-left font-medium">
                  {c.sortable
                    ? <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => cycle(c.key)}>{c.label ?? c.key}{sort?.key === c.key ? (sort.dir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />) : <ChevronsUpDown className="size-3.5 text-muted-foreground" />}</button>
                    : (c.label ?? c.key)}
                </th>
              ))}
              {actions.length > 0 && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
            {hasFilters && (
              <tr className="border-t">
                {p.selectable && <th />}
                {cols.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-normal">
                    {c.filter === 'text' && <Input aria-label={`Filter ${c.label ?? c.key}`} placeholder="Filter" className="h-8" value={filterIn[c.key] ?? ''} onChange={(e) => { setFilterIn((s) => ({ ...s, [c.key]: e.target.value })); setPage(0) }} />}
                    {typeof c.filter === 'object' && (
                      <select aria-label={`Filter ${c.label ?? c.key}`} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm" value={filterIn[c.key] ?? ''} onChange={(e) => { setFilterIn((s) => ({ ...s, [c.key]: e.target.value })); setPage(0) }}>
                        <option value="">All</option>
                        {c.filter.options.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    )}
                  </th>
                ))}
                {actions.length > 0 && <th />}
              </tr>
            )}
          </thead>
          <tbody className={cn(loading && rows.length > 0 && 'opacity-60 transition-opacity')}>
            {rows.map((r, i) => (
              <tr key={keyOf(r, i)} className={cn('border-t', on.rowClick && 'cursor-pointer hover:bg-accent/50')} onClick={() => on.rowClick?.({ row: r })}>
                {p.selectable && (
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select row" className="size-4 accent-primary" checked={picked.has(keyOf(r, i))} onChange={(e) => { const n = new Map(picked); if (e.target.checked) n.set(keyOf(r, i), r); else n.delete(keyOf(r, i)); commitPick(n) }} />
                  </td>
                )}
                {cols.map((c) => <td key={c.key} style={{ textAlign: c.align }} className="px-3 py-2"><Cell col={c} v={r?.[c.key]} /></td>)}
                {actions.length > 0 && (
                  <td className="whitespace-nowrap px-3 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions.map((a) => (
                      <Button key={a.name} size="sm" variant={a.variant || 'ghost'} onClick={() => { if (!a.confirm || confirm(a.confirm)) on.rowAction?.({ action: a.name, row: r }) }}>{a.label ?? a.name}</Button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && loading && Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
              <tr key={'sk' + i} className="border-t">{Array.from({ length: span }, (_, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-muted" /></td>)}</tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={span} className="px-3 py-8 text-center text-muted-foreground">
                {error ? <>Could not load data: {error} <button className="text-primary hover:underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></> : (p.emptyText || 'No records found')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {p.paginate !== false && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span aria-live="polite">{total ? `${from}-${to} of ${total.toLocaleString()}` : '0 results'}</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">Rows
              <select className="h-8 rounded-md border bg-transparent px-1 text-foreground" value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(0) }}>
                {SIZES.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="size-8" aria-label="First page" disabled={page === 0} onClick={() => setPage(0)}><ChevronsLeft /></Button>
              <Button size="icon" variant="outline" className="size-8" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
              <span className="px-2 text-foreground">Page {page + 1} of {pages}</span>
              <Button size="icon" variant="outline" className="size-8" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
              <Button size="icon" variant="outline" className="size-8" aria-label="Last page" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}><ChevronsRight /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
