import { Copy, Play, Search, Share2, Skull, Square, SquareTerminal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, Page } from '@/components/shared/page'
import { InstanceIcon } from '@/components/shared/pixel-scene'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useLauncher, useSelectedInstance, type LogLine } from '@/store/launcher'

const levelColor: Record<LogLine['level'], string> = { INFO: 'text-primary-light', WARN: 'text-warning-fg', ERROR: 'text-danger-fg', DEBUG: 'text-muted-2' }

function useElapsed(start: number | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!start) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [start])
  if (!start) return '00:00:00'
  const s = Math.max(0, Math.floor((now - start) / 1000))
  return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':')
}

export function ConsolePage() {
  const launch = useLauncher((s) => s.launch)
  const logs = useLauncher((s) => s.logs)
  const stop = useLauncher((s) => s.stopLaunch)
  const start = useLauncher((s) => s.startLaunch)
  const crash = useLauncher((s) => s.simulateCrash)
  const inst = useLauncher((s) => s.instances.find((i) => i.id === s.launch.instanceId))
  const selected = useSelectedInstance()
  const [level, setLevel] = useState('all')
  const [q, setQ] = useState('')
  const [follow, setFollow] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const elapsed = useElapsed(launch.startedAt)

  const shown = useMemo(
    () => logs.filter((l) => (level === 'all' || l.level === level) && l.msg.toLowerCase().includes(q.toLowerCase())),
    [logs, level, q],
  )

  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: 'end' })
  }, [shown.length, follow])

  if (launch.state === 'idle' || !inst)
    return (
      <Page className="max-w-3xl">
        <EmptyState
          icon={<SquareTerminal />}
          title="Nenhum jogo aberto"
          action={
            <Button onClick={() => start(selected.id)}>
              <Play className="fill-current" /> Jogar {selected.name}
            </Button>
          }
        >
          Quando o Minecraft estiver rodando, a saída do jogo aparece aqui em tempo real.
        </EmptyState>
      </Page>
    )

  const status =
    launch.state === 'preparing'
      ? { text: `Preparando · ${Math.round(launch.progress)}%`, dot: 'bg-primary animate-pulse' }
      : launch.state === 'running'
        ? { text: 'Em execução', dot: 'bg-success-fg' }
        : { text: 'Encerrado com erro', dot: 'bg-danger-fg' }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-3 px-6 py-5">
      <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3">
        <InstanceIcon scene={inst.scene} name={inst.name} className="size-11" />
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold">{inst.name}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', status.dot)} aria-hidden />
            {status.text}
          </span>
        </div>
        <dl className="flex flex-wrap gap-5 font-mono text-2xs text-muted-foreground">
          <div><dt className="inline">RAM </dt><dd className="inline text-foreground">{launch.state === 'running' ? `5,1 / ${inst.memoryGb} GB` : '—'}</dd></div>
          <div><dt className="inline">Sessão </dt><dd className="inline text-foreground">{elapsed}</dd></div>
        </dl>
        {launch.state === 'running' && (
          <Button variant="ghost" size="sm" onClick={crash} className="text-muted-foreground">
            <Skull /> Simular falha
          </Button>
        )}
        {launch.state === 'crashed' ? (
          <Button onClick={() => start(inst.id)}>
            <Play className="fill-current" /> Jogar de novo
          </Button>
        ) : (
          <Button variant="destructive" onClick={stop}>
            <Square className="fill-current" /> {launch.state === 'preparing' ? 'Cancelar' : 'Forçar encerramento'}
          </Button>
        )}
      </header>

      {launch.state === 'preparing' && <Progress value={launch.progress} label="Preparando o jogo" />}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={level} onValueChange={setLevel} variant="pill">
          <TabsList aria-label="Nível de log">
            <TabsTrigger value="all">Tudo</TabsTrigger>
            <TabsTrigger value="INFO">Info</TabsTrigger>
            <TabsTrigger value="WARN">Avisos</TabsTrigger>
            <TabsTrigger value="ERROR">Erros</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="relative">
          <span className="sr-only">Buscar no log</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no log…" className="w-56 pl-8" />
        </label>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={follow} onCheckedChange={(v) => setFollow(v === true)} /> Rolagem automática
        </label>
        <Button variant="secondary" onClick={() => toast.success('Log copiado')}>
          <Copy /> Copiar
        </Button>
        <Button variant="soft" onClick={() => toast('Enviado para mclo.gs', { description: 'Link copiado.' })}>
          <Share2 /> Compartilhar
        </Button>
      </div>

      <div role="log" aria-label="Saída do jogo" className="min-h-72 flex-1 overflow-auto rounded-lg border border-border bg-sidebar p-3 font-mono text-xs leading-relaxed">
        <AnimatePresence initial={false}>
          {shown.map((l, i) => (
            <motion.div key={`${i}-${l.msg}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 whitespace-pre">
              <span className="text-muted-2">{l.t}</span>
              <span className={cn('w-12', levelColor[l.level])}>{l.level}</span>
              <span className="text-muted-foreground">{l.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {launch.state === 'preparing' && <span className="text-muted-2">Verificando arquivos e bibliotecas…</span>}
        <div ref={end} />
      </div>

      <AnimatePresence>
        {launch.state === 'crashed' && (
          <motion.section
            role="alert"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-danger-line bg-danger-soft p-3"
          >
            <div className="flex min-w-60 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-danger-fg">O jogo fechou inesperadamente (código 1)</span>
              <span className="text-xs text-foreground">Causa provável: o mod “flywheel” está desatualizado para Create 6.0.6.</span>
            </div>
            <Button variant="secondary">Ver crash report</Button>
            <Button asChild>
              <Link to={`/instancia/${inst.id}`}>Atualizar mod</Link>
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
