// Reference backend for Nimbus, served by the Vite dev/preview server. The contract is in CONTRACT.md and is implemented
// identically by the Laravel and NestJS ports. Config (env):
//   NIMBUS_JWT_SECRET  enforce HS256 bearer tokens (unset = open, dev only)
//   NIMBUS_DEMO=0      disable the demo Account object, its data and /api/demo/*
//   NIMBUS_LATENCY     artificial latency in ms for records/lookups (default 250 with demo data, else 0)
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { AuthError, authorize, verifyJwt } from './jwt.js'

type Rec = Record<string, any>
interface Field { apiName: string; label: string; type: string; required?: boolean; options?: string[]; maxLength?: number }
interface ObjectMeta { apiName: string; label: string; nameField: string; fields: Field[] }

const NAME = /^[A-Za-z]\w{0,63}$/
const TENANT = /^[\w-]{1,64}$/
const DEMO = process.env.NIMBUS_DEMO !== '0'
const LATENCY = Number(process.env.NIMBUS_LATENCY ?? (DEMO ? 250 : 0))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const send = (res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', ...headers })
    res.end(code === 204 ? undefined : JSON.stringify(body))
}
const readBody = (req: IncomingMessage, max = 25 * 1024 * 1024) =>
    new Promise<Buffer>((ok, fail) => {
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (c: Buffer) => { size += c.length; if (size > max) { fail(new Error('Payload too large')); req.destroy() } else chunks.push(c) })
        req.on('end', () => ok(Buffer.concat(chunks)))
        req.on('error', fail)
    })
const readJson = async (req: IncomingMessage) => { try { return JSON.parse((await readBody(req)).toString() || "{}") } catch { throw new Error("Invalid JSON") } }

// ---- demo object + data (per tenant, in memory) ----
const WORDS = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Wonka', 'Soylent', 'Cyberdyne', 'Tyrell', 'Massive']
const SUFFIX = ['Industries', 'Systems', 'Labs', 'Holdings', 'Partners', 'Group', 'Works']
const INDUSTRIES = ['Manufacturing', 'Energy', 'Software', 'Biotech', 'Retail', 'Finance']
const seedAccounts = (): Rec[] => Array.from({ length: 237 }, (_, i) => ({
    id: i + 1,
    name: `${WORDS[i % 12]} ${SUFFIX[(i * 5) % 7]} ${Math.floor(i / 12) + 1}`,
    industry: INDUSTRIES[(i * 7) % 6],
    revenue: (20 + ((i * 7919) % 980)) * 1_000_000,
    employees: 10 + ((i * 104729) % 4990),
    active: i % 5 !== 0,
    website: `https://${WORDS[i % 12].toLowerCase()}${Math.floor(i / 12) + 1}.example.com`,
    created: new Date(Date.UTC(2021, 0, 1) + i * 3 * 86400000).toISOString().slice(0, 10),
}))
const OBJECTS: Record<string, ObjectMeta> = DEMO ? {
    Account: {
        apiName: 'Account', label: 'Account', nameField: 'name',
        fields: [
            { apiName: 'name', label: 'Account name', type: 'text', required: true, maxLength: 80 },
            { apiName: 'industry', label: 'Industry', type: 'picklist', options: INDUSTRIES },
            { apiName: 'revenue', label: 'Annual revenue', type: 'currency' },
            { apiName: 'employees', label: 'Employees', type: 'number' },
            { apiName: 'website', label: 'Website', type: 'url' },
            { apiName: 'active', label: 'Active', type: 'boolean' },
            { apiName: 'created', label: 'Created', type: 'date' },
        ],
    },
} : {}
const stores = new Map<string, Rec[]>()
const rowsOf = (tenant: string, object: string) => { const k = `${tenant}:${object}`; if (!stores.has(k)) stores.set(k, object === 'Account' ? seedAccounts() : []); return stores.get(k)! }
const files = new Map<string, { name: string; type: string; buf: Buffer }>()
const publicMeta = ({ nameField: _n, ...m }: ObjectMeta) => m

/** Metadata-driven validation. Returns the cleaned record (known fields only) and per-field errors. */
function validateRecord(meta: ObjectMeta, body: Rec, partial: boolean) {
    const errors: Record<string, string> = {}
    const clean: Rec = {}
    for (const f of meta.fields) {
        if (!(f.apiName in body)) { if (!partial && f.required) errors[f.apiName] = `${f.label} is required`; continue }
        let v = body[f.apiName]
        if (v == null || v === '') { if (f.required) errors[f.apiName] = `${f.label} is required`; else clean[f.apiName] = null; continue }
        switch (f.type) {
            case 'number': case 'currency': if (typeof v === 'boolean' || isNaN(+v)) errors[f.apiName] = `${f.label} must be a number`; else clean[f.apiName] = +v; break
            case 'boolean': if (typeof v !== 'boolean') errors[f.apiName] = `${f.label} must be true or false`; else clean[f.apiName] = v; break
            case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(String(v)))) errors[f.apiName] = `${f.label} must be a date (YYYY-MM-DD)`; else clean[f.apiName] = String(v); break
            case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errors[f.apiName] = `${f.label} must be a valid email`; else clean[f.apiName] = String(v); break
            case 'url': if (!/^https?:\/\/\S+$/i.test(String(v))) errors[f.apiName] = `${f.label} must be a valid URL`; else clean[f.apiName] = String(v); break
            case 'picklist': if (!f.options?.includes(String(v))) errors[f.apiName] = `${f.label} must be one of: ${f.options?.join(', ')}`; else clean[f.apiName] = String(v); break
            default: v = String(v); if (f.maxLength && v.length > f.maxLength) errors[f.apiName] = `${f.label} must be at most ${f.maxLength} characters`; else clean[f.apiName] = v
        }
    }
    return { errors, clean }
}

function queryRecords(meta: ObjectMeta, rows: Rec[], sp: URLSearchParams) {
    const q = (sp.get('q') || '').toLowerCase()
    const textual = meta.fields.filter((f) => ['text', 'picklist', 'email', 'url'].includes(f.type))
    let out = rows.filter((r) => !q || textual.some((f) => String(r[f.apiName] ?? '').toLowerCase().includes(q)))
    for (const f of meta.fields) { // only metadata fields can be filtered
        const v = sp.get(`filter[${f.apiName}]`)
        if (v == null || v === '') continue
        out = out.filter((r) => (['text', 'email', 'url'].includes(f.type) ? String(r[f.apiName] ?? '').toLowerCase().includes(v.toLowerCase()) : String(r[f.apiName]) === v))
    }
    const sort = meta.fields.find((f) => f.apiName === sp.get('sort'))
    if (sort) { const d = sp.get('dir') === 'desc' ? -1 : 1; out = [...out].sort((a, b) => (a[sort.apiName] > b[sort.apiName] ? 1 : a[sort.apiName] < b[sort.apiName] ? -1 : 0) * d) }
    const pageSize = Math.min(100, Math.max(1, Math.floor(+(sp.get('pageSize') || 10)) || 10))
    const page = Math.max(1, Math.floor(+(sp.get('page') || 1)) || 1)
    return { rows: out.slice((page - 1) * pageSize, page * pageSize), total: out.length, page, pageSize }
}

async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    const tenant = process.env.NIMBUS_SINGLE_TENANT ? 'default' : String(req.headers['x-tenant'] || 'default')
    if (!TENANT.test(tenant)) return send(res, 400, { message: 'Invalid tenant' })
    const m = req.method!
    const p = url.pathname
    let r: RegExpMatchArray | null

    // every route declares the permission it needs; with NIMBUS_JWT_SECRET set, the bearer token must grant it for this tenant
    const need = (permission: string) => {
        const secret = process.env.NIMBUS_JWT_SECRET
        if (!secret) return
        const h = String(req.headers.authorization || '')
        if (!h.startsWith('Bearer ')) throw new AuthError(401, 'Unauthenticated')
        authorize(verifyJwt(h.slice(7), secret), tenant, permission)
    }

    // ---- bundle store: one JSON file per bundle, per tenant ----
    const dir = path.join(process.cwd(), 'metadata', tenant)
    if (p === '/api/bundles' && m === 'GET') {
        need('metadata.read')
        const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : []
        return send(res, 200, list)
    }
    if ((r = p.match(/^\/api\/bundles\/([^/]+)$/)) && (m === 'PUT' || m === 'DELETE')) {
        need('metadata.write')
        const name = r[1]
        if (!NAME.test(name)) return send(res, 400, { message: 'Invalid bundle name' })
        const file = path.join(dir, name + '.json')
        if (m === 'PUT') {
            let body: any
            try { body = JSON.parse((await readBody(req)).toString() || '{}') } catch { return send(res, 400, { message: 'Invalid JSON' }) }
            if (body.apiName !== name || !body.template) return send(res, 422, { message: 'apiName must match the URL and a template is required' })
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(file, JSON.stringify(body, null, 2))
            return send(res, 200, body)
        }
        fs.rmSync(file, { force: true })
        return send(res, 204, null)
    }

    // ---- object metadata ----
    if ((r = p.match(/^\/api\/meta\/objects\/([^/]+)$/)) && m === 'GET') {
        need('metadata.read')
        return OBJECTS[r[1]] ? send(res, 200, publicMeta(OBJECTS[r[1]])) : send(res, 404, { message: `Unknown object ${r[1]}` })
    }

    // ---- records (server-side paging/sorting/filtering + metadata validation) ----
    if ((r = p.match(/^\/api\/records\/([^/]+)(?:\/(\d+))?$/))) {
        const meta = OBJECTS[r[1]]
        const id = r[2] ? +r[2] : null
        if (m === 'GET' && !id) {
            need('records.read')
            if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
            await sleep(LATENCY)
            return send(res, 200, queryRecords(meta, rowsOf(tenant, r[1]), url.searchParams))
        }
        if (m === 'GET' && id) {
            need('records.read')
            if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
            const row = rowsOf(tenant, r[1]).find((x) => x.id === id)
            return row ? send(res, 200, row) : send(res, 404, { message: 'Record not found' })
        }
        if (m === 'POST' && !id) {
            need('records.write')
            if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
            const { errors, clean } = validateRecord(meta, await readJson(req), false)
            if (Object.keys(errors).length) return send(res, 422, { message: 'Validation failed', errors })
            const rows = rowsOf(tenant, r[1])
            const rec = { id: Math.max(0, ...rows.map((x) => x.id)) + 1, ...clean }
            rows.push(rec)
            return send(res, 201, rec)
        }
        if (m === 'PUT' && id) {
            need('records.write')
            if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
            const row = rowsOf(tenant, r[1]).find((x) => x.id === id)
            if (!row) return send(res, 404, { message: 'Record not found' })
            const { errors, clean } = validateRecord(meta, await readJson(req), true)
            if (Object.keys(errors).length) return send(res, 422, { message: 'Validation failed', errors })
            Object.assign(row, clean)
            return send(res, 200, row)
        }
        if (m === 'DELETE' && id) {
            need('records.write')
            if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
            const rows = rowsOf(tenant, r[1])
            const i = rows.findIndex((x) => x.id === id)
            if (i < 0) return send(res, 404, { message: 'Record not found' })
            rows.splice(i, 1)
            return send(res, 204, null)
        }
    }

    // ---- lookups: autocomplete source, [{ value, label }] from the object's name field ----
    if ((r = p.match(/^\/api\/lookups\/([^/]+)$/)) && m === 'GET') {
        need('records.read')
        const meta = OBJECTS[r[1]]
        if (!meta) return send(res, 404, { message: `Unknown object ${r[1]}` })
        await sleep(LATENCY)
        const q = (url.searchParams.get('q') || '').toLowerCase()
        return send(res, 200, rowsOf(tenant, r[1]).filter((x) => String(x[meta.nameField]).toLowerCase().includes(q)).slice(0, 8).map((x) => ({ value: String(x.id), label: String(x[meta.nameField]) })))
    }

    // ---- files: raw body upload (x-filename header), download by id; stored per tenant ----
    if (p === '/api/files' && m === 'POST') {
        need('files.write')
        const buf = await readBody(req)
        const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
        const name = decodeURIComponent(String(req.headers['x-filename'] || 'upload.bin'))
        files.set(`${tenant}:${id}`, { name, type: String(req.headers['content-type'] || 'application/octet-stream'), buf })
        if (files.size > 100) files.delete(files.keys().next().value!)
        return send(res, 201, { id, name, size: buf.length, url: `/api/files/${id}` })
    }
    if ((r = p.match(/^\/api\/files\/(\w+)$/)) && m === 'GET') {
        need('files.read')
        const f = files.get(`${tenant}:${r[1]}`)
        if (!f) return send(res, 404, { message: 'File not found' })
        res.writeHead(200, { 'content-type': f.type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'x-content-type-options': 'nosniff' })
        return void res.end(f.buf)
    }

    // ---- demo only ----
    if (DEMO && p === '/api/demo/signup' && m === 'POST') {
        const b = await readJson(req)
        if (b.email === 'taken@example.com') return send(res, 422, { message: 'Please fix the highlighted fields', errors: { email: 'That email is already registered' } })
        return send(res, 201, { id: Date.now(), name: b.name })
    }
    return send(res, 404, { message: 'Not found' })
}

export function nimbusApi(): Plugin {
    const mw = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        handle(req, res, url).catch((e) => (e instanceof AuthError ? send(res, e.status, { message: e.message }) : send(res, 500, { message: e.message })))
    }
    return {
        name: 'nimbus-api',
        configureServer(s) { s.middlewares.use(mw) },
        configurePreviewServer(s) { s.middlewares.use(mw) },
    }
}
