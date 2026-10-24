import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-2xs font-medium [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border-2 bg-surface-2 text-muted-foreground',
        primary: 'border-primary-line bg-primary-soft text-primary-fg',
        success: 'border-success-line bg-success-soft text-success-fg',
        warning: 'border-warning-line bg-warning-soft text-warning-fg',
        info: 'border-info-line bg-info-soft text-info-fg',
        danger: 'border-danger-line bg-danger-soft text-danger-fg',
        ember: 'border-ember-line bg-ember-soft text-ember-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
