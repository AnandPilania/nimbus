import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const selectCls = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm text-foreground'

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="text-muted-foreground grid gap-1 text-xs font-medium">
    {label}
    {children}
  </label>
)

export function Seg<T extends string>({
  v,
  set,
  opts,
}: {
  v: T
  set: (v: T) => void
  opts: { v: T; label: ReactNode; title?: string }[]
}) {
  return (
    <div className="bg-muted inline-flex rounded-md p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          title={o.title}
          onClick={() => set(o.v)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            v === o.v ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const fmt = (v: unknown) =>
  typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v, null, 2)
const same = (text: string, value: unknown) => {
  if (typeof value === 'string') return text === value
  try {
    return JSON.stringify(JSON.parse(text)) === JSON.stringify(value)
  } catch {
    return false
  }
}

/** JSON textarea. With `raw`, text that isn't valid JSON is stored as a plain string (so `{!expr}` bindings and "a,b,c" lists work too). */
export function JsonField({
  label,
  value,
  onChange,
  rows = 7,
  raw,
}: {
  label: string
  value: unknown
  onChange: (v: any) => void
  rows?: number
  raw?: boolean
}) {
  const [text, setText] = useState(() => fmt(value))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    if (!same(text, value)) {
      setText(fmt(value))
      setBad(false)
    }
  }, [JSON.stringify(value)])
  return (
    <label className="text-muted-foreground grid gap-1 text-xs font-medium">
      <span className="flex justify-between">
        {label}
        {bad && <span className="text-destructive">Invalid JSON</span>}
      </span>
      <textarea
        value={text}
        rows={rows}
        spellCheck={false}
        className={cn(
          'text-foreground focus-visible:ring-ring/50 rounded-md border bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-[3px]',
          bad && 'border-destructive',
        )}
        onChange={(e) => {
          setText(e.target.value)
          try {
            onChange(JSON.parse(e.target.value))
            setBad(false)
          } catch {
            if (raw) {
              onChange(e.target.value)
              setBad(false)
            } else setBad(true)
          }
        }}
      />
    </label>
  )
}
