import React from 'react'
import { renderToString } from 'react-dom/server'
import { BundleView } from '@/nimbus/runtime'
import { registry } from '@/nimbus/registry'
import { samples } from '@/bundles/samples'
import { compile, resolve } from '@/nimbus/expr'
import type { Bundle } from '@/nimbus/types'

let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) fail++
  console.log(cond ? 'PASS' : 'FAIL', name, extra)
}

// every bundle renders in both modes
for (const b of Object.values(samples))
  for (const design of [false, true]) {
    try {
      const h = renderToString(
        <BundleView
          bundle={b}
          bundles={samples}
          design={design ? { sel: null, hov: null } : undefined}
        />,
      )
      ok(`render ${b.apiName} ${design ? 'design' : 'live'}`, h.length > 50, String(h.length))
    } catch (e: any) {
      ok(`render ${b.apiName}`, false, e.message)
    }
  }
// every registry component renders with its defaults, in both modes
for (const [type, def] of Object.entries(registry))
  for (const design of [false, true]) {
    const b: Bundle = {
      apiName: 't',
      label: 't',
      props: [],
      state: {},
      data: { rows: { value: [{ name: 'A', industry: 'X' }] } },
      handlers: {},
      template: {
        id: 'r',
        type,
        props: def.defaults as any,
        children: def.container
          ? [
              { id: 'c', type: 'Text', props: { text: 'child' } },
              { id: 'c2', type: 'Text', props: { text: 'child2' } },
            ]
          : undefined,
      },
    }
    try {
      renderToString(
        <BundleView
          bundle={b}
          bundles={{}}
          design={design ? { sel: null, hov: null } : undefined}
        />,
      )
      ok(`component ${type} ${design ? 'design' : 'live'}`, true)
    } catch (e: any) {
      ok(`component ${type}`, false, e.message)
    }
  }
// expressions
const ctx = {
  state: {
    form: { name: 'Al', email: 'a@b.co', password: 'longenough', terms: true, confirm: 'x' },
    sel: [{ name: 'a' }, { name: 'b' }],
    n: 3,
  },
  props: { step: 2 },
  $event: { row: { id: 7 } },
}
const ev = (s: string) => compile(s)(ctx)
ok(
  'completion',
  ev(
    '(len(state.form.name) > 1) * 25 + (len(state.form.email) > 3) * 25 + (len(state.form.password) >= 8) * 25 + (state.form.terms == true) * 25',
  ) === 100,
)
ok('pluck/join', ev('join(pluck(state.sel, "name"))') === 'a, b')
ok(
  'ternary+neq',
  ev('state.form.confirm != state.form.password ? "Passwords must match" : ""') ===
    'Passwords must match',
)
ok('contains', ev('"Acme Corp" ~ "acme"') === true)
ok('precedence', ev('1 + 2 * 3 - 4 / 2') === 5)
ok('interp', resolve('Row {!$event.row.id} of {!len(state.sel)}', ctx) === 'Row 7 of 2')
ok(
  'deep resolve',
  JSON.stringify(resolve({ a: ['{!state.n}'], b: { c: 'x{!props.step}' } }, ctx)) ===
    '{"a":[3],"b":{"c":"x2"}}',
)
// sandbox: none of these may reach globals or prototypes
for (const bad of [
  'constructor',
  'state.constructor',
  'state.__proto__',
  'state["__proto__"]',
  'toString',
  'hasOwnProperty',
])
  ok(
    'blocked ' + bad,
    (() => {
      try {
        const v = ev(bad)
        return v === undefined || typeof v !== 'function'
      } catch {
        return true
      }
    })(),
  )
for (const bad of [
  'eval("1")',
  'Function("return 1")()',
  'window',
  'len.constructor("x")',
  'state.sel.map(1)',
])
  ok(
    'rejected ' + bad,
    (() => {
      try {
        const v = ev(bad)
        return v === undefined
      } catch {
        return true
      }
    })(),
  )
// outline drag-reorder logic
import { moveNode, find } from '@/builder/tree'
const T = (id: string, type: string, children?: any[]): any => ({ id, type, children })
const tree = () =>
  T('root', 'Stack', [
    T('A', 'Card', [T('A1', 'Text'), T('A2', 'Text')]),
    T('B', 'Text'),
    T('C', 'Stack', []),
  ])
const kids = (t: any, id: string) =>
  find(t, id)![0]
    .children!.map((c: any) => c.id)
    .join(',')
ok(
  'tree: move before sibling-in-other-parent',
  kids(moveNode(tree(), 'B', 'A1', 'before'), 'A') === 'B,A1,A2',
)
ok(
  'tree: move into empty container',
  (() => {
    const t = moveNode(tree(), 'A1', 'C', 'inside')
    return kids(t, 'C') === 'A1' && kids(t, 'A') === 'A2'
  })(),
)
ok(
  'tree: cannot drop a node into its own subtree',
  (() => {
    const t = tree()
    return moveNode(t, 'A', 'A1', 'inside') === t
  })(),
)
ok(
  'tree: cannot drop onto itself or move the root',
  (() => {
    const t = tree()
    return moveNode(t, 'B', 'B', 'after') === t && moveNode(t, 'root', 'C', 'inside') === t
  })(),
)
ok(
  'tree: "inside" a non-container falls back to after',
  kids(moveNode(tree(), 'A2', 'B', 'inside'), 'root') === 'A,B,A2,C',
)
ok(
  'tree: moving keeps node count',
  (() => {
    const n = (x: any): number => 1 + (x.children ?? []).reduce((a: number, c: any) => a + n(c), 0)
    return n(moveNode(tree(), 'A', 'C', 'inside')) === n(tree())
  })(),
)

// regex hardening + JWT
import { safeRegex, validate } from '@/nimbus/form'
import { signJwt, verifyJwt, authorize } from '../server/jwt'
const quiet = console.warn
console.warn = () => {}
ok('regex: simple pattern compiles', !!safeRegex('^[a-z]+$'))
for (const bad of ['(a+)+$', '(.*)*', '.*a.*b', '(a)\\1', 'x'.repeat(201), '(unclosed'])
  ok('regex: refused ' + bad.slice(0, 12), safeRegex(bad) === null)
ok(
  'regex: validates with a safe pattern',
  validate('abc1', { pattern: '^[a-z]+$' }) !== '' &&
    validate('abc', { pattern: '^[a-z]+$' }) === '',
)
ok(
  'regex: unsafe pattern fails open (server still validates)',
  validate('aaaa!', { pattern: '(a+)+$' }) === '',
)
console.warn = quiet
const tk = signJwt(
  { tenant: 't', permissions: ['a'], exp: Math.floor(Date.now() / 1000) + 60 },
  'k',
)
ok('jwt: round trip', verifyJwt(tk, 'k').tenant === 't')
const thrown = (f: () => void) => {
  try {
    f()
    return false
  } catch (e: any) {
    return e.status
  }
}
ok('jwt: wrong secret 401', thrown(() => verifyJwt(tk, 'x')) === 401)
ok(
  'jwt: tampered payload 401',
  thrown(() => {
    const [h, , sg] = tk.split('.')
    verifyJwt(
      `${h}.${Buffer.from('{"tenant":"*","permissions":["*"]}').toString('base64url')}.${sg}`,
      'k',
    )
  }) === 401,
)
ok('jwt: expired 401', thrown(() => verifyJwt(signJwt({ exp: 1 }, 'k'), 'k')) === 401)
ok(
  'jwt: alg none 401',
  thrown(() =>
    verifyJwt(
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`,
      'k',
    ),
  ) === 401,
)
ok(
  'jwt: no tenant claim = default tenant only',
  thrown(() => authorize({ permissions: ['*'] }, 'default', 'x')) === false &&
    thrown(() => authorize({ permissions: ['*'] }, 'acme', 'x')) === 403,
)
ok(
  'jwt: tenant and permission enforcement',
  thrown(() => authorize({ tenant: 'a', permissions: ['x'] }, 'b', 'x')) === 403 &&
    thrown(() => authorize({ tenant: 'a', permissions: ['x'] }, 'a', 'y')) === 403 &&
    thrown(() => authorize({ tenant: '*', permissions: ['*'] }, 'z', 'y')) === false,
)
console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exit(fail ? 1 : 0)
