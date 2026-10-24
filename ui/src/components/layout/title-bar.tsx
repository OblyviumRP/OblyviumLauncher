import { Minus, Square, X } from 'lucide-react'
import { Link } from 'react-router'
import { useLauncher } from '@/store/launcher'
import { NotificationCenter } from './notification-center'

// Barra de título do Electron (janela sem moldura). Os botões chamam o IPC quando ligado.
export function TitleBar() {
  const launch = useLauncher((s) => s.launch)
  const inst = useLauncher((s) => s.instances.find((i) => i.id === s.launch.instanceId))

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-3 [-webkit-app-region:drag]">
      <div className="flex-1" />
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {launch.state !== 'idle' && inst && (
          <Link
            to="/console"
            className="mr-1 flex h-7 items-center gap-2 rounded-sm border border-border-2 bg-card px-2.5 text-xs text-foreground hover:bg-accent"
          >
            <span
              className={
                launch.state === 'running' ? 'size-2 rounded-full bg-success-fg' : launch.state === 'crashed' ? 'size-2 rounded-full bg-danger-fg' : 'size-2 animate-pulse rounded-full bg-primary'
              }
              aria-hidden
            />
            {launch.state === 'preparing' && `Preparando ${inst.name} · ${Math.round(launch.progress)}%`}
            {launch.state === 'running' && `Jogando ${inst.name}`}
            {launch.state === 'crashed' && `${inst.name} fechou com erro`}
          </Link>
        )}
        <NotificationCenter />
      </div>
      <div className="flex h-full [-webkit-app-region:no-drag]">
        <button type="button" aria-label="Minimizar" className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground">
          <Minus className="size-4" />
        </button>
        <button type="button" aria-label="Maximizar" className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground">
          <Square className="size-3.5" />
        </button>
        <button type="button" aria-label="Fechar" className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-danger-line hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </header>
  )
}
