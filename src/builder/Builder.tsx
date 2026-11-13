import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  Monitor,
  MousePointerClick,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { samples } from '@/bundles/samples'
import { defaultEnv, NimbusProvider, type NimbusEnv } from '@/nimbus/context'
import { decodeJwt } from '@/nimbus/util'
import { registry, type PropDef } from '@/nimbus/registry'
import { Boundary, BundleView, Toaster } from '@/nimbus/runtime'
import type { Bundle, Json, NodeDef } from '@/nimbus/types'
import { cn } from '@/lib/utils'
import { HandlerEditor } from './HandlerEditor'
import { useHistory } from './history'
import { localCache, restStore, type Bundles } from './store'
import { find, insert, isContainer, moveNode, place, reid, uid, update, type Pos } from './tree'
import { Field, JsonField, Seg, selectCls } from './ui'

const GROUPS = ['Layout', 'Content', 'Inputs', 'Actions', 'Data', 'Feedback'] as const
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const show = (v: Json | undefined) =>
  v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
const emitsOf = (b: Bundle) => [
  ...new Set(
    Object.values(b.handlers).flatMap((a) =>
      a.flatMap((x) => (x.type === 'emit' ? [x.event] : [])),
    ),
  ),
]
const coerce = (kind: PropDef['kind'], s: string): Json =>
  kind === 'number' && s.trim() !== '' && !isNaN(+s)
    ? +s
    : kind === 'boolean'
      ? s === 'true'
        ? true
        : s === 'false'
          ? false
          : s
      : s
const closestId = (t: EventTarget) =>
  (t as HTMLElement).closest<HTMLElement>('[data-nid]')?.dataset.nid ?? null
const STATUS = {
  loading: 'Loading...',
  saving: 'Saving...',
  saved: 'Saved to server',
  offline: 'Offline: saved locally',
  denied: 'Not authorized: check the token in Context',
} as const

function Tree({
  n,
  sel,
  pick,
  hint,
  setHint,
  drop,
  depth = 0,
}: {
  n: NodeDef
  sel: string | null
  pick: (id: string) => void
  hint: { id: string; pos: Pos } | null
  setHint: (h: { id: string; pos: Pos } | null) => void
  drop: (data: string, target: string, pos: Pos) => void
  depth?: number
}) {
  const root = depth === 0
  const posAt = (y: number): Pos =>
    root
      ? 'inside'
      : y < 0.3
        ? 'before'
        : y > 0.7
          ? 'after'
          : isContainer(n)
            ? 'inside'
            : y < 0.5
              ? 'before'
              : 'after'
  const h = hint?.id === n.id ? hint.pos : null
  return (
    <>
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={sel === n.id}
        draggable={!root}
        onClick={() => pick(n.id)}
        onKeyDown={(e) => e.key === 'Enter' && pick(n.id)}
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.setData('text/plain', 'nimbus-move:' + n.id)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setHint({ id: n.id, pos: posAt((e.clientY - r.top) / r.height) })
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setHint(null)
          drop(e.dataTransfer.getData('text/plain'), n.id, posAt((e.clientY - r.top) / r.height))
        }}
        onDragEnd={() => setHint(null)}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={cn(
          'hover:bg-accent cursor-pointer truncate rounded py-1 pr-2 text-xs',
          sel === n.id && 'bg-primary/10 text-primary font-medium',
          h === 'before' && 'shadow-[inset_0_2px_0_0_var(--primary)]',
          h === 'after' && 'shadow-[inset_0_-2px_0_0_var(--primary)]',
          h === 'inside' && 'bg-primary/15 ring-primary ring-1',
        )}
      >
        {registry[n.type]?.label ?? 'c:' + n.type}
        {n.each && ' (repeat)'}
        {n.if && ' (if)'}
        {n.perm && ' (perm)'}
      </div>
      {n.children?.map((c) => (
        <Tree
          key={c.id}
          n={c}
          sel={sel}
          pick={pick}
          hint={hint}
          setHint={setHint}
          drop={drop}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

// ---- property inspector: fields are generated from the component's registry metadata ----
function Inspector({
  n,
  b,
  bundles,
  edit,
  ops,
}: {
  n: NodeDef
  b: Bundle
  bundles: Bundles
  edit: (fn: (n: NodeDef) => NodeDef, group?: string) => void
  ops: { up: () => void; down: () => void; dup: () => void; del: () => void }
}) {
  const def = registry[n.type]
  const sub = bundles[n.type]
  const fields: PropDef[] = def
    ? def.props
    : (sub?.props ?? []).map((p) => ({ name: p.name, kind: p.type === 'string' ? 'text' : p.type }))
  const events = def ? (def.events ?? []) : sub ? emitsOf(sub) : []
  const setProp = (k: string, v: Json) =>
    edit((x) => ({ ...x, props: { ...x.props, [k]: v } }), 'p:' + k)
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{def?.label ?? 'c:' + n.type}</span>
        <code className="text-muted-foreground font-mono text-[10px]">{n.id}</code>
      </div>
      <div className="flex gap-1">
        <Button size="icon" variant="outline" title="Move up" onClick={ops.up}>
          <ArrowUp />
        </Button>
        <Button size="icon" variant="outline" title="Move down" onClick={ops.down}>
          <ArrowDown />
        </Button>
        <Button size="icon" variant="outline" title="Duplicate" onClick={ops.dup}>
          <Copy />
        </Button>
        <Button size="icon" variant="outline" title="Delete" onClick={ops.del}>
          <Trash2 />
        </Button>
      </div>
      {fields.map((f) => {
        const cur = show(n.props?.[f.name])
        if (f.kind === 'json')
          return (
            <JsonField
              key={f.name}
              label={f.name}
              raw
              rows={4}
              value={n.props?.[f.name] ?? ''}
              onChange={(v) => setProp(f.name, v)}
            />
          )
        return (
          <Field key={f.name} label={f.name}>
            {f.kind === 'select' ? (
              <select
                className={selectCls}
                value={cur}
                onChange={(e) => setProp(f.name, e.target.value)}
              >
                {[...(!cur || f.options!.includes(cur) ? [] : [cur]), ...f.options!].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <Input
                value={cur}
                placeholder={f.kind === 'boolean' ? 'true, false or {!expr}' : 'text or {!expr}'}
                onChange={(e) => setProp(f.name, coerce(f.kind, e.target.value))}
              />
            )}
          </Field>
        )
      })}
      <div className="my-1 border-t" />
      <Field label="Visible if (expression)">
        <Input
          value={n.if ?? ''}
          placeholder="state.open"
          onChange={(e) => edit((x) => ({ ...x, if: e.target.value || undefined }), 'if')}
        />
      </Field>
      <Field label="Required permission">
        <Input
          value={n.perm ?? ''}
          placeholder="accounts.edit"
          onChange={(e) => edit((x) => ({ ...x, perm: e.target.value || undefined }), 'perm')}
        />
      </Field>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Repeat over">
          <Input
            value={n.each?.items ?? ''}
            placeholder="data.accounts"
            onChange={(e) =>
              edit(
                (x) => ({
                  ...x,
                  each: e.target.value ? { items: e.target.value, as: x.each?.as } : undefined,
                }),
                'each',
              )
            }
          />
        </Field>
        <Field label="as">
          <Input
            value={n.each?.as ?? ''}
            placeholder="item"
            disabled={!n.each}
            onChange={(e) =>
              edit(
                (x) => ({ ...x, each: x.each ? { ...x.each, as: e.target.value } : undefined }),
                'as',
              )
            }
          />
        </Field>
      </div>
      {events.map((ev) => (
        <Field key={ev} label={`On ${ev}, run handler`}>
          <select
            className={selectCls}
            value={n.on?.[ev] ?? ''}
            onChange={(e) => edit((x) => ({ ...x, on: { ...x.on, [ev]: e.target.value } }))}
          >
            <option value="">(none)</option>
            {Object.keys(b.handlers).map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
      ))}
    </div>
  )
}

function ContextPanel({
  env,
  setEnv,
  token,
  setToken,
}: {
  env: { tenant: string; perms: string }
  setEnv: (e: { tenant: string; perms: string }) => void
  token: string
  setToken: (t: string) => void
}) {
  const [tenant, setTenant] = useState(env.tenant)
  const commit = () => {
    const t = tenant.trim()
    if ((t === '' || /^[\w-]{1,64}$/.test(t)) && t !== env.tenant) setEnv({ ...env, tenant: t })
    else setTenant(env.tenant)
  }
  return (
    <div className="grid gap-3">
      <Field label="Tenant (optional; empty = single tenant, otherwise sent as x-tenant)">
        <Input
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </Field>
      <Field label="User permissions (comma separated, * for all)">
        <Input value={env.perms} onChange={(e) => setEnv({ ...env, perms: e.target.value })} />
      </Field>
      <Field label="API token (sent as Authorization: Bearer; kept for this browser session only)">
        <Input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value.trim())}
        />
      </Field>
      {token && decodeJwt(token)?.permissions && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEnv({ ...env, perms: decodeJwt(token)!.permissions.join(',') })}
        >
          Preview with the token's permissions
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Preview mode applies each element's required permission, DataTable row-action permissions,
        and the $user and $tenant bindings using these values. Design mode always shows every
        element.
      </p>
    </div>
  )
}

export function Builder() {
  const {
    state: bundles,
    set: setB,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Bundles>(() => localCache.read('default') ?? samples)
  const [cur, setCur] = useState(() => Object.keys(bundles)[0])
  const [sel, setSel] = useState<string | null>(null)
  const [hov, setHov] = useState<string | null>(null)
  const [hint, setHint] = useState<{ id: string; pos: Pos } | null>(null)
  const [mode, setMode] = useState<'design' | 'preview'>('design')
  const [width, setWidth] = useState('100%')
  const [panel, setPanel] = useState<'props' | 'logic' | 'json' | 'context'>('props')
  const [ctx, setCtx] = useState({ tenant: '', perms: '*' })
  const [status, setStatus] = useState<keyof typeof STATUS>('loading')
  const [ready, setReady] = useState(false)
  // the token lives in sessionStorage only (gone when the tab closes); storage can be unavailable (privacy modes), so never let it throw
  const [token, setTokenState] = useState(() => {
    try {
      return sessionStorage.getItem('nimbus.token') ?? ''
    } catch {
      return ''
    }
  })
  const setToken = (t: string) => {
    setTokenState(t)
    try {
      t ? sessionStorage.setItem('nimbus.token', t) : sessionStorage.removeItem('nimbus.token')
    } catch {
      /* keep in memory */
    }
  }
  const headers = useMemo(
    () => (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  )
  const saved = useRef<Record<string, string>>({})

  const b = bundles[cur] ?? Object.values(bundles)[0]
  const hit = sel ? find(b.template, sel) : null
  const env = useMemo<NimbusEnv>(
    () => ({
      ...defaultEnv,
      tenant: ctx.tenant || undefined,
      api: { ...defaultEnv.api, headers },
      user: {
        ...defaultEnv.user,
        permissions: ctx.perms
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    }),
    [ctx, headers],
  )
  const store = useMemo(
    () =>
      restStore({
        ...defaultEnv,
        tenant: ctx.tenant || undefined,
        api: { ...defaultEnv.api, headers },
      }),
    [ctx.tenant, headers],
  )

  useEffect(() => {
    if (!bundles[cur]) setCur(Object.keys(bundles)[0])
  }, [bundles, cur])

  // load this tenant's bundles from the server (falls back to the local cache; seeds the server when it is empty)
  useEffect(() => {
    let live = true
    setReady(false)
    setStatus('loading')
    store
      .list()
      .then((remote) => {
        if (!live) return
        if (Object.keys(remote).length) {
          saved.current = Object.fromEntries(
            Object.entries(remote).map(([k, v]) => [k, JSON.stringify(v)]),
          )
          reset(remote)
          setCur(Object.keys(remote)[0])
          setStatus('saved')
        } else {
          saved.current = {}
          reset(localCache.read(ctx.tenant) ?? samples)
          setStatus('saving')
        }
        setSel(null)
      })
      .catch((e) => {
        if (live) {
          saved.current = {}
          reset(localCache.read(ctx.tenant) ?? samples)
          setStatus(e?.status === 401 || e?.status === 403 ? 'denied' : 'offline')
          setSel(null)
        }
      })
      .finally(() => {
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [store])

  // autosave: debounce, then push only the bundles that changed (and delete removed ones)
  useEffect(() => {
    if (!ready) return
    localCache.write(ctx.tenant, bundles)
    const t = setTimeout(async () => {
      const changed = Object.values(bundles).filter(
        (x) => saved.current[x.apiName] !== JSON.stringify(x),
      )
      const removed = Object.keys(saved.current).filter((k) => !bundles[k])
      if (!changed.length && !removed.length) return
      setStatus('saving')
      try {
        await Promise.all([
          ...changed.map((x) =>
            store.save(x).then(() => {
              saved.current[x.apiName] = JSON.stringify(x)
            }),
          ),
          ...removed.map((k) =>
            store.remove(k).then(() => {
              delete saved.current[k]
            }),
          ),
        ])
        setStatus('saved')
      } catch (e: any) {
        setStatus(e?.status === 401 || e?.status === 403 ? 'denied' : 'offline')
      }
    }, 700)
    return () => clearTimeout(t)
  }, [bundles, ready])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo])

  const patch = (fn: (b: Bundle) => Bundle, group = '') =>
    setB((all) => ({ ...all, [b.apiName]: fn(all[b.apiName]) }), group && b.apiName + ':' + group)
  const setTree = (fn: (t: NodeDef) => NodeDef) =>
    patch((x) => ({ ...x, template: fn(x.template) }))
  const edit = (fn: (n: NodeDef) => NodeDef, group = '') => {
    if (sel)
      patch((x) => ({ ...x, template: update(x.template, sel, fn) }), group && sel + ':' + group)
  }

  const mkNode = (type: string): NodeDef => {
    const def = registry[type]
    const props: Record<string, Json> = def
      ? structuredClone(def.defaults)
      : Object.fromEntries((bundles[type]?.props ?? []).map((p) => [p.name, p.default ?? '']))
    return { id: uid(), type, props, ...(def?.container ? { children: [] } : {}) }
  }
  const add = (type: string, target?: string) => {
    const node = mkNode(type)
    setTree((t) => insert(t, target ?? sel ?? t.id, node))
    setSel(node.id)
  }
  const dropOutline = (data: string, target: string, pos: Pos) => {
    if (data.startsWith('nimbus-move:')) setTree((t) => moveNode(t, data.slice(12), target, pos))
    else if (data.startsWith('nimbus:')) {
      const node = mkNode(data.slice(7))
      setTree((t) => place(t, node, target, pos))
      setSel(node.id)
    }
  }
  const siblings = (fn: (kids: NodeDef[], i: number, n: NodeDef) => NodeDef[]) => {
    if (!hit?.[1]) return
    const [n, p] = hit
    setTree((t) =>
      update(t, p!.id, (q) => ({
        ...q,
        children: fn(
          [...q.children!],
          q.children!.findIndex((c) => c.id === n.id),
          n,
        ),
      })),
    )
  }
  const swap = (d: number) =>
    siblings((k, i) => {
      const j = i + d
      if (j >= 0 && j < k.length) [k[i], k[j]] = [k[j], k[i]]
      return k
    })
  const ops = {
    up: () => swap(-1),
    down: () => swap(1),
    dup: () =>
      siblings((k, i, n) => {
        k.splice(i + 1, 0, reid(n))
        return k
      }),
    del: () => {
      const p = hit?.[1]
      siblings((k, i) => (k.splice(i, 1), k))
      if (p) setSel(p.id)
    },
  }

  const create = () => {
    const name = prompt('Bundle name (camelCase, e.g. caseSummary)')?.trim()
    if (!name || !/^[a-zA-Z]\w*$/.test(name) || registry[name] || bundles[name]) return
    const root: NodeDef = {
      id: 'root',
      type: 'Stack',
      props: { ...registry.Stack.defaults },
      children: [],
    }
    setB((all) => ({
      ...all,
      [name]: {
        apiName: name,
        label: name,
        props: [],
        state: {},
        data: {},
        handlers: {},
        template: root,
      },
    }))
    setCur(name)
    setSel(null)
  }
  const remove = () => {
    if (Object.keys(bundles).length < 2 || !confirm(`Delete c:${b.apiName}?`)) return
    const { [b.apiName]: _gone, ...rest } = bundles
    setB(() => rest)
    setCur(Object.keys(rest)[0])
    setSel(null)
  }
  const exportJson = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }),
    )
    a.download = `${b.apiName}.bundle.json`
    a.click()
  }

  const design = mode === 'design'
  const mine = Object.keys(bundles).filter((k) => k !== b.apiName)
  const chip =
    'cursor-grab truncate rounded-md border px-2 py-1.5 text-left text-xs hover:border-primary hover:bg-accent'

  return (
    <NimbusProvider value={env}>
      <div className="bg-muted/40 flex h-screen flex-col">
        <header className="bg-background flex items-center gap-2 border-b px-4 py-2">
          <span className="mr-2 text-sm font-semibold tracking-tight">
            Nimbus <span className="text-muted-foreground font-normal">Studio</span>
          </span>
          <select
            aria-label="Bundle"
            className={cn(selectCls, 'w-52')}
            value={b.apiName}
            onChange={(e) => {
              setCur(e.target.value)
              setSel(null)
            }}
          >
            {Object.values(bundles).map((x) => (
              <option key={x.apiName} value={x.apiName}>
                c:{x.apiName}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={create}>
            <Plus />
            New bundle
          </Button>
          <Button size="icon" variant="ghost" title="Delete bundle" onClick={remove}>
            <Trash2 />
          </Button>
          <div className="bg-border mx-1 h-5 w-px" />
          <Button
            size="icon"
            variant="ghost"
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Redo (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <span
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
              aria-live="polite"
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  status === 'saved'
                    ? 'bg-emerald-500'
                    : status === 'denied'
                      ? 'bg-destructive'
                      : status === 'offline'
                        ? 'bg-amber-500'
                        : 'bg-primary animate-pulse',
                )}
              />
              {STATUS[status]}
            </span>
            <Seg
              v={width}
              set={setWidth}
              opts={[
                { v: '100%', title: 'Desktop', label: <Monitor className="size-3.5" /> },
                { v: '768px', title: 'Tablet', label: <Tablet className="size-3.5" /> },
                { v: '390px', title: 'Phone', label: <Smartphone className="size-3.5" /> },
              ]}
            />
            <Seg
              v={mode}
              set={setMode}
              opts={[
                {
                  v: 'design',
                  label: (
                    <>
                      <MousePointerClick className="size-3.5" />
                      Design
                    </>
                  ),
                },
                {
                  v: 'preview',
                  label: (
                    <>
                      <Eye className="size-3.5" />
                      Preview
                    </>
                  ),
                },
              ]}
            />
            <Button size="sm" variant="outline" onClick={exportJson}>
              <Download />
              Export JSON
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className="bg-background flex w-60 shrink-0 flex-col border-r"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setHint(null)
            }}
          >
            <div className="min-h-0 flex-[3] overflow-y-auto p-3">
              {[
                ...GROUPS.map(
                  (g) =>
                    [
                      g,
                      Object.entries(registry)
                        .filter(([, d]) => d.group === g)
                        .map(([t, d]) => [t, d.label] as const),
                    ] as const,
                ),
                ...(mine.length
                  ? [['My bundles', mine.map((k) => [k, 'c:' + k] as const)] as const]
                  : []),
              ].map(([g, items]) => (
                <section key={g} className="mb-3">
                  <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold">{g}</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map(([t, label]) => (
                      <button
                        key={t}
                        draggable
                        title="Click to add, or drag onto the canvas or outline"
                        className={chip}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', 'nimbus:' + t)}
                        onClick={() => add(t)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="min-h-0 flex-[2] overflow-y-auto border-t p-3">
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
                Outline <span className="font-normal">(drag to reorder)</span>
              </h3>
              <Tree
                n={b.template}
                sel={sel}
                pick={setSel}
                hint={hint}
                setHint={setHint}
                drop={dropOutline}
              />
            </div>
          </aside>

          <main className="flex-1 overflow-auto p-6" onClick={() => setSel(null)}>
            <div
              className="bg-background mx-auto max-w-full rounded-xl border p-6 shadow-xs transition-[width]"
              style={{ width }}
              onClick={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => {
                if (design) e.preventDefault()
              }}
              onClickCapture={(e) => {
                if (design) {
                  e.preventDefault()
                  e.stopPropagation()
                  setSel(closestId(e.target))
                }
              }}
              onMouseOver={(e) => design && setHov(closestId(e.target))}
              onMouseLeave={() => setHov(null)}
              onDragOver={(e) => design && e.preventDefault()}
              onDrop={(e) => {
                const t = e.dataTransfer.getData('text/plain')
                if (!design || !t.startsWith('nimbus:')) return
                e.preventDefault()
                add(t.slice(7), closestId(e.target) ?? b.template.id)
              }}
            >
              <Boundary reset={b}>
                <BundleView
                  key={JSON.stringify([b.apiName, b.state, b.data, mode, ctx.tenant])}
                  bundle={b}
                  bundles={bundles}
                  design={design ? { sel, hov } : undefined}
                />
              </Boundary>
            </div>
          </main>

          <aside className="bg-background flex w-80 shrink-0 flex-col border-l">
            <div className="border-b p-2">
              <Seg
                v={panel}
                set={setPanel}
                opts={[
                  { v: 'props', label: 'Properties' },
                  { v: 'logic', label: 'Logic' },
                  { v: 'json', label: 'JSON' },
                  { v: 'context', label: 'Context' },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {panel === 'props' &&
                (hit ? (
                  <Inspector
                    key={hit[0].id}
                    n={hit[0]}
                    b={b}
                    bundles={bundles}
                    edit={edit}
                    ops={ops}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Select an element on the canvas or in the outline to edit its properties.
                  </p>
                ))}
              {panel === 'logic' && (
                <div className="grid gap-4">
                  <JsonField
                    label="props (public API, like @api)"
                    value={b.props}
                    onChange={(v) =>
                      Array.isArray(v) && patch((x) => ({ ...x, props: v }), 'props')
                    }
                  />
                  <JsonField
                    label="state (reactive, like @track)"
                    value={b.state}
                    onChange={(v) => isObj(v) && patch((x) => ({ ...x, state: v }), 'state')}
                  />
                  <JsonField
                    label="data (like @wire): value or url"
                    value={b.data}
                    onChange={(v) => isObj(v) && patch((x) => ({ ...x, data: v }), 'data')}
                  />
                  <div className="grid gap-2">
                    <div className="text-muted-foreground text-xs font-medium">Handlers</div>
                    <HandlerEditor
                      handlers={b.handlers}
                      onChange={(h) => patch((x) => ({ ...x, handlers: h }), 'handlers')}
                    />
                  </div>
                </div>
              )}
              {panel === 'json' && (
                <JsonField
                  label={`c:${b.apiName} metadata`}
                  rows={30}
                  value={b}
                  onChange={(v) =>
                    isObj(v) &&
                    isObj(v.template) &&
                    patch(() => ({ ...v, apiName: b.apiName }) as Bundle, 'json')
                  }
                />
              )}
              {panel === 'context' && (
                <ContextPanel env={ctx} setEnv={setCtx} token={token} setToken={setToken} />
              )}
            </div>
          </aside>
        </div>
        <Toaster />
      </div>
    </NimbusProvider>
  )
}
