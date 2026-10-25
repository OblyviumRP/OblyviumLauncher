import { Loader2, Play, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useLauncher, useServer } from '@/store/launcher'

/** Botão Jogar do servidor e perfil selecionados: pronto → preparando (progresso no botão) → jogando. */
export function PlayButton({ size = 'lg', className }: { size?: 'lg' | 'md'; className?: string }) {
  const launch = useLauncher((s) => s.launch)
  const start = useLauncher((s) => s.launchGame)
  const stop = useLauncher((s) => s.stopGame)
  const confirm = useLauncher((s) => s.confirm)
  const server = useServer()
  const state = launch.state
  const name = server?.name ?? t('o jogo')

  const pct = launch.progress != null ? `${Math.round(launch.progress)}%` : null
  const label = state === 'preparing' ? (pct ?? t('Abrindo')) : state === 'running' ? t('Encerrar') : t('Jogar')
  const onClick = async () => {
    if (state === 'idle' || state === 'crashed') return start()
    if (state === 'running') {
      const ok = await confirm({ title: t('Encerrar o jogo?'), body: t('O Minecraft fecha na hora, sem salvar o que estiver aberto. Prefira sair pelo menu do jogo.'), confirm: t('Encerrar'), tone: 'danger' })
      if (ok) stop()
    }
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={state === 'preparing' || !server}
      whileHover={{ scale: state === 'preparing' ? 1 : 1.02 }}
      whileTap={{ scale: 0.97 }}
      aria-label={state === 'preparing' ? t('Preparando {name}', { name }) + (pct ? `, ${pct}` : '') : `${label} ${name}`}

      title={state === 'preparing' ? launch.status : undefined}
      className={cn(
        'relative isolate inline-flex cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-md font-semibold uppercase tracking-[0.12em] text-white transition-colors disabled:cursor-progress',
        size === 'lg' ? 'h-12 min-w-44 px-7 text-base' : 'h-9 min-w-28 px-4 text-sm',
        state === 'running' ? 'border border-danger-line bg-danger-soft text-danger-fg' : 'border border-primary/60 bg-primary-fill shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_22%,transparent),inset_0_-3px_0_color-mix(in_srgb,var(--background)_45%,transparent)] hover:bg-primary-hover',
        className,
      )}
    >
      {state === 'preparing' && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 -z-10 bg-primary-hover"
          initial={{ width: 0 }}
          animate={{ width: `${launch.progress ?? 100}%`, opacity: launch.progress == null ? [0.4, 0.8, 0.4] : 1 }}
          transition={launch.progress == null ? { opacity: { repeat: Infinity, duration: 1.4 } } : { ease: 'linear', duration: 0.4 }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="flex items-center gap-2.5"
        >
          {state === 'preparing' ? <Loader2 className="size-4 animate-spin" /> : state === 'running' ? <Square className="size-3.5 fill-current" /> : <Play className="size-4 fill-current" />}
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
