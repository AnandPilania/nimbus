import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

export interface Rules { required?: boolean; minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string; type?: string; message?: string }

export function validate(value: any, r: Rules): string {
  const empty = value == null || value === '' || value === false || (Array.isArray(value) && !value.length)
  if (empty) return r.required ? r.message || 'This field is required' : ''
  const s = String(value)
  if (r.minLength != null && s.length < +r.minLength) return `Enter at least ${r.minLength} characters`
  if (r.maxLength != null && s.length > +r.maxLength) return `Enter at most ${r.maxLength} characters`
  if (r.min != null && r.min !== ('' as any) && +value < +r.min) return `Must be at least ${r.min}`
  if (r.max != null && r.max !== ('' as any) && +value > +r.max) return `Must be at most ${r.max}`
  if (r.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Enter a valid email address'
  if (r.type === 'url' && !/^https?:\/\/\S+$/i.test(s)) return 'Enter a valid URL (https://...)'
  if (r.pattern) { const re = safeRegex(r.pattern); if (re && !re.test(s.slice(0, 1000))) return r.message || 'Invalid format' }
  return ''
}

const compiled = new Map<string, RegExp | null>()
/**
 * Compile a tenant-authored `pattern`. Patterns are limited to 200 chars, and shapes that backtrack catastrophically
 * (nested quantifiers like (a+)+, repeated .* , backreferences) are refused with a console warning; the server still validates.
 * This is a heuristic, not a proof: keep patterns simple.
 */
export function safeRegex(src: string): RegExp | null {
  if (compiled.has(src)) return compiled.get(src)!
  let re: RegExp | null = null
  const risky = src.length > 200 || /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(src) || /\.\*[^)]*\.\*/.test(src) || /\\[1-9]/.test(src)
  if (!risky) { try { re = new RegExp(src) } catch { re = null } }
  if (!re) console.warn('[nimbus] ignoring unsafe or invalid pattern:', src)
  compiled.set(src, re)
  return re
}

export const rulesOf = (p: Record<string, any>): Rules => ({
  required: !!p.required, minLength: p.minLength, maxLength: p.maxLength, min: p.min, max: p.max, pattern: p.pattern, type: p.type, message: p.message,
})

interface FormApi { submitted: boolean; register: (name: string, value: any, error: string) => void; unregister: (name: string) => void }
const FormCtx = createContext<FormApi | null>(null)

/** Collects every named field below it. Submit validates all of them and fires `submit` ({ values }) or `invalid` ({ errors, values }). */
export function FormProvider({ onSubmit, onInvalid, children, className = 'grid gap-4' }: {
  onSubmit?: (d: { values: Record<string, any> }) => void
  onInvalid?: (d: { errors: Record<string, string>; values: Record<string, any> }) => void
  children: ReactNode
  className?: string
}) {
  const fields = useRef(new Map<string, { value: any; error: string }>())
  const [submitted, setSubmitted] = useState(false)
  const api = useMemo(() => ({
    register: (n: string, value: any, error: string) => { fields.current.set(n, { value, error }) },
    unregister: (n: string) => { fields.current.delete(n) },
  }), [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const all = [...fields.current.entries()]
    const values = Object.fromEntries(all.map(([n, f]) => [n, f.value]))
    const errors = Object.fromEntries(all.filter(([, f]) => f.error).map(([n, f]) => [n, f.error]))
    if (Object.keys(errors).length) onInvalid?.({ errors, values })
    else onSubmit?.({ values })
  }
  return (
    <FormCtx.Provider value={{ submitted, ...api }}>
      <form noValidate onSubmit={submit} className={className}>{children}</form>
    </FormCtx.Provider>
  )
}

/** Field-level validation. The error shows after the field is touched, or once the surrounding form was submitted. `external` (e.g. a server error) always wins. */
export function useField(name: string | undefined, value: any, rules: Rules, external?: string) {
  const form = useContext(FormCtx)
  const [touched, setTouched] = useState(false)
  const error = (typeof external === 'string' && external) || validate(value, rules)
  useEffect(() => { if (name && form) form.register(name, value, error) }, [name, JSON.stringify(value), error])
  useEffect(() => () => { if (name) form?.unregister(name) }, [name])
  return { error: touched || form?.submitted || external ? error : '', touch: () => setTouched(true) }
}

export function FieldShell({ id, label, help, error, required, children }: { id?: string; label?: string; help?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 text-sm">
      {label && <label htmlFor={id} className="font-medium">{label}{required && <span className="text-destructive"> *</span>}</label>}
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )
}
