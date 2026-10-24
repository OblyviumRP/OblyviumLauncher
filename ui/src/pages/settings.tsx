import { Bug, ExternalLink, FolderOpen, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Card } from '@/components/shared/page'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { javaRuntimes, systemMemoryGb } from '@/data/mock'
import { useLauncher } from '@/store/launcher'

const sections = [
  { id: 'geral', label: 'Geral' },
  { id: 'java', label: 'Java e memória' },
  { id: 'jogo', label: 'Jogo' },
  { id: 'aparencia', label: 'Aparência' },
  { id: 'rede', label: 'Downloads e rede' },
  { id: 'avancado', label: 'Avançado' },
  { id: 'atualizacoes', label: 'Atualizações' },
  { id: 'sobre', label: 'Sobre' },
]

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

function useSetting<K extends keyof ReturnType<typeof useLauncher.getState>['settings']>(key: K) {
  const value = useLauncher((s) => s.settings[key])
  const set = useLauncher((s) => s.setSetting)
  return [value, (v: typeof value) => set(key, v)] as const
}

function SwitchRow({ k, title, description }: { k: 'discordRpc' | 'notifications' | 'startup' | 'autoJava' | 'fullscreen' | 'autoConnect' | 'openConsole' | 'reduceMotion' | 'verifyHashes' | 'devMode'; title: string; description?: string }) {
  const [v, set] = useSetting(k)
  const id = `s-${k}`
  return (
    <Row title={title} description={description} htmlFor={id}>
      <Switch id={id} checked={v} onCheckedChange={set} />
    </Row>
  )
}

function MemorySection() {
  const [mem, setMem] = useSetting('memoryGb')
  const used = 8
  const warn = mem > 16 ? 'Acima de 16 GB o coletor de lixo costuma piorar o desempenho.' : mem < 4 ? 'Pouco para modpacks grandes.' : 'Bom para este PC.'
  const tone = mem > 16 || mem < 4 ? 'text-warning-fg' : 'text-success-fg'
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Memória máxima (padrão das instâncias)</span>
        <motion.span key={mem} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-mono text-base text-primary-fg">
          {mem} GB
        </motion.span>
      </div>
      <Slider value={[mem]} min={2} max={systemMemoryGb - used} step={1} onValueChange={([v]) => setMem(v)} aria-label="Memória máxima" />
      <div className="flex h-2.5 overflow-hidden rounded-full bg-accent" aria-hidden>
        <div className="bg-input" style={{ width: `${(used / systemMemoryGb) * 100}%` }} />
        <motion.div className="bg-primary" animate={{ width: `${(mem / systemMemoryGb) * 100}%` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-input" />Sistema {used} GB</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />Minecraft {mem} GB</span>
        <span>Total {systemMemoryGb} GB</span>
        <span className={tone}>{warn}</span>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('secao') ?? 'geral'
  const [afterLaunch, setAfterLaunch] = useSetting('afterLaunch')
  const [javaArgs, setJavaArgs] = useSetting('javaArgs')
  const [width, setWidth] = useSetting('width')
  const [height, setHeight] = useSetting('height')
  const [parallel, setParallel] = useSetting('parallelDownloads')
  const [source, setSource] = useSetting('preferredSource')
  const [channel, setChannel] = useSetting('channel')
  const [checking, setChecking] = useState(false)

  const check = () => {
    setChecking(true)
    setTimeout(() => {
      setChecking(false)
      toast.success('Você está na versão mais recente', { description: 'v3.0.0' })
    }, 1200)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-6 py-5">
      <h1 className="font-display text-2xl font-bold">Configurações</h1>
      <Tabs value={tab} onValueChange={(v) => setParams({ secao: v }, { replace: true })} variant="side" orientation="vertical" className="flex flex-wrap items-start gap-6">
        <TabsList aria-label="Seções" className="w-52 shrink-0">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Card className="min-w-0 flex-1 px-5 py-1">
          <TabsContent value="geral">
            <Row title="Idioma">
              <Select aria-label="Idioma" options={[{ value: 'pt', label: 'Português (Brasil)' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
            </Row>
            <Row title="Quando o jogo abrir" description="O que fazer com a janela do launcher.">
              <Select aria-label="Quando o jogo abrir" value={afterLaunch} onValueChange={(v) => setAfterLaunch(v as typeof afterLaunch)} options={[{ value: 'minimize', label: 'Minimizar' }, { value: 'close', label: 'Fechar' }, { value: 'keep', label: 'Manter aberto' }, { value: 'tray', label: 'Ocultar na bandeja' }]} />
            </Row>
            <SwitchRow k="startup" title="Iniciar com o sistema" description="Abre minimizado na bandeja." />
            <SwitchRow k="discordRpc" title="Discord Rich Presence" description="Mostra no Discord a instância e o servidor em que você está." />
            <SwitchRow k="notifications" title="Notificações" description="Avisos de download concluído, atualizações e erros." />
            <Row title="Pasta de dados" description={<span className="font-mono">%APPDATA%\.OblyviumLauncher</span>}>
              <Button variant="secondary" onClick={() => toast('Escolha uma pasta')}>
                <FolderOpen /> Alterar…
              </Button>
            </Row>
          </TabsContent>

          <TabsContent value="java">
            <MemorySection />
            <SwitchRow k="autoJava" title="Gerenciar Java automaticamente" description="Baixa a versão certa para cada versão do Minecraft." />
            <div className="flex flex-col gap-2 border-b border-border py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Runtimes Java</span>
                <Button variant="secondary" size="sm" onClick={() => toast('Escolha o executável java')}>
                  Adicionar caminho…
                </Button>
              </div>
              {javaRuntimes.map((j) => (
                <div key={j.version} className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm">
                  <span className="w-16 font-semibold">{j.version}</span>
                  <span className="min-w-48 flex-1 truncate font-mono text-xs text-muted-foreground">{j.path}</span>
                  <span className="text-xs text-muted-foreground">{j.use}</span>
                  <Badge tone={j.managed ? 'primary' : 'neutral'}>{j.managed ? 'gerenciado' : 'do sistema'}</Badge>
                </div>
              ))}
            </div>
            <Row title="Argumentos da JVM" htmlFor="jvm">
              <Input id="jvm" value={javaArgs} onChange={(e) => setJavaArgs(e.target.value)} className="w-80 font-mono text-xs" />
            </Row>
          </TabsContent>

          <TabsContent value="jogo">
            <Row title="Resolução da janela" description="Tamanho inicial do jogo.">
              <div className="flex items-center gap-2">
                <Input type="number" aria-label="Largura" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-24 font-mono" />
                <span className="text-muted-foreground">×</span>
                <Input type="number" aria-label="Altura" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-24 font-mono" />
              </div>
            </Row>
            <SwitchRow k="fullscreen" title="Tela cheia" description="Ignora a resolução acima." />
            <SwitchRow k="autoConnect" title="Conectar automaticamente ao servidor" description="Entra direto no servidor da instância ao abrir o jogo." />
            <SwitchRow k="openConsole" title="Abrir console ao iniciar" description="Mostra os logs em tempo real enquanto joga." />
          </TabsContent>

          <TabsContent value="aparencia">
            <SwitchRow k="reduceMotion" title="Reduzir animações" description="Desliga transições e animações decorativas. Também segue a preferência do sistema." />
            <Row title="Plano de fundo do Início" description="Cenário da instância selecionada.">
              <Select aria-label="Plano de fundo" options={[{ value: 'scene', label: 'Cenário da instância' }, { value: 'solid', label: 'Cor sólida' }, { value: 'custom', label: 'Imagem personalizada…' }]} />
            </Row>
            <Row title="Escala da interface">
              <Select aria-label="Escala da interface" defaultValue="100" options={[{ value: '90', label: '90%' }, { value: '100', label: '100%' }, { value: '110', label: '110%' }, { value: '125', label: '125%' }]} />
            </Row>
          </TabsContent>

          <TabsContent value="rede">
            <Row title="Downloads simultâneos" description="Mais conexões baixam mais rápido e usam mais banda.">
              <Select aria-label="Downloads simultâneos" value={parallel} onValueChange={setParallel} options={['4', '8', '16', '32'].map((v) => ({ value: v, label: v }))} />
            </Row>
            <Row title="Fonte preferida" description="Usada quando um mod existe nas duas plataformas.">
              <Select aria-label="Fonte preferida" value={source} onValueChange={(v) => setSource(v as typeof source)} options={[{ value: 'Modrinth', label: 'Modrinth' }, { value: 'CurseForge', label: 'CurseForge' }]} />
            </Row>
            <SwitchRow k="verifyHashes" title="Verificar arquivos antes de jogar" description="Baixa de novo o que estiver corrompido." />
            <Row title="Proxy">
              <Select aria-label="Proxy" options={[{ value: 'system', label: 'Do sistema' }, { value: 'none', label: 'Nenhum' }, { value: 'manual', label: 'Manual…' }]} />
            </Row>
          </TabsContent>

          <TabsContent value="avancado">
            <Row title="Cache" description="Ícones, metadados e downloads temporários · 1,2 GB">
              <Button variant="secondary" onClick={() => toast.success('Cache limpo', { description: '1,2 GB liberados' })}>
                <Trash2 /> Limpar cache
              </Button>
            </Row>
            <Row title="Comando antes de iniciar" description="Ex.: prime-run ou gamemoderun." htmlFor="wrapper">
              <Input id="wrapper" placeholder="vazio" className="w-60 font-mono text-xs" />
            </Row>
            <SwitchRow k="devMode" title="Modo desenvolvedor" description="DevTools e logs detalhados do launcher." />
            <div className="flex flex-wrap gap-2 py-4">
              <Button variant="secondary" onClick={() => toast('Logs exportados')}>
                <Bug /> Exportar logs do launcher
              </Button>
              <Button variant="destructive" onClick={() => toast.error('Restaurar padrões?', { action: { label: 'Restaurar', onClick: () => toast('Simulação: nada foi alterado.') } })}>
                <RotateCcw /> Restaurar padrões
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="atualizacoes">
            <Row title="Versão instalada" description={<span className="font-mono text-success-fg">v3.0.0 · nova interface</span>}>
              <Button variant="secondary" onClick={check} disabled={checking}>
                <RefreshCw className={checking ? 'animate-spin' : undefined} /> {checking ? 'Verificando…' : 'Verificar agora'}
              </Button>
            </Row>
            <Row title="Canal" description="Beta recebe novidades antes, com mais risco.">
              <Select aria-label="Canal" value={channel} onValueChange={(v) => setChannel(v as typeof channel)} options={[{ value: 'stable', label: 'Estável' }, { value: 'beta', label: 'Beta' }]} />
            </Row>
          </TabsContent>

          <TabsContent value="sobre" className="flex flex-col gap-4 py-5">
            <div className="flex items-center gap-4">
              <OblyviumMark className="size-14 text-primary-light" />
              <div className="flex flex-col gap-1">
                <span className="font-display text-xl font-bold">Oblyvium Launcher</span>
                <span className="font-mono text-xs text-muted-foreground">v3.0.0 · Electron · fork do Helios Launcher</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary"><ExternalLink /> Código-fonte</Button>
              <Button variant="secondary"><ExternalLink /> Licenças de terceiros</Button>
              <Button variant="secondary"><Bug /> Reportar problema</Button>
            </div>
            <p className="text-xs text-muted-foreground">Não é um produto oficial do Minecraft. Não aprovado nem associado à Mojang ou à Microsoft.</p>
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  )
}
