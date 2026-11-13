import { apiFetch, type NimbusEnv } from '@/nimbus/context'
import type { Bundle } from '@/nimbus/types'

export type Bundles = Record<string, Bundle>

/** Server persistence. Contract: GET /api/bundles -> Bundle[]; PUT /api/bundles/:name; DELETE /api/bundles/:name. Tenant travels in `x-tenant`. */
export const restStore = (env: NimbusEnv) => ({
    list: async (): Promise<Bundles> => Object.fromEntries(((await apiFetch(env, '/api/bundles')) as Bundle[]).map((b) => [b.apiName, b])),
    save: (b: Bundle) => apiFetch(env, `/api/bundles/${b.apiName}`, { method: 'PUT', json: b }),
    remove: (name: string) => apiFetch(env, `/api/bundles/${name}`, { method: 'DELETE' }),
})

/** Offline cache so work survives a dead server or a reload before the first save lands. */
const key = (tenant: string) => `nimbus.bundles.v2.${tenant}`
export const localCache = {
    read(tenant: string): Bundles | null {
        try { const v = JSON.parse(localStorage.getItem(key(tenant)) || ''); return Object.keys(v).length ? v : null } catch { return null }
    },
    write(tenant: string, b: Bundles) { try { localStorage.setItem(key(tenant), JSON.stringify(b)) } catch { /* quota */ } },
}
