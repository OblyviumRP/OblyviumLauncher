import { Check, ChevronsUpDown, LogOut, Shirt, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { backend } from '@/backend'
import { Avatar } from '@/components/shared/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { isBusy, useAccount, useLauncher } from '@/store/launcher'

const kindLabel = { microsoft: 'Microsoft', offline: 'Offline', mojang: 'Mojang' } as const

export async function logoutAccount(id: string) {
  const s = useLauncher.getState()
  const acc = s.accounts.find((a) => a.id === id)
  if (!acc) return
  if (isBusy(s.launch.state) && id === s.accountId) {
    toast.warning(t('Jogo aberto'), { description: t('Saia da conta depois de fechar o jogo.') })
    return
  }
  const ok = await s.confirm({ title: t('Sair de {name}?', { name: acc.name }), body: t('A conta sai deste launcher. Você pode entrar de novo quando quiser.'), confirm: t('Sair'), tone: 'danger' })
  if (!ok) return
  try {
    if (await backend().logout(id)) {
      s.refreshAccounts()
      toast(t('Você saiu de {name}', { name: acc.name }))
    }
  } catch (err) {
    s.showError(err, 'Não foi possível sair da conta')
  }
}

export function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const accounts = useLauncher((s) => s.accounts)
  const select = useLauncher((s) => s.selectAccount)
  const locked = useLauncher((s) => isBusy(s.launch.state))
  const active = useAccount()

  const trigger = (
    <DropdownMenuTrigger
      aria-label={active ? t('Conta {name}. Trocar conta', { name: active.name }) : t('Entrar em uma conta')}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card text-left transition-colors hover:bg-accent data-[state=open]:border-primary-line data-[state=open]:bg-primary-soft',
        // Recolhido: um quadrado fixo, para a cabeça não esticar junto com a animação do menu.
        collapsed ? 'mx-auto size-10 shrink-0 justify-center p-0' : 'w-full p-2',

      )}
    >
      <Avatar name={active?.name ?? ''} className="size-8 min-w-8" />
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{active?.name ?? t('Sem conta')}</span>
            <span className="truncate text-2xs text-muted-foreground">{active ? t('{kind} · trocar conta', { kind: kindLabel[active.kind] }) : t('Entrar')}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </>
      )}
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {collapsed ? <Tooltip content={active ? t('{name} · trocar conta', { name: active.name }) : t('Entrar')}>{trigger}</Tooltip> : trigger}
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} className="w-64">
        <DropdownMenuLabel>{t('Contas')}</DropdownMenuLabel>
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} disabled={locked && a.id !== active?.id} onSelect={() => a.id !== active?.id && select(a.id)} className="py-2">
            <Avatar name={a.name} className="size-7" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{a.name}</span>
              <span className="text-2xs text-muted-foreground">{kindLabel[a.kind]}</span>
            </span>
            {a.id === active?.id && <Check className="text-success-fg" aria-label={t('Conta ativa')} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/boas-vindas?adicionar=1')}>
          <UserPlus /> {t('Adicionar conta')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/skins')}>
          <Shirt /> {t('Trocar skin')}
        </DropdownMenuItem>
        {active && (
          <DropdownMenuItem tone="danger" onSelect={() => logoutAccount(active.id)}>
            <LogOut /> {t('Sair desta conta')}

          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
