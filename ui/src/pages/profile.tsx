import { ArrowLeft, Copy, FolderOpen, Image, Package, Pencil, Plus, RefreshCw, Search, Trash2, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { backend, type ContentFile, type ContentType, type PackMod, type ProfileInfo } from '@/backend'
import { Card, EmptyState } from '@/components/shared/page'
import { PlayButton } from '@/components/shared/play-button'
import { ProfileIcon, profileIcons, profileLabel } from '@/components/shared/profile-icon'
import { artNotice, hasRealArt, ServerArt } from '@/components/shared/server-art'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { t, tn } from '@/i18n'
import { useAsync } from '@/lib/use-async'
import { cn } from '@/lib/utils'
import { isBusy, useLauncher, useProfile, useServer } from '@/store/launcher'

// O launcher é exclusivo do Oblyvium: não cria perfis nem instala modpacks. O jogador
// pode adicionar mods, resource packs e shaders do Modrinth ao perfil (o que a staff
// bloquear é desligado antes de abrir o jogo) e ligar ou desligar os mods opcionais do servidor.

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
    }, tn(updates.length, '{n} item atualizado', '{n} itens atualizados'))

  const remove = async (f: ContentFile) => {
    const ok = await confirm({ title: t('Remover {name}?', { name: f.title }), body: t('O arquivo vai para a lixeira do sistema.'), confirm: t('Remover'), tone: 'danger' })
    if (ok) run(f.fileName, () => backend().removeContent(serverId, profileId, type, f.fileName), t('{name} removido', { name: f.title }))
  }

  if (type === 'mod' && loaderless) {
    return (
      <EmptyState icon={<Package />} title={t('Servidor sem mods')}>
        {t('Este servidor roda Minecraft sem loader, então não aceita mods. Resource packs e shaders continuam disponíveis.')}
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">{t('Filtrar')}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filtrar…')} className="w-60 pl-8" />
        </label>
        <span className="font-mono text-2xs text-muted-2">
          {t('{on} de {n} ativos', { on: items.filter((i) => i.enabled).length, n: items.length })}
        </span>
        <div className="flex-1" />
        <Tooltip content={t('Abrir pasta')} side="top">
          <Button variant="secondary" size="icon" aria-label={t('Abrir pasta')} onClick={() => backend().openContentFolder(serverId, profileId, type)}>
            <FolderOpen />
          </Button>
        </Tooltip>
        {updates.length > 0 && (
          <Button variant="secondary" onClick={updateAll} disabled={working != null || locked} className="border-warning-line text-warning-fg">
            <RefreshCw className={cn(working === '*' && 'animate-spin')} /> {t('Atualizar tudo ({n})', { n: updates.length })}
          </Button>
        )}
        <Button asChild>
          <Link to={`/descobrir?tipo=${type}`}>
            <Plus /> {t('Adicionar')}
          </Link>
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-2 font-mono text-2xs uppercase tracking-wider text-muted-2">
            <tr>
              <th className="w-14 px-3 py-2 text-left font-medium">{type === 'shader' ? t('Em uso') : t('Ativo')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('Nome')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('Versão')}</th>
              <th className="w-24 px-3 py-2 text-right font-medium">{t('Ações')}</th>
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
                      aria-label={type === 'shader' ? t('Usar {name}', { name: f.title }) : t('Ativar {name}', { name: f.title })}
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
                        <Tooltip content={t('Atualizar para {v}', { v: f.update.number })} side="top">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={working != null || locked}
                            aria-label={t('Atualizar {name}', { name: f.title })}
                            onClick={() => run(f.fileName, () => backend().updateContent(serverId, profileId, type, f.fileName, f.update!.id), t('{name} atualizado', { name: f.title }))}
                          >
                            <RefreshCw className={cn(working === f.fileName && 'animate-spin')} />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip content={t('Remover')} side="top">
                        <Button variant="ghost" size="icon-sm" disabled={working != null || locked} aria-label={t('Remover {name}', { name: f.title })} className="text-danger-fg" onClick={() => remove(f)}>
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
          <div className="flex flex-col gap-2 p-3" aria-label={t('Carregando')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : (
          shown.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? t('Nada instalado neste perfil ainda. Use Adicionar para procurar no Modrinth.') : t('Nada encontrado.')}
            </p>
          )
        )}
      </Card>
      {type === 'mod' && <p className="text-xs text-muted-foreground">{t('Mods que a staff bloquear são desativados sozinhos antes de abrir o jogo.')}</p>}
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
          aria-label={mod.required ? t('{name} (obrigatório)', { name: mod.name }) : mod.name}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-sm font-medium', !on && !mod.required && 'text-muted-foreground')}>{mod.name}</span>
          <span className="font-mono text-2xs text-muted-2">{mod.version}</span>
        </span>
        {mod.required ? <Badge>{t('obrigatório')}</Badge> : !mod.available ? <Badge tone="warning">{t('indisponível')}</Badge> : <Badge tone="primary">{t('opcional')}</Badge>}
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
    return (
      <EmptyState icon={<Package />} title={t('Sem mods no pacote')}>
        {t('Este servidor não distribui mods próprios.')}
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t('Mods enviados pela staff com o servidor. Os opcionais ({n}) podem ser ligados ou desligados neste perfil; a mudança vale na próxima vez que o jogo abrir.', { n: optional(mods) })}
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
        title={t('Nenhuma captura ainda')}
        action={
          <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'screenshots')}>
            <FolderOpen /> {t('Abrir pasta')}
          </Button>
        }
      >
        {t('Aperte F2 dentro do jogo para tirar uma captura de tela.')}
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'screenshots')}>
          <FolderOpen /> {t('Abrir pasta')}
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
        <span className="font-mono text-xs text-muted-foreground">{t('logs/latest.log · últimas 400 linhas')}</span>
        <div className="flex-1" />
        <Button variant="secondary" onClick={reload}>
          <RefreshCw className={cn(loading && 'animate-spin')} /> {t('Recarregar')}
        </Button>
        <Button
          variant="secondary"
          disabled={!data}
          onClick={() => {
            void navigator.clipboard.writeText(data ?? '')
            toast.success(t('Log copiado'))
          }}
        >
          <Copy /> {t('Copiar')}
        </Button>
        <Button variant="secondary" onClick={() => backend().openGameFolder(serverId, profileId, 'logs')}>
          <FolderOpen /> {t('Abrir pasta')}
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
            ? t('Carregando…')
            : t('Nenhum log ainda. Ele aparece depois que o jogo abrir uma vez com este perfil.')}

      </pre>
    </div>
  )
}

function JavaCard({ serverId, profileId }: { serverId: string; profileId: string }) {
  const [rev, setRev] = useState(0)
  const showError = useLauncher((s) => s.showError)
  void rev // muda a cada troca para reler do backend
  const ps = backend().profileSettings(serverId, profileId)
  const java = async (fn: () => Promise<string | null>, none: string) => {
    try {
      const p = await fn()
      if (p) toast.success(t('Java configurado'), { description: p })
      else if (none) toast(none)
      setRev((r) => r + 1)
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Java</h3>
        <p className="text-xs text-muted-foreground">{t('Cada versão do Minecraft pede um Java diferente, então ele fica por servidor. No automático o launcher escolhe ou baixa sozinho.')}</p>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="truncate rounded-sm border border-input bg-input-fill px-2.5 py-1.5 font-mono text-xs text-muted-foreground" title={ps.javaPath ?? undefined}>
          {ps.javaPath ?? t('Automático: escolhido ou baixado ao jogar')}
        </span>
        <span className="font-mono text-2xs text-muted-2">{t('Versões aceitas: {v}', { v: ps.javaSupported || '—' })}</span>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => java(() => backend().detectJava(serverId, profileId), t('Nenhum Java compatível encontrado. Ele será baixado ao jogar.'))}>
            {t('Detectar')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => java(() => backend().chooseJava(serverId, profileId), '')}>
            {t('Escolher arquivo…')}
          </Button>
          {ps.javaPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                backend().setProfileSetting(serverId, profileId, 'javaPath', null)
                setRev((r) => r + 1)
              }}
            >
              {t('Usar automático')}
            </Button>
          )}
        </div>
      </div>
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {t('Memória e tamanho da janela valem para todos os servidores.')}{' '}
        <Link to="/configuracoes?aba=jogo" className="text-primary-light hover:underline">
          {t('Abrir configurações do jogo')}
        </Link>
      </p>
    </Card>
  )
}

/** Renomear e trocar o ícone de um perfil que já existe. */
function ProfileEditor({ serverId, profile, onDone }: { serverId: string; profile: ProfileInfo; onDone: (changed: boolean) => void }) {
  const icons = [...profileIcons().entries()]
  const [name, setName] = useState(profile.name)
  const [icon, setIcon] = useState(profile.icon)
  const error = name ? backend().validateProfileName(name) : null

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || error) return
    backend().updateProfile(serverId, profile.id, { name: name.trim(), icon })
    onDone(true)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        {t('Nome')}
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus aria-invalid={!!error} />
        {error && <span className="text-xs text-danger-fg">{t(error)}</span>}
      </label>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="pb-1.5">{t('Ícone')}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          {icons.map(([key, v]) => (
            <Tooltip key={key} content={t(v.label)} side="top">
              <button
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={t(v.label)}
                onClick={() => setIcon(key)}
                className={cn('grid size-9 cursor-pointer place-items-center rounded-md border transition-colors', icon === key ? 'border-primary bg-primary-soft text-primary-light' : 'border-border bg-surface-2 text-muted-foreground hover:bg-accent')}
              >
                <ProfileIcon name={key} className="size-[18px]" />
              </button>
            </Tooltip>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          {t('Cancelar')}
        </Button>
        <Button type="submit" disabled={!name.trim() || !!error}>
          {t('Salvar')}
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

  // Perfis extras só existem para quem os criou em versões antigas; dá para apagar, não para criar.
  const remove = async () => {
    const ok = await confirm({
      title: t('Excluir o perfil {name}?', { name: profile.name }),
      body: t('A pasta do perfil (mundos, mods, capturas e configs) vai para a lixeira do sistema.'),
      confirm: t('Excluir'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend().removeProfile(serverId, profile.id)
      refreshProfiles()
      selectProfile(useLauncher.getState().profileId)
      toast(t('{name} excluído', { name: profile.name }))
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold">{t('Perfil')}</h3>
      <p className="text-xs text-muted-foreground">{t('O perfil guarda os mundos, mods extras, resource packs, shaders e configurações do jogo. Os arquivos do servidor são conferidos sempre que você joga.')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)} disabled={locked}>
          <Pencil /> {t('Renomear')}
        </Button>
        <Button variant="secondary" onClick={verify} disabled={locked}>
          <Wrench /> {t('Verificar arquivos')}
        </Button>
        {!profile.isDefault && (
          <Button variant="destructive" onClick={remove} disabled={locked}>
            <Trash2 /> {t('Excluir')}
          </Button>
        )}
      </div>
      <DialogPrimitive.Root open={editing} onOpenChange={setEditing}>
        {editing && (
          <DialogContent title={t('Editar perfil')}>
            <ProfileEditor
              serverId={serverId}
              profile={profile}
              onDone={(changed) => {
                setEditing(false)
                if (changed) refreshProfiles()
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
  const [kind, setKind] = useState<ContentType>((params.get('tipo') as ContentType) ?? 'mod')

  if (!server || !profile) return <Navigate to="/" replace />
  const hasPack = server.packModCount > 0
  const tab = params.get('aba') ?? 'conteudo'
  const loaderless = server.loader === 'Vanilla'

  return (
    <div className="flex flex-col">
      <div className="relative h-40 overflow-hidden">
        <ServerArt server={server} twinkle className="absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_5%,transparent)]" aria-hidden />
        <Button variant="secondary" size="sm" asChild className="absolute left-6 top-4 bg-overlay">
          <Link to="/">
            <ArrowLeft /> {t('Início')}
          </Link>
        </Button>
        {!hasRealArt(server) && <span className="absolute right-6 top-4 rounded-sm bg-overlay px-2 py-1 text-2xs text-muted-foreground">{artNotice()}</span>}
      </div>
      <div className="mx-auto -mt-14 flex w-full max-w-[1400px] flex-col gap-5 px-6 pb-6">
        <header className="relative flex flex-wrap items-end gap-4">
          <span className="grid size-24 place-items-center rounded-lg border-2 border-primary-line bg-card text-primary-light">
            <ProfileIcon name={profile.icon} className="size-10" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-muted-2">{server.name}</span>
            <h1 className="text-2xl font-bold">{profileLabel(profile)}</h1>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{server.loader === 'Vanilla' ? 'Vanilla' : server.loader}</Badge>
              <Badge>Minecraft {server.mcVersion}</Badge>
              {server.version && <Badge tone="primary">{t('Pacote {v}', { v: server.version })}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tooltip content={t('Abrir pasta do perfil')} side="top">
              <Button variant="secondary" size="icon" className="size-12" aria-label={t('Abrir pasta do perfil')} onClick={() => backend().openGameFolder(server.id, profile.id)}>
                <FolderOpen />
              </Button>
            </Tooltip>
            <PlayButton />
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
          <TabsList aria-label={t('Seções do perfil')}>
            <TabsTrigger value="conteudo">{t('Conteúdo')}</TabsTrigger>
            {hasPack && (
              <TabsTrigger value="pacote">
                {t('Mods do servidor')} <span className="font-mono text-2xs opacity-70">{server.packModCount}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="capturas">{t('Capturas')}</TabsTrigger>
            <TabsTrigger value="logs">{t('Logs')}</TabsTrigger>
            <TabsTrigger value="config">{t('Configurações')}</TabsTrigger>
          </TabsList>
          <TabsContent value="conteudo" className="flex flex-col gap-3 pt-4">
            <Tabs value={kind} onValueChange={(v) => setKind(v as ContentType)} variant="pill">
              <TabsList aria-label={t('Tipo de conteúdo')}>
                {kinds.map((k) => (
                  <TabsTrigger key={k.id} value={k.id}>
                    {t(k.label)}

                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ContentTable key={`${profile.id}-${kind}`} serverId={server.id} profileId={profile.id} type={kind} loaderless={loaderless} />
          </TabsContent>
          {hasPack && (
            <TabsContent value="pacote" className="pt-4">
              <PackMods key={profile.id} serverId={server.id} profileId={profile.id} />
            </TabsContent>
          )}
          <TabsContent value="capturas" className="pt-4">
            <Screenshots serverId={server.id} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="logs" className="pt-4">
            <Logs serverId={server.id} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="config" className="pt-4">
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <JavaCard key={profile.id} serverId={server.id} profileId={profile.id} />
              <ProfileManage serverId={server.id} profile={profile} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
