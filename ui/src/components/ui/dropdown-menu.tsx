import { DropdownMenu as Menu } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 animate-[pop-in_var(--dur-base)_var(--ease-forja)] rounded-lg border border-border-2 bg-popover p-1 text-foreground shadow-popover',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
}

const itemClass =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-border-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [@media(pointer:coarse)]:min-h-11'

export function DropdownMenuItem({ className, tone, ...props }: ComponentProps<typeof Menu.Item> & { tone?: 'danger' }) {
  return <Menu.Item className={cn(itemClass, tone === 'danger' && 'text-danger-fg', className)} {...props} />
}

export function DropdownMenuRadioItem({ className, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return <Menu.RadioItem className={cn(itemClass, className)} {...props} />
}

export const DropdownMenuItemIndicator = Menu.ItemIndicator

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2 py-1.5 font-mono text-2xs uppercase tracking-wider text-muted-2', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border-2', className)} {...props} />
}
