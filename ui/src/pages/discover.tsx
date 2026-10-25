import { Check, ChevronLeft, ChevronRight, Download, Loader2, Package, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { backend, type ContentType, type SearchHit } from '@/backend'
import { EmptyState, Page, PageHeader } from '@/components/shared/page'
import { ProfileIcon } from '@/components/shared/profile-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { installProject, useInstallState } from '@/lib/install'
import { useAsync } from '@/lib/use-async'
import { cn, formatCount, formatDate } from '@/lib/utils'
import { useLauncher, useProfile, useServer } from '@/store/launcher'

const types: { id: ContentType; label: string }[] = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Resource packs' },
  { id: 'shader', label: 'Shaders' },
]

const sorts = [
  { value: 'relevance', label: 'Relevância' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'updated', label: 'Atualizados' },
  { value: 'newest', label: 'Novos' },
]

export function ProjectIcon({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={cn('shrink-0 rounded-md bg-surface-2 object-cover', className)} />
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-md bg-surface-2 text-muted-2', className)} aria-hidden>
      <Package className="size-1/2" />
    </span>
  )
}

export function InstallButton({ id, title, installed, size }: { id: string; title: string; installed: boolean; size?: 'sm' }) {
  const state = useInstallState(id, installed)
  if (state === 'installed')
    return (
      <Button variant="secondary" size={size} asChild>
        <Link to="/perfil?aba=conteudo">
          <Check className="text-success-fg" /> Instalado
        </Link>
      </Button>
    )
  if (state === 'installing')
    return (
      <Button variant="soft" size={size} disabled>
        <Loader2 className="animate-spin" /> Instalando
      </Button>
    )
  return (
    <Button size={size} onClick={() => installProject(id, title)}>
      <Download /> Instalar
    </Button>
  )
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

export function DiscoverPage() {
  const server = useServer()
  const profile = useProfile()
  const rev = useLauncher((s) => s.contentRev)
  const [params, setParams] = useSearchParams()
  const type = ((params.get('tipo') as ContentType) || 'mod') as ContentType
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('relevance')
  const [cats, setCats] = useState<string[]>([])
  const [offset, setOffset] = useState(0)
  const query = useDebounced(q, 350)
  const loaderless = server?.loader === 'Vanilla'

  useEffect(() => {
    setOffset(0)
  }, [type, query, sort, cats])

  const categories = useAsync(() => backend().categories(type), [type])
  const results = useAsync(
    () => (type === 'mod' && loaderless ? Promise.resolve({ hits: [] as SearchHit[], total: 0, pageSize: 20 }) : backend().search({ query, type, categories: cats, sort, offset })),
    [type, query, sort, cats.join(','), offset, server?.id, profile?.id, rev],
  )
  const data = results.data
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0
  const page = data ? Math.floor(offset / data.pageSize) + 1 : 1

  return (
    <Page>
      <PageHeader
        title="Descobrir"
        description={
          server && profile ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Do Modrinth, só o que é compatível com {server.name} ({server.loader === 'Vanilla' ? 'Vanilla' : server.loader} {server.mcVersion}). Instala no perfil
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <ProfileIcon name={profile.icon} className="size-3.5 text-primary-light" />
                {profile.name}
              </span>
            </span>
          ) : undefined
        }
        actions={
          <Tabs
            value={type}
            onValueChange={(v) => {
              setCats([])
              setParams({ tipo: v }, { replace: true })
            }}
            variant="pill"
          >
            <TabsList aria-label="Tipo de conteúdo">
              {types.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${types.find((t) => t.id === type)!.label.toLowerCase()}…`} className="h-10 pl-9 text-base" />
        </label>
        <Select aria-label="Ordenar" value={sort} onValueChange={setSort} className="h-10" options={sorts} />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <aside aria-label="Filtros" className="flex w-52 shrink-0 flex-col gap-5">
          <fieldset>
            <legend className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-2">Categorias</legend>
            <div className="flex flex-wrap gap-1.5">
              {(categories.data ?? []).map((c) => {
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
              {categories.loading && <span className="text-xs text-muted-2">Carregando…</span>}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">Projetos que a staff bloqueou e mods que já vêm com o servidor não aparecem aqui.</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {results.loading ? 'Buscando…' : data ? `${data.total.toLocaleString('pt-BR')} ${data.total === 1 ? 'resultado' : 'resultados'}` : ''}
          </span>
          {type === 'mod' && loaderless ? (
            <EmptyState icon={<Package />} title="Servidor sem mods">
              {server?.name} roda Minecraft sem loader. Procure resource packs ou shaders.
            </EmptyState>
          ) : results.error ? (
            <EmptyState icon={<Search />} title="Busca indisponível" action={<Button variant="secondary" onClick={results.reload}>Tentar de novo</Button>}>
              Não foi possível falar com o Modrinth. Verifique a conexão.
            </EmptyState>
          ) : !results.loading && data && data.hits.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="Nada encontrado"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('')
                    setCats([])
                  }}
                >
                  Limpar filtros
                </Button>
              }
            >
              Tente outra busca ou menos filtros.
            </EmptyState>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {(data?.hits ?? []).map((r, i) => (
                <motion.article
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: results.loading ? 0.5 : 1, y: 0, transition: { delay: i * 0.02 } }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border-2"
                >
                  <Link to={`/descobrir/${r.id}`} aria-label={`Ver ${r.title}`}>
                    <ProjectIcon url={r.iconUrl} className="size-16" />
                  </Link>
                  <div className="flex min-w-60 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link to={`/descobrir/${r.id}`} className="text-base font-semibold hover:underline">
                        {r.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">por {r.author}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.categories.slice(0, 4).map((c) => (
                        <Badge key={c} tone="primary">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-mono text-2xs text-muted-2">
                      {formatCount(r.downloads)} downloads{r.updated ? ` · ${formatDate(r.updated)}` : ''}
                    </span>
                    <InstallButton id={r.id} title={r.title} installed={r.installed} />
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          )}
          {results.loading && !data && [0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-card" />)}
          {pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-2 pt-2">
              <Button variant="secondary" size="icon" aria-label="Página anterior" disabled={offset === 0 || results.loading} onClick={() => setOffset((o) => Math.max(0, o - data!.pageSize))}>
                <ChevronLeft />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {page} de {pages.toLocaleString('pt-BR')}
              </span>
              <Button variant="secondary" size="icon" aria-label="Próxima página" disabled={page >= pages || results.loading} onClick={() => setOffset((o) => o + data!.pageSize)}>
                <ChevronRight />
              </Button>
            </nav>
          )}
        </div>
      </div>
    </Page>
  )
}
