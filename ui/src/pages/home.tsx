import { ArrowRight, Clock, Download, HardDrive, Newspaper, Server, Settings2, Users } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { Link } from 'react-router'
import { PixelScene, InstanceIcon, scenes } from '@/components/shared/pixel-scene'
import { PlayButton } from '@/components/shared/play-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import { cn, formatBytes } from '@/lib/utils'
import { useLauncher, useSelectedInstance } from '@/store/launcher'

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

export function HomePage() {
  const instances = useLauncher((s) => s.instances)
  const select = useLauncher((s) => s.select)
  const downloads = useLauncher(useShallow((s) => s.downloads.filter((d) => d.status === 'active' || d.status === 'queued' || d.status === 'paused')))
  const inst = useSelectedInstance()
  const glow = scenes[inst.scene].glow
  const recent = instances.filter((i) => i.id !== inst.id).slice(0, 3)

  return (
    <motion.div
      variants={grid}
      initial="hidden"
      animate="show"
      className="mx-auto grid w-full max-w-[1400px] auto-rows-min grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
      style={{ '--scene-glow': glow } as React.CSSProperties}
    >
      {/* Hero: o cenário troca com a instância selecionada. */}
      <motion.section
        variants={tile}
        aria-label="Instância selecionada"
        className="relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-lg border border-border sm:col-span-2 lg:col-span-3 lg:row-span-2"
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={inst.scene}
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <PixelScene scene={inst.scene} twinkle />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[linear-gradient(to_top,var(--background),transparent)]" aria-hidden />

        <div className="flex flex-1 flex-col justify-end gap-4 p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-[440px] flex-col gap-3 rounded-lg border border-border-2 bg-overlay p-4"
            >
              <div className="flex flex-wrap gap-1.5">
                {inst.kind === 'server' && <Badge tone="primary">Servidor oficial</Badge>}
                {inst.update ? <Badge tone="warning">{inst.update.from} → {inst.update.to}</Badge> : <Badge tone="success">Atualizado</Badge>}
                <Badge>{inst.loader === 'Vanilla' ? 'Vanilla' : `${inst.loader} ${inst.mcVersion}`}</Badge>
              </div>
              <h1 className="font-display text-3xl font-bold leading-tight">{inst.name}</h1>
              <p className="text-sm text-muted-foreground">{inst.description}</p>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <div className="flex gap-1"><dt className="sr-only">Mods</dt><dd><span className="font-semibold text-foreground">{inst.mods}</span> mods</dd></div>
                <div className="flex gap-1"><dt className="sr-only">Memória</dt><dd><span className="font-semibold text-foreground">{inst.memoryGb} GB</span> RAM</dd></div>
                <div className="flex gap-1"><dt className="sr-only">Tamanho</dt><dd><span className="font-semibold text-foreground">{formatBytes(inst.sizeMb)}</span></dd></div>
                {inst.server && <div className="flex gap-1"><dt className="sr-only">Jogadores</dt><dd><span className="font-semibold text-foreground">{inst.server.online}</span>/{inst.server.max} online</dd></div>}
              </dl>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <PlayButton instance={inst} />
                <Button variant="secondary" size="lg" asChild>
                  <Link to={`/instancia/${inst.id}`}>Gerenciar</Link>
                </Button>
                <Tooltip content="Configurações da instância" side="top">
                  <Button variant="secondary" size="icon" className="size-10" asChild>
                    <Link to={`/instancia/${inst.id}?aba=config`} aria-label="Configurações da instância">
                      <Settings2 />
                    </Link>
                  </Button>
                </Tooltip>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-end justify-between gap-3">
            <div role="radiogroup" aria-label="Escolher instância" className="flex flex-wrap gap-1.5 rounded-lg border border-border-2 bg-overlay p-1.5">
              {instances.map((i) => {
                const on = i.id === inst.id
                return (
                  <Tooltip key={i.id} content={i.name} side="top">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={i.name}
                      onClick={() => select(i.id)}
                      className={cn('relative cursor-pointer rounded-md p-0.5 transition-transform hover:-translate-y-0.5', on && 'ring-2 ring-[var(--scene-glow)]')}
                    >
                      <InstanceIcon scene={i.scene} name={i.name} className="size-9" />
                    </button>
                  </Tooltip>
                )
              })}
            </div>
            <span className="rounded-sm bg-overlay px-2 py-1 text-2xs text-muted-foreground">Arte gerada, não é uma captura do servidor</span>
          </div>
        </div>
      </motion.section>

      <Tile label="Servidor">
        <TileTitle icon={<Server />}>{inst.server ? 'Servidor' : 'Instância local'}</TileTitle>
        {inst.server ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-3xl font-semibold tabular-nums">{inst.server.online}</span>
              <span className="text-sm text-muted-foreground">/ {inst.server.max} jogadores</span>
            </div>
            <Progress value={(inst.server.online / inst.server.max) * 100} tone="muted" label="Lotação do servidor" />
            <div className="flex flex-col gap-1 font-mono text-2xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success-fg" aria-hidden />online · {inst.server.pingMs} ms</span>
              <span className="truncate">{inst.server.address}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem servidor associado. Abre direto no menu do jogo.</p>
        )}
      </Tile>

      <Tile label="Tempo de jogo">
        <TileTitle icon={<Clock />}>Tempo de jogo</TileTitle>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="whitespace-nowrap text-3xl font-semibold tabular-nums">{inst.playtimeH}<span className="text-xl"> h</span></span>
          <span className="text-sm text-muted-foreground">nesta instância</span>
        </div>
        <div className="flex flex-wrap justify-between gap-1 font-mono text-2xs text-muted-foreground">
          <span>última vez {inst.lastPlayed}</span>
          <span className="flex items-center gap-1"><HardDrive className="size-3" />{formatBytes(inst.sizeMb)}</span>
        </div>
      </Tile>

      <Tile label="Continuar jogando" className="sm:col-span-2">
        <TileTitle icon={<Users />} action={<Link to="/biblioteca" className="flex items-center gap-1 text-xs text-primary-light hover:underline">Biblioteca <ArrowRight className="size-3" /></Link>}>
          Continuar jogando
        </TileTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          {recent.map((i) => (
            <motion.button
              key={i.id}
              type="button"
              whileHover={{ y: -2 }}
              onClick={() => select(i.id)}
              className="group relative flex h-24 cursor-pointer flex-col justify-end overflow-hidden rounded-md border border-border text-left"
            >
              <PixelScene scene={i.scene} cols={48} rows={27} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
              <span className="relative bg-overlay px-2.5 py-1.5">
                <span className="block truncate text-sm font-medium">{i.name}</span>
                <span className="block font-mono text-2xs text-muted-foreground">{i.lastPlayed}</span>
              </span>
            </motion.button>
          ))}
        </div>
      </Tile>

      <Tile label="Downloads">
        <TileTitle icon={<Download />} action={<Link to="/downloads" className="text-xs text-primary-light hover:underline">Ver tudo</Link>}>
          Downloads
        </TileTitle>
        {downloads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada baixando agora.</p>
        ) : (
          downloads.slice(0, 2).map((d) => (
            <div key={d.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{d.name}</span>
                <span className="font-mono text-muted-foreground">{d.status === 'queued' ? 'na fila' : `${Math.round(d.progress)}%`}</span>
              </div>
              <Progress value={d.progress} tone={d.status === 'active' ? 'primary' : 'muted'} label={d.name} />
            </div>
          ))
        )}
      </Tile>

      <Tile label="Notícias">
        <TileTitle icon={<Newspaper />}>Notícias</TileTitle>
        <article className="flex flex-col gap-1">
          <span className="font-mono text-2xs text-warning-fg">ATUALIZAÇÃO · [DATA]</span>
          <h3 className="text-sm font-medium">[Título da notícia mais recente do RSS]</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">[Resumo vindo do feed configurado na distribuição.]</p>
        </article>
      </Tile>
    </motion.div>
  )
}
