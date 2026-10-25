import { toast } from 'sonner'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { t } from '@/i18n'
import { backend, UserError, type AccountInfo, type FeedItem, type LogLine, type ProfileInfo, type ServerInfo } from '@/backend'

// Estado da interface. Tudo que é do launcher (servidores, perfis, contas, config)
// mora no backend; aqui fica o espelho para a tela e o que só a UI precisa.

export type LaunchState = 'idle' | 'preparing' | 'running' | 'crashed'

export type Task = {
  id: string
  title: string
  detail: string
  progress: number | null
  status: 'active' | 'done' | 'error'
  kind: 'game' | 'java' | 'content' | 'update'
  startedAt: number
  finishedAt?: number
}

export type Notice = {
  id: string
  title: string
  body: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
  at: number
  read: boolean
  href?: string
  link?: { url: string; label: string } | null
  image?: string | null
  feedId?: string
}

export type Ask = { title: string; body: string; confirm: string; cancel?: string; tone?: 'danger'; resolve: (ok: boolean) => void }

type Update =
  | { state: 'idle' | 'checking' | 'none' }
  | { state: 'available'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

type State = {
  sidebarCollapsed: boolean
  boot: { phase: 'booting' | 'ready' | 'error'; message?: string; firstLaunch?: boolean }
  servers: ServerInfo[]
  serverId: string | null
  profiles: ProfileInfo[]
  profileId: string
  accounts: AccountInfo[]
  accountId: string | null
  launch: { state: LaunchState; status: string; progress: number | null; serverId: string | null; profileId: string | null; startedAt: number | null; crashReport: string | null; code: number | null }
  logs: LogLine[]
  tasks: Task[]
  notifications: Notice[]
  update: Update
  contentRev: number
  ask: Ask | null
  windowMaximized: boolean

  toggleSidebar: () => void
  start: () => Promise<void>
  refreshServers: () => void
  refreshProfiles: () => void
  refreshAccounts: () => void
  selectServer: (id: string) => void
  selectProfile: (id: string) => void
  selectAccount: (id: string) => Promise<void>
  bumpContent: () => void
  launchGame: () => Promise<void>
  stopGame: () => void
  verifyFiles: () => Promise<void>
  addTask: (t: Omit<Task, 'id' | 'startedAt' | 'status'> & { id?: string }) => string
  patchTask: (id: string, p: Partial<Task>) => void
  clearTasks: () => void
  notify: (n: Omit<Notice, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
  clearNotifications: () => void
  confirm: (o: Omit<Ask, 'resolve'>) => Promise<boolean>
  closeAsk: (ok: boolean) => void
  showError: (err: unknown, fallbackTitle?: string) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)
const MAX_LOGS = 5000

function clock() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false })
}

// Linhas do log4j: "[12:00:00] [Render thread/WARN]: ..." ou "[main/INFO]: ...".
const LEVEL = /\/(INFO|WARN|ERROR|DEBUG|FATAL)\]/
function toLogLine(stream: 'stdout' | 'stderr', line: string): LogLine {
  const m = LEVEL.exec(line)
  const level = m ? (m[1] === 'FATAL' ? 'ERROR' : (m[1] as LogLine['level'])) : stream === 'stderr' ? 'ERROR' : 'INFO'
  return { t: clock(), level, msg: line }
}

let feedTimer: number | null = null
let pendingLogs: LogLine[] = []
let logFlush: number | null = null

export const useLauncher = create<State>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      boot: { phase: 'booting' },
      servers: [],
      serverId: null,
      profiles: [],
      profileId: 'padrao',
      accounts: [],
      accountId: null,
      launch: { state: 'idle', status: '', progress: null, serverId: null, profileId: null, startedAt: null, crashReport: null, code: null },
      logs: [],
      tasks: [],
      notifications: [],
      update: { state: 'idle' },
      contentRev: 0,
      ask: null,
      windowMaximized: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      start: async () => {
        if (get().boot.phase === 'ready') return
        const b = backend()
        let res
        try {
          res = await b.boot()
        } catch {
          res = { ok: false as const, message: 'O launcher não conseguiu iniciar. Feche e abra de novo.' }
        }
        if (!res.ok) {
          set({ boot: { phase: 'error', message: res.message } })
          return
        }
        get().refreshServers()
        get().refreshAccounts()
        set({ boot: { phase: 'ready', firstLaunch: res.firstLaunch } })

        b.onWindowMaximized((maximized) => set({ windowMaximized: maximized }))
        b.onUpdate((e) => {

          if (e.kind === 'checking') set({ update: { state: 'checking' } })
          else if (e.kind === 'none') set({ update: { state: 'none' } })
          else if (e.kind === 'available') {
            set({ update: { state: 'available', version: e.version, percent: 0 } })
            get().addTask({ id: 'launcher-update', title: `Launcher ${e.version}`, detail: t('Baixando atualização'), progress: 0, kind: 'update' })
          } else if (e.kind === 'progress') {
            const u = get().update
            if (u.state === 'available') set({ update: { ...u, percent: e.percent } })
            get().patchTask('launcher-update', { progress: e.percent })
          } else if (e.kind === 'ready') {
            set({ update: { state: 'ready', version: e.version } })
            get().patchTask('launcher-update', { status: 'done', progress: 100, detail: t('Pronta para instalar'), finishedAt: Date.now() })
            get().notify({ title: t('Atualização {v} pronta', { v: e.version }), body: t('Reinicie o launcher para instalar.'), tone: 'primary', href: '/configuracoes?aba=sobre' })
          } else if (e.kind === 'error') set({ update: { state: 'error', message: e.message } })
        })

        const poll = async () => {
          const items = await b.pollFeed()
          const known = new Set(get().notifications.map((n) => n.feedId).filter(Boolean))
          const fresh = items.filter((i) => !known.has(i.id))
          if (fresh.length) {
            set((s) => ({ notifications: [...fresh.map(fromFeed), ...s.notifications].slice(0, 40) }))
            const top = fresh[fresh.length - 1]
            toast(top.title, { description: top.body || undefined })
          }
        }
        void poll()
        if (feedTimer == null) feedTimer = window.setInterval(poll, 5 * 60 * 1000)
      },

      refreshServers: () => {
        const b = backend()
        const servers = b.servers()
        const serverId = b.selectedServerId() ?? servers[0]?.id ?? null
        set({ servers, serverId })
        get().refreshProfiles()
      },
      refreshProfiles: () => {
        const { serverId } = get()
        if (!serverId) return
        const b = backend()
        set({ profiles: b.profiles(serverId), profileId: b.selectedProfileId(serverId) })
      },
      refreshAccounts: () => {
        const b = backend()
        set({ accounts: b.accounts(), accountId: b.selectedAccountId() })
      },

      selectServer: (id) => {
        if (id === get().serverId) return
        if (isBusy(get().launch.state)) {
          toast.warning(t('Jogo aberto'), { description: t('Troque de servidor depois de fechar o jogo.') })
          return
        }
        try {
          backend().selectServer(id)
          set({ serverId: id })
          get().refreshProfiles()
        } catch (err) {
          get().showError(err)
        }
      },
      selectProfile: (id) => {
        const { serverId } = get()
        if (!serverId || id === get().profileId) return
        try {
          backend().selectProfile(serverId, id)
          set({ profileId: id })
        } catch (err) {
          get().showError(err)
        }
      },
      selectAccount: async (id) => {
        const b = backend()
        b.selectAccount(id)
        get().refreshAccounts()
        const acc = get().accounts.find((a) => a.id === id)
        const ok = await b.validateSelectedAccount()
        if (!ok) toast.warning(t('A sessão de {name} expirou', { name: acc?.name ?? '' }), { description: t('Entre de novo com a Microsoft para jogar.') })
        else if (acc) toast(t('Conta trocada para {name}', { name: acc.name }))
      },

      bumpContent: () => set((s) => ({ contentRev: s.contentRev + 1 })),

      launchGame: async () => {
        const s = get()
        if (isBusy(s.launch.state)) return
        if (!s.accountId) {
          toast.warning(t('Entre em uma conta'), { description: t('Adicione uma conta para jogar.') })
          return
        }
        const serv = s.servers.find((x) => x.id === s.serverId)
        const taskId = get().addTask({ title: t('{name} · arquivos do jogo', { name: serv?.name ?? '' }), detail: t('Preparando'), progress: null, kind: 'game' })
        set({
          launch: { state: 'preparing', status: t('Preparando…'), progress: null, serverId: s.serverId, profileId: s.profileId, startedAt: null, crashReport: null, code: null },
          logs: [],
        })
        let started = false
        let filesDone = false
        try {
          const ok = await backend().launch({
            onStatus: (text) => {
              set((st) => ({ launch: { ...st.launch, status: text } }))
              if (!filesDone) get().patchTask(taskId, { detail: text })
            },
            onProgress: ({ phase, percent }) => {
              set((st) => ({ launch: { ...st.launch, progress: percent } }))
              if (phase === 'java') get().patchTask(taskId, { title: 'Java', detail: t('Baixando Java'), progress: percent })
              else if (!filesDone) get().patchTask(taskId, { progress: percent })
            },
            onBlocked: (items) => {
              const names = items.map((i) => i.title).join(', ')
              toast.warning(t('Conteúdo bloqueado foi desativado'), { description: names })
              get().notify({ title: t('Conteúdo bloqueado pela staff'), body: t('Desativado neste perfil: {names}', { names }), tone: 'warning', href: '/perfil?aba=conteudo' })
            },
            onLog: ({ stream, line }) => {
              if (!filesDone) {
                filesDone = true
                get().patchTask(taskId, { status: 'done', progress: 100, detail: t('Arquivos verificados'), finishedAt: Date.now() })
              }
              pendingLogs.push(toLogLine(stream, line))
              if (logFlush == null) {
                logFlush = window.setTimeout(() => {
                  const add = pendingLogs
                  pendingLogs = []
                  logFlush = null
                  set((st) => ({ logs: [...st.logs, ...add].slice(-MAX_LOGS) }))
                }, 120)
              }
            },
            onStarted: () => {
              started = true
              set((st) => ({ launch: { ...st.launch, state: 'running', status: t('Jogando'), progress: null, startedAt: Date.now() } }))
              toast.success(t('{name} aberto', { name: serv?.name ?? 'Minecraft' }))
            },
            onExit: ({ code, started: wasStarted, crashReport }) => {
              const crashed = code !== 0 && code != null
              set((st) => ({
                launch: { ...st.launch, state: crashed ? 'crashed' : 'idle', status: '', progress: null, code, crashReport },
                logs: [...st.logs, { t: clock(), level: crashed ? 'ERROR' : 'INFO', msg: `Processo encerrado com código ${code ?? '?'}` }],
              }))
              if (crashed) {
                toast.error(wasStarted ? t('O jogo fechou inesperadamente') : t('O jogo não abriu'), { description: t('Veja os detalhes no console.') })
                get().notify({ title: t('O jogo fechou (código {code})', { code: code ?? '?' }), body: crashReport ? t('Um relatório de erro foi gerado.') : t('Veja o console para a causa.'), tone: 'danger', href: '/console' })
              }
            },
            askDownloadJava: ({ major }) =>
              get().confirm({
                title: t('Instalar Java {n}?', { n: major }),
                body: t('Este servidor precisa do Java {n}, que não foi encontrado no computador. O launcher pode baixar uma versão compatível (Temurin) agora.', { n: major }),
                confirm: t('Baixar Java'),
                cancel: t('Agora não'),
              }),
          })
          if (!ok) {
            get().patchTask(taskId, { status: 'error', detail: t('Cancelado'), finishedAt: Date.now() })
            set((st) => ({ launch: { ...st.launch, state: 'idle', status: '', progress: null } }))
          } else if (!started && get().launch.state === 'preparing') {
            set((st) => ({ launch: { ...st.launch, status: t('Abrindo o jogo…'), progress: null } }))
          }
        } catch (err) {
          get().patchTask(taskId, { status: 'error', detail: err instanceof UserError ? err.message : t('Falhou'), finishedAt: Date.now() })
          set((st) => ({ launch: { ...st.launch, state: 'idle', status: '', progress: null } }))
          get().showError(err, 'Não foi possível abrir o jogo')
        }
      },
      stopGame: () => backend().stop(),

      verifyFiles: async () => {
        if (isBusy(get().launch.state)) return
        const serv = get().servers.find((x) => x.id === get().serverId)
        const taskId = get().addTask({ title: t('{name} · verificação', { name: serv?.name ?? '' }), detail: t('Verificando arquivos'), progress: null, kind: 'game' })
        try {
          await backend().verifyFiles({
            onStatus: (text) => get().patchTask(taskId, { detail: text }),
            onProgress: ({ percent }) => get().patchTask(taskId, { progress: percent }),
          })
          get().patchTask(taskId, { status: 'done', progress: 100, detail: t('Arquivos verificados'), finishedAt: Date.now() })
          toast.success(t('Arquivos verificados'), { description: t('Tudo pronto para jogar.') })
        } catch (err) {
          get().patchTask(taskId, { status: 'error', detail: t('Falhou'), finishedAt: Date.now() })
          get().showError(err, 'Não foi possível verificar os arquivos')
        }
      },

      addTask: (task) => {
        const id = task.id ?? uid()
        set((s) => ({ tasks: [{ ...task, id, status: 'active' as const, startedAt: Date.now() }, ...s.tasks.filter((x) => x.id !== id)].slice(0, 50) }))
        return id
      },
      patchTask: (id, p) => set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      clearTasks: () => set((s) => ({ tasks: s.tasks.filter((x) => x.status === 'active') })),

      notify: (n) => set((s) => ({ notifications: [{ ...n, id: uid(), at: Date.now(), read: false }, ...s.notifications].slice(0, 40) })),
      markAllRead: () => {
        const ids = get()
          .notifications.filter((n) => !n.read && n.feedId)
          .map((n) => n.feedId!)
        if (ids.length) backend().markFeedSeen(ids)
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
      },
      clearNotifications: () => {
        get().markAllRead()
        set({ notifications: [] })
      },

      confirm: (o) =>
        new Promise<boolean>((resolve) => {
          get().ask?.resolve(false)
          set({ ask: { ...o, resolve } })
        }),
      closeAsk: (ok) => {
        get().ask?.resolve(ok)
        set({ ask: null })
      },
      showError: (err, fallbackTitle = 'Algo deu errado') => {
        if (err instanceof UserError) toast.error(err.title, { description: err.message })
        else {
          console.error(err)
          toast.error(t(fallbackTitle), { description: t('Veja o console (Ctrl+Shift+I) para detalhes.') })

        }
      },
    }),
    {
      name: 'oblyvium-ui',
      version: 2,
      migrate: () => ({ sidebarCollapsed: false }),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
)

function fromFeed(i: FeedItem): Notice {
  const tone = i.type === 'maintenance' ? 'warning' : i.type === 'event' ? 'success' : 'primary'
  return { id: uid(), feedId: i.id, title: i.title, body: i.body, tone, at: i.startsAtMs, read: false, link: i.link, image: i.image }
}

export function isBusy(state: LaunchState) {
  return state === 'preparing' || state === 'running'
}

export const useServer = () => useLauncher((s) => s.servers.find((x) => x.id === s.serverId) ?? null)
export const useProfile = () => useLauncher((s) => s.profiles.find((p) => p.id === s.profileId) ?? s.profiles[0] ?? null)
export const useAccount = () => useLauncher((s) => s.accounts.find((a) => a.id === s.accountId) ?? null)
