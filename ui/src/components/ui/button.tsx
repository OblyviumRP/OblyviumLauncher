import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors duration-(--dur-fast) disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [@media(pointer:coarse)]:min-h-11',
  {
    variants: {
      variant: {
        default: 'bg-primary-fill text-white hover:bg-primary-hover',
        secondary: 'border border-border-2 bg-surface-2 text-foreground hover:bg-accent',
        outline: 'border border-input bg-transparent text-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-border-2/60',
        destructive: 'border border-danger-line bg-danger-soft text-danger-fg hover:bg-danger-line/40',
        ember: 'bg-ember text-background hover:bg-ember/90',
        soft: 'border border-primary-line bg-primary-soft text-primary-fg hover:bg-primary-line/40',
        link: 'h-auto px-0 text-primary-light underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        default: 'h-8 px-3',
        lg: 'h-10 px-4 text-base',
        xl: 'h-12 px-6 text-base font-semibold',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
