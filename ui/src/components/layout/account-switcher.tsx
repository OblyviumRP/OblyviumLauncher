import { Check, ChevronsUpDown, LogOut, Shirt, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { defaultSkins, savedSkins } from '@/data/mock'
import { cn } from '@/lib/utils'
import { useActiveAccount, useLauncher } from '@/store/launcher'

const allSkins = [...savedSkins, ...defaultSkins]

export function SkinHead({ skinId, className }: { skinId?: string; className?: string }) {
  const skin = allSkins.find((s) => s.id === skinId) ?? defaultSkins[0]
  // Rosto 4×4 simplificado a partir das cores da skin.
  const grid = [skin.hair, skin.hair, skin.hair, skin.hair, skin.skin, '#fff', '#fff', skin.skin, skin.skin, skin.skin, skin.skin, skin.skin, skin.skin, skin.shirt, skin.shirt, skin.skin]
  return (
    <span className={cn('grid shrink-0 grid-cols-4 overflow-hidden rounded-sm', className)} aria-hidden>
      {grid.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  )
}

export function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const accounts = useLauncher((s) => s.accounts)
  const skinByAccount = useLauncher((s) => s.skinByAccount)
  const setActive = useLauncher((s) => s.setActiveAccount)
  const active = useActiveAccount()

  const trigger = (
    <DropdownMenuTrigger
      aria-label={`Conta ${active.name}. Trocar conta`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card text-left transition-colors hover:bg-accent data-[state=open]:border-primary-line data-[state=open]:bg-primary-soft',
        collapsed ? 'justify-center p-1.5' : 'p-2',
      )}
    >
      <SkinHead skinId={skinByAccount[active.id]} className="size-8" />
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{active.name}</span>
            <span className="truncate text-2xs text-muted-foreground">{active.kind === 'microsoft' ? 'Microsoft' : 'Offline'} · trocar conta</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </>
      )}
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {collapsed ? <Tooltip content={`${active.name} · trocar conta`}>{trigger}</Tooltip> : trigger}
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} className="w-64">
        <DropdownMenuLabel>Contas</DropdownMenuLabel>
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => setActive(a.id)} className="py-2">
            <SkinHead skinId={skinByAccount[a.id]} className="size-7" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{a.name}</span>
              <span className="text-2xs text-muted-foreground">{a.kind === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
            </span>
            {a.expired && <Badge tone="warning">expirada</Badge>}
            {a.id === active.id && <Check className="text-success-fg" aria-label="Conta ativa" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/boas-vindas')}>
          <UserPlus /> Adicionar conta
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/skins')}>
          <Shirt /> Trocar skin
        </DropdownMenuItem>
        <DropdownMenuItem tone="danger" onSelect={() => toast(`Você saiu de ${active.name}`, { description: 'Simulação: nenhuma conta foi removida.' })}>
          <LogOut /> Sair desta conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
