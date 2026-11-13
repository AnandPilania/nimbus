import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Determinate when `value` is a number, indeterminate otherwise. */
export function Progress({
  value,
  max = 100,
  className,
}: {
  value?: number | null
  max?: number
  className?: string
}) {
  const known = typeof value === 'number' && !isNaN(value)
  const pct = known ? Math.min(100, Math.max(0, (value / (max || 100)) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={known ? value : undefined}
      className={cn('bg-primary/15 relative h-2 w-full overflow-hidden rounded-full', className)}
    >
      {known ? (
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300"
          style={{ width: pct + '%' }}
        />
      ) : (
        <div className="nimbus-indet bg-primary h-full w-2/5 rounded-full" />
      )}
    </div>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      className={cn('text-muted-foreground inline-flex items-center gap-2 text-sm', className)}
    >
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  )
}
