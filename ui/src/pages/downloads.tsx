import { CircleAlert, CircleCheck, Download, Pause, Play, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { EmptyState, Page, PageHeader } from '@/components/shared/page'
import { InstanceIcon } from '@/components/shared/pixel-scene'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import type { Download as DL } from '@/data/types'
import { formatBytes } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

function Row({ d }: { d: DL }) {
  const togglePause = useLauncher((s) => s.togglePause)
  const cancel = useLauncher((s) => s.cancel)
  const retry = useLauncher((s) => s.retry)
  const done = d.status === 'done'
  const error = d.status === 'error'

  return (
    <motion.div
      layout
      layoutId={d.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
    >
      <InstanceIcon scene={d.scene} name={d.name} className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{d.name}</span>
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            {d.status === 'active' && `${Math.round(d.progress)}% · ${formatBytes((d.sizeMb * d.progress) / 100)} de ${formatBytes(d.sizeMb)}`}
            {d.status === 'paused' && `pausado · ${Math.round(d.progress)}%`}
            {d.status === 'queued' && `na fila · ${formatBytes(d.sizeMb)}`}
            {done && <span className="flex items-center gap-1 text-success-fg"><CircleCheck className="size-3" />concluído</span>}
            {error && <span className="flex items-center gap-1 text-danger-fg"><CircleAlert className="size-3" />falhou</span>}
          </span>
        </div>
        {!done && !error && <Progress value={d.progress} tone={d.status === 'active' ? 'primary' : 'muted'} label={d.name} />}
        <span className="truncate text-xs text-muted-foreground">{d.detail}</span>
      </div>
      <div className="flex gap-1">
        {(d.status === 'active' || d.status === 'paused') && (
          <Tooltip content={d.status === 'active' ? 'Pausar' : 'Retomar'} side="top">
            <Button variant="ghost" size="icon" aria-label={d.status === 'active' ? `Pausar ${d.name}` : `Retomar ${d.name}`} onClick={() => togglePause(d.id)}>
              {d.status === 'active' ? <Pause /> : <Play />}
            </Button>
          </Tooltip>
        )}
        {error && (
          <Button variant="secondary" size="sm" onClick={() => retry(d.id)}>
            <RotateCcw /> Tentar de novo
          </Button>
        )}
        {!done && !error && (
          <Tooltip content="Cancelar" side="top">
            <Button variant="ghost" size="icon" className="text-danger-fg" aria-label={`Cancelar ${d.name}`} onClick={() => cancel(d.id)}>
              <X />
            </Button>
          </Tooltip>
        )}
      </div>
    </motion.div>
  )
}

function Section({ title, items, action }: { title: string; items: DL[]; action?: React.ReactNode }) {
  if (!items.length) return null
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-2xs uppercase tracking-wider text-muted-2">{title}</h2>
        {action}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((d) => (
          <Row key={d.id} d={d} />
        ))}
      </AnimatePresence>
    </section>
  )
}

export function DownloadsPage() {
  const downloads = useLauncher((s) => s.downloads)
  const bandwidth = useLauncher((s) => s.bandwidth)
  const setBandwidth = useLauncher((s) => s.setBandwidth)
  const pauseAll = useLauncher((s) => s.pauseAll)
  const resumeAll = useLauncher((s) => s.resumeAll)
  const clearHistory = useLauncher((s) => s.clearHistory)

  const active = downloads.filter((d) => d.status === 'active' || d.status === 'paused')
  const queued = downloads.filter((d) => d.status === 'queued')
  const history = downloads.filter((d) => d.status === 'done' || d.status === 'error').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const anyActive = downloads.some((d) => d.status === 'active')
  const anyPaused = downloads.some((d) => d.status === 'paused')

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Downloads"
        description={anyActive ? `${active.length} em andamento · ${queued.length} na fila` : 'Nada baixando agora.'}
        actions={
          <>
            <Select aria-label="Limite de banda" value={bandwidth} onValueChange={setBandwidth} options={[{ value: '0', label: 'Sem limite de banda' }, { value: '10', label: '10 MB/s' }, { value: '5', label: '5 MB/s' }, { value: '1', label: '1 MB/s' }]} />
            {anyActive ? (
              <Button variant="secondary" onClick={pauseAll}>
                <Pause /> Pausar tudo
              </Button>
            ) : (
              <Button variant="secondary" onClick={resumeAll} disabled={!anyPaused}>
                <Play /> Retomar tudo
              </Button>
            )}
          </>
        }
      />
      {downloads.length === 0 ? (
        <EmptyState icon={<Download />} title="Sem downloads">
          Instalações de modpacks, atualizações e runtimes Java aparecem aqui.
        </EmptyState>
      ) : (
        <LayoutGroup>
          <Section title="Em andamento" items={active} />
          <Section title="Na fila" items={queued} />
          <Section
            title="Concluídos"
            items={history}
            action={
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                Limpar histórico
              </Button>
            }
          />
        </LayoutGroup>
      )}
    </Page>
  )
}
