import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-6 py-5', className)}>{children}</div>
}

export function PageHeader({ title, description, actions, kicker }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {kicker}
        <h1 className="font-display text-2xl font-bold tracking-normal">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({ className, children, ...props }: React.ComponentProps<'section'>) {
  return (
    <section className={cn('rounded-lg border border-border bg-card', className)} {...props}>
      {children}
    </section>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-2 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary-light [&_svg]:size-5">{icon}</span>
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">{title}</span>
        {children && <span className="max-w-sm text-sm text-muted-foreground">{children}</span>}
      </div>
      {action}
    </div>
  )
}
