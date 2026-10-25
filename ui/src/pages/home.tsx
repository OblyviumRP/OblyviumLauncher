import { ArrowRight, Download, ExternalLink, Newspaper, Server, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { backend } from '@/backend'
import { scenes } from '@/components/shared/pixel-scene'
import { PlayButton } from '@/components/shared/play-button'
import { ProfileIcon } from '@/components/shared/profile-icon'
import { hasRealArt, ServerArt, ServerIcon } from '@/components/shared/server-art'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import { useAsync } from '@/lib/use-async'
import { cn, formatDate } from '@/lib/utils'
import { isBusy, useLauncher, useProfile, useServer } from '@/store/launcher'

const grid: Variants = { show: { transition: { staggerChildren: 0.05 } } }
const tile: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }

function Tile({ className, children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <motion.section variants={tile} aria-label={label} className={cn('flex flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}>
      {children}
    </motion.section>
  )
}

function TileTitle({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      <h2 className="flex-1 text-sm font-semibold">{children}</h2>
      {action}
    </div>
  )
}

function StatusTile({ serverId, address }: { serverId: string; address: string | null }) {
  const { data, loading } = useAsync(() => backend().serverStatus(serverId), [serverId])
  return (
    <Tile label="Servidor">
      <TileTitle icon={<Server />}>Servidor</TileTitle>
      {loading ? (
        <div className="h-16 animate-pulse rounded-md bg-surface-2" />
      ) : data ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tabular-nums">{data.online}</span>
            <span className="text-sm text-muted-foreground">/ {data.max} jogadores</span>
          </div>
          <Progress value={data.max ? (data.online / data.max) * 100 : 0} tone="muted" label="Lotação do servidor" />
          <span className="flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
            <span className="size-2 rounded-full bg-success-fg" aria-hidden />
            online{address ? ` · ${address}` : ''}
          </span>
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-muted-2" aria-hidden />
          {address ? 'Sem resposta do servidor agora.' : 'Este servidor não tem endereço público.'}
        </p>
      )}
    </Tile>
  )
}

function NewsTile() {
  const { data, loading } = useAsync(() => backend().news(), [])
  const items = data ?? []
  return (
    <Tile label="Notícias" className="sm:col-span-2">
      <TileTitle icon={<Newspaper />}>Notícias</TileTitle>
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="h-12 animate-pulse rounded-md bg-surface-2" />
          <div className="h-12 animate-pulse rounded-md bg-surface-2" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{data == null ? 'Não foi possível carregar as notícias agora.' : 'Nenhuma notícia publicada.'}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {items.slice(0, 3).map((n, i) => (
            <article key={i} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
              <span className="font-mono text-2xs text-muted-2">
                {formatDate(n.date)}
                {n.author ? ` · ${n.author}` : ''}
              </span>
              {n.link ? (
                <button type="button" onClick={() => backend().openExternal(n.link!)} className="flex cursor-pointer items-center gap-1.5 text-left text-sm font-medium hover:underline">
                  {n.title} <ExternalLink className="size-3 shrink-0 text-muted-2" />
                </button>
              ) : (
                <h3 className="text-sm font-medium">{n.title}</h3>
              )}
              {n.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>}
            </article>
          ))}
        </div>
      )}
    </Tile>
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
  const tasks = useLauncher(useShallow((s) => s.tasks.filter((t) => t.status === 'active')))

  if (!server || !profile) {
    return <p className="p-6 text-sm text-muted-foreground">Nenhum servidor disponível na distribuição.</p>
  }
  const glow = scenes[server.scene].glow
  const others = servers.filter((s) => s.id !== server.id)

  return (
    <motion.div
      variants={grid}
      initial="hidden"
      animate="show"
      className="mx-auto grid w-full max-w-[1400px] auto-rows-min grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
      style={{ '--scene-glow': glow } as React.CSSProperties}
    >
      <motion.section
        variants={tile}
        aria-label="Servidor selecionado"
        className="relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-lg border border-border sm:col-span-2 lg:col-span-3 lg:row-span-2"
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={server.id}
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <ServerArt server={server} twinkle />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[linear-gradient(to_top,var(--background),transparent)]" aria-hidden />

        <div className="flex flex-1 flex-col justify-end gap-4 p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-[460px] flex-col gap-3 rounded-lg border border-border-2 bg-overlay p-4"
            >
              <div className="flex flex-wrap gap-1.5">
                {server.main && <Badge tone="primary">Servidor oficial</Badge>}
                <Badge>{server.loader === 'Vanilla' ? 'Vanilla' : server.loader} {server.mcVersion}</Badge>
                {server.version && <Badge>Pacote {server.version}</Badge>}
              </div>
              <h1 className="font-display text-3xl font-bold leading-tight">{server.name}</h1>
              {server.description && <p className="text-sm text-muted-foreground">{server.description}</p>}
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <ProfileIcon name={profile.icon} className="size-3.5 text-primary-light" />
                Perfil <span className="font-semibold text-foreground">{profile.name}</span>
              </span>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <PlayButton />
                <Button variant="secondary" size="lg" asChild>
                  <Link to="/perfil">Gerenciar</Link>
                </Button>
                <Tooltip content="Configurações do perfil" side="top">
                  <Button variant="secondary" size="icon" className="size-10" asChild>
                    <Link to="/perfil?aba=config" aria-label="Configurações do perfil">
                      <Settings2 />
                    </Link>
                  </Button>
                </Tooltip>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-end justify-between gap-3">
            {profiles.length > 1 ? (
              <div role="radiogroup" aria-label="Escolher perfil" className="flex flex-wrap gap-1.5 rounded-lg border border-border-2 bg-overlay p-1.5">
                {profiles.map((p) => {
                  const on = p.id === profile.id
                  return (
                    <Tooltip key={p.id} content={p.name} side="top">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={p.name}
                        disabled={locked && !on}
                        onClick={() => selectProfile(p.id)}
                        className={cn(
                          'grid size-9 cursor-pointer place-items-center rounded-md border border-border bg-card text-muted-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50',
                          on && 'text-foreground ring-2 ring-[var(--scene-glow)]',
                        )}
                      >
                        <ProfileIcon name={p.icon} className="size-[18px]" />
                      </button>
                    </Tooltip>
                  )
                })}
              </div>
            ) : (
              <span />
            )}
            {!hasRealArt(server) && <span className="rounded-sm bg-overlay px-2 py-1 text-2xs text-muted-foreground">Arte gerada, não é uma captura do servidor</span>}
          </div>
        </div>
      </motion.section>

      <StatusTile key={server.id} serverId={server.id} address={server.address} />

      <Tile label="Downloads">
        <TileTitle icon={<Download />} action={<Link to="/downloads" className="text-xs text-primary-light hover:underline">Ver tudo</Link>}>
          Downloads
        </TileTitle>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada baixando agora. Os arquivos do servidor são conferidos sempre que você joga.</p>
        ) : (
          tasks.slice(0, 2).map((t) => (
            <div key={t.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{t.title}</span>
                <span className="font-mono text-muted-foreground">{t.progress != null ? `${Math.round(t.progress)}%` : '…'}</span>
              </div>
              <Progress value={t.progress ?? 0} label={t.title} />
            </div>
          ))
        )}
      </Tile>

      <NewsTile />

      {others.length > 0 && (
        <Tile label="Outros servidores" className="sm:col-span-2">
          <TileTitle icon={<Server />} action={<Link to="/servidores" className="flex items-center gap-1 text-xs text-primary-light hover:underline">Servidores <ArrowRight className="size-3" /></Link>}>
            Outros servidores
          </TileTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            {others.slice(0, 3).map((s) => (
              <motion.button
                key={s.id}
                type="button"
                whileHover={{ y: -2 }}
                disabled={locked}
                onClick={() => selectServer(s.id)}
                className="group relative flex h-24 cursor-pointer flex-col justify-end overflow-hidden rounded-md border border-border text-left disabled:cursor-not-allowed"
              >
                <ServerArt server={s} cols={48} rows={27} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
                <span className="relative flex items-center gap-2 bg-overlay px-2.5 py-1.5">
                  <ServerIcon server={s} className="size-5" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block font-mono text-2xs text-muted-foreground">Minecraft {s.mcVersion}</span>
                  </span>
                </span>
              </motion.button>
            ))}
          </div>
        </Tile>
      )}
    </motion.div>
  )
}
