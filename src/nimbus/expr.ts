// A tiny, safe expression language for {!...} bindings. No eval, no calls, no globals.
// Supports: literals, identifiers, a.b / a[b], whitelisted helper calls (len, empty, has, join, upper, lower, round, num, str, pluck, now), ! - * / % + - < > <= >= == != === !== && || ?: and `a ~ b` (case-insensitive contains).
type Ctx = Record<string, any>
type Fn = (c: Ctx) => any
type Tok = { k: 'n' | 's' | 'i' | 'p'; v: string }

const TOK = /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||[-+*/%<>!?:.()\[\]~,]))/y
export const BLOCK_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const has = (a: any, b: any) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase())
const BIN: Record<string, [number, (a: any, b: any) => any]> = {
    '||': [1, (a, b) => a || b], '&&': [2, (a, b) => a && b],
    '==': [3, (a, b) => a == b], '!=': [3, (a, b) => a != b], '===': [3, (a, b) => a === b], '!==': [3, (a, b) => a !== b],
    '<': [4, (a, b) => a < b], '>': [4, (a, b) => a > b], '<=': [4, (a, b) => a <= b], '>=': [4, (a, b) => a >= b], '~': [4, has],
    '+': [5, (a, b) => a + b], '-': [5, (a, b) => a - b], '*': [6, (a, b) => a * b], '/': [6, (a, b) => a / b], '%': [6, (a, b) => a % b],
}
const FN: Record<string, (...a: any[]) => any> = {
    len: (x) => (x == null ? 0 : x.length ?? 0),
    empty: (x) => x == null || x === '' || (Array.isArray(x) && !x.length),
    has: (a, v) => (Array.isArray(a) ? a.includes(v) : false),
    join: (a, s = ', ') => (Array.isArray(a) ? a.join(s) : ''),
    upper: (x) => String(x ?? '').toUpperCase(),
    lower: (x) => String(x ?? '').toLowerCase(),
    round: (x, d = 0) => { const m = 10 ** d; return Math.round(+x * m) / m },
    num: (x) => +x,
    str: (x) => String(x ?? ''),
    pluck: (a, k) => (Array.isArray(a) ? a.map((o) => get(o, k)) : []),
    now: () => Date.now(),
}
// Own properties only: inherited members (toString, hasOwnProperty, ...) are never reachable from an expression.
const get = (o: any, k: any) => (o == null || BLOCK_KEYS.has(String(k)) || !Object.hasOwn(Object(o), k) ? undefined : o[k])

function lex(src: string): Tok[] {
    const out: Tok[] = []
    TOK.lastIndex = 0
    while (TOK.lastIndex < src.length) {
        const m = TOK.exec(src)
        if (!m) throw new Error('Unexpected character in: ' + src)
        out.push(m[1] ? { k: 'n', v: m[1] } : m[2] ? { k: 's', v: m[2] } : m[3] ? { k: 'i', v: m[3] } : { k: 'p', v: m[4] })
    }
    return out
}

const cache = new Map<string, Fn>()

export function compile(src: string): Fn {
    const hit = cache.get(src)
    if (hit) return hit
    const t = lex(src.trim())
    let i = 0
    const peek = () => t[i]
    const isP = (v: string) => peek()?.k === 'p' && peek().v === v
    const eat = (v: string) => { if (!isP(v)) throw new Error(`Expected "${v}" in: ${src}`); i++ }

    const primary = (): Fn => {
        const k = t[i++]
        if (!k) throw new Error('Unexpected end of: ' + src)
        if (k.k === 'n') { const n = +k.v; return () => n }
        if (k.k === 's') { const s = k.v.slice(1, -1).replace(/\\(.)/g, '$1'); return () => s }
        if (k.k === 'i') {
            const id = k.v
            if (id === 'true') return () => true
            if (id === 'false') return () => false
            if (id === 'null') return () => null
            if (isP('(') && Object.hasOwn(FN, id)) {
                i++
                const args: Fn[] = []
                if (!isP(')')) { args.push(ternary()); while (isP(',')) { i++; args.push(ternary()) } }
                eat(')')
                const fn = FN[id]
                return (c) => fn(...args.map((a) => a(c)))
            }
            return (c) => (BLOCK_KEYS.has(id) || !Object.hasOwn(c, id) ? undefined : c[id])
        }
        if (k.v === '(') { const f = ternary(); eat(')'); return f }
        throw new Error(`Unexpected "${k.v}" in: ${src}`)
    }
    const postfix = (): Fn => {
        let f = primary()
        for (; ;) {
            const g = f
            if (isP('.')) { i++; const key = t[i++]?.v; f = (c) => get(g(c), key) }
            else if (isP('[')) { i++; const k = ternary(); eat(']'); f = (c) => get(g(c), k(c)) }
            else return f
        }
    }
    const unary = (): Fn => {
        if (isP('!')) { i++; const a = unary(); return (c) => !a(c) }
        if (isP('-')) { i++; const a = unary(); return (c) => -a(c) }
        return postfix()
    }
    const binary = (min: number): Fn => {
        let l = unary()
        for (; ;) {
            const p = peek()
            const op = p?.k === 'p' ? BIN[p.v] : undefined
            if (!op || op[0] < min) return l
            i++
            const r = binary(op[0] + 1), a = l
            l = (c) => op[1](a(c), r(c))
        }
    }
    function ternary(): Fn {
        const cond = binary(1)
        if (!isP('?')) return cond
        i++
        const a = ternary(); eat(':'); const b = ternary()
        return (c) => (cond(c) ? a(c) : b(c))
    }

    const f = ternary()
    if (i < t.length) throw new Error(`Unexpected "${t[i].v}" in: ${src}`)
    cache.set(src, f)
    return f
}

/** Evaluate a bare expression. Errors are logged and yield undefined, so one bad binding never breaks a page. */
export function run(src: string, ctx: Ctx): any {
    try { return compile(src)(ctx) } catch (e) { console.warn('[nimbus]', (e as Error).message); return undefined }
}

/** Resolve a metadata value deeply: "{!expr}" returns the raw value, "text {!expr}" interpolates, arrays/objects are walked. */
export function resolve(v: any, ctx: Ctx): any {
    if (typeof v === 'string') {
        if (!v.includes('{!')) return v
        const whole = v.match(/^\{!([^}]*)\}$/)
        if (whole) return run(whole[1], ctx)
        return v.replace(/\{!([^}]*)\}/g, (_, e) => { const r = run(e, ctx); return r == null ? '' : String(r) })
    }
    if (Array.isArray(v)) return v.map((x) => resolve(x, ctx))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, ctx)]))
    return v
}
