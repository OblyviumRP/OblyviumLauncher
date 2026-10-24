import { Select as SelectPrimitive } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string; hint?: string }

export function Select({
  value,
  defaultValue,
  onValueChange,
  options,
  className,
  'aria-label': ariaLabel,
  id,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  options: SelectOption[]
  className?: string
  'aria-label'?: string
  id?: string
}) {
  return (
    <SelectPrimitive.Root value={value} defaultValue={defaultValue ?? options[0]?.value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-8 min-w-40 cursor-pointer items-center justify-between gap-2 rounded-sm border border-input bg-input-fill px-2.5 text-sm text-foreground data-[placeholder]:text-muted-2 [@media(pointer:coarse)]:min-h-11',
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-(--radix-select-trigger-width) animate-[pop-in_var(--dur-base)_var(--ease-forja)] overflow-hidden rounded-lg border border-border-2 bg-popover p-1 shadow-popover"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-border-2 [@media(pointer:coarse)]:min-h-11"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5 text-primary-light" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.hint && <span className="ml-auto pl-4 font-mono text-2xs text-muted-2">{o.hint}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
