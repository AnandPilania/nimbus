import { useCallback, useRef, useState } from 'react'

/** Undo/redo over an immutable value. Consecutive edits with the same `group` inside 700ms collapse into one step (typing, sliders). */
export function useHistory<T>(init: () => T, limit = 100) {
    const [h, setH] = useState(() => ({ past: [] as T[], present: init(), future: [] as T[] }))
    const last = useRef({ group: '', at: 0 })

    const set = useCallback((fn: (t: T) => T, group = '') => {
        const now = Date.now()
        const merge = !!group && group === last.current.group && now - last.current.at < 700
        last.current = { group, at: now }
        setH((s) => {
            const next = fn(s.present)
            return next === s.present ? s : { past: merge ? s.past : [...s.past, s.present].slice(-limit), present: next, future: [] }
        })
    }, [limit])
    const reset = useCallback((v: T) => { last.current.group = ''; setH({ past: [], present: v, future: [] }) }, [])
    const undo = useCallback(() => { last.current.group = ''; setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)) }, [])
    const redo = useCallback(() => { last.current.group = ''; setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)) }, [])
    return { state: h.present, set, reset, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
