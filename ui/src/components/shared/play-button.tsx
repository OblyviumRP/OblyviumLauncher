import { Loader2, Play, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Instance } from '@/data/types'
import { cn } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

/** Botão Jogar com três estados animados: pronto → preparando (progresso no próprio botão) → jogando. */
export function PlayButton({ instance, size = 'lg', className }: { instance: Instance; size?: 'lg' | 'md'; className?: string }) {
  const launch = useLauncher((s) => s.launch)
  const start = useLauncher((s) => s.startLaunch)
  const stop = useLauncher((s) => s.stopLaunch)
  const mine = launch.instanceId === instance.id
  const busyOther = !mine && (launch.state === 'preparing' || launch.state === 'running')
  const state = mine ? launch.state : 'idle'

  const label = state === 'preparing' ? `${Math.round(launch.progress)}%` : state === 'running' ? 'Encerrar' : 'Jogar'
  const onClick = () => (state === 'idle' || state === 'crashed' ? start(instance.id) : stop())

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busyOther}
      whileHover={{ scale: busyOther ? 1 : 1.02 }}
      whileTap={{ scale: 0.97 }}
      aria-label={state === 'preparing' ? `Preparando ${instance.name}, ${Math.round(launch.progress)}%. Cancelar` : `${label} ${instance.name}`}
      title={busyOther ? 'Outra instância já está aberta' : undefined}
      className={cn(
        'relative isolate inline-flex cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-md font-semibold uppercase tracking-[0.12em] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'h-12 min-w-44 px-7 text-base' : 'h-9 min-w-28 px-4 text-sm',
        state === 'running' ? 'border border-danger-line bg-danger-soft text-danger-fg' : 'bg-primary-fill hover:bg-primary-hover',
        className,
      )}
    >
      {state === 'preparing' && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 -z-10 bg-primary-hover"
          initial={{ width: 0 }}
          animate={{ width: `${launch.progress}%` }}
          transition={{ ease: 'linear', duration: 0.4 }}
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
