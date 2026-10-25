import { ArrowRight, Download, ExternalLink, Layers, Newspaper, Settings2, Swords } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { backend, type ServerInfo } from '@/backend'
import { PlayButton } from '@/components/shared/play-button'
import { ProfileIcon, profileLabel } from '@/components/shared/profile-icon'
import { artNotice, hasRealArt, ServerArt, ServerIcon } from '@/components/shared/server-art'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/i18n'
import { useAsync } from '@/lib/use-async'
import { cn, formatDate } from '@/lib/utils'
import { isBusy, useLauncher, useProfile, useServer } from '@/store/launcher'

// A arte do modpack fica atrás da janela inteira (AppShell). Aqui só entram o texto
// e cartões translúcidos por cima dela.

const stagger: Variants = { show: { transition: { staggerChildren: 0.06 } } }
const rise: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }

/** Fundo translúcido com desfoque, para cartões e pílulas sobre a arte. */
const glass = 'border border-border/70 bg-card/65 backdrop-blur-md'

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium', glass, className)}>{children}</span>
}

/** Endereço · jogadores · tempo de resposta, como uma pílula só. */
function StatusPill({ server }: { server: ServerInfo }) {
  const { data, loading } = useAsync(() => backend().serverStatus(server.id), [server.id])
  if (!server.address) return null
  return (
    <Pill>
      <span className={cn('size-2 rounded-full', loading ? 'animate-pulse bg-muted-2' : data ? 'bg-success-fg' : 'bg-danger-fg')} aria-hidden />
      <span className="font-mono">{server.address}</span>
      {data ? (
        <>
          <span className="text-muted-2" aria-hidden>
            ·
          </span>
          <span className="text-primary-light">{t('{online}/{max} online', { online: data.online, max: data.max })}</span>
          <Tooltip content={t('Tempo de resposta da consulta de status')} side="bottom">
            <span className="font-mono text-muted-foreground">{data.pingMs} ms</span>
          </Tooltip>
        </>
      ) : (
        !loading && <span className="text-muted-foreground">{t('Sem resposta do servidor agora.')}</span>
      )}
    </Pill>
  )
}

function GlassCard({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={rise} aria-label={title} className={cn('flex min-w-0 flex-col gap-3 rounded-lg p-4', glass, className)}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

function NewsCard() {
  const { data, loading } = useAsync(() => backend().news(), [])
  const items = data ?? []
  return (
    <GlassCard title={t('Notícias')} icon={<Newspaper />}>
      {loading ? (
        <div className="h-14 animate-pulse rounded-md bg-surface-2/60" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{data == null ? t('Não foi possível carregar as notícias agora.') : t('Nenhuma notícia publicada.')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {items.slice(0, 2).map((n, i) => (
            <article key={i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <span className="font-mono text-2xs text-muted-2">{formatDate(n.date)}</span>
              {n.link ? (
                <button type="button" onClick={() => backend().openExternal(n.link!)} className="flex cursor-pointer items-center gap-1.5 text-left text-sm font-medium hover:underline">
                  <span className="line-clamp-1">{n.title}</span> <ExternalLink className="size-3 shrink-0 text-muted-2" />
                </button>
              ) : (
                <h3 className="line-clamp-1 text-sm font-medium">{n.title}</h3>
              )}
            </article>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

export function HomePage() {
  const server = useServer()
  const profile = useProfile()
  const profiles = useLauncher((s) => s.profiles)
  const servers = useLauncher((s) => s.servers)
  const selectProfile = useLauncher((s) => s.selectProfile)
  const selectServer = useLauncher((s) => s.selectServer)
  const locked = useLauncher((s) => isBusy(s.launch.state))
  const tasks = useLauncher(useShallow((s) => s.tasks.filter((x) => x.status === 'active')))

  if (!server || !profile) {
    return <p className="p-6 text-sm text-muted-foreground">{t('Nenhum modpack disponível na distribuição.')}</p>
  }
  const others = servers.filter((s) => s.id !== server.id)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col gap-6 px-6 pb-4 pt-1">
      {/* Status do modpack em pílulas, no topo. */}
      <motion.div variants={rise} className="flex flex-wrap items-center gap-2">
        <StatusPill server={server} />
        <Pill>
          <Swords className="size-3.5 text-primary-light" />
          Minecraft {server.mcVersion} · {server.loader === 'Vanilla' ? 'Vanilla' : server.loader}
        </Pill>
        <Pill>
          <Layers className="size-3.5 text-primary-light" />
          {server.group}
          {server.version && <span className="font-mono text-muted-foreground">v{server.version}</span>}
        </Pill>
      </motion.div>

      {/* Destaque: nome grande sobre a arte, à esquerda. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={server.id}
          aria-label={t('Modpack selecionado')}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex max-w-[600px] flex-1 flex-col justify-center gap-4 py-4"
        >
          <span className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-primary-light">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            {server.main ? t('Servidor oficial') : t('Modpack')}
          </span>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-foreground [text-shadow:0_2px_24px_var(--background)]">{server.name}</h1>
          {server.description && <p className="max-w-[520px] text-base leading-relaxed text-muted-foreground">{server.description}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <PlayButton />
            <Button variant="secondary" size="lg" asChild className={cn('h-12 px-5', glass)}>
              <Link to="/perfil">{t('Gerenciar')}</Link>
            </Button>
            <Tooltip content={t('Configurações do perfil')} side="top">
              <Button variant="secondary" size="icon" className={cn('size-12', glass)} asChild>
                <Link to="/perfil?aba=config" aria-label={t('Configurações do perfil')}>
                  <Settings2 />
                </Link>
              </Button>
            </Tooltip>
          </div>

          {/* Perfis do modpack, para trocar sem sair do Início. */}
          <div role="radiogroup" aria-label={t('Escolher perfil')} className="flex flex-wrap items-center gap-1.5">
            {profiles.map((p) => {
              const on = p.id === profile.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={locked && !on}
                  onClick={() => selectProfile(p.id)}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    on ? 'border border-primary-line bg-primary-soft/80 text-foreground backdrop-blur-md' : cn(glass, 'text-muted-foreground hover:text-foreground'),
                  )}
                >
                  <ProfileIcon name={p.icon} className={cn('size-3.5', on && 'text-primary-light')} />
                  {profileLabel(p)}
                </button>
              )
            })}
          </div>
        </motion.section>
      </AnimatePresence>

      {/* Cartões translúcidos embaixo. */}
      <div className="grid gap-3 md:grid-cols-3">
        <NewsCard />

        <GlassCard
          title={tasks.length ? t('Downloads') : t('Outros modpacks')}
          icon={tasks.length ? <Download /> : <Layers />}
          action={
            <Link to={tasks.length ? '/downloads' : '/modpacks'} className="flex items-center gap-1 text-xs text-primary-light hover:underline">
              {tasks.length ? t('Ver tudo') : t('Modpacks')} <ArrowRight className="size-3" />
            </Link>
          }
          className="md:col-span-2"
        >
          {tasks.length > 0 ? (
            tasks.slice(0, 2).map((task) => (
              <div key={task.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{task.title}</span>
                  <span className="font-mono text-muted-foreground">{task.progress != null ? `${Math.round(task.progress)}%` : '…'}</span>
                </div>
                <Progress value={task.progress ?? 0} label={task.title} />
              </div>
            ))
          ) : others.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Nada baixando agora. Os arquivos do modpack são conferidos sempre que você joga.')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {others.slice(0, 3).map((s) => (
                <motion.button
                  key={s.id}
                  type="button"
                  whileHover={{ y: -2 }}
                  disabled={locked}
                  onClick={() => selectServer(s.id)}
                  className="group relative flex h-20 cursor-pointer flex-col justify-end overflow-hidden rounded-md border border-border/70 text-left disabled:cursor-not-allowed"
                >
                  <ServerArt server={s} cols={48} rows={27} className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-105" />
                  <span className="relative flex items-center gap-2 bg-overlay px-2.5 py-1.5">
                    <ServerIcon server={s} className="size-5" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block font-mono text-2xs text-muted-foreground">
                        {s.mcVersion} · {s.group}
                      </span>
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {!hasRealArt(server) && <span className="self-end text-2xs text-muted-2">{artNotice()}</span>}
    </motion.div>
  )
}
