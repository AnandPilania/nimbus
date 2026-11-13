import { createContext, useContext, useEffect, useState } from 'react'

export interface FieldMeta {
  apiName: string
  label: string
  type:
    'text' | 'textarea' | 'number' | 'currency' | 'date' | 'boolean' | 'picklist' | 'email' | 'url'
  required?: boolean
  options?: string[]
  maxLength?: number
}
export interface ObjectMeta {
  apiName: string
  label: string
  fields: FieldMeta[]
}

/** Everything a bundle needs to know about where and for whom it runs. Provide your own via <NimbusProvider>. */
export interface NimbusEnv {
  /** Optional. Leave unset for a single-tenant app: no `x-tenant` header is sent and the server uses its "default" tenant. */
  tenant?: string
  user: { id: string; name: string; permissions: string[] }
  api: {
    baseUrl: string
    /** Extra headers on every request (e.g. Authorization). `x-tenant` is sent only when `env.tenant` is set. */
    headers?: () => Record<string, string>
    /** Where object/field metadata is served: GET {metaPath}/{object} -> ObjectMeta */
    metaPath?: string
  }
}

export const defaultEnv: NimbusEnv = {
  user: { id: 'u1', name: 'Demo user', permissions: ['*'] },
  api: { baseUrl: '', metaPath: '/api/meta/objects' },
}
export const NimbusContext = createContext<NimbusEnv>(defaultEnv)
export const NimbusProvider = NimbusContext.Provider
export const useNimbus = () => useContext(NimbusContext)
export const can = (env: NimbusEnv, perm?: string) =>
  !perm || env.user.permissions.includes('*') || env.user.permissions.includes(perm)

export const apiHeaders = (env: NimbusEnv): Record<string, string> => ({
  ...(env.tenant ? { 'x-tenant': env.tenant } : {}),
  ...env.api.headers?.(),
})
export const apiUrl = (env: NimbusEnv, url: string) =>
  /^https?:/.test(url) ? url : env.api.baseUrl + url

/** JSON-first fetch. Throws an Error with `.status` and `.body` (the server's JSON error, e.g. { message, errors }). */
export async function apiFetch(
  env: NimbusEnv,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<any> {
  const { json, ...rest } = init
  const headers: Record<string, string> = {
    ...apiHeaders(env),
    ...(rest.headers as Record<string, string>),
  }
  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    rest.body = JSON.stringify(json)
  }
  const res = await fetch(apiUrl(env, url), { ...rest, headers })
  const text = await res.text()
  let body: any = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* plain text */
  }
  if (!res.ok)
    throw Object.assign(new Error(body?.message || `${res.status} ${res.statusText}`), {
      status: res.status,
      body,
    })
  return body
}

/** Load an object's field metadata (the tenant's schema) for object-driven components. */
export function useObject(name?: string): ObjectMeta | null {
  const env = useNimbus()
  const [meta, setMeta] = useState<ObjectMeta | null>(null)
  useEffect(() => {
    if (!name) {
      setMeta(null)
      return
    }
    let live = true
    apiFetch(env, `${env.api.metaPath ?? '/api/meta/objects'}/${encodeURIComponent(name)}`)
      .then((m) => live && setMeta(m))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [name, env.tenant])
  return meta
}
