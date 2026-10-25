import { Bell, BellOff, CheckCheck, ExternalLink } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { backend } from '@/backend'
import { cn } from '@/lib/utils'
import { useLauncher, type Notice } from '@/store/launcher'

const toneDot: Record<Notice['tone'], string> = {
  primary: 'bg-primary',
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  danger: 'bg-danger-fg',
}

const toneLabel: Record<Notice['tone'], string> = { primary: 'Aviso', success: 'Concluído', warning: 'Atenção', danger: 'Erro' }

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

export function NotificationCenter() {
  const navigate = useNavigate()
  const items = useLauncher((s) => s.notifications)
  const markAllRead = useLauncher((s) => s.markAllRead)
  const clear = useLauncher((s) => s.clearNotifications)
  const unread = items.filter((n) => !n.read).length

  return (
    <Popover onOpenChange={(open) => !open && unread && markAllRead()}>
      <PopoverTrigger
        aria-label={unread ? `Notificações, ${unread} não lidas` : 'Notificações'}
        className="relative grid size-8 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
      >
        <Bell className="size-4" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full bg-primary-fill font-mono text-[9px] text-white"
            >
              {unread}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border-2 px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread}>
              <CheckCheck /> Marcar lidas
            </Button>
            <Button variant="ghost" size="sm" onClick={clear} disabled={!items.length}>
              Limpar
            </Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground">
              <BellOff className="size-5" />
              <span className="text-sm">Nada por aqui. Avisos da staff, atualizações e erros aparecem nesta lista.</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((n) => (
                <motion.button
                  layout
                  key={n.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  type="button"
                  onClick={() => (n.href ? navigate(n.href) : n.link && backend().openExternal(n.link.url))}
                  className={cn('flex w-full cursor-pointer gap-3 rounded-sm px-2 py-2 text-left hover:bg-border-2', !n.read && 'bg-primary-soft/60')}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[n.tone])} aria-hidden />
                  <span className="sr-only">{toneLabel[n.tone]}:</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{n.title}</span>
                    {n.image && <img src={n.image} alt="" className="my-1 max-h-28 w-full rounded-sm object-cover" />}
                    {n.body && <span className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</span>}
                    {n.link && (
                      <span className="flex items-center gap-1 text-xs text-primary-light">
                        {n.link.label} <ExternalLink className="size-3" />
                      </span>
                    )}
                    <span className="font-mono text-2xs text-muted-2">{ago(n.at)}</span>
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
