import { Copy, Ellipsis, FileArchive, FolderOpen, PackageOpen, Pin, Plus, Search, Trash2, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader, EmptyState } from '@/components/shared/page'
import { PixelScene } from '@/components/shared/pixel-scene'
import { PlayButton } from '@/components/shared/play-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Instance, Loader, SceneKey } from '@/data/types'
import { cn, formatBytes } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

const filters = [
  { id: 'all', label: 'Todas' },
  { id: 'server', label: 'Servidores' },
  { id: 'modpack', label: 'Modpacks' },
  { id: 'vanilla', label: 'Vanilla' },
] as const

const sorts = [
  { value: 'recent', label: 'Jogadas recentemente' },
  { value: 'name', label: 'Nome' },
  { value: 'size', label: 'Tamanho' },
  { value: 'time', label: 'Tempo de jogo' },
]

function InstanceCard({ inst }: { inst: Instance }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      whileHover={{ y: -3 }}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border-2"
    >
      <Link to={`/instancia/${inst.id}`} className="relative block h-28 overflow-hidden" aria-label={`Abrir ${inst.name}`}>
        <PixelScene scene={inst.scene} cols={64} rows={28} className="transition-transform duration-500 group-hover:scale-105" />
        <span className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
          <Badge className="bg-overlay">{inst.loader}</Badge>
          {inst.update && <Badge tone="warning">atualização</Badge>}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link to={`/instancia/${inst.id}`} className="truncate text-base font-semibold hover:underline">
              {inst.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {inst.source} · {inst.mcVersion}
            </span>
          </div>
          <InstanceMenu inst={inst} />
        </div>
        <div className="flex gap-3 font-mono text-2xs text-muted-2">
          <span>{inst.mods} mods</span>
          <span>{formatBytes(inst.sizeMb)}</span>
          <span>{inst.playtimeH} h</span>
        </div>
        <PlayButton instance={inst} size="md" className="mt-auto w-full" />
      </div>
    </motion.article>
  )
}

function InstanceMenu({ inst }: { inst: Instance }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Mais ações para ${inst.name}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => toast('Pasta aberta no explorador', { description: `.oblyvium/instances/${inst.id}` })}>
          <FolderOpen /> Abrir pasta
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast(`${inst.name} ${inst.pinned ? 'desafixada' : 'fixada'} no menu`)}>
          <Pin /> {inst.pinned ? 'Desafixar do menu' : 'Fixar no menu'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast(`${inst.name} duplicada`)}>
          <Copy /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast('Exportação iniciada', { description: `${inst.id}.mrpack` })}>
          <FileArchive /> Exportar .mrpack
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={() => toast.error(`Excluir ${inst.name}?`, { description: 'Mundos e capturas vão junto.', action: { label: 'Excluir', onClick: () => toast('Simulação: nada foi apagado.') } })}>
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const loaders: Loader[] = ['Vanilla', 'Fabric', 'Quilt', 'Forge', 'NeoForge']
const sceneCycle: SceneKey[] = ['frost', 'grove', 'tide', 'ember', 'dusk', 'arcane']

function NewInstanceDialog() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('custom')
  const [name, setName] = useState('Minha instância')
  const [loader, setLoader] = useState<Loader>('Fabric')
  const [mc, setMc] = useState('1.21.4')
  const [snapshots, setSnapshots] = useState(false)
  const enqueue = useLauncher((s) => s.enqueue)
  const count = useLauncher((s) => s.instances.length)
  const navigate = useNavigate()

  const create = () => {
    const id = `custom-${Date.now()}`
    const scene = sceneCycle[count % sceneCycle.length]
    enqueue({
      id,
      name: `${name} · ${loader} ${mc}`,
      detail: 'Nova instância',
      sizeMb: 380,
      scene,
      onDone: 'install-instance',
      payload: { id, name, loader, mcVersion: mc, source: 'Local', kind: loader === 'Vanilla' ? 'vanilla' : 'modpack', description: 'Instância criada por você.', mods: 0, sizeMb: 380, playtimeH: 0, lastPlayed: 'nunca', scene, memoryGb: 4 },
    })
    setOpen(false)
    navigate('/downloads')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Nova instância
        </Button>
      </DialogTrigger>
      <DialogContent title="Nova instância" description="Comece do zero, de um modpack ou importe de outro launcher." className="max-w-xl">
        <Tabs value={tab} onValueChange={setTab} variant="pill">
          <TabsList className="w-full">
            <TabsTrigger value="custom" className="flex-1 justify-center">Personalizada</TabsTrigger>
            <TabsTrigger value="import" className="flex-1 justify-center">Importar</TabsTrigger>
          </TabsList>
          <TabsContent value="custom" className="flex flex-col gap-4 pt-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Nome
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm">Mod loader</legend>
              <div role="radiogroup" aria-label="Mod loader" className="flex flex-wrap gap-1.5">
                {loaders.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={l === loader}
                    onClick={() => setLoader(l)}
                    className={cn(
                      'h-8 cursor-pointer rounded-sm border px-3 text-sm transition-colors',
                      l === loader ? 'border-primary bg-primary-soft text-foreground' : 'border-border-2 bg-surface-2 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                Versão do Minecraft
                <Select
                  value={mc}
                  onValueChange={setMc}
                  options={[
                    { value: '1.21.4', label: '1.21.4', hint: 'mais recente' },
                    { value: '1.21.1', label: '1.21.1' },
                    { value: '1.20.1', label: '1.20.1', hint: 'mais mods' },
                    { value: '1.12.2', label: '1.12.2' },
                    ...(snapshots ? [{ value: '25w44a', label: '25w44a', hint: 'snapshot' }] : []),
                  ]}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                Versão do loader
                <Select
                  key={loader}
                  options={
                    loader === 'Vanilla'
                      ? [{ value: 'none', label: 'Não se aplica' }]
                      : [
                          { value: 'latest', label: 'Mais recente estável', hint: 'recomendado' },
                          { value: 'pick', label: 'Escolher manualmente' },
                        ]
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={snapshots} onCheckedChange={(v) => setSnapshots(v === true)} /> Mostrar snapshots
            </label>
            <div className="flex justify-between gap-2">
              <Button variant="link" asChild>
                <Link to="/descobrir" onClick={() => setOpen(false)}>
                  <PackageOpen /> Prefere um modpack pronto?
                </Link>
              </Button>
              <Button onClick={create} disabled={!name.trim()}>
                Criar e instalar
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="import" className="flex flex-col gap-3 pt-4">
            <button
              type="button"
              onClick={() => toast('Selecione um arquivo', { description: 'Simulação: o seletor de arquivos abre no Electron.' })}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-primary-line bg-sidebar px-6 py-10 text-center hover:bg-primary-soft/40"
            >
              <Upload className="size-6 text-primary-light" />
              <span className="text-sm font-medium">Arraste um arquivo ou clique para escolher</span>
              <span className="text-xs text-muted-foreground">.mrpack, .zip do CurseForge, pasta do Prism Launcher ou MultiMC</span>
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export function LibraryPage() {
  const instances = useLauncher((s) => s.instances)
  const [filter, setFilter] = useState<string>('all')
  const [sort, setSort] = useState('recent')
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    let list = instances.filter((i) => (filter === 'all' || i.kind === filter) && i.name.toLowerCase().includes(q.toLowerCase()))
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'size') list = [...list].sort((a, b) => b.sizeMb - a.sizeMb)
    if (sort === 'time') list = [...list].sort((a, b) => b.playtimeH - a.playtimeH)
    return list
  }, [instances, filter, sort, q])

  const total = instances.reduce((a, i) => a + i.sizeMb, 0)

  return (
    <Page>
      <PageHeader
        title="Biblioteca"
        description={`${instances.length} instâncias · ${formatBytes(total)} em disco`}
        actions={<NewInstanceDialog />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={setFilter} variant="pill">
          <TabsList aria-label="Filtrar instâncias">
            {filters.map((f) => (
              <TabsTrigger key={f.id} value={f.id}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <label className="relative">
          <span className="sr-only">Buscar instâncias</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-52 pl-8" />
        </label>
        <Select aria-label="Ordenar" value={sort} onValueChange={setSort} options={sorts} className="min-w-48" />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Search />} title="Nenhuma instância encontrada" action={<Button variant="secondary" onClick={() => { setQ(''); setFilter('all') }}>Limpar filtros</Button>}>
          Tente outro filtro ou crie uma nova instância.
        </EmptyState>
      ) : (
        <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          <AnimatePresence mode="popLayout">
            {shown.map((i) => (
              <InstanceCard key={i.id} inst={i} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </Page>
  )
}
