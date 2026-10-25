import { Bug, ExternalLink, FolderOpen, LogOut, RefreshCw, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { backend, type LauncherSettings } from '@/backend'
import { logoutAccount } from '@/components/layout/account-switcher'
import { Avatar } from '@/components/shared/avatar'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { Card } from '@/components/shared/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/lib/use-async'
import { formatDate } from '@/lib/utils'
import { useLauncher, useProfile, useServer } from '@/store/launcher'

const sections = [
  { id: 'geral', label: 'Geral' },
  { id: 'contas', label: 'Contas' },
  { id: 'jogo', label: 'Java e jogo' },
  { id: 'sobre', label: 'Sobre e atualizações' },
]

const REPO = 'https://github.com/OblyviumRP/OblyviumLauncher'

function Row({ title, description, children, htmlFor }: { title: string; description?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border py-3.5 last:border-0">
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      {children}
    </div>
  )
}

type BoolKey = 'discordPresence' | 'allowPrerelease' | 'autoConnect' | 'hideLauncherWhilePlaying'

function SwitchRow({ k, title, description, settings, onChange }: { k: BoolKey; title: string; description?: string; settings: LauncherSettings; onChange: () => void }) {
  const id = `s-${k}`
  return (
    <Row title={title} description={description} htmlFor={id}>
      <Switch
        id={id}
        checked={settings[k]}
        onCheckedChange={(v) => {
          backend().setLauncherSetting(k, v)
          onChange()
        }}
      />
    </Row>
  )
}

function Accounts() {
  const accounts = useLauncher((s) => s.accounts)
  const accountId = useLauncher((s) => s.accountId)
  const select = useLauncher((s) => s.selectAccount)
  return (
    <div className="flex flex-col gap-2 py-4">
      {accounts.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
          <Avatar name={a.name} className="size-8" />
          <span className="flex min-w-40 flex-1 flex-col">
            <span className="text-sm font-semibold">{a.name}</span>
            <span className="text-2xs text-muted-foreground">{a.kind === 'microsoft' ? 'Microsoft' : a.kind === 'offline' ? 'Offline' : 'Mojang'}</span>
          </span>
          {a.id === accountId ? (
            <Badge tone="success">em uso</Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => select(a.id)}>
              Usar
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-danger-fg" onClick={() => logoutAccount(a.id)}>
            <LogOut /> Sair
          </Button>
        </div>
      ))}
      <div className="pt-2">
        <Button asChild>
          <Link to="/boas-vindas?adicionar=1">
            <UserPlus /> Adicionar conta
          </Link>
        </Button>
      </div>
    </div>
  )
}

function About() {
  const update = useLauncher((s) => s.update)
  const b = backend()
  const notes = useAsync(() => b.changelog(), [])
  const checking = update.state === 'checking'
  return (
    <div className="flex flex-col gap-4 py-5">
      <div className="flex items-center gap-4">
        <OblyviumMark className="size-14 text-primary-light" />
        <div className="flex flex-col gap-1">
          <span className="font-display text-xl font-bold">Oblyvium Launcher</span>
          <span className="font-mono text-xs text-muted-foreground">
            v{b.appVersion}
            {b.isDev ? ' · desenvolvimento' : ''} · fork do Helios Launcher
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-3">
        <span className="min-w-48 flex-1 text-sm">
          {update.state === 'available' && `Baixando a versão ${update.version}… ${update.percent}%`}
          {update.state === 'ready' && `A versão ${update.version} está pronta para instalar.`}
          {update.state === 'none' && 'Você está na versão mais recente.'}
          {update.state === 'checking' && 'Verificando atualizações…'}
          {update.state === 'error' && update.message}
          {update.state === 'idle' && (b.isDev ? 'Atualizações automáticas ficam desligadas no modo de desenvolvimento.' : 'O launcher verifica atualizações sozinho a cada 30 minutos.')}
        </span>
        {update.state === 'ready' ? (
          <Button
            onClick={() => {
              try {
                b.installUpdate()
              } catch (err) {
                useLauncher.getState().showError(err)
              }
            }}
          >
            Reiniciar e instalar
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => b.checkForUpdate()} disabled={checking || b.isDev || update.state === 'available'}>
            <RefreshCw className={checking ? 'animate-spin' : undefined} /> Verificar agora
          </Button>
        )}
      </div>
      {notes.data && (
        <section aria-labelledby="novidades" className="flex flex-col gap-2">
          <h2 id="novidades" className="text-sm font-semibold">
            Novidades da {notes.data.version} {notes.data.title && <span className="font-normal text-muted-foreground">· {notes.data.title}</span>}
          </h2>
          <span className="font-mono text-2xs text-muted-2">{formatDate(notes.data.publishedAt)}</span>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {notes.data.blocks.map((blk, i) =>
              blk.type === 'p' ? (
                <p key={i}>{blk.text}</p>
              ) : (
                <ul key={i} className="list-disc space-y-1 pl-5">
                  {blk.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => b.openExternal(REPO)}>
          <ExternalLink /> Código-fonte
        </Button>
        <Button variant="secondary" onClick={() => b.openExternal(`${REPO}/issues`)}>
          <Bug /> Reportar problema
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Não é um produto oficial do Minecraft. Não aprovado nem associado à Mojang ou à Microsoft.</p>
    </div>
  )
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') ?? 'geral'
  const [rev, setRev] = useState(0)
  const server = useServer()
  const profile = useProfile()
  void rev
  const settings = backend().launcherSettings()
  const bump = () => setRev((r) => r + 1)

  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-6 py-5">
      <h1 className="font-display text-2xl font-bold">Configurações</h1>
      <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })} variant="side" orientation="vertical" className="flex flex-wrap items-start gap-6">
        <TabsList aria-label="Seções" className="w-52 shrink-0">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Card className="min-w-0 flex-1 px-5 py-1">
          <TabsContent value="geral">
            <SwitchRow k="hideLauncherWhilePlaying" title="Esconder o launcher enquanto joga" description="A janela volta quando o jogo fechar." settings={settings} onChange={bump} />
            <SwitchRow k="autoConnect" title="Entrar direto no servidor" description="Ao abrir o jogo, conecta no endereço do servidor selecionado." settings={settings} onChange={bump} />
            <SwitchRow k="discordPresence" title="Discord Rich Presence" description="Mostra no Discord o servidor em que você está jogando." settings={settings} onChange={bump} />
            <Row title="Pasta de dados" description={<span className="break-all font-mono">{settings.dataDirectory}</span>}>
              <Button variant="secondary" onClick={() => backend().openDataFolder()}>
                <FolderOpen /> Abrir
              </Button>
            </Row>
          </TabsContent>

          <TabsContent value="contas">
            <Accounts />
          </TabsContent>

          <TabsContent value="jogo" className="flex flex-col gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Memória, Java e tamanho da janela são guardados por perfil, porque cada servidor pede uma versão diferente do Java.
            </p>
            {server && profile && (
              <div>
                <Button asChild>
                  <Link to="/perfil?aba=config">
                    Abrir configurações de {profile.name} · {server.name}
                  </Link>
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sobre">
            <SwitchRow k="allowPrerelease" title="Receber versões de teste" description="Atualizações beta chegam antes, com mais risco de bugs." settings={settings} onChange={bump} />
            <About />
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  )
}
