import { BLOCK_KEYS } from './expr'

export const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`

const parts = (path: string) => path.split('.').filter((k) => k && !BLOCK_KEYS.has(k))
export const getIn = (o: any, path: string) =>
  parts(path).reduce((a, k) => (a == null ? undefined : a[k]), o)
export function setIn(o: any, path: string, v: any): any {
  const go = (cur: any, ks: string[]): any =>
    ks.length ? { ...(cur ?? {}), [ks[0]]: go(cur?.[ks[0]], ks.slice(1)) } : v
  const ks = parts(path)
  return ks.length ? go(o, ks) : o
}

/** Download a url (fetched with the given headers, so tenant/auth apply) or inline content as a file. */
export async function downloadFile(a: {
  url?: string
  content?: string
  filename?: string
  mime?: string
  headers?: Record<string, string>
}) {
  const link = document.createElement('a')
  let obj = ''
  if (a.content != null)
    obj = URL.createObjectURL(new Blob([a.content], { type: a.mime || 'text/plain' }))
  else if (a.url) {
    try {
      const res = await fetch(a.url, { headers: a.headers })
      if (!res.ok) throw new Error(String(res.status))
      obj = URL.createObjectURL(await res.blob())
    } catch {
      link.href = a.url
    } // cross-origin without CORS: let the browser navigate
  }
  if (obj) link.href = obj
  link.download = a.filename || ''
  link.click()
  if (obj) setTimeout(() => URL.revokeObjectURL(obj), 2000)
}

/** Read (not verify) a JWT payload, so Studio can preview with the token's own permissions. */
export function decodeJwt(token: string): Record<string, any> | null {
  try {
    return JSON.parse(
      decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))),
    )
  } catch {
    return null
  }
}
