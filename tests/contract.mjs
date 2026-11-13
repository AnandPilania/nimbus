// Backend contract test. Run it against ANY implementation of CONTRACT.md (reference server, NestJS port, Laravel port):
//   BASE_URL=http://localhost:3000 NIMBUS_JWT_SECRET=secret node tests/contract.mjs
// Without NIMBUS_JWT_SECRET the auth checks are skipped (the server must be running open).
import crypto from 'node:crypto'

const BASE = (process.env.BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
const SECRET = process.env.NIMBUS_JWT_SECRET || ''
const b64u = (x) => Buffer.from(x).toString('base64url')
const sign = (claims, secret = SECRET, alg = 'HS256') => {
  const body = `${b64u(JSON.stringify({ alg, typ: 'JWT' }))}.${b64u(JSON.stringify(claims))}`
  return `${body}.${alg === 'none' ? '' : crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
}
const future = () => Math.floor(Date.now() / 1000) + 3600
const tok = (tenant = 'default', permissions = ['*'], extra = {}) =>
  SECRET ? sign({ sub: 'contract', tenant, permissions, exp: future(), ...extra }) : ''

let fail = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fail++
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : String(extra).slice(0, 300))
}
async function call(
  method,
  path,
  { tenant = 'default', token = tok(tenant), body, raw, headers = {} } = {},
) {
  const h = { 'x-tenant': tenant, ...headers }
  if (token) h.authorization = 'Bearer ' + token
  if (body !== undefined) h['content-type'] = 'application/json'
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers }
}

// ---------- authentication and authorization ----------
if (SECRET) {
  ok('auth: no token -> 401', (await call('GET', '/api/bundles', { token: '' })).status === 401)
  const good = tok()
  ok(
    'auth: tampered signature -> 401',
    (
      await call('GET', '/api/bundles', {
        token: good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA'),
      })
    ).status === 401,
  )
  ok(
    'auth: alg none -> 401',
    (
      await call('GET', '/api/bundles', {
        token: sign({ tenant: 'default', permissions: ['*'], exp: future() }, '', 'none'),
      })
    ).status === 401,
  )
  ok(
    'auth: wrong secret -> 401',
    (
      await call('GET', '/api/bundles', {
        token: sign({ tenant: 'default', permissions: ['*'], exp: future() }, 'not-the-secret'),
      })
    ).status === 401,
  )
  ok(
    'auth: expired -> 401',
    (
      await call('GET', '/api/bundles', {
        token: tok('default', ['*'], { exp: Math.floor(Date.now() / 1000) - 60 }),
      })
    ).status === 401,
  )
  ok(
    'auth: token for another tenant -> 403',
    (await call('GET', '/api/bundles', { token: tok('other') })).status === 403,
  )
  ok(
    'auth: wildcard-tenant token is accepted',
    (await call('GET', '/api/bundles', { token: tok('*') })).status === 200,
  )
  ok(
    'auth: read-only token can read',
    (await call('GET', '/api/bundles', { token: tok('default', ['metadata.read']) })).status ===
      200,
  )
  const put = (token) =>
    call('PUT', '/api/bundles/contractAuth', {
      tenant: 'contract-a',
      token,
      body: { apiName: 'contractAuth', label: 'x', template: { id: 'root', type: 'Stack' } },
    })
  ok(
    'auth: read-only token cannot write bundles -> 403',
    (await put(tok('contract-a', ['metadata.read']))).status === 403,
  )
  ok(
    'auth: space-separated scope claim grants permissions',
    (
      await put(
        sign({ tenant: 'contract-a', scope: 'metadata.read metadata.write', exp: future() }),
      )
    ).status === 200,
  )
  await call('DELETE', '/api/bundles/contractAuth', { tenant: 'contract-a' })
  ok(
    'auth: records.read cannot write records -> 403',
    (
      await call('POST', '/api/records/Account', {
        token: tok('default', ['records.read']),
        body: { name: 'x' },
      })
    ).status === 403,
  )
}

// ---------- tenant header and bundle store ----------
ok(
  'tenant: invalid header -> 400',
  (await call('GET', '/api/bundles', { tenant: '../etc', token: tok('*') })).status === 400,
)
const bundle = {
  apiName: 'contractDemo',
  label: 'Contract demo',
  props: [],
  state: {},
  data: {},
  handlers: {},
  template: {
    id: 'root',
    type: 'Stack',
    children: [{ id: 'h', type: 'Heading', props: { text: 'hi' } }],
  },
}
let r = await call('PUT', '/api/bundles/contractDemo', { tenant: 'contract-a', body: bundle })
ok('bundles: PUT stores a bundle', r.status === 200 && r.json?.apiName === 'contractDemo', r.text)
r = await call('GET', '/api/bundles', { tenant: 'contract-a' })
ok(
  'bundles: GET lists it with the template intact',
  Array.isArray(r.json) &&
    r.json.some(
      (b) => b.apiName === 'contractDemo' && b.template?.children?.[0]?.props?.text === 'hi',
    ),
  r.text,
)
r = await call('GET', '/api/bundles', { tenant: 'contract-b' })
ok(
  'bundles: other tenants do not see it',
  Array.isArray(r.json) && !r.json.some((b) => b.apiName === 'contractDemo'),
)
ok(
  'bundles: apiName must match the URL -> 422',
  (await call('PUT', '/api/bundles/contractOther', { tenant: 'contract-a', body: bundle }))
    .status === 422,
)
ok(
  'bundles: template is required -> 422',
  (
    await call('PUT', '/api/bundles/contractDemo', {
      tenant: 'contract-a',
      body: { apiName: 'contractDemo' },
    })
  ).status === 422,
)
ok(
  'bundles: invalid name -> 400',
  (
    await call('PUT', '/api/bundles/1bad', {
      tenant: 'contract-a',
      body: { ...bundle, apiName: '1bad' },
    })
  ).status === 400,
)
await call('PUT', '/api/bundles/contractDemo', {
  tenant: 'contract-a',
  body: { ...bundle, label: 'Changed' },
})
r = await call('GET', '/api/bundles', { tenant: 'contract-a' })
ok(
  'bundles: PUT again replaces (no duplicates)',
  r.json.filter((b) => b.apiName === 'contractDemo').length === 1 &&
    r.json.find((b) => b.apiName === 'contractDemo').label === 'Changed',
)
ok(
  'bundles: DELETE -> 204',
  (await call('DELETE', '/api/bundles/contractDemo', { tenant: 'contract-a' })).status === 204,
)
r = await call('GET', '/api/bundles', { tenant: 'contract-a' })
ok('bundles: gone after delete', !r.json.some((b) => b.apiName === 'contractDemo'))

// ---------- object metadata ----------
r = await call('GET', '/api/meta/objects/Account')
ok(
  'meta: Account fields',
  r.status === 200 &&
    r.json.apiName === 'Account' &&
    r.json.fields.some((f) => f.apiName === 'name' && f.required === true) &&
    r.json.fields.some((f) => f.type === 'picklist' && Array.isArray(f.options)),
  r.text,
)
ok('meta: unknown object -> 404', (await call('GET', '/api/meta/objects/Nope')).status === 404)

// ---------- records: server-side paging, sorting, filtering ----------
const list = (qs = '') => call('GET', '/api/records/Account' + (qs ? '?' + qs : ''))
r = await list()
const all = r.json?.total
ok(
  'records: default page',
  r.status === 200 &&
    r.json.rows.length === 10 &&
    r.json.page === 1 &&
    r.json.pageSize === 10 &&
    all > 20,
  r.text,
)
const first = r.json.rows[0]
r = await list('page=2')
ok('records: page 2 differs', r.json.page === 2 && r.json.rows[0].id !== first.id)
r = await list('pageSize=1000')
ok('records: pageSize is capped at 100', r.json.pageSize === 100 && r.json.rows.length <= 100)
r = await list('pageSize=abc&page=-4')
ok(
  'records: non-numeric or negative paging falls back to safe defaults',
  r.status === 200 && r.json.pageSize === 10 && r.json.page === 1,
  r.text,
)
r = await list('sort=revenue&dir=desc&pageSize=5')
ok(
  'records: sort desc',
  r.json.rows.every((x, i, a) => i === 0 || a[i - 1].revenue >= x.revenue),
  r.text,
)
r = await list('sort=revenue&dir=asc&pageSize=5')
ok(
  'records: sort asc',
  r.json.rows.every((x, i, a) => i === 0 || a[i - 1].revenue <= x.revenue),
)
r = await list('filter[industry]=Energy&pageSize=50')
ok(
  'records: filter by picklist',
  r.json.rows.length > 0 && r.json.rows.every((x) => x.industry === 'Energy') && r.json.total < all,
)
r = await list('q=acme&pageSize=50')
ok(
  'records: search',
  r.json.rows.length > 0 &&
    r.json.rows.every((x) => JSON.stringify(x).toLowerCase().includes('acme')),
)
r = await list('filter[industry]=Energy&q=acme')
ok('records: filter + search combine', r.status === 200 && r.json.total === 0, r.text)
r = await list('sort=' + encodeURIComponent('name;drop table accounts') + '&dir=desc')
ok(
  'records: unknown sort column is ignored (no injection, no 500)',
  r.status === 200 && r.json.total === all,
  r.text,
)
r = await list('filter[nope]=1&filter[' + encodeURIComponent("name' or '1'='1") + ']=x')
ok('records: unknown filter fields are ignored', r.status === 200 && r.json.total === all, r.text)
ok('records: unknown object -> 404', (await call('GET', '/api/records/Nope')).status === 404)

// ---------- records: create / read / update / delete with metadata validation ----------
r = await call('POST', '/api/records/Account', { body: {} })
ok(
  'records: create validates required fields -> 422',
  r.status === 422 && !!r.json?.errors?.name,
  r.text,
)
r = await call('POST', '/api/records/Account', {
  body: { name: 'Contract Test Co', industry: 'Space' },
})
ok(
  'records: create validates picklist -> 422',
  r.status === 422 && !!r.json?.errors?.industry,
  r.text,
)
r = await call('POST', '/api/records/Account', {
  body: { name: 'Contract Test Co', revenue: 'lots' },
})
ok(
  'records: create validates numbers -> 422',
  r.status === 422 && !!r.json?.errors?.revenue,
  r.text,
)
r = await call('POST', '/api/records/Account', {
  body: {
    name: 'Contract Test Co',
    industry: 'Energy',
    revenue: 5000000,
    employees: 12,
    active: true,
    website: 'https://contract.example.com',
    created: '2026-01-31',
    ignored: 'x',
  },
})
ok(
  'records: create -> 201 with id, unknown fields dropped',
  r.status === 201 && r.json.id > 0 && r.json.name === 'Contract Test Co' && !('ignored' in r.json),
  r.text,
)
const id = r.json?.id
r = await call('GET', `/api/records/Account/${id}`)
ok('records: get one', r.status === 200 && r.json.name === 'Contract Test Co')
r = await list('q=' + encodeURIComponent('Contract Test'))
ok('records: new record is searchable', r.json.total === 1)
r = await call('PUT', `/api/records/Account/${id}`, { body: { employees: 42 } })
ok(
  'records: partial update keeps other fields',
  r.status === 200 && r.json.employees === 42 && r.json.name === 'Contract Test Co',
  r.text,
)
r = await call('PUT', `/api/records/Account/${id}`, { body: { industry: 'Space' } })
ok('records: update validates -> 422', r.status === 422 && !!r.json?.errors?.industry)
r = await call('GET', `/api/lookups/Account?q=${encodeURIComponent('Contract Test')}`)
ok(
  'lookups: [{ value, label }] from the name field',
  r.status === 200 &&
    r.json.length === 1 &&
    r.json[0].label === 'Contract Test Co' &&
    String(r.json[0].value) === String(id),
  r.text,
)
r = await call('GET', '/api/lookups/Account?q=acme')
ok(
  'lookups: capped at 8',
  r.json.length > 0 &&
    r.json.length <= 8 &&
    r.json.every((x) => 'value' in x && /acme/i.test(x.label)),
)
ok('records: delete -> 204', (await call('DELETE', `/api/records/Account/${id}`)).status === 204)
ok(
  'records: delete again -> 404',
  (await call('DELETE', `/api/records/Account/${id}`)).status === 404,
)
ok('records: get deleted -> 404', (await call('GET', `/api/records/Account/${id}`)).status === 404)

// ---------- files ----------
const content = 'hello contract \u00e9'
r = await call('POST', '/api/files', {
  raw: Buffer.from(content),
  headers: { 'x-filename': encodeURIComponent('a b.txt'), 'content-type': 'text/plain' },
})
ok(
  'files: upload -> 201 { id, name, size, url }',
  r.status === 201 &&
    r.json.name === 'a b.txt' &&
    r.json.size === Buffer.byteLength(content) &&
    /^\/api\/files\/\w+$/.test(r.json.url),
  r.text,
)
const url = r.json?.url
r = await call('GET', url)
ok('files: download returns the same bytes', r.status === 200 && r.text === content, r.text)
ok(
  'files: download sets an attachment filename',
  /attachment/i.test(r.headers.get('content-disposition') || '') &&
    /a%20b\.txt/.test(r.headers.get('content-disposition') || ''),
)
ok(
  'files: another tenant cannot download it -> 404',
  (await call('GET', url, { tenant: 'contract-b' })).status === 404,
)
ok('files: unknown id -> 404', (await call('GET', '/api/files/doesnotexist')).status === 404)

console.log(fail ? `\n${fail} FAILED against ${BASE}` : `\nall passed against ${BASE}`)
process.exit(fail ? 1 : 0)
