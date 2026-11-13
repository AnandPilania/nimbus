import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div data-slot="card" className={cn('flex flex-col gap-4 rounded-xl border bg-card py-5 text-card-foreground shadow-xs', className)} {...p} />
)
export const CardHeader = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('grid gap-1 px-5', className)} {...p} />
export const CardTitle = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('font-semibold leading-none', className)} {...p} />
export const CardDescription = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('text-sm text-muted-foreground', className)} {...p} />
export const CardContent = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('px-5', className)} {...p} />
