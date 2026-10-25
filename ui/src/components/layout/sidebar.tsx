import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { ProfileIcon, profileLabel } from '@/components/shared/profile-icon'
import { ServerIcon } from '@/components/shared/server-art'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { footerNav, isActive, mainNav, type NavItem } from '@/config/navigation'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { isBusy, useLauncher, useServer } from '@/store/launcher'
import { AccountSwitcher } from './account-switcher'

const fade = { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -4 }, transition: { duration: 0.12 } }

function NavLinkItem({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) {
  const { pathname } = useLocation()
  const active = isActive(item, pathname)
  const Icon = item.icon
  const link = (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? t(item.label) : undefined}
      className={cn(
        'relative flex h-9 items-center gap-3 rounded-sm text-sm font-medium outline-none transition-colors duration-(--dur-fast) [@media(pointer:coarse)]:min-h-11',
        collapsed ? 'justify-center' : 'px-2.5',
        active ? 'text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-sm border border-primary-line bg-primary-soft"
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
        />
      )}
      <span className="relative">
        <Icon className={cn('size-[18px]', active && 'text-primary-light')} />
        {collapsed && !!badge && (
          <span className="absolute -right-2 -top-1.5 grid size-4 place-items-center rounded-full bg-primary-fill font-mono text-[10px] text-white">{badge}</span>
        )}
      </span>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span {...fade} className="relative flex flex-1 items-center justify-between">
            {t(item.label)}
            {!!badge && <span className="rounded-full bg-primary-fill px-1.5 font-mono text-2xs text-white">{badge}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
  return collapsed ? <Tooltip content={badge ? t('{label} · {n} ativos', { label: t(item.label), n: badge }) : t(item.label)}>{link}</Tooltip> : link
}

export function Sidebar() {
  const collapsed = useLauncher((s) => s.sidebarCollapsed)
  const toggle = useLauncher((s) => s.toggleSidebar)
  const server = useServer()
  const profiles = useLauncher((s) => s.profiles)
  const profileId = useLauncher((s) => s.profileId)
  const selectProfile = useLauncher((s) => s.selectProfile)
  const activeTasks = useLauncher((s) => s.tasks.filter((x) => x.status === 'active').length)
  const launch = useLauncher((s) => s.launch)
  const locked = isBusy(launch.state)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.isContentEditable) toggle()

    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const toggleBtn = (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? t('Expandir menu') : t('Recolher menu')}
      aria-expanded={!collapsed}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  )

  return (
    <motion.nav
      aria-label={t('Navegação principal')}
      initial={false}
      animate={{ width: collapsed ? 56 : 240 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="flex h-full shrink-0 flex-col gap-5 overflow-hidden border-r border-border bg-sidebar px-2 py-3"
    >
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between pl-1.5')}>
        <Link to="/" className="flex items-center gap-2.5 rounded-sm" aria-label={t('Oblyvium Launcher, início')}>
          <OblyviumMark className="size-7 shrink-0 text-primary-light" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span {...fade} className="whitespace-nowrap font-minecraft text-[11px] leading-none tracking-wide text-foreground">
                OBLYVIUM
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        {collapsed ? (
          <Tooltip content={<span className="flex items-center gap-2">{t('Expandir menu')} <Kbd className="border-background/30 bg-transparent text-background">[</Kbd></span>}>{toggleBtn}</Tooltip>
        ) : (
          toggleBtn
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {mainNav.map((item) => (
          <NavLinkItem key={item.to} item={item} collapsed={collapsed} badge={item.to === '/downloads' ? activeTasks : undefined} />
        ))}
      </div>

      {server && (
        <div className="flex min-h-0 flex-col gap-0.5">
          {collapsed ? (
            <span className="mx-2 mb-1 h-px bg-border" />
          ) : (
            <span className="flex items-center gap-2 whitespace-nowrap px-2.5 pb-1 font-mono text-2xs uppercase tracking-wider text-muted-2">
              <ServerIcon server={server} className="size-4" />
              <span className="truncate">{t('Perfis · {name}', { name: server.name })}</span>
            </span>
          )}
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {profiles.map((p) => {
              const on = p.id === profileId
              const playing = on && launch.state === 'running'
              const btn = (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProfile(p.id)}
                  disabled={locked && !on}
                  aria-pressed={on}
                  aria-label={collapsed ? t('Perfil {name}', { name: profileLabel(p) }) : undefined}
                  className={cn(
                    'flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-sm text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    collapsed ? 'justify-center' : 'px-2.5',
                    on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="relative">
                    <ProfileIcon name={p.icon} className={cn('size-[18px]', on && 'text-primary-light')} />
                    {playing && <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-sidebar bg-success-fg" aria-hidden />}
                  </span>
                  {!collapsed && <span className="truncate">{profileLabel(p)}</span>}
                  {!collapsed && playing && <span className="ml-auto font-mono text-2xs text-success-fg">{t('jogando')}</span>}
                </button>
              )
              return collapsed ? (
                <Tooltip key={p.id} content={on ? t('{name} · selecionado', { name: profileLabel(p) }) : profileLabel(p)}>

                  {btn}
                </Tooltip>
              ) : (
                btn
              )
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5">
        {footerNav.map((item) => (
          <NavLinkItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
      <AccountSwitcher collapsed={collapsed} />
    </motion.nav>
  )
}
