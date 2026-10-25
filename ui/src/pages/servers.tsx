import { Check, Plus, RefreshCw, Settings2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { backend, type ServerInfo } from '@/backend'
import { Page, PageHeader } from '@/components/shared/page'
import { ProfileIcon } from '@/components/shared/profile-icon'
import { hasRealArt, ServerArt, ServerIcon } from '@/components/shared/server-art'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent } from '@/components/ui/dialog'
import { useAsync } from '@/lib/use-async'
import { cn, formatDate } from '@/lib/utils'
import { isBusy, useLauncher } from '@/store/launcher'
import { ProfileEditor } from './profile'

function Players({ server }: { server: ServerInfo }) {
  const { data, loading } = useAsync(() => backend().serverStatus(server.id), [server.id])
  if (!server.address) return null
  if (loading) return <span className="font-mono text-2xs text-muted-2">consultando…</span>
  if (!data) return <span className="flex items-center gap-1.5 font-mono text-2xs text-muted-2"><span className="size-2 rounded-full bg-muted-2" aria-hidden />offline</span>
  return (
    <span className="flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
      <span className="size-2 rounded-full bg-success-fg" aria-hidden />
      {data.online}/{data.max} online
    </span>
  )
}

function ServerCard({ server, selected, locked, onSelect }: { server: ServerInfo; selected: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <motion.article
      layout
      whileHover={{ y: -3 }}
      className={cn('group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors', selected ? 'border-primary-line' : 'border-border hover:border-border-2')}
    >
      <div className="relative h-32 overflow-hidden">
        <ServerArt server={server} cols={64} rows={28} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
        <span className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
          <Badge className="bg-overlay">{server.loader === 'Vanilla' ? 'Vanilla' : server.loader} {server.mcVersion}</Badge>
          {selected && (
            <Badge tone="primary" className="bg-overlay">
              <Check /> selecionado
            </Badge>
          )}
        </span>
        {!hasRealArt(server) && <span className="sr-only">Arte gerada, não é uma captura do servidor</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2.5">
          <ServerIcon server={server} className="size-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="truncate text-base font-semibold">{server.name}</h2>
            <Players server={server} />
          </div>
          {server.main && <Badge tone="primary">principal</Badge>}
        </div>
        {server.description && <p className="line-clamp-2 text-sm text-muted-foreground">{server.description}</p>}
        <div className="mt-auto flex items-center gap-2">
          <span className="font-mono text-2xs text-muted-2">
            {server.packModCount} mods no pacote{server.version ? ` · v${server.version}` : ''}
          </span>
          <div className="flex-1" />
          <Button variant={selected ? 'soft' : 'secondary'} size="sm" disabled={selected || locked} onClick={onSelect}>
            {selected ? 'Em uso' : 'Selecionar'}
          </Button>
        </div>
      </div>
    </motion.article>
  )
}

export function ServersPage() {
  const servers = useLauncher((s) => s.servers)
  const serverId = useLauncher((s) => s.serverId)
  const profiles = useLauncher((s) => s.profiles)
  const profileId = useLauncher((s) => s.profileId)
  const selectServer = useLauncher((s) => s.selectServer)
  const selectProfile = useLauncher((s) => s.selectProfile)
  const refreshServers = useLauncher((s) => s.refreshServers)
  const refreshProfiles = useLauncher((s) => s.refreshProfiles)
  const showError = useLauncher((s) => s.showError)
  const locked = useLauncher((s) => isBusy(s.launch.state))
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const server = servers.find((s) => s.id === serverId)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await backend().refreshDistribution()
      refreshServers()
      toast.success('Lista de servidores atualizada')
    } catch (err) {
      showError(err, 'Não foi possível atualizar a lista')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Servidores"
        description="Os servidores vêm da staff. Cada um pode ter vários perfis, com mundos, mods extras e configurações separados."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} /> Atualizar lista
          </Button>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {servers.map((s) => (
          <ServerCard key={s.id} server={s} selected={s.id === serverId} locked={locked} onSelect={() => selectServer(s.id)} />
        ))}
      </div>

      {server && (
        <section aria-labelledby="perfis" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="perfis" className="text-lg font-semibold">
                Perfis de {server.name}
              </h2>
              <p className="text-sm text-muted-foreground">O perfil selecionado é o que abre no Jogar.</p>
            </div>
            <Button onClick={() => setCreating(true)} disabled={locked}>
              <Plus /> Novo perfil
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {profiles.map((p) => {
              const on = p.id === profileId
              return (
                <motion.div
                  key={p.id}
                  layout
                  className={cn('flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors', on ? 'border-primary-line bg-primary-soft/40' : 'border-border hover:border-border-2')}
                >
                  <button
                    type="button"
                    onClick={() => selectProfile(p.id)}
                    disabled={locked && !on}
                    aria-pressed={on}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-not-allowed"
                  >
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-md border', on ? 'border-primary-line text-primary-light' : 'border-border text-muted-foreground')}>
                      <ProfileIcon name={p.icon} className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="truncate font-mono text-2xs text-muted-2">{p.isDefault ? 'padrão' : p.created ? `criado em ${formatDate(p.created)}` : ''}</span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Gerenciar ${p.name}`}
                    onClick={() => {
                      selectProfile(p.id)
                      navigate('/perfil')
                    }}
                    disabled={locked && !on}
                  >
                    <Settings2 />
                  </Button>
                </motion.div>
              )
            })}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> A conta e a skin são as mesmas em todos os perfis. <Link to="/perfil" className="text-primary-light hover:underline">Abrir perfil atual</Link>
          </p>
        </section>
      )}

      <DialogPrimitive.Root open={creating} onOpenChange={setCreating}>
        {creating && server && (
          <DialogContent title="Novo perfil" description={`Um perfil novo de ${server.name}, com pasta própria.`}>
            <ProfileEditor
              serverId={server.id}
              profile={null}
              onDone={(p) => {
                setCreating(false)
                if (p) {
                  refreshProfiles()
                  selectProfile(p.id)
                  toast.success(`Perfil ${p.name} criado`)
                }
              }}
            />
          </DialogContent>
        )}
      </DialogPrimitive.Root>
    </Page>
  )
}
