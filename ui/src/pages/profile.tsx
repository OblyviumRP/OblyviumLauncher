import { ArrowLeft, Copy, FolderOpen, Image, Package, Pencil, Plus, RefreshCw, Search, Trash2, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { backend, type ContentFile, type ContentType, type PackMod, type ProfileInfo } from '@/backend'
import { Card, EmptyState } from '@/components/shared/page'
import { PlayButton } from '@/components/shared/play-button'
import { ProfileIcon, profileIcons } from '@/components/shared/profile-icon'
import { hasRealArt, ServerArt } from '@/components/shared/server-art'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { useAsync } from '@/lib/use-async'
import { cn } from '@/lib/utils'
import { isBusy, useLauncher, useProfile, useServer } from '@/store/launcher'

const kinds: { id: ContentType; label: string }[] = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Resource packs' },
  { id: 'shader', label: 'Shaders' },
]

function ContentIcon({ file }: { file: ContentFile }) {
  const [failed, setFailed] = useState(false)
  if (file.iconUrl && !failed) return <img src={file.iconUrl} alt="" onError={() => setFailed(true)} className="size-8 shrink-0 rounded-md bg-surface-2 object-cover" />
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-muted-2" aria-hidden>
      <Package className="size-4" />
    </span>
  )
}

function ContentTable({ serverId, profileId, type, loaderless }: { serverId: string; profileId: string; type: ContentType; loaderless: boolean }) {
  const rev = useLauncher((s) => s.contentRev)
  const showError = useLauncher((s) => s.showError)
  const confirm = useLauncher((s) => s.confirm)
  const locked = useLauncher((s) => isBusy(s.launch.state))
  const { data, loading, reload } = useAsync(() => backend().listContent(serverId, profileId, type), [serverId, profileId, type, rev])
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const items = data ?? []
  const shown = items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()) || i.fileName.toLowerCase().includes(q.toLowerCase()))
  const updates = items.filter((i) => i.update)

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setWorking(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (err) {
      showError(err)
    } finally {
      setWorking(null)
      reload()
    }
  }

  const updateAll = () =>
    run('*', async () => {
      for (const f of updates) await backend().updateContent(serverId, profileId, type, f.fileName, f.update!.id)
    }, `${updates.length} ${updates.length === 1 ? 'item atualizado' : 'itens atualizados'}`)

  const remove = async (f: ContentFile) => {
    const ok = await confirm({ title: `Remover ${f.title}?`, body: 'O arquivo vai para a lixeira do sistema.', confirm: 'Remover', tone: 'danger' })
    if (ok) run(f.fileName, () => backend().removeContent(serverId, profileId, type, f.fileName), `${f.title} removido`)
  }

  if (type === 'mod' && loaderless) {
    return (
      <EmptyState icon={<Package />} title="Servidor sem mods">
        Este servidor roda Minecraft sem loader, então não aceita mods. Resource packs e shaders continuam disponíveis.
      </EmptyState>
    )
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
        <Tooltip content="Abrir pasta" side="top">
          <Button variant="secondary" size="icon" aria-label="Abrir pasta" onClick={() => backend().openContentFolder(serverId, profileId, type)}>
            <FolderOpen />
          </Button>
        </Tooltip>
        {updates.length > 0 && (
          <Button variant="secondary" onClick={updateAll} disabled={working != null || locked} className="border-warning-line text-warning-fg">
            <RefreshCw className={cn(working === '*' && 'animate-spin')} /> Atualizar tudo ({updates.length})
          </Button>
        )}
        <Button asChild>
          <Link to={`/descobrir?tipo=${type}`}>
            <Plus /> Adicionar
          </Link>
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-2 font-mono text-2xs uppercase tracking-wider text-muted-2">
            <tr>
              <th className="w-14 px-3 py-2 text-left font-medium">{type === 'shader' ? 'Em uso' : 'Ativo'}</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Versão</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((f) => (
                <motion.tr key={f.fileName} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24 }} className={cn('border-t border-border', !f.enabled && 'opacity-60')}>
                  <td className="px-3 py-2">
                    <Switch
                      checked={f.enabled}
                      disabled={working != null || locked}
                      aria-label={`${type === 'shader' ? 'Usar' : 'Ativar'} ${f.title}`}
                      onCheckedChange={(v) => run(f.fileName, () => backend().setContentEnabled(serverId, profileId, type, f.fileName, v))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <ContentIcon file={f} />
                      <div className="flex min-w-0 flex-col">
                        {f.projectId ? (
                          <Link to={`/descobrir/${f.projectId}`} className="truncate font-medium hover:underline">
                            {f.title}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{f.title}</span>
                        )}
                        <span className="truncate font-mono text-2xs text-muted-2">{f.fileName}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {f.version ?? '—'}
                    {f.update && <span className="ml-2 text-warning-fg">→ {f.update.number}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {f.update && (
                        <Tooltip content={`Atualizar para ${f.update.number}`} side="top">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={working != null || locked}
                            aria-label={`Atualizar ${f.title}`}
                            onClick={() => run(f.fileName, () => backend().updateContent(serverId, profileId, type, f.fileName, f.update!.id), `${f.title} atualizado`)}
                          >
                            <RefreshCw className={cn(working === f.fileName && 'animate-spin')} />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip content="Remover" side="top">
                        <Button variant="ghost" size="icon-sm" disabled={working != null || locked} aria-label={`Remover ${f.title}`} className="text-danger-fg" onClick={() => remove(f)}>
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
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-2 p-3" aria-label="Carregando">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : (
          shown.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? 'Nada instalado neste perfil ainda. Use Adicionar para procurar no Modrinth.' : 'Nada encontrado.'}
            </p>
          )
        )}
      </Card>
      {type === 'mod' && <p className="text-xs text-muted-foreground">Mods que a staff bloquear são desativados sozinhos antes de abrir o jogo.</p>}
    </div>
  )
}

function PackModRow({ mod, depth, parentOn, onToggle, locked }: { mod: PackMod; depth: number; parentOn: boolean; onToggle: (m: PackMod, v: boolean) => void; locked: boolean }) {
  const on = mod.enabled && parentOn
  return (
    <>
      <li className={cn('flex items-center gap-3 border-t border-border px-3 py-2 first:border-t-0', !mod.available && 'opacity-50')} style={{ paddingLeft: 12 + depth * 24 }}>
        <Switch
          checked={mod.required || mod.enabled}
          disabled={mod.required || !mod.available || !parentOn || locked}
          onCheckedChange={(v) => onToggle(mod, v)}
          aria-label={`${mod.name}${mod.required ? ' (obrigatório)' : ''}`}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-sm font-medium', !on && !mod.required && 'text-muted-foreground')}>{mod.name}</span>
          <span className="font-mono text-2xs text-muted-2">{mod.version}</span>
        </span>
        {mod.required ? <Badge>obrigatório</Badge> : !mod.available ? <Badge tone="warning">indisponível</Badge> : <Badge tone="primary">opcional</Badge>}
      </li>
      {mod.children.map((c) => (
        <PackModRow key={c.id} mod={c} depth={depth + 1} parentOn={on || mod.required} onToggle={onToggle} locked={locked} />
      ))}
    </>
  )
}

function PackMods({ serverId, profileId }: { serverId: string; profileId: string }) {
  const [rev, setRev] = useState(0)
  const locked = useLauncher((s) => isBusy(s.launch.state))
  void rev // muda a cada troca para reler do backend
  const mods = backend().packMods(serverId, profileId)
  const optional = (list: PackMod[]): number => list.reduce((n, m) => n + (m.required ? 0 : 1) + optional(m.children), 0)
  const toggle = (m: PackMod, v: boolean) => {
    backend().setPackModEnabled(serverId, profileId, m.path, v)
    setRev((r) => r + 1)
  }
  if (mods.length === 0) {
    return <EmptyState icon={<Package />} title="Sem mods no pacote">Este servidor não distribui mods próprios.</EmptyState>
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Mods enviados pela staff com o servidor. Os opcionais ({optional(mods)}) podem ser ligados ou desligados neste perfil; a mudança vale na próxima vez que o jogo abrir.
      </p>
      <Card>
        <ul>
          {mods.map((m) => (
            <PackModRow key={m.id} mod={m} depth={0} parentOn onToggle={toggle} locked={locked} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Screenshots({ serverId, profileId }: { serverId: string; profileId: string }) {
  const { data, loading } = useAsync(() => backend().screenshots(serverId, profileId), [serverId, profileId])
  const [open, setOpen] = useState<{ name: string; url: string } | null>(null)
  if (!loading && (data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Image />}
        title="Nenhuma captura ainda"
        action={
          <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'screenshots')}>
            <FolderOpen /> Abrir pasta
          </Button>
        }
      >
        Aperte F2 dentro do jogo para tirar uma captura de tela.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'screenshots')}>
          <FolderOpen /> Abrir pasta
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {(data ?? []).map((s) => (
          <motion.button key={s.name} type="button" whileHover={{ scale: 1.02 }} onClick={() => setOpen(s)} className="cursor-zoom-in overflow-hidden rounded-lg border border-border bg-card text-left">
            <img src={s.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            <span className="block truncate px-2.5 py-1.5 font-mono text-2xs text-muted-2">{s.name}</span>
          </motion.button>
        ))}
      </div>
      <DialogPrimitive.Root open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent title={open.name} className="max-w-5xl">
            <img src={open.url} alt={open.name} className="w-full rounded-md" />
          </DialogContent>
        )}
      </DialogPrimitive.Root>
    </div>
  )
}

function Logs({ serverId, profileId }: { serverId: string; profileId: string }) {
  const { data, loading, reload } = useAsync(() => backend().latestLog(serverId, profileId), [serverId, profileId])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">logs/latest.log · últimas 400 linhas</span>
        <div className="flex-1" />
        <Button variant="secondary" onClick={reload}>
          <RefreshCw className={cn(loading && 'animate-spin')} /> Recarregar
        </Button>
        <Button
          variant="secondary"
          disabled={!data}
          onClick={() => {
            void navigator.clipboard.writeText(data ?? '')
            toast.success('Log copiado')
          }}
        >
          <Copy /> Copiar
        </Button>
        <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'logs')}>
          <FolderOpen /> Abrir pasta
        </Button>
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-sidebar p-4 font-mono text-xs leading-relaxed text-muted-foreground">
        {data
          ? data.split('\n').map((line, i) => (
              <span key={i} className={cn('block', /\/(ERROR|FATAL)\]/.test(line) ? 'text-danger-fg' : /\/WARN\]/.test(line) && 'text-warning-fg')}>
                {line || ' '}
              </span>
            ))
          : loading
            ? 'Carregando…'
            : 'Nenhum log ainda. Ele aparece depois que o jogo abrir uma vez com este perfil.'}
      </pre>
    </div>
  )
}

function ProfileSettingsCard({ serverId, profileId }: { serverId: string; profileId: string }) {
  const [rev, setRev] = useState(0)
  const showError = useLauncher((s) => s.showError)
  void rev
  const ps = backend().profileSettings(serverId, profileId)
  const [ram, setRam] = useState(ps.maxRamGB)
  const [w, setW] = useState(String(ps.width))
  const [h, setH] = useState(String(ps.height))
  const set = (key: Parameters<ReturnType<typeof backend>['setProfileSetting']>[2], value: number | boolean | string | null) => {
    backend().setProfileSetting(serverId, profileId, key, value)
    setRev((r) => r + 1)
  }
  const java = async (fn: () => Promise<string | null>, none: string) => {
    try {
      const p = await fn()
      if (p) toast.success('Java configurado', { description: p })
      else if (none) toast(none)
      setRev((r) => r + 1)
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Java e memória</h3>
        <p className="text-xs text-muted-foreground">Valem só para este perfil.</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span>Memória máxima</span>
          <span className="font-mono text-primary-fg">{ram.toLocaleString('pt-BR')} GB</span>
        </div>
        <Slider value={[ram]} min={ps.ramMinGB} max={ps.ramMaxGB} step={0.5} onValueChange={([v]) => setRam(v)} onValueCommit={([v]) => set('maxRamGB', v)} aria-label="Memória máxima" />
        <div className="flex justify-between font-mono text-2xs text-muted-2">
          <span>mín. {ps.ramMinGB} GB</span>
          <span>recomendado {ps.ramRecommendedGB} GB · PC {ps.systemRamGB} GB</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span>Java</span>
        <span className="truncate rounded-sm border border-input bg-input-fill px-2.5 py-1.5 font-mono text-xs text-muted-foreground" title={ps.javaPath ?? undefined}>
          {ps.javaPath ?? 'Automático: escolhido ou baixado ao jogar'}
        </span>
        <span className="font-mono text-2xs text-muted-2">Versões aceitas: {ps.javaSupported || '—'}</span>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => java(() => backend().detectJava(serverId, profileId), 'Nenhum Java compatível encontrado. Ele será baixado ao jogar.')}>
            Detectar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => java(() => backend().chooseJava(serverId, profileId), '')}>
            Escolher arquivo…
          </Button>
          {ps.javaPath && (
            <Button variant="ghost" size="sm" onClick={() => set('javaPath', null)}>
              Usar automático
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Janela do jogo</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Largura
            <Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} onBlur={() => set('width', Number(w))} className="w-24 font-mono" disabled={ps.fullscreen} />
          </label>
          <span className="pb-2 text-muted-2">×</span>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Altura
            <Input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} onBlur={() => set('height', Number(h))} className="w-24 font-mono" disabled={ps.fullscreen} />
          </label>
          <label className="ml-auto flex items-center gap-2 pb-1.5 text-sm">
            Tela cheia <Switch checked={ps.fullscreen} onCheckedChange={(v) => set('fullscreen', v)} />
          </label>
        </div>
      </div>
    </Card>
  )
}

export function ProfileEditor({ serverId, profile, onDone }: { serverId: string; profile: ProfileInfo | null; onDone: (p: ProfileInfo | null) => void }) {
  const profiles = useLauncher((s) => s.profiles)
  const showError = useLauncher((s) => s.showError)
  const icons = [...profileIcons().entries()]
  const [name, setName] = useState(profile?.name ?? '')
  const [icon, setIcon] = useState(profile?.icon ?? icons[1]?.[0] ?? icons[0][0])
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const error = name ? backend().validateProfileName(name) : null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || error) return
    setBusy(true)
    try {
      if (profile) {
        backend().updateProfile(serverId, profile.id, { name: name.trim(), icon })
        onDone(profile)
      } else {
        onDone(await backend().createProfile(serverId, { name: name.trim(), icon, copyFrom }))
      }
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        Nome
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus placeholder="Ex.: Shaders, PvP, Construção" aria-invalid={!!error} />
        {error && <span className="text-xs text-danger-fg">{error}</span>}
      </label>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="pb-1.5">Ícone</legend>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          {icons.map(([key, v]) => (
            <Tooltip key={key} content={v.label} side="top">
              <button
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={v.label}
                onClick={() => setIcon(key)}
                className={cn('grid size-9 cursor-pointer place-items-center rounded-md border transition-colors', icon === key ? 'border-primary bg-primary-soft text-primary-light' : 'border-border bg-surface-2 text-muted-foreground hover:bg-accent')}
              >
                <ProfileIcon name={key} className="size-[18px]" />
              </button>
            </Tooltip>
          ))}
        </div>
      </fieldset>
      {!profile && (
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="pb-1.5">Copiar configurações de</legend>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: null, name: 'Nenhum' } as { id: string | null; name: string }, ...profiles].map((p) => (
              <Button key={p.id ?? 'none'} type="button" size="sm" variant={copyFrom === p.id ? 'soft' : 'secondary'} onClick={() => setCopyFrom(p.id)} aria-pressed={copyFrom === p.id}>
                {p.name}
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Copia options.txt, teclas e configs. Mods e mundos não vêm junto.</span>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!name.trim() || !!error || busy}>
          {profile ? 'Salvar' : 'Criar perfil'}
        </Button>
      </div>
    </form>
  )
}

function ProfileManage({ serverId, profile }: { serverId: string; profile: ProfileInfo }) {
  const [editing, setEditing] = useState(false)
  const refreshProfiles = useLauncher((s) => s.refreshProfiles)
  const selectProfile = useLauncher((s) => s.selectProfile)
  const verify = useLauncher((s) => s.verifyFiles)
  const confirm = useLauncher((s) => s.confirm)
  const showError = useLauncher((s) => s.showError)
  const locked = useLauncher((s) => isBusy(s.launch.state))

  const duplicate = async () => {
    try {
      const p = await backend().duplicateProfile(serverId, profile.id)
      refreshProfiles()
      toast.success(`${p.name} criado`)
    } catch (err) {
      showError(err)
    }
  }
  const remove = async () => {
    const ok = await confirm({
      title: `Excluir o perfil ${profile.name}?`,
      body: 'A pasta do perfil (mundos, mods, capturas e configs) vai para a lixeira do sistema.',
      confirm: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend().removeProfile(serverId, profile.id)
      refreshProfiles()
      selectProfile(useLauncher.getState().profileId)
      toast(`${profile.name} excluído`)
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold">Perfil</h3>
      <p className="text-xs text-muted-foreground">
        Cada perfil tem a própria pasta: mundos, mods extras, resource packs, shaders e configurações. Os arquivos do servidor são os mesmos para todos.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)} disabled={locked}>
          <Pencil /> Renomear
        </Button>
        <Button variant="secondary" onClick={duplicate} disabled={locked}>
          <Copy /> Duplicar
        </Button>
        <Button variant="secondary" onClick={verify} disabled={locked}>
          <Wrench /> Verificar arquivos
        </Button>
        {!profile.isDefault && (
          <Button variant="destructive" onClick={remove} disabled={locked}>
            <Trash2 /> Excluir
          </Button>
        )}
      </div>
      <DialogPrimitive.Root open={editing} onOpenChange={setEditing}>
        {editing && (
          <DialogContent title="Editar perfil">
            <ProfileEditor
              serverId={serverId}
              profile={profile}
              onDone={(p) => {
                setEditing(false)
                if (p) refreshProfiles()
              }}
            />
          </DialogContent>
        )}
      </DialogPrimitive.Root>
    </Card>
  )
}

export function ProfilePage() {
  const server = useServer()
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') ?? 'conteudo'
  const [kind, setKind] = useState<ContentType>((params.get('tipo') as ContentType) ?? 'mod')

  if (!server || !profile) return <Navigate to="/servidores" replace />
  const loaderless = server.loader === 'Vanilla'

  return (
    <div className="flex flex-col">
      <div className="relative h-40 overflow-hidden">
        <ServerArt server={server} twinkle className="absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_5%,transparent)]" aria-hidden />
        <Button variant="secondary" size="sm" asChild className="absolute left-6 top-4 bg-overlay">
          <Link to="/servidores">
            <ArrowLeft /> Servidores
          </Link>
        </Button>
        {!hasRealArt(server) && <span className="absolute right-6 top-4 rounded-sm bg-overlay px-2 py-1 text-2xs text-muted-foreground">Arte gerada, não é uma captura do servidor</span>}
      </div>
      <div className="mx-auto -mt-14 flex w-full max-w-[1400px] flex-col gap-5 px-6 pb-6">
        <header className="relative flex flex-wrap items-end gap-4">
          <span className="grid size-24 place-items-center rounded-lg border-2 border-primary-line bg-card text-primary-light">
            <ProfileIcon name={profile.icon} className="size-10" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-muted-2">{server.name}</span>
            <h1 className="text-2xl font-bold">{profile.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{loaderless ? 'Vanilla' : server.loader}</Badge>
              <Badge>Minecraft {server.mcVersion}</Badge>
              {server.version && <Badge tone="primary">Pacote {server.version}</Badge>}
              {profile.isDefault && <Badge>Perfil padrão</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tooltip content="Abrir pasta do perfil" side="top">
              <Button variant="secondary" size="icon" className="size-12" aria-label="Abrir pasta do perfil" onClick={() => backend().openGameFolder(server.id, profile.id)}>
                <FolderOpen />
              </Button>
            </Tooltip>
            <PlayButton />
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
          <TabsList aria-label="Seções do perfil">
            <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
            <TabsTrigger value="pacote">
              Mods do servidor <span className="font-mono text-2xs opacity-70">{server.packModCount}</span>
            </TabsTrigger>
            <TabsTrigger value="capturas">Capturas</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
          <TabsContent value="conteudo" className="flex flex-col gap-3 pt-4">
            <Tabs value={kind} onValueChange={(v) => setKind(v as ContentType)} variant="pill">
              <TabsList aria-label="Tipo de conteúdo">
                {kinds.map((k) => (
                  <TabsTrigger key={k.id} value={k.id}>
                    {k.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ContentTable key={`${profile.id}-${kind}`} serverId={server.id} profileId={profile.id} type={kind} loaderless={loaderless} />
          </TabsContent>
          <TabsContent value="pacote" className="pt-4">
            <PackMods key={profile.id} serverId={server.id} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="capturas" className="pt-4">
            <Screenshots serverId={server.id} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="logs" className="pt-4">
            <Logs serverId={server.id} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="config" className="pt-4">
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <ProfileSettingsCard key={profile.id} serverId={server.id} profileId={profile.id} />
              <ProfileManage serverId={server.id} profile={profile} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
