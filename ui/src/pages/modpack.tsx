import { ArrowLeft, Check, Heart, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Card } from '@/components/shared/page'
import { PixelScene } from '@/components/shared/pixel-scene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { contentByType, discover } from '@/data/mock'
import { installModpack, useInstallState } from '@/lib/install'
import { formatBytes } from '@/lib/utils'

const versions = [
  { v: 'v1.9', channel: 'Estável', date: 'há 3 dias' },
  { v: 'v1.9-b2', channel: 'Beta', date: 'há 2 semanas' },
  { v: 'v1.8', channel: 'Estável', date: 'há 1 mês' },
]

export function ModpackPage() {
  const { id } = useParams()
  const item = discover.find((d) => d.id === id)
  const [tab, setTab] = useState('desc')
  const [version, setVersion] = useState('v1.9')
  const [liked, setLiked] = useState(false)
  const install = useInstallState(id ?? '')
  const navigate = useNavigate()

  if (!item) return <Navigate to="/descobrir" replace />

  const steps = [
    { label: 'Manifesto baixado', at: 5 },
    { label: `${item.loader} instalado`, at: 25 },
    { label: `Baixando mods · ${Math.round((Math.min(install.progress, 95) / 95) * item.mods)}/${item.mods}`, at: 95 },
    { label: 'Aplicar configurações e overrides', at: 100 },
  ]

  return (
    <div className="flex flex-col">
      <div className="relative h-44 overflow-hidden">
        <PixelScene scene={item.scene} twinkle />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_5%,transparent)]" aria-hidden />
        <Button variant="secondary" size="sm" asChild className="absolute left-6 top-4 bg-overlay">
          <Link to="/descobrir">
            <ArrowLeft /> Descobrir
          </Link>
        </Button>
      </div>
      <div className="mx-auto -mt-12 flex w-full max-w-[1400px] flex-wrap items-start gap-5 px-6 pb-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <header className="relative flex items-end gap-4">
            <span className="size-24 shrink-0 overflow-hidden rounded-lg border-2 border-border-2">
              <PixelScene scene={item.scene} cols={24} rows={24} stars={false} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className="text-2xl font-bold">{item.name}</h1>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>por <span className="text-foreground">{item.author}</span></span>
                <span><span className="font-semibold text-foreground">{item.downloads}</span> downloads</span>
                <span><span className="font-semibold text-foreground">{item.mods}</span> mods</span>
                <span>{item.source}</span>
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => setLiked((v) => !v)}
              aria-pressed={liked}
              aria-label="Seguir"
              className="grid size-9 cursor-pointer place-items-center rounded-sm border border-border-2 bg-card hover:bg-accent"
            >
              <Heart className={liked ? 'size-4 fill-danger-fg text-danger-fg' : 'size-4 text-muted-foreground'} />
            </motion.button>
          </header>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="desc">Descrição</TabsTrigger>
              <TabsTrigger value="mods">Mods incluídos</TabsTrigger>
              <TabsTrigger value="versions">Versões</TabsTrigger>
              <TabsTrigger value="changelog">Changelog</TabsTrigger>
            </TabsList>
            <TabsContent value="desc" className="flex flex-col gap-4 pt-4">
              <div className="grid grid-cols-3 gap-2">
                {(['ember', 'tide', 'grove'] as const).map((s) => (
                  <div key={s} className="h-28 overflow-hidden rounded-lg border border-border">
                    <PixelScene scene={s} cols={48} rows={27} />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
                <p>[Descrição completa do modpack em Markdown, vinda da API do {item.source}.]</p>
                <h2 className="text-base font-semibold text-foreground">Destaques</h2>
                <ul className="list-disc space-y-1 pl-5">
                  {item.categories.map((c) => (
                    <li key={c}>[Destaque de {c.toLowerCase()}]</li>
                  ))}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="mods" className="pt-4">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                {contentByType.mods.slice(0, 7).map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
                    <span className="size-7 shrink-0 rounded-sm" style={{ background: m.color }} aria-hidden />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <span className="text-2xs text-muted-foreground">{m.author}</span>
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="versions" className="pt-4">
              <Card>
                {versions.map((v) => (
                  <div key={v.v} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
                    <span className="w-20 font-mono">{v.v}</span>
                    <Badge tone={v.channel === 'Beta' ? 'warning' : 'success'}>{v.channel}</Badge>
                    <span className="flex-1 text-muted-foreground">{item.loader} · MC {item.mcVersion}</span>
                    <span className="text-xs text-muted-2">{v.date}</span>
                  </div>
                ))}
              </Card>
            </TabsContent>
            <TabsContent value="changelog" className="pt-4 text-sm text-muted-foreground">
              [Changelog por versão, vindo da API.]
            </TabsContent>
          </Tabs>
        </div>

        <Card className="sticky top-4 flex flex-[1_1_300px] flex-col gap-4 p-4 lg:max-w-sm">
          <h2 className="text-base font-semibold">Instalar</h2>
          <label className="flex flex-col gap-1.5 text-sm">
            Versão
            <Select value={version} onValueChange={setVersion} className="w-full" options={versions.map((v) => ({ value: v.v, label: v.v, hint: v.channel }))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Destino
            <Select className="w-full" options={[{ value: 'new', label: 'Nova instância' }]} />
          </label>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Mods opcionais</legend>
            <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Shaders (Iris)</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox /> Minimapa</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Voice chat</label>
          </fieldset>
          <p className="font-mono text-2xs text-muted-2">
            Download ≈ {formatBytes(item.sizeMb)} · disco ≈ {formatBytes(item.sizeMb * 2.2)} · Java automático
          </p>

          {install.state === 'installing' && (
            <motion.ol initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-2 text-sm">
              {steps.map((s, i) => {
                const prev = i === 0 ? 0 : steps[i - 1].at
                const done = install.progress >= s.at
                const current = !done && install.progress >= prev
                return (
                  <li key={s.label} className="flex flex-col gap-1.5">
                    <span className={done ? 'flex items-center gap-2' : current ? 'flex items-center gap-2' : 'flex items-center gap-2 text-muted-2'}>
                      {done ? <Check className="size-4 text-success-fg" /> : current ? <Loader2 className="size-4 animate-spin text-primary-light" /> : <span className="size-4" />}
                      {s.label}
                    </span>
                    {current && <Progress value={((install.progress - prev) / (s.at - prev)) * 100} label={s.label} />}
                  </li>
                )
              })}
            </motion.ol>
          )}

          {install.state === 'installed' ? (
            <Button size="xl" variant="secondary" onClick={() => navigate(`/instancia/mp-${item.id}`)}>
              <Check className="text-success-fg" /> Instalado · abrir
            </Button>
          ) : install.state === 'installing' ? (
            <Button size="xl" variant="soft" onClick={() => navigate('/downloads')}>
              Acompanhar em Downloads
            </Button>
          ) : (
            <Button size="xl" onClick={() => installModpack(item, version) || toast('Já está na fila')}>
              Instalar modpack
            </Button>
          )}
        </Card>
      </div>
    </div>
  )
}
