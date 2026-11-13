import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { apiFetch, can, useNimbus, apiHeaders, apiUrl, type NimbusEnv } from './context'
import { resolve, run } from './expr'
import { registry } from './registry'
import { downloadFile, getIn, setIn } from './util'
import type { Bundle, NodeDef } from './types'

type Bundles = Record<string, Bundle>
export type Design = { sel: string | null; hov: string | null }
interface Scope { ctx: Record<string, any>; fire: (handler: string, detail?: any) => void; bundles: Bundles; design?: Design; depth: number; env: NimbusEnv }

// ---- toast (tiny built-in so the `toast` action works anywhere) ----
type Toast = { id: number; m: string; v?: string }
const listeners = new Set<(t: Omit<Toast, 'id'>) => void>()
export const toast = (m: string, v?: string) => listeners.forEach((l) => l({ m, v }))
export function Toaster() {
  const [msgs, setMsgs] = useState<Toast[]>([])
  useEffect(() => {
    const l = (t: Omit<Toast, 'id'>) => {
      const id = Math.random()
      setMsgs((s) => [...s, { ...t, id }])
      setTimeout(() => setMsgs((s) => s.filter((x) => x.id !== id)), 3000)
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {msgs.map((x) => (
        <div key={x.id} className={`rounded-md border bg-card px-4 py-2 text-sm shadow-lg ${x.v === 'error' ? 'border-destructive/50 text-destructive' : x.v === 'success' ? 'border-emerald-500/50' : ''}`}>{x.m}</div>
      ))}
    </div>
  )
}

/** Catches bad metadata so a broken bundle shows a message instead of blanking the app. */
export class Boundary extends Component<{ reset?: unknown; children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {}
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidUpdate(prev: { reset?: unknown }) { if (prev.reset !== this.props.reset && this.state.err) this.setState({ err: undefined }) }
  render() {
    return this.state.err
      ? <pre className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{this.state.err.message}</pre>
      : this.props.children
  }
}

// ---- template interpreter ----
function renderNode(n: NodeDef, s: Scope, key: string): ReactNode {
  if (n.each?.items) {
    const list = run(n.each.items, s.ctx)
    if (!Array.isArray(list)) return null
    const as = n.each.as || 'item'
    return list.map((item, index) => renderNode({ ...n, each: undefined }, { ...s, ctx: { ...s.ctx, [as]: item, index } }, `${key}-${index}`))
  }
  // The builder canvas shows every node so it can be selected; conditions and permissions apply in preview and production.
  if (!s.design) {
    if (n.perm && !can(s.env, n.perm)) return null
    if (n.if && !run(n.if, s.ctx)) return null
  }

  const props: Record<string, any> = {}
  for (const [k, v] of Object.entries(n.props ?? {})) props[k] = resolve(v, s.ctx)
  const on: Record<string, (d?: any) => void> = {}
  for (const [ev, h] of Object.entries(n.on ?? {})) if (h) on[ev] = (d) => s.fire(h, d)

  const def = registry[n.type]
  const sub = s.bundles[n.type]
  let el: ReactNode
  if (def) {
    const kids = n.children?.map((c) => renderNode(c, s, c.id))
    const empty = def.container && s.design && !n.children?.length
    el = def.render({
      props, on, design: !!s.design,
      children: empty
        ? <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Empty. Drop a component here.</div>
        : kids,
    })
  } else if (sub) {
    el = <BundleView bundle={sub} bundles={s.bundles} props={props} on={on} depth={s.depth + 1} />
  } else {
    el = <div className="rounded border border-dashed border-destructive p-2 text-xs text-destructive">Unknown component: {n.type}</div>
  }

  // In design mode every node is wrapped (display:contents, so layout is untouched) to make it selectable.
  return s.design
    ? <div key={key} data-nid={n.id} data-sel={s.design.sel === n.id ? '' : undefined} data-hov={s.design.hov === n.id ? '' : undefined} style={{ display: 'contents' }}>{el}</div>
    : <Fragment key={key}>{el}</Fragment>
}

export function BundleView({ bundle, bundles, props = {}, on = {}, design, depth = 0 }: {
  bundle: Bundle
  bundles: Bundles
  props?: Record<string, any>
  on?: Record<string, (d?: any) => void>
  design?: Design
  depth?: number
}) {
  const env = useNimbus()
  const [state, setState] = useState<Record<string, any>>(() => structuredClone(bundle.state ?? {}))
  const [data, setData] = useState<Record<string, any>>(() => Object.fromEntries(Object.entries(bundle.data ?? {}).map(([k, w]) => [k, w.value ?? null])))
  const live = useRef(state)
  live.current = state
  const dataRef = useRef(data)
  dataRef.current = data
  const p = { ...Object.fromEntries((bundle.props ?? []).map((x) => [x.name, x.default])), ...props }

  const fire = async (name: string, $event?: any, hops = 0): Promise<void> => {
    const acts = bundle.handlers?.[name]
    if (!acts || hops > 20) return
    const commit = (path: string, v: any) => { live.current = setIn(live.current, path, v); setState(live.current) }
    for (const a of acts) {
      const ctx = { props: p, state: live.current, data: dataRef.current, $event, $user: env.user, $tenant: env.tenant }
      const key = 'key' in a ? String(resolve(a.key, ctx) ?? '') : ''
      switch (a.type) {
        case 'set': commit(key, resolve(a.value, ctx)); break
        case 'toggle': commit(key, !getIn(live.current, key)); break
        case 'push': commit(key, [...(getIn(live.current, key) ?? []), resolve(a.value, ctx)]); break
        case 'remove': { const i = +resolve(a.index, ctx); commit(key, (getIn(live.current, key) ?? []).filter((_: unknown, x: number) => x !== i)); break }
        case 'emit': on[a.event]?.(resolve(a.detail, ctx)); break
        case 'toast': toast(String(resolve(a.message, ctx) ?? ''), a.variant); break
        case 'call': await fire(a.handler, $event, hops + 1); break
        case 'if': { const h = run(a.cond, ctx) ? a.then : a.else; if (h) await fire(h, $event, hops + 1); break }
        case 'download': downloadFile({ url: a.url ? apiUrl(env, String(resolve(a.url, ctx))) : undefined, content: a.content != null ? String(resolve(a.content, ctx)) : undefined, filename: String(resolve(a.filename, ctx) ?? ''), headers: apiHeaders(env) }); break
        case 'fetch': {
          if (a.loading) commit(a.loading, true)
          if (a.error) commit(a.error, '')
          try {
            const body = a.body !== undefined ? resolve(a.body, ctx) : undefined
            const result = await apiFetch(env, String(resolve(a.url, ctx)), { method: a.method ?? 'GET', json: body })
            if (a.into) commit(a.into, result)
            if (a.loading) commit(a.loading, false)
            if (a.then) await fire(a.then, result, hops + 1)
          } catch (e: any) {
            if (a.loading) commit(a.loading, false)
            if (a.error) commit(a.error, e.message)
            const detail = { message: e.message, status: e.status, errors: e.body?.errors }
            if (a.catch) await fire(a.catch, detail, hops + 1)
            else toast(e.message, 'error')
          }
          break
        }
      }
    }
  }

  useEffect(() => {
    const ac = new AbortController()
    for (const [k, w] of Object.entries(bundle.data ?? {}))
      if (w.url) apiFetch(env, w.url, { signal: ac.signal }).then((v) => setData((d) => ({ ...d, [k]: v }))).catch(() => {})
    if (bundle.handlers?.init) fire('init')
    return () => ac.abort()
  }, [])

  if (depth > 8) return <div className="text-xs text-destructive">Max nesting depth reached (circular bundle?)</div>
  return <>{renderNode(bundle.template, { ctx: { props: p, state, data, $user: env.user, $tenant: env.tenant }, fire, bundles, design, depth, env }, bundle.template.id)}</>
}
