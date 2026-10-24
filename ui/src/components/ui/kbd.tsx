import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd className={cn('rounded-sm border border-border-2 bg-surface-2 px-1.5 font-mono text-2xs text-muted-foreground', className)} {...props} />
}
