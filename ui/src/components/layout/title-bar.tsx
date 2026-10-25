import { Link } from 'react-router'
import { backend } from '@/backend'
import { t } from '@/i18n'
import { useLauncher } from '@/store/launcher'
import { NotificationCenter } from './notification-center'

// Desenhos dos botões da janela no traço fino do Windows (10×10).
function WindowGlyph({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden shapeRendering="crispEdges">
      {kind === 'minimize' && <path d="M0 5.5h10" />}
      {kind === 'maximize' && <rect x="0.5" y="0.5" width="9" height="9" />}
      {kind === 'restore' && (
        <>
          <rect x="0.5" y="2.5" width="7" height="7" />
          <path d="M2.5 2.5V0.5h7v7h-2" />
        </>
      )}
      {kind === 'close' && <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" shapeRendering="geometricPrecision" />}
    </svg>
  )
}

// Barra de título da janela sem moldura do Electron. Arrastar move a janela e o
// duplo clique maximiza, como no Windows.
export function TitleBar() {
  const launch = useLauncher((s) => s.launch)
  const server = useLauncher((s) => s.servers.find((x) => x.id === s.launch.serverId))
  const b = backend()
  const maximized = useLauncher((s) => s.windowMaximized)

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
        <button type="button" aria-label={t('Minimizar')} title={t('Minimizar')} onClick={() => b.windowMinimize()} className="grid h-full w-12 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground">
          <WindowGlyph kind="minimize" />
        </button>
        <button
          type="button"
          aria-label={maximized ? t('Restaurar') : t('Maximizar')}
          title={maximized ? t('Restaurar') : t('Maximizar')}
          onClick={() => b.toggleMaximize()}
          className="grid h-full w-12 cursor-pointer place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <WindowGlyph kind={maximized ? 'restore' : 'maximize'} />
        </button>
        <button type="button" aria-label={t('Fechar')} title={t('Fechar')} onClick={() => b.windowClose()} className="grid h-full w-12 cursor-pointer place-items-center text-muted-foreground hover:bg-danger-line hover:text-foreground">
          <WindowGlyph kind="close" />
        </button>
      </div>
    </header>
  )
}
