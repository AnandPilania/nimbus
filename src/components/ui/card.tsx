import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div
    data-slot="card"
    className={cn(
      'bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-5 shadow-xs',
      className,
    )}
    {...p}
  />
)
export const CardHeader = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('grid gap-1 px-5', className)} {...p} />
)
export const CardTitle = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('leading-none font-semibold', className)} {...p} />
)
export const CardDescription = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('text-muted-foreground text-sm', className)} {...p} />
)
export const CardContent = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('px-5', className)} {...p} />
)
