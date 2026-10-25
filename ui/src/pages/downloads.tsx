import { CircleAlert, CircleCheck, Coffee, Download, Gamepad2, Package, RefreshCw } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { EmptyState, Page, PageHeader } from '@/components/shared/page'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { t } from '@/i18n'
import { ago } from '@/lib/utils'
import { useLauncher, type Task } from '@/store/launcher'

const kindIcon = { game: Gamepad2, java: Coffee, content: Package, update: RefreshCw }

function Row({ task }: { task: Task }) {
  const done = task.status === 'done'
  const error = task.status === 'error'
  const Icon = kindIcon[task.kind]
  return (
    <motion.div
      layout
      layoutId={task.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-light">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{task.title}</span>
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            {task.status === 'active' && (task.progress != null ? `${Math.round(task.progress)}%` : t('em andamento'))}
            {done && (
              <span className="flex items-center gap-1 text-success-fg">
                <CircleCheck className="size-3" />
                {t('concluído')} {task.finishedAt ? ago(task.finishedAt) : ''}
              </span>
            )}
            {error && (
              <span className="flex items-center gap-1 text-danger-fg">
                <CircleAlert className="size-3" />
                {t('falhou')}
              </span>
            )}
          </span>
        </div>
        {task.status === 'active' &&
          (task.progress != null ? (
            <Progress value={task.progress} label={task.title} />
          ) : (
            <div className="h-1.5 overflow-hidden rounded-full bg-accent" role="progressbar" aria-label={task.title}>
              <div className="h-full w-1/3 animate-[shimmer_1.2s_linear_infinite] rounded-full bg-primary" />
            </div>
          ))}
        <span className="truncate text-xs text-muted-foreground">{task.detail}</span>
      </div>
    </motion.div>
  )
}

export function DownloadsPage() {
  const tasks = useLauncher((s) => s.tasks)
  const clear = useLauncher((s) => s.clearTasks)
  const active = tasks.filter((x) => x.status === 'active')
  const history = tasks.filter((x) => x.status !== 'active')

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title={t('Downloads')}
        description={t('Arquivos do servidor, Java e atualizações do launcher.')}
        actions={
          <Button variant="secondary" onClick={clear} disabled={history.length === 0}>
            {t('Limpar histórico')}
          </Button>
        }
      />
      <LayoutGroup>
        <section aria-labelledby="ativos" className="flex flex-col gap-2">
          <h2 id="ativos" className="font-mono text-2xs uppercase tracking-wider text-muted-2">
            {t('Em andamento · {n}', { n: active.length })}
          </h2>
          <AnimatePresence initial={false}>
            {active.length === 0 ? (
              <EmptyState key="vazio" icon={<Download />} title={t('Nada baixando')}>
                {t('Ao jogar, o launcher confere e baixa o que faltar do servidor.')}
              </EmptyState>
            ) : (
              active.map((x) => <Row key={x.id} task={x} />)
            )}
          </AnimatePresence>
        </section>
        {history.length > 0 && (
          <section aria-labelledby="historico" className="flex flex-col gap-2">
            <h2 id="historico" className="font-mono text-2xs uppercase tracking-wider text-muted-2">
              {t('Nesta sessão · {n}', { n: history.length })}
            </h2>
            <AnimatePresence initial={false}>
              {history.map((x) => (
                <Row key={x.id} task={x} />
              ))}
            </AnimatePresence>
          </section>
        )}
      </LayoutGroup>
    </Page>
  )
}
