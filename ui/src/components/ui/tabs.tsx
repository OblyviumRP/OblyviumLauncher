import { Tabs as TabsPrimitive } from 'radix-ui'
import { motion } from 'motion/react'
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TabsCtx = createContext<{ value: string; group: string; variant: 'underline' | 'pill' | 'side' }>({ value: '', group: '', variant: 'underline' })

/** Abas Radix com indicador que desliza entre os itens (layoutId do Motion). */
export function Tabs({
  value,
  onValueChange,
  variant = 'underline',
  className,
  children,
  orientation,
}: {
  value: string
  onValueChange: (v: string) => void
  variant?: 'underline' | 'pill' | 'side'
  className?: string
  children: ReactNode
  orientation?: 'horizontal' | 'vertical'
}) {
  const group = useId()
  return (
    <TabsCtx.Provider value={{ value, group, variant }}>
      <TabsPrimitive.Root value={value} onValueChange={onValueChange} orientation={orientation} className={className}>
        {children}
      </TabsPrimitive.Root>
    </TabsCtx.Provider>
  )
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = useContext(TabsCtx)
  return (
    <TabsPrimitive.List
      className={cn(
        'flex',
        variant === 'underline' && 'flex-wrap gap-1 border-b border-border',
        variant === 'pill' && 'inline-flex gap-1 rounded-lg border border-border bg-card p-1',
        variant === 'side' && 'flex-col gap-0.5',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ value, className, children, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = useContext(TabsCtx)
  const active = ctx.value === value
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'relative flex cursor-pointer items-center gap-2 text-sm font-medium transition-colors duration-(--dur-fast) [@media(pointer:coarse)]:min-h-11',
        ctx.variant === 'underline' && 'h-9 px-3 text-muted-foreground hover:text-foreground data-[state=active]:text-foreground',
        ctx.variant === 'pill' && 'h-7 rounded-sm px-3 text-muted-foreground hover:text-foreground data-[state=active]:text-white',
        ctx.variant === 'side' && 'h-8 rounded-sm px-2.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={`tab-${ctx.group}`}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          className={cn(
            'absolute',
            ctx.variant === 'underline' && 'inset-x-2 -bottom-px h-0.5 rounded-full bg-primary',
            ctx.variant === 'pill' && 'inset-0 rounded-sm bg-primary-fill',
            ctx.variant === 'side' && 'inset-0 rounded-sm border border-primary-line bg-primary-soft',
          )}
        />
      )}
      <span className="relative flex items-center gap-2">{children}</span>
    </TabsPrimitive.Trigger>
  )
}

export const TabsContent = TabsPrimitive.Content
