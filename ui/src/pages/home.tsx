import { ArrowRight, Download, ExternalLink, Layers, Newspaper, Plus, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { Link } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { backend, type ServerInfo } from '@/backend'
import { PlayButton } from '@/components/shared/play-button'
import { ProfileIcon, profileLabel } from '@/components/shared/profile-icon'
import { RealmScene } from '@/components/shared/realm-scene'
import { hasRealArt, ServerArt, ServerIcon } from '@/components/shared/server-art'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/i18n'
import { useAsync } from '@/lib/use-async'
import { cn, formatDate } from '@/lib/utils'
import { isBusy, useLauncher, useProfile, useServer } from '@/store/launcher'

// Início: a arte do servidor (sem ela, o cenário em camadas do site, com parallax)
// ocupa a área de conteúdo e se desfaz em desfoque no fundo. O texto fica embaixo à esquerda, a ficha do servidor à direita
// e os cartões por último.

const stagger: Variants = { show: { transition: { staggerChildren: 0.06 } } }
const rise: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }

function Art({ server }: { server: ServerInfo }) {
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={server.id}
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {hasRealArt(server) ? <ServerArt server={server} className="absolute inset-0 size-full" /> : <RealmScene className="absolute inset-x-0 top-0 h-[80%]" />}
        {/* Desfoque do site (o vidro do cabeçalho do oblyvium.com.br), entrando aos poucos no pé da arte. */}
        <div className="absolute inset-0 bg-background/85 backdrop-blur-md [mask-image:linear-gradient(to_top,#000_30%,transparent_70%)] supports-[not(backdrop-filter:blur(0))]:bg-background" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_26%,transparent_44%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_0%_100%,color-mix(in_srgb,var(--background)_85%,transparent)_0%,transparent_65%)]" />
      </motion.div>
    </AnimatePresence>
  )
}

/** Linha da ficha do servidor: rótulo à esquerda, valor à direita. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 text-xs first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-foreground">{children}</dd>
    </div>
  )
}

/** Ficha do servidor: jogadores em destaque e os dados técnicos em lista. */
function ServerSheet({ server }: { server: ServerInfo }) {
  const { data, loading } = useAsync(() => backend().serverStatus(server.id), [server.id])
  return (
    <motion.aside variants={rise} aria-label={t('Servidor')} className="w-full max-w-[260px] rounded-lg border border-border bg-card/90 p-4">
      <div className="flex items-center gap-2.5">
        <ServerIcon server={server} className="size-8" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{server.name}</span>
        <span className={cn('size-2 shrink-0 rounded-full', loading ? 'animate-pulse bg-muted-2' : data ? 'bg-success-fg' : 'bg-danger-fg')} aria-hidden />
      </div>
      {server.address && (
        <div className="py-3">
          {loading ? (
            <div className="h-12 animate-pulse rounded-md bg-surface-2" />
          ) : data ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums">{data.online}</span>
                <span className="text-xs text-muted-foreground">{t('de {max} jogadores', { max: data.max })}</span>
              </div>
              <Progress value={data.max ? (data.online / data.max) * 100 : 0} tone="muted" label={t('Jogadores online')} className="mt-2" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('Sem resposta do servidor agora.')}</p>
          )}
        </div>
      )}
      <dl>
        {data && (
          <Fact label={t('Resposta')}>
            <Tooltip content={t('Tempo de resposta da consulta de status')} side="left">
              <span>{data.pingMs} ms</span>
            </Tooltip>
          </Fact>
        )}
        {server.address && <Fact label={t('Endereço')}>{server.address}</Fact>}
        <Fact label={t('Versão')}>
          {server.mcVersion} · {server.loader === 'Vanilla' ? 'Vanilla' : server.loader}
        </Fact>
        <Fact label={t('Renderizador')}>{server.group}</Fact>
        {server.version && <Fact label={t('Pacote')}>v{server.version}</Fact>}
      </dl>
    </motion.aside>
  )
}

function Panel({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={rise} aria-label={title} className={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

function NewsLink({ link, children, className }: { link: string | null; children: React.ReactNode; className?: string }) {
  if (!link) return <span className={className}>{children}</span>
  return (
    <button type="button" onClick={() => backend().openExternal(link)} className={cn('cursor-pointer text-left hover:underline', className)}>
      {children}
    </button>
  )
}

/** Notícias em destaque: a mais recente grande, as seguintes em lista ao lado. */
function NewsPanel({ className }: { className?: string }) {
  const { data, loading } = useAsync(() => backend().news(), [])
  const items = data ?? []
  const [first, ...rest] = items
  return (
    <Panel title={t('Notícias')} icon={<Newspaper />} className={className}>
      {loading ? (
        <div className="grid flex-1 gap-4 sm:grid-cols-[1.5fr_1fr]">
          <div className="h-28 animate-pulse rounded-md bg-surface-2" />
          <div className="h-28 animate-pulse rounded-md bg-surface-2" />
        </div>
      ) : !first ? (
        <p className="flex flex-1 items-center text-sm text-muted-foreground">{data == null ? t('Não foi possível carregar as notícias agora.') : t('Nenhuma notícia publicada.')}</p>
      ) : (
        <div className="grid flex-1 gap-4 sm:grid-cols-[1.5fr_1fr]">
          <article className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-primary-light">
              {formatDate(first.date)}
              {first.author ? ` · ${first.author}` : ''}
            </span>
            <NewsLink link={first.link} className="text-lg font-semibold leading-snug">
              {first.title}
            </NewsLink>
            {first.summary && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{first.summary}</p>}
            {first.link && (
              <button type="button" onClick={() => backend().openExternal(first.link!)} className="mt-auto flex w-fit cursor-pointer items-center gap-1.5 pt-1 text-xs font-medium text-primary-light hover:underline">
                {t('Ler notícia')} <ExternalLink className="size-3" />
              </button>
            )}
          </article>
          {rest.length > 0 && (
            <ul className="flex min-w-0 flex-col divide-y divide-border border-border sm:border-l sm:pl-4">
              {rest.slice(0, 3).map((n, i) => (
                <li key={i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <span className="font-mono text-2xs text-muted-2">{formatDate(n.date)}</span>
                  <NewsLink link={n.link} className="line-clamp-2 text-sm font-medium">
                    {n.title}
                  </NewsLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
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
    return <p className="p-6 text-sm text-muted-foreground">{t('Nenhum servidor disponível na distribuição.')}</p>
  }
  const others = servers.filter((s) => s.id !== server.id)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="relative isolate flex min-h-[calc(100vh-2.5rem)] flex-col">
      <Art server={server} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-6 pb-5 pt-6">
        <div className="flex flex-1 flex-wrap items-end justify-between gap-6">
          {/* Destaque: nome do servidor sobre a arte, embaixo à esquerda. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={server.id}
              aria-label={t('Servidor selecionado')}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex min-w-0 max-w-[560px] flex-1 flex-col gap-3"
            >
              <span className="font-mono text-2xs uppercase tracking-[0.2em] text-primary-light">{server.main ? t('Servidor oficial') : t('Servidor')}</span>
              <h1 className="font-display text-5xl font-bold leading-[1.05] text-foreground [text-shadow:0_2px_18px_var(--background)]">{server.name}</h1>
              {/* Ornamento da forja: filete com losango. */}
              <span className="flex items-center gap-2" aria-hidden>
                <span className="h-px w-12 bg-primary" />
                <span className="size-1.5 rotate-45 bg-primary" />
                <span className="h-px w-24 bg-[linear-gradient(90deg,var(--primary),transparent)]" />
              </span>
              {server.description && <p className="max-w-[500px] text-sm leading-relaxed text-muted-foreground">{server.description}</p>}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <PlayButton />
                <Button variant="secondary" size="lg" asChild className="h-12 px-5">
                  <Link to="/perfil">{t('Gerenciar')}</Link>
                </Button>
                {server.loader !== 'Vanilla' && (
                  <Button variant="secondary" size="lg" asChild className="h-12 px-5">
                    <Link to="/descobrir?tipo=mod">
                      <Plus /> {t('Adicionar mods')}
                    </Link>
                  </Button>
                )}
                <Tooltip content={t('Configurações do perfil')} side="top">
                  <Button variant="secondary" size="icon" className="size-12" asChild>
                    <Link to="/perfil?aba=config" aria-label={t('Configurações do perfil')}>
                      <Settings2 />
                    </Link>
                  </Button>
                </Tooltip>
              </div>

              {/* Perfis antigos (criados em versões anteriores): trocar sem sair do Início. */}
              {profiles.length > 1 && (
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
                          'inline-flex h-7 cursor-pointer items-center gap-2 rounded-sm border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          on ? 'border-primary-line bg-primary-soft text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <ProfileIcon name={p.icon} className={cn('size-3.5', on && 'text-primary-light')} />
                        {profileLabel(p)}
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <ServerSheet key={server.id} server={server} />
        </div>

        {/* Notícias em destaque (duas colunas); outros servidores numa lista compacta ao lado. */}
        <div className="grid gap-3 md:grid-cols-3">
          <NewsPanel className="md:col-span-2" />

          <Panel
            title={tasks.length ? t('Downloads') : t('Outros servidores')}
            icon={tasks.length ? <Download /> : <Layers />}
            action={
              tasks.length > 0 && (
                <Link to="/downloads" className="flex items-center gap-1 text-xs text-primary-light hover:underline">
                  {t('Ver tudo')} <ArrowRight className="size-3" />
                </Link>
              )
            }
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
              <p className="text-sm text-muted-foreground">{t('Nada baixando agora. Os arquivos do servidor são conferidos sempre que você joga.')}</p>
            ) : (
              <ul className="-mx-1.5 flex flex-col gap-0.5">
                {others.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => selectServer(s.id)}
                      aria-label={t('Jogar em {name}', { name: s.name })}
                      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ServerIcon server={s} className="size-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block font-mono text-2xs text-muted-foreground">
                          {s.mcVersion} · {s.group}
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {!hasRealArt(server) && <span className="self-end text-2xs text-muted-2">{t('Arte conceitual, não é uma captura do servidor')}</span>}
      </div>
    </motion.div>
  )
}
