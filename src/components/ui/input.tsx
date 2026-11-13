import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm transition-shadow outline-none focus-visible:ring-[3px] disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
