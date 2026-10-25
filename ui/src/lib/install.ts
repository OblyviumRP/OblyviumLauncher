import { toast } from 'sonner'
import { create } from 'zustand'
import { backend, UserError } from '@/backend'
import { useLauncher } from '@/store/launcher'

// Instalações do Modrinth em andamento e as concluídas nesta sessão (por perfil).
const useInstalls = create<{ running: Record<string, true>; done: Record<string, true> }>(() => ({ running: {}, done: {} }))

function key(projectId: string) {
  const s = useLauncher.getState()
  return `${s.serverId}|${s.profileId}|${projectId}`
}

export async function installProject(projectId: string, title: string) {
  const k = key(projectId)
  if (useInstalls.getState().running[k]) return
  const store = useLauncher.getState()
  const profile = store.profiles.find((p) => p.id === store.profileId)
  useInstalls.setState((s) => ({ running: { ...s.running, [k]: true } }))
  const taskId = store.addTask({ title, detail: `Instalando no perfil ${profile?.name ?? ''}`, progress: null, kind: 'content' })
  try {
    await backend().install(projectId)
    useInstalls.setState((s) => ({ done: { ...s.done, [k]: true } }))
    store.patchTask(taskId, { status: 'done', progress: 100, detail: `Instalado no perfil ${profile?.name ?? ''}`, finishedAt: Date.now() })
    store.bumpContent()
    toast.success(`${title} instalado`, { description: `No perfil ${profile?.name ?? ''}. Dependências entram junto.` })
  } catch (err) {
    store.patchTask(taskId, { status: 'error', detail: err instanceof UserError ? err.message : 'Falhou', finishedAt: Date.now() })
    store.showError(err, 'Não foi possível instalar')
  } finally {
    useInstalls.setState((s) => {
      const running = { ...s.running }
      delete running[k]
      return { running }
    })
  }
}

export function useInstallState(projectId: string, installedFromApi: boolean) {
  const k = useLauncher((s) => `${s.serverId}|${s.profileId}|${projectId}`)
  const running = useInstalls((s) => Boolean(s.running[k]))
  const done = useInstalls((s) => Boolean(s.done[k]))
  return running ? 'installing' : installedFromApi || done ? 'installed' : 'none'
}
