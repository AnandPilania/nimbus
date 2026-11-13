import { registry } from '@/nimbus/registry'
import type { NodeDef } from '@/nimbus/types'

export type Pos = 'before' | 'after' | 'inside'
export const uid = () => 'n' + Math.random().toString(36).slice(2, 7)
export const isContainer = (n: NodeDef) => !!registry[n.type]?.container

export function find(n: NodeDef, id: string, parent?: NodeDef): [NodeDef, NodeDef | undefined] | null {
    if (n.id === id) return [n, parent]
    for (const c of n.children ?? []) { const r = find(c, id, n); if (r) return r }
    return null
}
export const update = (n: NodeDef, id: string, fn: (n: NodeDef) => NodeDef): NodeDef =>
    n.id === id ? fn(n) : n.children ? { ...n, children: n.children.map((c) => update(c, id, fn)) } : n
export const reid = (n: NodeDef): NodeDef => ({ ...n, id: uid(), children: n.children?.map(reid) })

/** Put `node` before/after/inside the target. "inside" on a non-container falls back to "after". */
export function place(root: NodeDef, node: NodeDef, targetId: string, pos: Pos): NodeDef {
    const [target, parent] = find(root, targetId) ?? find(root, root.id)!
    if (!parent || (pos === 'inside' && isContainer(target)))
        return update(root, target.id, (n) => ({ ...n, children: [...(n.children ?? []), node] }))
    return update(root, parent.id, (p) => {
        const kids = [...(p.children ?? [])]
        const i = kids.findIndex((c) => c.id === target.id)
        kids.splice(pos === 'before' ? i : i + 1, 0, node)
        return { ...p, children: kids }
    })
}

/** Where a click-to-add or canvas drop lands: inside a container, otherwise right after the target. */
export const insert = (root: NodeDef, targetId: string, node: NodeDef) => {
    const t = find(root, targetId)?.[0] ?? root
    return place(root, node, t.id, isContainer(t) ? 'inside' : 'after')
}

export function moveNode(root: NodeDef, id: string, targetId: string, pos: Pos): NodeDef {
    if (id === targetId || id === root.id) return root
    const hit = find(root, id)
    if (!hit || !hit[1] || find(hit[0], targetId)) return root // never drop a node into its own subtree
    const [node, parent] = hit
    const without = update(root, parent.id, (p) => ({ ...p, children: p.children!.filter((c) => c.id !== id) }))
    return place(without, node, targetId, pos)
}
