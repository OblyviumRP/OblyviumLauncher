import { ImagePlus, Loader2, RotateCcw, Save, Shirt, Trash2, UserRound } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { backend, type LibrarySkin, type SkinProfile } from '@/backend'
import { Avatar } from '@/components/shared/avatar'
import { Card, EmptyState } from '@/components/shared/page'
import { SkinModel } from '@/components/shared/skin-model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/i18n'
import { useAsync } from '@/lib/use-async'
import { cn } from '@/lib/utils'
import { useAccount, useLauncher } from '@/store/launcher'

type Variant = 'classic' | 'slim'
type Pick = { kind: 'current' } | { kind: 'library'; id: string }

function Preview({ src, slim, cape, scale, interactive }: { src: string | null; slim: boolean; cape?: string | null; scale: number; interactive?: boolean }) {
  if (!src) {
    return (
      <span className="grid place-items-center text-muted-2" style={{ width: 128 * scale, height: 256 * scale }}>
        <UserRound className="size-1/2" />
      </span>
    )
  }
  return <SkinModel src={src} slim={slim} capeSrc={cape} scale={scale} interactive={interactive} />
}

function LibraryCard({ skin, selected, onPick, onRemove }: { skin: LibrarySkin; selected: boolean; onPick: () => void; onRemove: () => void }) {
  return (
    <motion.div layout whileHover={{ y: -3 }} className="group relative">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        aria-label={t('Skin {name}', { name: skin.name })}
        className={cn(
          'flex h-44 w-full cursor-pointer flex-col items-center justify-end gap-2 rounded-lg border-2 bg-card pb-2.5 pt-3 transition-colors',
          selected ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-2',
        )}
      >
        <Preview src={skin.dataUrl} slim={skin.variant === 'slim'} scale={0.42} />
        <span className="max-w-full truncate px-2 text-xs font-medium">{skin.name}</span>
      </button>
      <Tooltip content={t('Remover da biblioteca')} side="top">
        <Button variant="ghost" size="icon-sm" aria-label={t('Remover {name}', { name: skin.name })} onClick={onRemove} className="absolute right-1.5 top-1.5 text-danger-fg opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
          <Trash2 />
        </Button>
      </Tooltip>
    </motion.div>
  )
}

export function SkinsPage() {
  const account = useAccount()
  const showError = useLauncher((s) => s.showError)
  const confirm = useLauncher((s) => s.confirm)
  const microsoft = account?.kind === 'microsoft'
  const prof = useAsync(() => (microsoft ? backend().skinProfile() : Promise.resolve(null)), [account?.id])
  const [libRev, setLibRev] = useState(0)
  const lib = useAsync(() => backend().skinLibrary(), [libRev])
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [pick, setPick] = useState<Pick>({ kind: 'current' })
  const [variant, setVariant] = useState<Variant>('classic')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setProfile(prof.data)
    if (prof.data?.skin) setVariant(prof.data.skin.variant)
  }, [prof.data])

  const library = lib.data ?? []
  const picked = pick.kind === 'library' ? library.find((s) => s.id === pick.id) : null
  const currentUrl = profile?.skin?.url || null
  const src = picked ? picked.dataUrl : currentUrl
  const activeCape = profile?.capes.find((c) => c.active) ?? null
  const dirty = picked != null || (profile?.skin != null && variant !== profile.skin.variant)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(null)
    }
  }

  const apply = () =>
    run('apply', async () => {
      let entry = picked
      if (!entry) {
        // Trocar só o modelo do braço: salva a skin atual e envia de novo.
        entry = await backend().addSkinFromCurrent(account?.name ?? 'Skin')
        setLibRev((r) => r + 1)
        if (!entry) return
      }
      setProfile(await backend().applyLibrarySkin(entry.id, variant))
      setPick({ kind: 'current' })
      toast.success(t('Skin “{name}” aplicada', { name: entry.name }), { description: t('Pode levar alguns minutos para aparecer para os outros jogadores.') })
    })

  const addFile = () =>
    run('add', async () => {
      const s = await backend().addSkinFromFile()
      if (s) {
        setLibRev((r) => r + 1)
        setPick({ kind: 'library', id: s.id })
        setVariant(s.variant)
      }
    })

  const saveCurrent = () =>
    run('save', async () => {
      const s = await backend().addSkinFromCurrent(account?.name ?? 'Skin')
      if (s) {
        setLibRev((r) => r + 1)
        toast.success(t('Skin atual salva na biblioteca'))
      }
    })

  const reset = async () => {
    const ok = await confirm({ title: t('Voltar à skin padrão?'), body: t('A conta passa a usar Steve ou Alex. Salve a skin atual na biblioteca antes, se quiser usá-la de novo.'), confirm: t('Voltar ao padrão') })
    if (ok)
      run('reset', async () => {
        setProfile(await backend().resetSkin())
        toast(t('Skin padrão aplicada'))
      })
  }

  const cape = (id: string | null) =>
    run(`cape-${id}`, async () => {
      setProfile(await backend().setCape(id))
    })

  const remove = (s: LibrarySkin) =>
    run(`rm-${s.id}`, async () => {
      await backend().removeLibrarySkin(s.id)
      if (pick.kind === 'library' && pick.id === s.id) setPick({ kind: 'current' })
      setLibRev((r) => r + 1)
    })

  if (!account) return null
  if (!microsoft) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-5">
        <EmptyState
          icon={<Shirt />}
          title={t('Skins precisam de conta Microsoft')}
          action={
            <Button asChild>
              <Link to="/boas-vindas?adicionar=1">{t('Entrar com Microsoft')}</Link>
            </Button>
          }
        >
          {t('{name} é uma conta offline. A skin fica nos servidores da Mojang, então só dá para trocar com uma conta Microsoft.', { name: account.name })}
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-start gap-6 px-6 py-5">
      <section aria-label={t('Pré-visualização')} className="flex w-72 shrink-0 flex-col gap-4 lg:sticky lg:top-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">{t('Skins')}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar name={account.name} className="size-5" />
            {t('Personagem de')} <span className="font-semibold text-foreground">{account.name}</span>
          </p>
        </div>
        <Card className="relative grid h-[360px] place-items-center overflow-hidden">
          <span className="absolute bottom-14 h-5 w-40 rounded-[50%] bg-accent" aria-hidden />
          {prof.loading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : prof.error ? (
            <p className="px-6 text-center text-sm text-muted-foreground">{t('Não foi possível carregar a skin da conta. Verifique a conexão ou entre de novo.')}</p>
          ) : (
            <motion.div key={src ?? 'none'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <Preview src={src} slim={variant === 'slim'} cape={activeCape?.url || null} scale={1.05} interactive />
            </motion.div>
          )}
          <span className="absolute bottom-3 text-2xs text-muted-2">{t('Arraste para girar')}</span>
          {picked && (
            <Badge tone="primary" className="absolute left-3 top-3">
              {t('pré-visualização')}
            </Badge>
          )}
        </Card>
        <Tabs value={variant} onValueChange={(v) => setVariant(v as Variant)} variant="pill">
          <TabsList aria-label={t('Modelo de braço')} className="w-full">
            <TabsTrigger value="classic" className="flex-1 justify-center">
              {t('Clássico')}
            </TabsTrigger>
            <TabsTrigger value="slim" className="flex-1 justify-center">
              {t('Slim')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled={!dirty || busy != null} onClick={apply}>
            {busy === 'apply' && <Loader2 className="animate-spin" />}
            {dirty ? (picked ? t('Aplicar “{name}”', { name: picked.name }) : t('Aplicar modelo')) : t('Em uso')}
          </Button>
          {picked && (
            <Button variant="secondary" size="lg" onClick={() => setPick({ kind: 'current' })}>
              {t('Cancelar')}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={saveCurrent} disabled={!profile?.skin || busy != null}>
            <Save /> {t('Salvar atual')}
          </Button>
          <Tooltip content={t('Voltar à skin padrão')} side="top">
            <Button variant="secondary" size="icon" aria-label={t('Voltar à skin padrão')} onClick={reset} disabled={busy != null}>
              <RotateCcw />
            </Button>
          </Tooltip>
        </div>
      </section>

      <div className="flex min-w-[300px] flex-1 flex-col gap-6 pt-1">
        <section className="flex flex-col gap-3" aria-label={t('Biblioteca')}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">{t('Biblioteca')}</h2>
            <p className="text-xs text-muted-foreground">{t('Fica neste PC; só a aplicada vai para a conta.')}</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
            <button
              type="button"
              onClick={addFile}
              disabled={busy != null}
              className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary-line bg-sidebar text-sm text-primary-fg transition-colors hover:bg-primary-soft/50 disabled:cursor-progress"
            >
              {busy === 'add' ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {t('Adicionar skin')}
              <span className="text-2xs text-muted-foreground">.png 64×64</span>
            </button>
            {library.map((s) => (
              <LibraryCard
                key={s.id}
                skin={s}
                selected={pick.kind === 'library' && pick.id === s.id}
                onPick={() => {
                  setPick({ kind: 'library', id: s.id })
                  setVariant(s.variant)
                }}
                onRemove={() => remove(s)}
              />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3" aria-label={t('Capa')}>
          <h2 className="text-base font-semibold">{t('Capa')}</h2>
          {profile && profile.capes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Esta conta não tem capas. Capas vêm de eventos da Mojang e da Minecraft Experience.')}</p>
          ) : (
            <div role="radiogroup" aria-label={t('Capa')} className="flex flex-wrap gap-2">
              {[{ id: null, alias: t('Nenhuma'), url: '' },
 ...(profile?.capes ?? [])].map((c) => {
                const on = c.id == null ? activeCape == null : activeCape?.id === c.id
                return (
                  <button
                    key={c.id ?? 'none'}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy != null}
                    onClick={() => !on && cape(c.id)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm transition-colors disabled:cursor-progress',
                      on ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-border-2',
                    )}
                  >
                    {c.url ? (
                      <span
                        aria-hidden
                        className="h-10 w-[25px] rounded-sm [image-rendering:pixelated]"
                        style={{ backgroundImage: `url("${c.url}")`, backgroundSize: '160px 80px', backgroundPosition: '-2.5px -2.5px' }}
                      />
                    ) : (
                      <span className="h-10 w-6 rounded-sm border border-dashed border-border-2" aria-hidden />
                    )}
                    {busy === `cape-${c.id}` ? <Loader2 className="size-4 animate-spin" /> : c.alias}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
