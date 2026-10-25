import { Bug, ExternalLink, FolderOpen, LogOut, RefreshCw, UserPlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { backend, type LauncherSettings } from '@/backend'
import { logoutAccount } from '@/components/layout/account-switcher'
import { Avatar } from '@/components/shared/avatar'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { Card } from '@/components/shared/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LANGS, locale, t, type Lang } from '@/i18n'
import { useLang } from '@/i18n/store'
import { useAsync } from '@/lib/use-async'
import { formatDate } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

// Rótulos em português; traduzidos na hora de mostrar.
const sections = [
  { id: 'geral', label: 'Geral' },
  { id: 'jogo', label: 'Jogo' },
  { id: 'contas', label: 'Contas' },
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

type BoolKey = 'discordPresence' | 'allowPrerelease' | 'autoConnect'

// Rótulos em português; traduzidos na hora de mostrar.
const onPlayOptions: { value: LauncherSettings['launcherOnPlay']; label: string; hint: string }[] = [
  { value: 'tray', label: 'Esconder na bandeja', hint: 'A janela some e fica um ícone perto do relógio. Volta quando o jogo fechar.' },
  { value: 'minimize', label: 'Minimizar', hint: 'A janela vai para a barra de tarefas. Volta quando o jogo fechar.' },
  { value: 'keep', label: 'Deixar aberto', hint: 'O launcher continua na tela, com o console à mão.' },
]

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

/** Memória e janela do jogo: valem para todos os servidores e perfis. */
function GameSettingsSection() {
  const [rev, setRev] = useState(0)
  void rev // muda a cada troca para reler do backend
  const g = backend().gameSettings()
  const [ram, setRam] = useState(g.maxRamGB)
  const [w, setW] = useState(String(g.width))
  const [h, setH] = useState(String(g.height))
  const set = (key: 'maxRamGB' | 'width' | 'height' | 'fullscreen', value: number | boolean) => {
    backend().setGameSetting(key, value)
    setRev((r) => r + 1)
  }
  const fmt = (n: number) => n.toLocaleString(locale())
  const tone = ram < g.ramRecommendedGB ? 'text-warning-fg' : ram > 16 ? 'text-warning-fg' : 'text-success-fg'
  const hint = ram < g.ramRecommendedGB ? t('Abaixo do recomendado: o jogo pode travar em áreas cheias.') : ram > 16 ? t('Acima de 16 GB o coletor de lixo costuma piorar o desempenho.') : t('Bom para este PC.')

  return (
    <div className="flex flex-col">
      <p className="border-b border-border py-3.5 text-sm text-muted-foreground">{t('Estas opções valem para todos os servidores. O Java fica por servidor, em Gerenciar → Configurações.')}</p>
      <div className="flex flex-col gap-3 border-b border-border py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{t('Memória máxima')}</span>
          <motion.span key={ram} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-mono text-base text-primary-fg">
            {fmt(ram)} GB
          </motion.span>
        </div>
        <Slider value={[ram]} min={g.ramMinGB} max={g.ramMaxGB} step={0.5} onValueChange={([v]) => setRam(v)} onValueCommit={([v]) => set('maxRamGB', v)} aria-label={t('Memória máxima')} />
        <div className="flex h-2.5 overflow-hidden rounded-full bg-accent" aria-hidden>
          <motion.div className="bg-primary" animate={{ width: `${(ram / Math.max(1, g.systemRamGB)) * 100}%` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className={tone}>{hint}</span>
          <span className="font-mono">{t('mín. {min} GB · recomendado {rec} GB · PC {pc} GB', { min: fmt(g.ramMinGB), rec: fmt(g.ramRecommendedGB), pc: g.systemRamGB })}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 py-4">
        <span className="text-sm font-medium">{t('Janela do jogo')}</span>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('Largura')}
            <Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} onBlur={() => set('width', Number(w))} className="w-24 font-mono" disabled={g.fullscreen} />
          </label>
          <span className="pb-2 text-muted-2">×</span>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('Altura')}
            <Input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} onBlur={() => set('height', Number(h))} className="w-24 font-mono" disabled={g.fullscreen} />
          </label>
          <label className="ml-auto flex items-center gap-2 pb-1.5 text-sm">
            {t('Abrir o jogo em tela cheia')} <Switch checked={g.fullscreen} onCheckedChange={(v) => set('fullscreen', v)} />
          </label>
        </div>
      </div>
    </div>
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
            <span className="text-2xs text-muted-foreground">{a.kind === 'microsoft' ? 'Microsoft' : a.kind === 'offline' ? t('Offline') : 'Mojang'}</span>
          </span>
          {a.id === accountId ? (
            <Badge tone="success">{t('em uso')}</Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => select(a.id)}>
              {t('Usar')}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-danger-fg" onClick={() => logoutAccount(a.id)}>
            <LogOut /> {t('Sair')}
          </Button>
        </div>
      ))}
      <div className="pt-2">
        <Button asChild>
          <Link to="/boas-vindas?adicionar=1">
            <UserPlus /> {t('Adicionar conta')}
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
            {b.isDev ? ` · ${t('desenvolvimento')}` : ''} · {t('fork do Helios Launcher')}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-3">
        <span className="min-w-48 flex-1 text-sm">
          {update.state === 'available' && t('Baixando a versão {v}… {p}%', { v: update.version, p: update.percent })}
          {update.state === 'ready' && t('A versão {v} está pronta para instalar.', { v: update.version })}
          {update.state === 'none' && t('Você está na versão mais recente.')}
          {update.state === 'checking' && t('Verificando atualizações…')}
          {update.state === 'error' && t(update.message)}
          {update.state === 'idle' && (b.isDev ? t('Atualizações automáticas ficam desligadas no modo de desenvolvimento.') : t('O launcher verifica atualizações sozinho a cada 30 minutos.'))}
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
            {t('Reiniciar e instalar')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => b.checkForUpdate()} disabled={checking || b.isDev || update.state === 'available'}>
            <RefreshCw className={checking ? 'animate-spin' : undefined} /> {t('Verificar agora')}
          </Button>
        )}
      </div>
      {notes.data && (
        <section aria-labelledby="novidades" className="flex flex-col gap-2">
          <h2 id="novidades" className="text-sm font-semibold">
            {t('Novidades da {v}', { v: notes.data.version })} {notes.data.title && <span className="font-normal text-muted-foreground">· {notes.data.title}</span>}
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
          <ExternalLink /> {t('Código-fonte')}
        </Button>
        <Button variant="secondary" onClick={() => b.openExternal(`${REPO}/issues`)}>
          <Bug /> {t('Reportar problema')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('Não é um produto oficial do Minecraft. Não aprovado nem associado à Mojang ou à Microsoft.')}</p>
    </div>
  )
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') ?? 'geral'
  const [rev, setRev] = useState(0)
  const lang = useLang((s) => s.lang)
  const changeLang = useLang((s) => s.change)
  void rev
  const settings = backend().launcherSettings()
  const bump = () => setRev((r) => r + 1)

  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-6 py-5">
      <h1 className="font-display text-2xl font-bold">{t('Configurações')}</h1>
      <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })} variant="side" orientation="vertical" className="flex flex-wrap items-start gap-6">
        <TabsList aria-label={t('Seções')} className="w-52 shrink-0">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {t(s.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <Card className="min-w-0 flex-1 px-5 py-1">
          <TabsContent value="geral">
            <Row title={t('Idioma')} description={t('O launcher reinicia a tela ao trocar.')}>
              <Select aria-label={t('Idioma')} value={lang} onValueChange={(v) => changeLang(v as Lang)} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
            </Row>
            <Row title={t('Quando o jogo abrir')} description={t(onPlayOptions.find((o) => o.value === settings.launcherOnPlay)!.hint)}>
              <Select
                aria-label={t('Quando o jogo abrir')}
                value={settings.launcherOnPlay}
                onValueChange={(v) => {
                  backend().setLauncherSetting('launcherOnPlay', v as LauncherSettings['launcherOnPlay'])
                  bump()
                }}
                options={onPlayOptions.map((o) => ({ value: o.value, label: t(o.label) }))}
              />
            </Row>
            <SwitchRow k="autoConnect" title={t('Entrar direto no servidor')} description={t('Ao abrir o jogo, conecta no endereço do servidor selecionado.')} settings={settings} onChange={bump} />
            <SwitchRow k="discordPresence" title={t('Discord Rich Presence')} description={t('Mostra no Discord o servidor em que você está jogando.')} settings={settings} onChange={bump} />
            <Row title={t('Pasta de dados')} description={<span className="break-all font-mono">{settings.dataDirectory}</span>}>
              <Button variant="secondary" onClick={() => backend().openDataFolder()}>
                <FolderOpen /> {t('Abrir')}
              </Button>
            </Row>
          </TabsContent>

          <TabsContent value="jogo">
            <GameSettingsSection />
          </TabsContent>

          <TabsContent value="contas">
            <Accounts />
          </TabsContent>

          <TabsContent value="sobre">
            <SwitchRow k="allowPrerelease" title={t('Receber versões de teste')} description={t('Atualizações beta chegam antes, com mais risco de bugs.')} settings={settings} onChange={bump} />
            <About />
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  )
}
