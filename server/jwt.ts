// HS256 bearer tokens. The same claim contract is implemented by the Laravel and Nest ports:
//   sub, tenant ("*" = any), permissions[] (or space separated `scope`), exp (seconds)
import crypto from 'node:crypto'

export interface Claims { sub?: string; tenant?: string; permissions?: string[]; scope?: string; exp?: number; [k: string]: unknown }
export class AuthError extends Error { constructor(public status: 401 | 403, message: string) { super(message) } }

const b64u = (v: Buffer | string) => Buffer.from(v).toString('base64url')
const mac = (data: string, secret: string) => crypto.createHmac('sha256', secret).update(data).digest()

export function signJwt(claims: Claims, secret: string): string {
  const body = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claims))}`
  return `${body}.${b64u(mac(body, secret))}`
}

export function verifyJwt(token: string, secret: string): Claims {
  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError(401, 'Malformed token')
  let header: any, claims: Claims
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) }
  catch { throw new AuthError(401, 'Malformed token') }
  if (header.alg !== 'HS256') throw new AuthError(401, 'Unsupported algorithm') // never accept "none" or asymmetric swaps
  const given = Buffer.from(parts[2], 'base64url')
  const want = mac(`${parts[0]}.${parts[1]}`, secret)
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new AuthError(401, 'Invalid signature')
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new AuthError(401, 'Token expired')
  return claims
}

export const permissionsOf = (c: Claims) => [...(Array.isArray(c.permissions) ? c.permissions : []), ...(typeof c.scope === 'string' ? c.scope.split(' ') : [])]

/** The token must be for this tenant ("*" = any) and carry the permission ("*" = any). */
export function authorize(c: Claims, tenant: string, permission: string) {
  if (c.tenant !== '*' && c.tenant !== tenant) throw new AuthError(403, 'Token is not valid for this tenant')
  const p = permissionsOf(c)
  if (!p.includes('*') && !p.includes(permission)) throw new AuthError(403, `Missing permission ${permission}`)
}
