import { ArrowLeft, Copy, FileArchive, FolderOpen, Plus, RefreshCw, Search, Share2, Trash2, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Card, EmptyState } from '@/components/shared/page'
import { PixelScene, scenes } from '@/components/shared/pixel-scene'
import { PlayButton } from '@/components/shared/play-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { contentByType } from '@/data/mock'
import type { ContentItem, SceneKey } from '@/data/types'
import { cn, formatBytes } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

type ContentKind = keyof typeof contentByType
const kinds: { id: ContentKind; label: string }[] = [
  { id: 'mods', label: 'Mods' },
  { id: 'resourcepacks', label: 'Resource packs' },
  { id: 'shaders', label: 'Shaders' },
  { id: 'worlds', label: 'Mundos' },
]

function ContentTable({ kind }: { kind: ContentKind }) {
  const [items, setItems] = useState<ContentItem[]>(contentByType[kind])
  const [q, setQ] = useState('')
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
  const updates = items.filter((i) => i.next).length

  const update = (id?: string) => {
    setItems((list) => list.map((i) => (!id || i.id === id) && i.next ? { ...i, version: i.next, next: undefined } : i))
    toast.success(id ? 'Atualizado' : `${updates} itens atualizados`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Filtrar</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="w-60 pl-8" />
        </label>
        <span className="font-mono text-2xs text-muted-2">
          {items.filter((i) => i.enabled).length} de {items.length} ativos
        </span>
        <div className="flex-1" />
        {updates > 0 && kind !== 'worlds' && (
          <Button variant="secondary" onClick={() => update()} className="border-warning-line text-warning-fg">
            <RefreshCw /> Atualizar tudo ({updates})
          </Button>
        )}
        <Button asChild>
          <Link to="/descobrir">
            <Plus /> {kind === 'worlds' ? 'Importar mundo' : 'Adicionar'}
          </Link>
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 font-mono text-2xs uppercase tracking-wider text-muted-2">
            <tr>
              <th className="w-14 px-3 py-2 text-left font-medium">Ativo</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Versão</th>
              <th className="px-3 py-2 text-left font-medium">Origem</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((m) => (
                <motion.tr
                  key={m.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: 24 }}
                  className={cn('border-t border-border transition-opacity', !m.enabled && 'opacity-60')}
                >
                  <td className="px-3 py-2">
                    <Switch
                      checked={m.enabled}
                      aria-label={`Ativar ${m.name}`}
                      onCheckedChange={(v) => setItems((l) => l.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="size-8 shrink-0 rounded-md" style={{ background: m.color }} aria-hidden />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{m.author}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.version}
                    {m.next && <span className="ml-2 text-warning-fg">→ {m.next}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.source}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {m.next && (
                        <Tooltip content={`Atualizar para ${m.next}`} side="top">
                          <Button variant="ghost" size="icon-sm" aria-label={`Atualizar ${m.name}`} onClick={() => update(m.id)}>
                            <RefreshCw />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip content="Remover" side="top">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover ${m.name}`}
                          className="text-danger-fg"
                          onClick={() => {
                            setItems((l) => l.filter((x) => x.id !== m.id))
                            toast(`${m.name} removido`, { action: { label: 'Desfazer', onClick: () => setItems((l) => [...l, m]) } })
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
      </Card>
    </div>
  )
}

const shots: SceneKey[] = ['arcane', 'ember', 'tide', 'grove', 'dusk', 'frost', 'arcane', 'grove']

function Logs() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Arquivo de log" options={[{ value: 'latest', label: 'latest.log' }, { value: 'debug', label: 'debug.log' }, { value: 'crash', label: 'crash-2026-10-23.txt', hint: 'crash' }]} />
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => toast.success('Log copiado')}>
          <Copy /> Copiar
        </Button>
        <Button variant="soft" onClick={() => toast('Enviado para mclo.gs', { description: 'Link copiado para a área de transferência.' })}>
          <Share2 /> Compartilhar
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-sidebar p-4 font-mono text-xs leading-relaxed text-muted-foreground">
        {'[22:41:07] [main/INFO]: Loading Minecraft with NeoForge 21.1.77\n[22:41:09] [main/INFO]: Found 142 mods\n'}
        <span className="text-warning-fg">{"[22:41:12] [main/WARN]: Mod 'ponder' requires 'flywheel' >= 1.0.1\n"}</span>
        {'[22:41:18] [Render thread/INFO]: Reloading ResourceManager\n'}
        <span className="text-danger-fg">{"[22:41:22] [Render thread/ERROR]: Failed to load shader pack 'BSL_v8.4'\n"}</span>
        {'[22:41:25] [Server thread/INFO]: Done (3.112s)!'}
      </pre>
    </div>
  )
}

function InstanceSettings({ memory }: { memory: number }) {
  const [mem, setMem] = useState(memory)
  const [override, setOverride] = useState(true)
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Usar configurações próprias</h3>
            <p className="text-xs text-muted-foreground">Desligado, segue Configurações › Java e memória.</p>
          </div>
          <Switch checked={override} onCheckedChange={setOverride} aria-label="Usar configurações próprias" />
        </div>
        <fieldset disabled={!override} className="flex flex-col gap-4 disabled:opacity-50">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span>Memória máxima</span>
              <span className="font-mono text-primary-fg">{mem} GB</span>
            </div>
            <Slider value={[mem]} min={2} max={24} step={1} onValueChange={([v]) => setMem(v)} aria-label="Memória máxima" />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Java
            <Select options={[{ value: 'auto', label: 'Automático (Java 21)' }, { value: '17', label: 'Java 17' }, { value: 'custom', label: 'Caminho personalizado…' }]} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Argumentos da JVM
            <Input defaultValue="-XX:+UseZGC -XX:+ZGenerational" className="font-mono text-xs" />
          </label>
        </fieldset>
      </Card>
      <Card className="flex flex-col gap-4 p-4">
        <h3 className="text-sm font-semibold">Instância</h3>
        <label className="flex items-center justify-between gap-3 text-sm">
          Atualizar modpack automaticamente <Switch defaultChecked />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Entrar direto no servidor ao abrir <Switch />
        </label>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast('Duplicando instância…')}>
            <Copy /> Duplicar
          </Button>
          <Button variant="secondary" onClick={() => toast.success('Arquivos verificados', { description: '3 arquivos baixados de novo.' })}>
            <Wrench /> Reparar arquivos
          </Button>
          <Button variant="destructive" onClick={() => toast.error('Excluir instância?', { description: 'Mundos e capturas vão junto.', action: { label: 'Excluir', onClick: () => toast('Simulação: nada foi apagado.') } })}>
            <Trash2 /> Excluir
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function InstancePage() {
  const { id } = useParams()
  const inst = useLauncher((s) => s.instances.find((i) => i.id === id))
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') ?? 'conteudo'
  const [kind, setKind] = useState<ContentKind>('mods')
  const glow = useMemo(() => (inst ? scenes[inst.scene].glow : ''), [inst])

  if (!inst) return <Navigate to="/biblioteca" replace />

  return (
    <div className="flex flex-col">
      <div className="relative h-40 overflow-hidden">
        <PixelScene scene={inst.scene} twinkle />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_5%,transparent)]" aria-hidden />
        <Button variant="secondary" size="sm" asChild className="absolute left-6 top-4 bg-overlay">
          <Link to="/biblioteca">
            <ArrowLeft /> Biblioteca
          </Link>
        </Button>
      </div>
      <div className="mx-auto -mt-14 flex w-full max-w-[1400px] flex-col gap-5 px-6 pb-6">
        <header className="relative flex flex-wrap items-end gap-4">
          <span className="size-24 overflow-hidden rounded-lg border-2" style={{ borderColor: glow }}>
            <PixelScene scene={inst.scene} cols={24} rows={24} stars={false} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-2xl font-bold">{inst.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{inst.loader === 'Vanilla' ? 'Vanilla' : `${inst.loader} ${inst.loaderVersion}`}</Badge>
              <Badge>Minecraft {inst.mcVersion}</Badge>
              <Badge>Java 21 (auto)</Badge>
              {inst.update && <Badge tone="warning">{inst.update.from} → {inst.update.to}</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">
              {inst.playtimeH} h jogadas · última vez {inst.lastPlayed} · {formatBytes(inst.sizeMb)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tooltip content="Abrir pasta" side="top">
              <Button variant="secondary" size="icon" className="size-12" aria-label="Abrir pasta" onClick={() => toast('Pasta aberta no explorador')}>
                <FolderOpen />
              </Button>
            </Tooltip>
            <Tooltip content="Exportar .mrpack" side="top">
              <Button variant="secondary" size="icon" className="size-12" aria-label="Exportar .mrpack" onClick={() => toast('Exportação iniciada')}>
                <FileArchive />
              </Button>
            </Tooltip>
            <PlayButton instance={inst} />
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
          <TabsList aria-label="Seções da instância">
            <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
            <TabsTrigger value="capturas">Capturas</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
          <TabsContent value="conteudo" className="flex flex-col gap-3 pt-4">
            <Tabs value={kind} onValueChange={(v) => setKind(v as ContentKind)} variant="pill">
              <TabsList aria-label="Tipo de conteúdo">
                {kinds.map((k) => (
                  <TabsTrigger key={k.id} value={k.id}>
                    {k.label}
                    <span className="font-mono text-2xs opacity-70">{k.id === 'mods' ? inst.mods : contentByType[k.id].length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {inst.kind === 'vanilla' && kind === 'mods' ? (
              <EmptyState icon={<Plus />} title="Instância vanilla" action={<Button asChild><Link to="/descobrir">Procurar mods</Link></Button>}>
                Escolha um loader (Fabric, NeoForge…) nas configurações da instância para poder instalar mods.
              </EmptyState>
            ) : (
              <ContentTable key={kind} kind={kind} />
            )}
          </TabsContent>
          <TabsContent value="capturas" className="pt-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {shots.map((s, i) => (
                <motion.figure key={i} whileHover={{ scale: 1.02 }} className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="h-28">
                    <PixelScene scene={s} cols={64} rows={36} />
                  </div>
                  <figcaption className="px-2.5 py-1.5 font-mono text-2xs text-muted-2">2026-10-{10 + i}_22.14.0{i}.png</figcaption>
                </motion.figure>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="logs" className="pt-4">
            <Logs />
          </TabsContent>
          <TabsContent value="config" className="pt-4">
            <InstanceSettings memory={inst.memoryGb} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
