import { Check, Download, Loader2, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EmptyState, Page, PageHeader } from '@/components/shared/page'
import { PixelScene } from '@/components/shared/pixel-scene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { discover, discoverCategories } from '@/data/mock'
import type { DiscoverItem, Loader } from '@/data/types'
import { installModpack, useInstallState } from '@/lib/install'
import { cn } from '@/lib/utils'

const types = ['Modpacks', 'Mods', 'Resource packs', 'Shaders', 'Data packs']
const loaderOpts: Loader[] = ['Fabric', 'NeoForge', 'Forge', 'Quilt']

function InstallButton({ item }: { item: DiscoverItem }) {
  const { state, progress } = useInstallState(item.id)
  const navigate = useNavigate()
  if (state === 'installed')
    return (
      <Button variant="secondary" onClick={() => navigate(`/instancia/mp-${item.id}`)}>
        <Check className="text-success-fg" /> Instalado
      </Button>
    )
  if (state === 'installing')
    return (
      <Button variant="soft" onClick={() => navigate('/downloads')}>
        <Loader2 className="animate-spin" /> {Math.round(progress)}%
      </Button>
    )
  return (
    <Button onClick={() => installModpack(item)}>
      <Download /> Instalar
    </Button>
  )
}

export function DiscoverPage() {
  const [type, setType] = useState('Modpacks')
  const [q, setQ] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [loaders, setLoaders] = useState<Loader[]>([])
  const [source, setSource] = useState('all')

  const results = useMemo(
    () =>
      discover.filter(
        (d) =>
          (q === '' || `${d.name} ${d.description}`.toLowerCase().includes(q.toLowerCase())) &&
          (cats.length === 0 || cats.some((c) => d.categories.includes(c))) &&
          (loaders.length === 0 || loaders.includes(d.loader)) &&
          (source === 'all' || d.source === source),
      ),
    [q, cats, loaders, source],
  )

  return (
    <Page>
      <PageHeader
        title="Descobrir"
        description="Modrinth e CurseForge em um só lugar."
        actions={
          <Tabs value={type} onValueChange={setType} variant="pill">
            <TabsList aria-label="Tipo de conteúdo">
              {types.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${type.toLowerCase()}…`} className="h-10 pl-9 text-base" />
        </label>
        <Select aria-label="Fonte" value={source} onValueChange={setSource} className="h-10" options={[{ value: 'all', label: 'Todas as fontes' }, { value: 'Modrinth', label: 'Modrinth' }, { value: 'CurseForge', label: 'CurseForge' }]} />
        <Select aria-label="Ordenar" className="h-10" options={[{ value: 'rel', label: 'Relevância' }, { value: 'dl', label: 'Downloads' }, { value: 'upd', label: 'Atualizados' }, { value: 'new', label: 'Novos' }]} />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <aside aria-label="Filtros" className="flex w-52 shrink-0 flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-2">Versão</legend>
            <Select aria-label="Versão do Minecraft" options={[{ value: 'all', label: 'Todas' }, { value: '1.21.4', label: '1.21.4' }, { value: '1.21.1', label: '1.21.1' }, { value: '1.20.1', label: '1.20.1' }]} className="w-full" />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-2">Loader</legend>
            {loaderOpts.map((l) => (
              <label key={l} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={loaders.includes(l)} onCheckedChange={(v) => setLoaders((s) => (v ? [...s, l] : s.filter((x) => x !== l)))} />
                {l}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-2">Categorias</legend>
            <div className="flex flex-wrap gap-1.5">
              {discoverCategories.map((c) => {
                const on = cats.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCats((s) => (on ? s.filter((x) => x !== c) : [...s, c]))}
                    className={cn(
                      'h-7 cursor-pointer rounded-sm border px-2 text-xs transition-colors',
                      on ? 'border-primary bg-primary-soft text-foreground' : 'border-border-2 bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </span>
          {results.length === 0 ? (
            <EmptyState icon={<Search />} title="Nada encontrado" action={<Button variant="secondary" onClick={() => { setQ(''); setCats([]); setLoaders([]); setSource('all') }}>Limpar filtros</Button>}>
              Tente outra busca ou menos filtros.
            </EmptyState>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {results.map((r, i) => (
                <motion.article
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border-2"
                >
                  <Link to={`/descobrir/${r.id}`} className="size-16 shrink-0 overflow-hidden rounded-md" aria-label={`Ver ${r.name}`}>
                    <PixelScene scene={r.scene} cols={24} rows={24} stars={false} />
                  </Link>
                  <div className="flex min-w-60 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link to={`/descobrir/${r.id}`} className="text-base font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">por {r.author}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{r.loader}</Badge>
                      <Badge>{r.mcVersion}</Badge>
                      <Badge tone={r.source === 'Modrinth' ? 'success' : 'ember'}>{r.source}</Badge>
                      {r.categories.map((c) => (
                        <Badge key={c} tone="primary">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-mono text-2xs text-muted-2">
                      {r.downloads} downloads · {r.updated}
                    </span>
                    <InstallButton item={r} />
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </Page>
  )
}
