import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, FileText, Loader2, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { apiFetch, apiHeaders, apiUrl, useNimbus, useObject, type FieldMeta } from './context'
import { FieldShell, FormProvider, rulesOf, useField } from './form'
import { downloadFile, fmtSize } from './util'

export type Ev = Record<string, (d?: any) => void>
interface FP { p: Record<string, any>; on: Ev }
export interface Opt { value: string; label: string }

const control = 'w-full rounded-md border border-input bg-transparent text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

/** Options may be "a, b, c", ["a","b"], or [{ value, label }] / [{ id, name }]. */
export function normOptions(x: any): Opt[] {
  const arr: any[] = typeof x === 'string' ? x.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(x) ? x : []
  return arr.map((o) => (o && typeof o === 'object'
    ? { value: String(o.value ?? o.id ?? o.label), label: String(o.label ?? o.name ?? o.value ?? o.id) }
    : { value: String(o), label: String(o) }))
}

export function TextField({ p, on }: FP) {
  const id = useId()
  const f = useField(p.name, p.value, rulesOf(p), p.error)
  const change = (v: string) => on.change?.({ name: p.name, value: p.type === 'number' && v !== '' ? +v : v })
  const common = { id, name: p.name, placeholder: p.placeholder, disabled: !!p.disabled, readOnly: !!p.readOnly, 'aria-invalid': !!f.error || undefined, onBlur: f.touch }
  return (
    <FieldShell id={id} label={p.label} help={p.help} error={f.error} required={!!p.required}>
      {p.multiline
        ? <textarea {...common} rows={p.rows ?? 4} maxLength={p.maxLength} value={p.value ?? ''} onChange={(e) => change(e.target.value)} className={cn(control, 'min-h-16 px-3 py-2', f.error && 'border-destructive')} />
        : <Input {...common} type={p.type || 'text'} min={p.min} max={p.max} maxLength={p.maxLength} value={p.value ?? ''} onChange={(e) => change(e.target.value)} className={f.error ? 'border-destructive' : ''} />}
    </FieldShell>
  )
}

export function SelectField({ p, on }: FP) {
  const id = useId()
  const f = useField(p.name, p.value, rulesOf(p), p.error)
  return (
    <FieldShell id={id} label={p.label} help={p.help} error={f.error} required={!!p.required}>
      <select id={id} name={p.name} value={p.value ?? ''} disabled={!!p.disabled} onBlur={f.touch} onChange={(e) => on.change?.({ name: p.name, value: e.target.value })} className={cn(control, 'h-9 px-2', f.error && 'border-destructive')}>
        <option value="">{p.placeholder ?? 'Select...'}</option>
        {normOptions(p.options).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  )
}

/** Autocomplete and MultiSelect share this: static options, remote search (`searchUrl`, GET ?q=), or parent-driven (`serverSearch` + search event). */
export function ComboField({ p, on }: FP) {
  const env = useNimbus()
  const id = useId()
  const multiple = !!p.multiple
  const f = useField(p.name, p.value, rulesOf(p), p.error)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<Opt[]>([])
  const [busy, setBusy] = useState(false)
  const labels = useRef(new Map<string, string>())
  const box = useRef<HTMLDivElement>(null)
  const statics = useMemo(() => normOptions(p.options), [JSON.stringify(p.options)])
  const searching = !!p.searchUrl || !!p.serverSearch
  const minChars = p.minChars ?? (searching ? 2 : 0)

  const list = p.searchUrl ? remote : p.serverSearch ? statics : statics.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  for (const o of [...statics, ...remote]) labels.current.set(o.value, o.label)
  const sel: string[] = multiple ? (Array.isArray(p.value) ? p.value.map(String) : []) : p.value == null || p.value === '' ? [] : [String(p.value)]
  const labelOf = (v: string) => labels.current.get(v) ?? v

  useEffect(() => {
    if (!open || !searching) return
    if (q.length < minChars) { setRemote([]); return }
    const ac = new AbortController()
    const t = setTimeout(() => {
      if (!p.searchUrl) { on.search?.({ query: q }); return }
      setBusy(true)
      apiFetch(env, `${p.searchUrl}${p.searchUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((r) => setRemote(normOptions(Array.isArray(r) ? r : r?.rows ?? r?.options ?? [])))
        .catch(() => {})
        .finally(() => setBusy(false))
    }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [q, open])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setQ(''); f.touch() } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = (o: Opt) => {
    labels.current.set(o.value, o.label)
    if (multiple) on.change?.({ name: p.name, value: sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value] })
    else { on.change?.({ name: p.name, value: o.value, option: o }); setOpen(false) }
    setQ('')
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]) }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); setQ('') }
    else if (e.key === 'Backspace' && !q && multiple && sel.length) on.change?.({ name: p.name, value: sel.slice(0, -1) })
  }

  return (
    <FieldShell id={id} label={p.label} help={p.help} error={f.error} required={!!p.required}>
      <div ref={box} className="relative">
        <div onClick={() => setOpen(true)} className={cn('flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input px-2 py-1 focus-within:ring-[3px] focus-within:ring-ring/50', f.error && 'border-destructive', p.disabled && 'opacity-50')}>
          {multiple && sel.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {labelOf(v)}
              <button type="button" aria-label={`Remove ${labelOf(v)}`} onClick={(e) => { e.stopPropagation(); on.change?.({ name: p.name, value: sel.filter((x) => x !== v) }) }}><X className="size-3" /></button>
            </Badge>
          ))}
          <input
            id={id} role="combobox" aria-expanded={open} aria-autocomplete="list" disabled={!!p.disabled}
            className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={multiple && sel.length ? '' : p.placeholder}
            value={open || multiple ? q : sel[0] ? labelOf(sel[0]) : ''}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
            onFocus={() => setOpen(true)} onKeyDown={onKey}
          />
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        {open && (
          <ul role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background py-1 shadow-md">
            {list.length ? list.map((o, i) => (
              <li key={o.value} role="option" aria-selected={sel.includes(o.value)}
                onMouseDown={(e) => { e.preventDefault(); pick(o) }} onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm', i === active && 'bg-accent')}>
                {o.label}{sel.includes(o.value) && <Check className="size-4 text-primary" />}
              </li>
            )) : (
              <li className="px-3 py-2 text-sm text-muted-foreground">{busy ? 'Searching...' : q.length < minChars ? `Type ${minChars} or more characters` : 'No results'}</li>
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}

export function CheckboxField({ p, on }: FP) {
  const id = useId()
  const f = useField(p.name, !!p.value, { required: !!p.required, message: p.message }, p.error)
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={!!p.value} disabled={!!p.disabled} onBlur={f.touch} onChange={(e) => on.change?.({ name: p.name, value: e.target.checked })} className="size-4 accent-primary" />
        {p.label}{p.required && <span className="text-destructive">*</span>}
      </label>
      {f.error && <p role="alert" className="text-xs text-destructive">{f.error}</p>}
    </div>
  )
}

export function SwitchField({ p, on }: FP) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id} className="font-medium">{p.label}</label>
      <button id={id} type="button" role="switch" aria-checked={!!p.value} disabled={!!p.disabled} onClick={() => on.change?.({ name: p.name, value: !p.value })}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50', p.value ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform', p.value && 'translate-x-4')} />
      </button>
    </div>
  )
}

export function RadioField({ p, on }: FP) {
  const group = useId()
  const f = useField(p.name, p.value, rulesOf(p), p.error)
  return (
    <FieldShell label={p.label} help={p.help} error={f.error} required={!!p.required}>
      <div role="radiogroup" className={cn('flex gap-4', p.direction !== 'row' && 'flex-col gap-2')}>
        {normOptions(p.options).map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name={group} value={o.value} checked={String(p.value ?? '') === o.value} disabled={!!p.disabled} onBlur={f.touch} onChange={() => on.change?.({ name: p.name, value: o.value })} className="size-4 accent-primary" />
            {o.label}
          </label>
        ))}
      </div>
    </FieldShell>
  )
}

export function SliderField({ p, on }: FP) {
  const id = useId()
  return (
    <FieldShell id={id} label={p.label ? `${p.label}: ${p.value ?? p.min ?? 0}` : undefined} help={p.help}>
      <input id={id} type="range" min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? 1} value={p.value ?? p.min ?? 0} disabled={!!p.disabled} onChange={(e) => on.change?.({ name: p.name, value: +e.target.value })} className="w-full accent-primary" />
    </FieldShell>
  )
}

// ---- file upload (XHR so we get real upload progress) ----
interface UItem { key: string; name: string; size: number; progress: number; status: 'uploading' | 'done' | 'error'; error?: string; url?: string }
const accepts = (file: File, accept?: string) => {
  if (!accept) return true
  return accept.split(',').map((s) => s.trim().toLowerCase()).some((a) => a.startsWith('.') ? file.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a)
}

export function FileUploadField({ p, on }: FP) {
  const env = useNimbus()
  const id = useId()
  const done: any[] = Array.isArray(p.value) ? p.value : []
  const f = useField(p.name, done, rulesOf(p), p.error)
  const [items, setItems] = useState<UItem[]>([])
  const [over, setOver] = useState(false)
  const value = useRef(done)
  value.current = done
  const xhrs = useRef(new Map<string, XMLHttpRequest>())
  const patch = (key: string, d: Partial<UItem>) => setItems((s) => s.map((x) => (x.key === key ? { ...x, ...d } : x)))
  const fail = (key: string, message: string) => { patch(key, { status: 'error', error: message }); on.error?.({ message }) }
  const finish = (key: string, d: Record<string, any>) => {
    patch(key, { status: 'done', progress: 100, url: d.url })
    value.current = p.multiple ? [...value.current, { key, ...d }] : [{ key, ...d }]
    on.change?.({ name: p.name, value: value.current })
  }

  const upload = (file: File) => {
    const key = Math.random().toString(36).slice(2)
    const base = { key, name: file.name, size: file.size, progress: 0 }
    const reason = p.maxSize && file.size > p.maxSize * 1048576 ? `Larger than ${p.maxSize} MB` : !accepts(file, p.accept) ? `Not an accepted file type (${p.accept})` : ''
    if (reason) { setItems((s) => [...s, { ...base, status: 'error', error: reason }]); on.error?.({ message: reason }); return }
    if (!p.multiple) { value.current = []; setItems([]) }
    if (!p.uploadUrl) { setItems((s) => [...s, { ...base, status: 'uploading' }]); finish(key, { name: file.name, size: file.size, type: file.type }); return }
    setItems((s) => [...s, { ...base, status: 'uploading' }])
    const xhr = new XMLHttpRequest()
    xhrs.current.set(key, xhr)
    xhr.open('POST', apiUrl(env, p.uploadUrl))
    for (const [k, v] of Object.entries(apiHeaders(env))) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && patch(key, { progress: Math.round((e.loaded / e.total) * 100) })
    xhr.onerror = () => fail(key, 'Network error')
    xhr.onload = () => {
      xhrs.current.delete(key)
      let body: any = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) { finish(key, { name: body.name ?? file.name, size: body.size ?? file.size, id: body.id, url: body.url }); on.uploaded?.({ file: body }) }
      else fail(key, body.message || `Upload failed (${xhr.status})`)
    }
    if (p.multipart) { const fd = new FormData(); fd.append(p.fieldName || 'file', file); xhr.send(fd) }
    else { xhr.setRequestHeader('x-filename', encodeURIComponent(file.name)); xhr.setRequestHeader('content-type', file.type || 'application/octet-stream'); xhr.send(file) }
  }
  const remove = (key: string) => {
    xhrs.current.get(key)?.abort(); xhrs.current.delete(key)
    setItems((s) => s.filter((x) => x.key !== key))
    if (value.current.some((d) => d.key === key)) { value.current = value.current.filter((d) => d.key !== key); on.change?.({ name: p.name, value: value.current }) }
  }
  const take = (files: FileList | null) => { if (files) [...files].forEach(upload) }
  const rows: UItem[] = [...done.filter((d) => !items.some((i) => i.key === d.key)).map((d) => ({ key: d.key ?? d.name, name: d.name, size: d.size ?? 0, progress: 100, status: 'done' as const, url: d.url })), ...items]

  return (
    <FieldShell id={id} label={p.label} help={p.help} error={f.error} required={!!p.required}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
        className={cn('flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors', over && 'border-primary bg-primary/5', f.error && 'border-destructive')}>
        <Upload className="size-5 text-muted-foreground" />
        <span>Drop {p.multiple ? 'files' : 'a file'} here or <label htmlFor={id} className="cursor-pointer font-medium text-primary hover:underline">browse</label></span>
        <span className="text-xs text-muted-foreground">{[p.accept, p.maxSize && `up to ${p.maxSize} MB`].filter(Boolean).join(', ')}</span>
        <input id={id} type="file" className="sr-only" accept={p.accept} multiple={!!p.multiple} disabled={!!p.disabled} onBlur={f.touch} onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      </div>
      {rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.key} className="grid gap-1.5 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground">{fmtSize(r.size)}</span>
                {r.status === 'done' && r.url && <Button type="button" size="sm" variant="ghost" onClick={() => downloadFile({ url: apiUrl(env, r.url!), filename: r.name, headers: apiHeaders(env) })}>Download</Button>}
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => remove(r.key)}><X className="size-4 text-muted-foreground hover:text-foreground" /></button>
              </div>
              {r.status === 'uploading' && p.uploadUrl && <Progress value={r.progress} />}
              {r.status === 'error' && <p className="text-xs text-destructive">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </FieldShell>
  )
}

// ---- object-driven form: fields come from the tenant's object metadata ----
function MetaField({ f, value, onChange }: { f: FieldMeta; value: any; onChange: (v: any) => void }) {
  const base = { label: f.label, name: f.apiName, value, required: f.required, maxLength: f.maxLength }
  const on = { change: (d?: any) => onChange(d.value) }
  switch (f.type) {
    case 'picklist': return <SelectField p={{ ...base, options: f.options }} on={on} />
    case 'boolean': return <CheckboxField p={base} on={on} />
    case 'textarea': return <TextField p={{ ...base, multiline: true }} on={on} />
    case 'number': case 'currency': return <TextField p={{ ...base, type: 'number' }} on={on} />
    case 'date': case 'email': case 'url': return <TextField p={{ ...base, type: f.type }} on={on} />
    default: return <TextField p={base} on={on} />
  }
}

export function RecordForm({ p, on }: FP) {
  const meta = useObject(p.object)
  const [vals, setVals] = useState<Record<string, any>>(() => ({ ...(p.value ?? {}) }))
  useEffect(() => setVals({ ...(p.value ?? {}) }), [JSON.stringify(p.value)])
  if (!meta) return <div className="text-sm text-muted-foreground">{p.object ? `Loading ${p.object} metadata...` : 'Set the object property to generate this form.'}</div>
  const wanted = typeof p.fields === 'string' && p.fields.trim() ? p.fields.split(',').map((s: string) => s.trim()) : null
  return (
    <FormProvider onSubmit={(d) => on.submit?.(d)} onInvalid={(d) => on.invalid?.(d)} className="grid gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${p.columns || 1}, minmax(0, 1fr))` }}>
        {meta.fields.filter((f) => !wanted || wanted.includes(f.apiName)).map((f) => (
          <MetaField key={f.apiName} f={f} value={vals[f.apiName]} onChange={(v) => setVals((s) => ({ ...s, [f.apiName]: v }))} />
        ))}
      </div>
      <div><Button type="submit">{p.submitLabel || 'Save'}</Button></div>
    </FormProvider>
  )
}
