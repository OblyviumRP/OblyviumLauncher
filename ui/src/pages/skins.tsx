import { Download, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SkinHead } from '@/components/layout/account-switcher'
import { Card } from '@/components/shared/page'
import { SkinFigure } from '@/components/shared/skin-figure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { defaultSkins, savedSkins } from '@/data/mock'
import type { Skin } from '@/data/types'
import { cn } from '@/lib/utils'
import { useActiveAccount, useLauncher } from '@/store/launcher'

const all = [...savedSkins, ...defaultSkins]

function SkinCard({ skin, selected, current, onPick }: { skin: Skin; selected: boolean; current: boolean; onPick: () => void }) {
  return (
    <motion.button
      type="button"
      layout
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      aria-pressed={selected}
      aria-label={`Skin ${skin.name}${current ? ', em uso' : ''}`}
      className={cn(
        'relative flex h-44 cursor-pointer flex-col items-center justify-end gap-2 rounded-lg border-2 bg-card pb-2.5 pt-3 transition-colors',
        selected ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-2',
      )}
    >
      {current && (
        <Badge tone="success" className="absolute right-2 top-2">
          em uso
        </Badge>
      )}
      <SkinFigure skin={skin} scale={0.42} />
      <span className="text-xs font-medium">{skin.name}</span>
    </motion.button>
  )
}

export function SkinsPage() {
  const account = useActiveAccount()
  const currentId = useLauncher((s) => s.skinByAccount[s.activeAccountId])
  const apply = useLauncher((s) => s.applySkin)
  const model = useLauncher((s) => s.skinModel)
  const setModel = useLauncher((s) => s.setSkinModel)
  const cape = useLauncher((s) => s.cape)
  const setCape = useLauncher((s) => s.setCape)
  const [sel, setSel] = useState(currentId)
  const skin = all.find((s) => s.id === sel) ?? all[0]
  const dirty = sel !== currentId

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-start gap-6 px-6 py-5">
      <section aria-label="Pré-visualização" className="flex w-72 shrink-0 flex-col gap-4 lg:sticky lg:top-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Skins</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SkinHead skinId={currentId} className="size-5" />
            Personagem de <span className="font-semibold text-foreground">{account.name}</span>
          </p>
        </div>
        <Card className="relative grid h-[360px] place-items-center overflow-hidden">
          <span className="absolute bottom-14 h-5 w-40 rounded-[50%] bg-accent" aria-hidden />
          <motion.div key={skin.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
            <SkinFigure skin={skin} slim={model === 'slim'} cape={cape === 'oblyvium'} scale={1.05} interactive />
          </motion.div>
          <span className="absolute bottom-3 text-2xs text-muted-2">Arraste para girar</span>
        </Card>
        <Tabs value={model} onValueChange={(v) => setModel(v as 'classic' | 'slim')} variant="pill">
          <TabsList aria-label="Modelo de braço" className="w-full">
            <TabsTrigger value="classic" className="flex-1 justify-center">Clássico</TabsTrigger>
            <TabsTrigger value="slim" className="flex-1 justify-center">Slim</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1"
            disabled={!dirty}
            onClick={() => {
              apply(sel)
              toast.success(`Skin “${skin.name}” aplicada`, { description: `Na conta ${account.name}. Pode levar alguns segundos para aparecer no jogo.` })
            }}
          >
            {dirty ? `Aplicar “${skin.name}”` : 'Em uso'}
          </Button>
          <Button variant="secondary" size="icon" className="size-10" aria-label="Baixar skin (.png)" onClick={() => toast('Skin salva como .png')}>
            <Download />
          </Button>
        </div>
      </section>

      <div className="flex min-w-[300px] flex-1 flex-col gap-6 pt-1">
        <section className="flex flex-col gap-3" aria-label="Skins salvas">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Skins salvas</h2>
            <span className="text-xs text-muted-foreground">Ficam neste PC; a aplicada vai para a conta.</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
            <button
              type="button"
              onClick={() => toast('Escolha um arquivo .png 64×64', { description: 'Simulação: o seletor abre no Electron.' })}
              className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary-line bg-sidebar text-sm text-primary-fg transition-colors hover:bg-primary-soft/50"
            >
              <Plus className="size-5" />
              Adicionar skin
              <span className="text-2xs text-muted-foreground">.png ou arraste</span>
            </button>
            {savedSkins.map((s) => (
              <SkinCard key={s.id} skin={s} selected={s.id === sel} current={s.id === currentId} onPick={() => setSel(s.id)} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3" aria-label="Skins padrão">
          <h2 className="text-base font-semibold">Skins padrão</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
            {defaultSkins.map((s) => (
              <SkinCard key={s.id} skin={s} selected={s.id === sel} current={s.id === currentId} onPick={() => setSel(s.id)} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3" aria-label="Capa">
          <h2 className="text-base font-semibold">Capa</h2>
          <div role="radiogroup" aria-label="Capa" className="flex flex-wrap gap-2">
            {(
              [
                { id: 'none', label: 'Nenhuma' },
                { id: 'oblyvium', label: 'Oblyvium' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={cape === c.id}
                onClick={() => setCape(c.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm transition-colors',
                  cape === c.id ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-border-2',
                )}
              >
                <span className={cn('h-10 w-6 rounded-sm', c.id === 'none' ? 'border border-dashed border-border-2' : 'border-2 border-primary-light bg-primary-hover')} aria-hidden />
                {c.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
