import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-8 w-full min-w-0 rounded-sm border border-input bg-input-fill px-2.5 text-sm text-foreground placeholder:text-muted-2 focus-visible:border-ring disabled:opacity-50 [@media(pointer:coarse)]:min-h-11',
        className,
      )}
      {...props}
    />
  )
}
