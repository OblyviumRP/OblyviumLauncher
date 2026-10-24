import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export function Progress({ value, className, tone = 'primary', label }: { value: number; className?: string; tone?: 'primary' | 'muted' | 'danger'; label?: string }) {
  const color = tone === 'muted' ? 'bg-input' : tone === 'danger' ? 'bg-danger-fg' : 'bg-primary'
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-accent', className)}
    >
      <motion.div
        className={cn('relative h-full overflow-hidden rounded-full', color)}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      >
        {tone === 'primary' && value < 100 && (
          <span aria-hidden className="absolute inset-0 animate-[shimmer_1.6s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.25),transparent)]" />
        )}
      </motion.div>
    </div>
  )
}
