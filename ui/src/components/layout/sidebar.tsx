import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { InstanceIcon } from '@/components/shared/pixel-scene'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { footerNav, isActive, mainNav, type NavItem } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'
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
      aria-label={collapsed ? item.label : undefined}
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
            {item.label}
            {!!badge && <span className="rounded-full bg-primary-fill px-1.5 font-mono text-2xs text-white">{badge}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
  return collapsed ? <Tooltip content={badge ? `${item.label} · ${badge} ativos` : item.label}>{link}</Tooltip> : link
}

export function Sidebar() {
  const collapsed = useLauncher((s) => s.sidebarCollapsed)
  const toggle = useLauncher((s) => s.toggleSidebar)
  const pinned = useLauncher(useShallow((s) => s.instances.filter((i) => i.pinned)))
  const activeDownloads = useLauncher((s) => s.downloads.filter((d) => d.status === 'active' || d.status === 'queued' || d.status === 'paused').length)
  const running = useLauncher((s) => (s.launch.state === 'running' ? s.launch.instanceId : null))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const toggleBtn = (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-expanded={!collapsed}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  )

  return (
    <motion.nav
      aria-label="Navegação principal"
      initial={false}
      animate={{ width: collapsed ? 56 : 240 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="flex h-full shrink-0 flex-col gap-5 overflow-hidden border-r border-border bg-sidebar px-2 py-3"
    >
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between pl-1.5')}>
        <Link to="/" className="flex items-center gap-2.5 rounded-sm" aria-label="Oblyvium Launcher, início">
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
          <Tooltip content={<span className="flex items-center gap-2">Expandir menu <Kbd className="border-background/30 bg-transparent text-background">[</Kbd></span>}>{toggleBtn}</Tooltip>
        ) : (
          toggleBtn
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {mainNav.map((item) => (
          <NavLinkItem key={item.to} item={item} collapsed={collapsed} badge={item.to === '/downloads' ? activeDownloads : undefined} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        {collapsed ? (
          <span className="mx-2 mb-1 h-px bg-border" />
        ) : (
          <span className="whitespace-nowrap px-2.5 pb-1 font-mono text-2xs uppercase tracking-wider text-muted-2">Fixadas</span>
        )}
        {pinned.map((i) => {
          const link = (
            <Link
              key={i.id}
              to={`/instancia/${i.id}`}
              aria-label={collapsed ? i.name : undefined}
              className={cn('flex h-9 items-center gap-2.5 rounded-sm text-sm text-foreground transition-colors hover:bg-accent', collapsed ? 'justify-center' : 'px-2')}
            >
              <span className="relative">
                <InstanceIcon scene={i.scene} name={i.name} className="size-6" />
                {(i.server || running === i.id) && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-success-fg" aria-hidden />
                )}
              </span>
              {!collapsed && <span className="truncate">{i.name}</span>}
              {!collapsed && running === i.id && <span className="ml-auto font-mono text-2xs text-success-fg">jogando</span>}
            </Link>
          )
          return collapsed ? (
            <Tooltip key={i.id} content={`${i.name}${running === i.id ? ' · jogando' : i.server ? ' · servidor online' : ''}`}>
              {link}
            </Tooltip>
          ) : (
            link
          )
        })}
      </div>

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
