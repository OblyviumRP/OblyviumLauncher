import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { Link } from 'react-router'
import { backend } from '@/backend'
import { t } from '@/i18n'
import { useLauncher } from '@/store/launcher'
import { NotificationCenter } from './notification-center'

// Barra de título da janela sem moldura do Electron.
export function TitleBar() {
  const launch = useLauncher((s) => s.launch)
  const server = useLauncher((s) => s.servers.find((x) => x.id === s.launch.serverId))
  const b = backend()
  const fullscreen = useLauncher((s) => s.windowFullscreen)

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-3 [-webkit-app-region:drag]">
      <div className="flex-1" />
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {launch.state !== 'idle' && server && (
          <Link
            to="/console"
            className="mr-1 flex h-7 max-w-80 items-center gap-2 rounded-sm border border-border-2 bg-card px-2.5 text-xs text-foreground hover:bg-accent"
          >
            <span
              className={
                launch.state === 'running' ? 'size-2 shrink-0 rounded-full bg-success-fg' : launch.state === 'crashed' ? 'size-2 shrink-0 rounded-full bg-danger-fg' : 'size-2 shrink-0 animate-pulse rounded-full bg-primary'
              }
              aria-hidden
            />
            <span className="truncate">
              {launch.state === 'preparing' && `${server.name} · ${launch.status}${launch.progress != null ? ` ${Math.round(launch.progress)}%` : ''}`}
              {launch.state === 'running' && t('Jogando {name}', { name: server.name })}
              {launch.state === 'crashed' && t('{name} fechou com erro', { name: server.name })}
            </span>
          </Link>
        )}
        <NotificationCenter />
      </div>
      <div className="flex h-full [-webkit-app-region:no-drag]">
        <button type="button" aria-label={t('Minimizar')} onClick={() => b.windowMinimize()} className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground">
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label={fullscreen ? t('Sair da tela cheia (F11)') : t('Tela cheia (F11)')}
          title={fullscreen ? t('Sair da tela cheia (F11)') : t('Tela cheia (F11)')}
          onClick={() => b.setWindowFullscreen(!fullscreen)}
          className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button type="button" aria-label={t('Fechar')}

 onClick={() => b.windowClose()} className="grid h-full w-11 cursor-pointer place-items-center text-muted-foreground hover:bg-danger-line hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </header>
  )
}
