export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

/**
 * Handler actions: the metadata equivalent of a JS handler body. Strings may contain {!expr}.
 * `key` may be a dotted path ("form.email") and may itself contain bindings ("form.{!$event.name}").
 */
export type Action =
  | { type: 'set'; key: string; value: Json }
  | { type: 'toggle'; key: string }
  | { type: 'push'; key: string; value: Json }
  | { type: 'remove'; key: string; index: Json }
  | { type: 'emit'; event: string; detail?: Json }
  | { type: 'toast'; message: string; variant?: 'default' | 'success' | 'error' }
  | {
      type: 'fetch'
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      body?: Json
      into?: string
      loading?: string
      error?: string
      then?: string
      catch?: string
    }
  | { type: 'call'; handler: string }
  | { type: 'if'; cond: string; then?: string; else?: string }
  | { type: 'download'; url?: string; content?: string; filename: string }

export interface NodeDef {
  id: string
  /** A registry component (Stack, DataTable...) or another bundle's apiName. */
  type: string
  props?: Record<string, Json>
  /** Expression. On a repeated node it is evaluated per item (like v-for + v-if). */
  if?: string
  /** Permission the current user needs to see this node. */
  perm?: string
  each?: { items: string; as?: string }
  /** component event -> handler name */
  on?: Record<string, string>
  children?: NodeDef[]
}

export interface Bundle {
  apiName: string
  label: string
  /** Public API (like @api). */
  props: { name: string; type: 'string' | 'number' | 'boolean'; default?: Json }[]
  /** Reactive state (like @track). */
  state: Record<string, Json>
  /** Data sources (like @wire): a static value, or a REST url fetched on mount. */
  data: Record<string, { value?: Json; url?: string }>
  /** A handler named `init` runs on mount (like connectedCallback). */
  handlers: Record<string, Action[]>
  template: NodeDef
}
