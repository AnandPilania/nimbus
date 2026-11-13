import { Children, createElement, useEffect, useState, type ReactNode } from 'react'
import { Check, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, Spinner } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { DataTable } from './datatable'
import { extras } from './extras'
import { CheckboxField, ComboField, FileUploadField, normOptions, RadioField, RecordForm, SelectField, SliderField, SwitchField, TextField } from './fields'
import { FormProvider } from './form'
import { downloadFile } from './util'
import { apiHeaders, apiUrl, useNimbus } from './context'
import type { Json } from './types'

export interface PropDef { name: string; kind: 'text' | 'number' | 'boolean' | 'select' | 'json'; options?: string[] }
export interface RenderArgs { props: Record<string, any>; on: Record<string, (detail?: any) => void>; children: ReactNode; design: boolean }
export interface ComponentDef {
  label: string
  group: 'Layout' | 'Content' | 'Inputs' | 'Actions' | 'Data' | 'Feedback'
  container?: boolean
  props: PropDef[]      // drives the builder's property inspector
  events?: string[]     // drives the builder's event -> handler pickers
  defaults: Record<string, Json>
  render: (a: RenderArgs) => ReactNode
}

const t = (name: string): PropDef => ({ name, kind: 'text' })
const b = (name: string): PropDef => ({ name, kind: 'boolean' })
const n = (name: string): PropDef => ({ name, kind: 'number' })
const j = (name: string): PropDef => ({ name, kind: 'json' })
const s = (name: string, ...options: string[]): PropDef => ({ name, kind: 'select', options })
const FIELD = [t('label'), t('name'), t('value'), b('required'), b('disabled'), t('help'), t('error')]
const RULES = [n('minLength'), n('maxLength'), n('min'), n('max'), t('pattern'), t('message')]

const HEAD: Record<string, string> = { '1': 'text-3xl font-semibold tracking-tight', '2': 'text-2xl font-semibold tracking-tight', '3': 'text-lg font-semibold' }
const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end' }
const ALERT = {
  info: { icon: Info, cls: 'border-primary/30 bg-primary/5' },
  success: { icon: CircleCheck, cls: 'border-emerald-500/30 bg-emerald-500/5' },
  warning: { icon: TriangleAlert, cls: 'border-amber-500/40 bg-amber-500/5' },
  error: { icon: CircleX, cls: 'border-destructive/40 bg-destructive/5' },
} as const

function TabsView({ p, children, design }: { p: Record<string, any>; children: ReactNode; design: boolean }) {
  const tabs = normOptions(p.tabs)
  const [i, setI] = useState(+p.active || 0)
  const kids = Children.toArray(children)
  return (
    <div className="grid gap-3">
      <div role="tablist" className="flex gap-1 border-b">
        {tabs.map((tab, k) => (
          <button key={tab.value} role="tab" aria-selected={k === i} onClick={() => setI(k)} className={cn('-mb-px border-b-2 px-3 py-1.5 text-sm font-medium', k === i ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{tab.label}</button>
        ))}
      </div>
      {design ? kids.map((k, x) => <section key={x} className="grid gap-2"><div className="text-xs text-muted-foreground">Tab: {tabs[x]?.label ?? x + 1}</div>{k}</section>) : <div role="tabpanel">{kids[i]}</div>}
    </div>
  )
}

function ModalView({ p, on, children, design }: { p: Record<string, any>; on: RenderArgs['on']; children: ReactNode; design: boolean }) {
  useEffect(() => {
    if (!p.open || design) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') on.close?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [p.open, design])
  const body = (
    <div role="dialog" aria-modal={!design} aria-label={p.title} className={cn('grid w-full gap-4 rounded-xl border bg-background p-5', !design && 'shadow-xl')} style={{ maxWidth: p.width || 480 }}>
      {(p.title || p.description) && <div className="grid gap-1">{p.title && <h2 className="text-lg font-semibold">{p.title}</h2>}{p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}</div>}
      {children}
    </div>
  )
  if (design) return <div className="grid gap-2 rounded-lg border-2 border-dashed p-3"><div className="text-xs text-muted-foreground">Modal (shown inline while designing)</div>{body}</div>
  if (!p.open) return null
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) on.close?.() }}>{body}</div>
}

function DownloadButton({ p }: { p: Record<string, any> }) {
  const env = useNimbus()
  return <Button variant={p.variant} onClick={() => downloadFile({ url: p.url ? apiUrl(env, p.url) : undefined, content: p.content, filename: p.filename, headers: apiHeaders(env) })}>{p.label}</Button>
}

export const registry: Record<string, ComponentDef> = {
  // ---- layout ----
  Stack: {
    label: 'Stack', group: 'Layout', container: true,
    props: [s('direction', 'column', 'row'), n('gap'), s('align', 'stretch', 'start', 'center', 'end'), b('wrap')],
    defaults: { direction: 'column', gap: 3, align: 'stretch' },
    render: ({ props: p, children }) => <div className="flex" style={{ flexDirection: p.direction, gap: (p.gap ?? 0) * 4, alignItems: ALIGN[p.align] ?? p.align, flexWrap: p.wrap ? 'wrap' : 'nowrap' }}>{children}</div>,
  },
  Grid: {
    label: 'Grid', group: 'Layout', container: true,
    props: [n('columns'), n('gap')],
    defaults: { columns: 2, gap: 4 },
    render: ({ props: p, children }) => <div className="grid" style={{ gridTemplateColumns: `repeat(${p.columns || 1}, minmax(0, 1fr))`, gap: (p.gap ?? 0) * 4 }}>{children}</div>,
  },
  Card: {
    label: 'Card', group: 'Layout', container: true,
    props: [t('title'), t('description'), n('width')],
    defaults: { title: 'Card title' },
    render: ({ props: p, children }) => (
      <Card style={p.width ? { width: p.width, maxWidth: '100%' } : undefined}>
        {(p.title || p.description) && <CardHeader>{p.title && <CardTitle>{p.title}</CardTitle>}{p.description && <CardDescription>{p.description}</CardDescription>}</CardHeader>}
        <CardContent className="flex flex-col gap-3">{children}</CardContent>
      </Card>
    ),
  },
  Tabs: {
    label: 'Tabs', group: 'Layout', container: true,
    props: [t('tabs'), n('active')],
    defaults: { tabs: 'First,Second', active: 0 },
    render: ({ props, children, design }) => <TabsView p={props} design={design}>{children}</TabsView>,
  },
  Modal: {
    label: 'Modal', group: 'Layout', container: true, events: ['close'],
    props: [b('open'), t('title'), t('description'), n('width')],
    defaults: { open: false, title: 'Dialog title', width: 480 },
    render: ({ props, on, children, design }) => <ModalView p={props} on={on} design={design}>{children}</ModalView>,
  },
  Form: {
    label: 'Form', group: 'Layout', container: true, events: ['submit', 'invalid'],
    props: [],
    defaults: {},
    render: ({ on, children }) => <FormProvider onSubmit={(d) => on.submit?.(d)} onInvalid={(d) => on.invalid?.(d)}>{children}</FormProvider>,
  },
  Loading: {
    label: 'Loading overlay', group: 'Layout', container: true,
    props: [b('loading'), t('label')],
    defaults: { loading: false, label: 'Loading...' },
    render: ({ props: p, children }) => (
      <div className="relative" aria-busy={!!p.loading}>
        {children}
        {p.loading && <div className="absolute inset-0 z-10 grid place-items-center rounded-md bg-background/70"><Spinner label={p.label} /></div>}
      </div>
    ),
  },
  Divider: { label: 'Divider', group: 'Layout', props: [], defaults: {}, render: () => <hr className="border-border" /> },

  // ---- content ----
  Heading: {
    label: 'Heading', group: 'Content',
    props: [t('text'), s('level', '1', '2', '3')],
    defaults: { text: 'Heading', level: '2' },
    render: ({ props: p }) => createElement(`h${p.level || 2}`, { className: HEAD[p.level] ?? HEAD['2'] }, p.text),
  },
  Text: {
    label: 'Text', group: 'Content',
    props: [t('text'), b('muted')],
    defaults: { text: 'Some text' },
    render: ({ props: p }) => <p className={cn('text-sm', p.muted && 'text-muted-foreground')}>{p.text}</p>,
  },
  Badge: {
    label: 'Badge', group: 'Content',
    props: [t('text'), s('variant', 'default', 'secondary', 'outline', 'destructive')],
    defaults: { text: 'Badge', variant: 'secondary' },
    render: ({ props: p }) => <Badge variant={p.variant}>{p.text}</Badge>,
  },
  Image: {
    label: 'Image', group: 'Content',
    props: [t('src'), t('alt'), n('width'), b('rounded')],
    defaults: { src: '', alt: '', width: 120 },
    render: ({ props: p }) => (p.src ? <img src={p.src} alt={p.alt ?? ''} width={p.width} className={cn('max-w-full', p.rounded && 'rounded-full')} /> : <div className="grid h-20 w-32 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">No image</div>),
  },
  Link: {
    label: 'Link', group: 'Content',
    props: [t('text'), t('href'), b('external')],
    defaults: { text: 'Link', href: '#' },
    render: ({ props: p }) => <a href={p.href} className="text-sm text-primary hover:underline" {...(p.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{p.text}</a>,
  },
  Alert: {
    label: 'Alert', group: 'Content',
    props: [s('variant', 'info', 'success', 'warning', 'error'), t('title'), t('text')],
    defaults: { variant: 'info', title: 'Heads up', text: '' },
    render: ({ props: p }) => {
      const v = ALERT[p.variant as keyof typeof ALERT] ?? ALERT.info
      const Icon = v.icon
      return (
        <div role="alert" className={cn('flex gap-3 rounded-md border p-3 text-sm', v.cls)}>
          <Icon className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-0.5">{p.title && <div className="font-medium">{p.title}</div>}{p.text && <div className="text-muted-foreground">{p.text}</div>}</div>
        </div>
      )
    },
  },

  // ---- inputs (all support required/min/max/pattern validation, help text and `error` for server or cross-field errors) ----
  Input: {
    label: 'Input', group: 'Inputs', events: ['change'],
    props: [...FIELD, s('type', 'text', 'email', 'password', 'number', 'date', 'time', 'datetime-local', 'url', 'tel', 'search'), t('placeholder'), ...RULES],
    defaults: { label: 'Label', name: 'field', type: 'text', value: '' },
    render: ({ props, on }) => <TextField p={props} on={on} />,
  },
  Textarea: {
    label: 'Textarea', group: 'Inputs', events: ['change'],
    props: [...FIELD, t('placeholder'), n('rows'), ...RULES],
    defaults: { label: 'Label', name: 'notes', multiline: true, rows: 4, value: '' },
    render: ({ props, on }) => <TextField p={{ ...props, multiline: true }} on={on} />,
  },
  Select: {
    label: 'Select', group: 'Inputs', events: ['change'],
    props: [...FIELD, j('options'), t('placeholder')],
    defaults: { label: 'Label', name: 'choice', options: 'One, Two, Three', value: '' },
    render: ({ props, on }) => <SelectField p={props} on={on} />,
  },
  MultiSelect: {
    label: 'Multi-select', group: 'Inputs', events: ['change'],
    props: [...FIELD, j('options'), t('placeholder'), t('searchUrl')],
    defaults: { label: 'Label', name: 'choices', options: 'One, Two, Three', value: [] },
    render: ({ props, on }) => <ComboField p={{ ...props, multiple: true }} on={on} />,
  },
  Autocomplete: {
    label: 'Autocomplete', group: 'Inputs', events: ['change', 'search'],
    props: [...FIELD, j('options'), t('placeholder'), t('searchUrl'), n('minChars'), b('multiple'), b('serverSearch')],
    defaults: { label: 'Label', name: 'lookup', placeholder: 'Start typing...', value: '' },
    render: ({ props, on }) => <ComboField p={props} on={on} />,
  },
  Checkbox: {
    label: 'Checkbox', group: 'Inputs', events: ['change'],
    props: [t('label'), t('name'), t('value'), b('required'), b('disabled'), t('error')],
    defaults: { label: 'I agree', name: 'agree', value: false },
    render: ({ props, on }) => <CheckboxField p={props} on={on} />,
  },
  Switch: {
    label: 'Switch', group: 'Inputs', events: ['change'],
    props: [t('label'), t('name'), t('value'), b('disabled')],
    defaults: { label: 'Enabled', name: 'enabled', value: false },
    render: ({ props, on }) => <SwitchField p={props} on={on} />,
  },
  RadioGroup: {
    label: 'Radio group', group: 'Inputs', events: ['change'],
    props: [...FIELD, j('options'), s('direction', 'column', 'row')],
    defaults: { label: 'Label', name: 'radio', options: 'One, Two', value: 'One', direction: 'column' },
    render: ({ props, on }) => <RadioField p={props} on={on} />,
  },
  Slider: {
    label: 'Slider', group: 'Inputs', events: ['change'],
    props: [t('label'), t('name'), t('value'), n('min'), n('max'), n('step'), b('disabled')],
    defaults: { label: 'Amount', name: 'amount', value: 50, min: 0, max: 100, step: 1 },
    render: ({ props, on }) => <SliderField p={props} on={on} />,
  },
  FileUpload: {
    label: 'File upload', group: 'Inputs', events: ['change', 'uploaded', 'error'],
    props: [t('label'), t('name'), j('value'), t('uploadUrl'), t('accept'), b('multiple'), n('maxSize'), b('multipart'), t('fieldName'), b('required'), t('help'), t('error')],
    defaults: { label: 'Attachments', name: 'files', uploadUrl: '/api/files', multiple: true, maxSize: 10, value: [] },
    render: ({ props, on }) => <FileUploadField p={props} on={on} />,
  },

  // ---- actions ----
  Button: {
    label: 'Button', group: 'Actions', events: ['click'],
    props: [t('label'), s('variant', 'default', 'secondary', 'outline', 'ghost', 'destructive'), b('submit'), b('loading'), b('disabled')],
    defaults: { label: 'Button', variant: 'default' },
    render: ({ props: p, on }) => (
      <Button type={p.submit ? 'submit' : 'button'} variant={p.variant} disabled={!!p.disabled || !!p.loading} onClick={() => on.click?.()}>
        {p.loading && <Spinner />}{p.label}
      </Button>
    ),
  },
  Download: {
    label: 'Download', group: 'Actions',
    props: [t('label'), t('url'), t('filename'), t('content'), s('variant', 'outline', 'default', 'secondary', 'ghost')],
    defaults: { label: 'Download', url: '', filename: 'file.txt', variant: 'outline' },
    render: ({ props }) => <DownloadButton p={props} />,
  },

  // ---- data ----
  DataTable: {
    label: 'Data table', group: 'Data', events: ['query', 'select', 'rowAction', 'rowClick'],
    props: [
      j('columns'), j('rows'), t('url'), b('serverSide'), n('total'), b('loading'), n('version'), t('object'),
      n('pageSize'), b('paginate'), b('searchable'), b('selectable'), b('exportable'), j('actions'), t('rowKey'), t('emptyText'),
    ],
    defaults: { columns: 'name,industry', rows: '{!data.rows}', pageSize: 10, searchable: true, paginate: true },
    render: ({ props, on }) => <DataTable p={props} on={on} />,
  },
  RecordForm: {
    label: 'Record form', group: 'Data', events: ['submit', 'invalid'],
    props: [t('object'), t('fields'), j('value'), n('columns'), t('submitLabel')],
    defaults: { object: 'Account', columns: 2, submitLabel: 'Save' },
    render: ({ props, on }) => <RecordForm p={props} on={on} />,
  },
  Table: {
    label: 'Simple table', group: 'Data',
    props: [t('items'), t('columns')],
    defaults: { items: '{!data.rows}', columns: 'name,industry' },
    render: ({ props: p }) => {
      const rows: any[] = Array.isArray(p.items) ? p.items : []
      const cols = String(p.columns ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      return (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{cols.map((c) => <td key={c} className="px-3 py-2">{String(r?.[c] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    },
  },

  // ---- feedback ----
  Progress: {
    label: 'Progress bar', group: 'Feedback',
    props: [t('value'), n('max'), t('label'), b('showValue')],
    defaults: { value: 40, max: 100, label: 'Progress', showValue: true },
    render: ({ props: p }) => (
      <div className="grid gap-1.5">
        {(p.label || (p.showValue && typeof p.value === 'number')) && <div className="flex justify-between text-sm"><span>{p.label}</span>{p.showValue && typeof p.value === 'number' && <span className="text-muted-foreground">{Math.round((p.value / (p.max || 100)) * 100)}%</span>}</div>}
        <Progress value={typeof p.value === 'number' ? p.value : p.value === '' || p.value == null ? null : +p.value} max={p.max || 100} />
      </div>
    ),
  },
  Spinner: { label: 'Spinner', group: 'Feedback', props: [t('label')], defaults: { label: 'Loading...' }, render: ({ props: p }) => <Spinner label={p.label} /> },
  Skeleton: {
    label: 'Skeleton', group: 'Feedback',
    props: [n('lines')],
    defaults: { lines: 3 },
    render: ({ props: p }) => <div className="grid gap-2" aria-hidden>{Array.from({ length: Math.min(+p.lines || 1, 20) }, (_, i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: i % 3 === 2 ? '60%' : '100%' }} />)}</div>,
  },
  Steps: {
    label: 'Progress steps', group: 'Feedback',
    props: [t('steps'), n('current')],
    defaults: { steps: 'Details,Review,Done', current: 0 },
    render: ({ props: p }) => {
      const steps = normOptions(p.steps)
      const cur = +p.current || 0
      return (
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((st, i) => (
            <li key={st.value} className="flex items-center gap-2" aria-current={i === cur ? 'step' : undefined}>
              <span className={cn('grid size-6 place-items-center rounded-full border text-xs font-medium', i < cur && 'border-primary bg-primary text-primary-foreground', i === cur && 'border-primary text-primary')}>{i < cur ? <Check className="size-3.5" /> : i + 1}</span>
              <span className={cn('text-sm', i > cur && 'text-muted-foreground')}>{st.label}</span>
              {i < steps.length - 1 && <span className="h-px w-8 bg-border" />}
            </li>
          ))}
        </ol>
      )
    },
  },
  ...extras,
}

/** Extension point: register your own React component as a metadata-addressable primitive. */
export const registerComponent = (type: string, def: ComponentDef) => { registry[type] = def }
