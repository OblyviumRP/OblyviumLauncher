import { Copy, FileWarning, Play, Search, Square, SquareTerminal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { backend, type LogLine } from '@/backend'
import { EmptyState, Page } from '@/components/shared/page'
import { ProfileIcon, profileLabel } from '@/components/shared/profile-icon'
import { ServerIcon } from '@/components/shared/server-art'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { locale, t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useLauncher, useServer } from '@/store/launcher'

const levelColor: Record<LogLine['level'], string> = { INFO: 'text-primary-light', WARN: 'text-warning-fg', ERROR: 'text-danger-fg', DEBUG: 'text-muted-2' }
const MAX_SHOWN = 2000

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
  const stop = useLauncher((s) => s.stopGame)
  const start = useLauncher((s) => s.launchGame)
  const confirm = useLauncher((s) => s.confirm)
  const server = useLauncher((s) => s.servers.find((x) => x.id === s.launch.serverId)) ?? null
  const profile = useLauncher((s) => s.profiles.find((p) => p.id === s.launch.profileId)) ?? null
  const selected = useServer()
  const [level, setLevel] = useState('all')
  const [q, setQ] = useState('')
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const elapsed = useElapsed(launch.state === 'running' ? launch.startedAt : null)

  const filtered = useMemo(() => logs.filter((l) => (level === 'all' || l.level === level) && (!q || l.msg.toLowerCase().includes(q.toLowerCase()))), [logs, level, q])
  const shown = filtered.slice(-MAX_SHOWN)

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown.length, follow])

  if (!server || (launch.state === 'idle' && logs.length === 0))
    return (
      <Page className="max-w-3xl">
        <EmptyState
          icon={<SquareTerminal />}
          title={t('Nenhum jogo aberto')}
          action={
            selected && (
              <Button onClick={start}>
                <Play className="fill-current" /> {t('Jogar {name}', { name: selected.name })}
              </Button>
            )
          }
        >
          {t('Quando o Minecraft estiver rodando, a saída do jogo aparece aqui em tempo real.')}
        </EmptyState>
      </Page>
    )

  const status =
    launch.state === 'preparing'
      ? { text: `${launch.status}${launch.progress != null ? ` · ${Math.round(launch.progress)}%` : ''}`, dot: 'bg-primary animate-pulse' }
      : launch.state === 'running'
        ? { text: t('Em execução'), dot: 'bg-success-fg' }
        : launch.state === 'crashed'
          ? { text: t('Encerrado com erro (código {code})', { code: launch.code ?? '?' }), dot: 'bg-danger-fg' }
          : { text: t('Encerrado'), dot: 'bg-muted-2' }

  const forceStop = async () => {
    const ok = await confirm({ title: t('Forçar encerramento?'), body: t('O Minecraft fecha na hora, sem salvar o que estiver aberto.'), confirm: t('Encerrar'), tone: 'danger' })
    if (ok) stop()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-3 px-6 py-5">
      <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3">
        <ServerIcon server={server} className="size-11" />
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-base font-semibold">
            {server.name}
            {profile && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <ProfileIcon name={profile.icon} className="size-3.5" /> {profileLabel(profile)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', status.dot)} aria-hidden />
            {status.text}
          </span>
        </div>
        <dl className="flex flex-wrap gap-5 font-mono text-2xs text-muted-foreground">
          <div>
            <dt className="inline">{t('Linhas')} </dt>
            <dd className="inline text-foreground">{logs.length.toLocaleString(locale())}</dd>
          </div>
          <div>
            <dt className="inline">{t('Sessão')} </dt>
            <dd className="inline text-foreground">{elapsed}</dd>
          </div>
        </dl>
        {launch.state === 'running' ? (
          <Button variant="destructive" onClick={forceStop}>
            <Square className="fill-current" /> {t('Forçar encerramento')}
          </Button>
        ) : launch.state !== 'preparing' ? (
          <Button onClick={start}>
            <Play className="fill-current" /> {t('Jogar de novo')}
          </Button>
        ) : null}
      </header>

      {launch.state === 'preparing' && launch.progress != null && <Progress value={launch.progress} label={t('Preparando o jogo')} />}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={level} onValueChange={setLevel} variant="pill">
          <TabsList aria-label={t('Nível de log')}>
            <TabsTrigger value="all">{t('Tudo')}</TabsTrigger>
            <TabsTrigger value="INFO">Info</TabsTrigger>
            <TabsTrigger value="WARN">{t('Avisos')}</TabsTrigger>
            <TabsTrigger value="ERROR">{t('Erros')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="relative">
          <span className="sr-only">{t('Buscar no log')}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar no log…')} className="w-56 pl-8" />
        </label>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={follow} onCheckedChange={(v) => setFollow(v === true)} /> {t('Rolagem automática')}
        </label>
        <Button
          variant="secondary"
          disabled={logs.length === 0}
          onClick={() => {
            void navigator.clipboard.writeText(filtered.map((l) => l.msg).join('\n'))
            toast.success(t('Log copiado'))
          }}
        >
          <Copy /> {t('Copiar')}
        </Button>
      </div>

      <div ref={box} role="log" aria-label={t('Saída do jogo')} className="min-h-72 flex-1 overflow-auto rounded-lg border border-border bg-sidebar p-3 font-mono text-xs leading-relaxed">
        {filtered.length > MAX_SHOWN && <div className="pb-2 text-muted-2">{t('… {n} linhas anteriores ocultas. Use Copiar para pegar tudo.', { n: (filtered.length - MAX_SHOWN).toLocaleString(locale()) })}</div>}
        {shown.map((l, i) => (
          <div key={i} className="flex gap-3 whitespace-pre">
            <span className="text-muted-2">{l.t}</span>
            <span className={cn('w-12 shrink-0', levelColor[l.level])}>{l.level}</span>
            <span className={cn(l.level === 'ERROR' ? 'text-danger-fg' : l.level === 'WARN' ? 'text-warning-fg' : 'text-muted-foreground')}>{l.msg}</span>
          </div>
        ))}
        {launch.state === 'preparing' && <span className="text-muted-2">{launch.status}</span>}
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
              <span className="text-sm font-semibold text-danger-fg">{t('O jogo fechou inesperadamente (código {code})', { code: launch.code ?? '?' })}</span>
              <span className="text-xs text-foreground">{t('Filtre por Erros para ver a causa. Se pedir ajuda à staff, envie o crash report e o log copiado.')}</span>
            </div>
            {launch.crashReport && (
              <Button variant="secondary" onClick={() => backend().showFile(launch.crashReport!)}>
                <FileWarning /> {t('Abrir crash report')}

              </Button>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
