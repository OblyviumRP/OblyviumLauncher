import { toast } from 'sonner'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { accounts as mockAccounts, instances as mockInstances } from '@/data/mock'
import type { Account, Download, Instance, Notification } from '@/data/types'

// Estado simulado da nova interface. As ações aqui são o ponto de troca para o IPC
// real (helios-core/processbuilder) quando a UI for ligada ao Electron.

type LaunchState = 'idle' | 'preparing' | 'running' | 'crashed'

export type LogLine = { t: string; level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'; msg: string }

type Settings = {
  memoryGb: number
  javaArgs: string
  autoJava: boolean
  width: number
  height: number
  fullscreen: boolean
  autoConnect: boolean
  openConsole: boolean
  afterLaunch: 'minimize' | 'close' | 'keep' | 'tray'
  discordRpc: boolean
  notifications: boolean
  startup: boolean
  reduceMotion: boolean
  parallelDownloads: string
  preferredSource: 'Modrinth' | 'CurseForge'
  verifyHashes: boolean
  channel: 'stable' | 'beta'
  devMode: boolean
}

type State = {
  sidebarCollapsed: boolean
  instances: Instance[]
  selectedId: string
  accounts: Account[]
  activeAccountId: string
  skinByAccount: Record<string, string>
  skinModel: 'classic' | 'slim'
  cape: 'none' | 'oblyvium'
  downloads: Download[]
  bandwidth: string
  notifications: Notification[]
  launch: { state: LaunchState; instanceId: string | null; progress: number; startedAt: number | null }
  logs: LogLine[]
  settings: Settings
  onboarded: boolean

  toggleSidebar: () => void
  select: (id: string) => void
  setActiveAccount: (id: string) => void
  applySkin: (skinId: string) => void
  setSkinModel: (m: 'classic' | 'slim') => void
  setCape: (c: 'none' | 'oblyvium') => void
  enqueue: (d: Omit<Download, 'progress' | 'status'>) => void
  pauseAll: () => void
  resumeAll: () => void
  togglePause: (id: string) => void
  cancel: (id: string) => void
  retry: (id: string) => void
  clearHistory: () => void
  setBandwidth: (b: string) => void
  notify: (n: Omit<Notification, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
  clearNotifications: () => void
  startLaunch: (instanceId: string) => void
  stopLaunch: () => void
  simulateCrash: () => void
  tick: () => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setOnboarded: (v: boolean) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toLocaleTimeString('pt-BR', { hour12: false })

const bootLog = (i: Instance, account: string): LogLine[] => [
  { t: now(), level: 'INFO', msg: `Iniciando Minecraft ${i.mcVersion}${i.loader === 'Vanilla' ? '' : ` com ${i.loader} ${i.loaderVersion ?? ''}`}` },
  { t: now(), level: 'INFO', msg: `Java 21 (Temurin) · -Xmx${i.memoryGb}G -XX:+UseG1GC` },
  { t: now(), level: 'INFO', msg: `Encontrados ${i.mods} mods` },
  { t: now(), level: 'DEBUG', msg: 'Carregando configs de config/*.toml' },
  { t: now(), level: 'WARN', msg: "Mod 'ponder' recomenda 'flywheel' >= 1.0.1" },
  { t: now(), level: 'INFO', msg: 'Recarregando ResourceManager' },
  { t: now(), level: 'INFO', msg: 'OpenGL 4.6 · GPU dedicada' },
  { t: now(), level: 'INFO', msg: `Autenticado como ${account}` },
  ...(i.server ? [{ t: now(), level: 'INFO' as const, msg: `Conectando a ${i.server.address}:25565` }] : []),
  { t: now(), level: 'INFO', msg: 'Jogo aberto' },
]

export const useLauncher = create<State>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      instances: mockInstances,
      selectedId: mockInstances[0].id,
      accounts: mockAccounts,
      activeAccountId: mockAccounts[0].id,
      skinByAccount: { 'acc-main': 's-knight', 'acc-alt': 'd-steve', 'acc-off': 'd-alex' },
      skinModel: 'classic',
      cape: 'oblyvium',
      downloads: [
        { id: 'dl-java', name: 'Java 21 (Temurin)', detail: 'Runtime para Minecraft 1.20.5+', sizeMb: 190, progress: 34, status: 'active', scene: 'frost' },
        { id: 'dl-atm', name: 'All the Mods 10 · v2.33', detail: 'Atualização de modpack', sizeMb: 212, progress: 0, status: 'queued', scene: 'dusk' },
        { id: 'dl-ok', name: 'Oblyvium RP · arquivos verificados', detail: 'Nenhum arquivo corrompido', sizeMb: 0, progress: 100, status: 'done', scene: 'arcane', finishedAt: Date.now() - 7_200_000 },
        { id: 'dl-err', name: 'BSL Shaders v8.4', detail: 'Falhou: hash não confere', sizeMb: 3, progress: 62, status: 'error', scene: 'ember', finishedAt: Date.now() - 86_400_000 * 3 },
      ],
      bandwidth: '0',
      notifications: [
        { id: 'n1', title: 'Atualização disponível', body: 'Create: Engenharia v1.9 está pronta para instalar.', tone: 'warning', at: Date.now() - 3_600_000, read: false, href: '/instancia/create-eng' },
        { id: 'n2', title: 'Arquivos verificados', body: 'Oblyvium RP está pronto para jogar.', tone: 'success', at: Date.now() - 7_200_000, read: true },
      ],
      launch: { state: 'idle', instanceId: null, progress: 0, startedAt: null },
      logs: [],
      settings: {
        memoryGb: 8,
        javaArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50',
        autoJava: true,
        width: 1600,
        height: 900,
        fullscreen: false,
        autoConnect: false,
        openConsole: false,
        afterLaunch: 'minimize',
        discordRpc: true,
        notifications: true,
        startup: false,
        reduceMotion: false,
        parallelDownloads: '8',
        preferredSource: 'Modrinth',
        verifyHashes: true,
        channel: 'stable',
        devMode: false,
      },
      onboarded: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      select: (id) => set({ selectedId: id }),
      setActiveAccount: (id) => {
        const acc = get().accounts.find((a) => a.id === id)
        set({ activeAccountId: id })
        if (acc?.expired) toast.warning(`Sessão de ${acc.name} expirou`, { description: 'Entre de novo com a Microsoft para jogar online.' })
        else if (acc) toast(`Conta trocada para ${acc.name}`)
      },
      applySkin: (skinId) => set((s) => ({ skinByAccount: { ...s.skinByAccount, [s.activeAccountId]: skinId } })),
      setSkinModel: (m) => set({ skinModel: m }),
      setCape: (c) => set({ cape: c }),

      enqueue: (d) => {
        const hasActive = get().downloads.some((x) => x.status === 'active')
        set((s) => ({ downloads: [...s.downloads, { ...d, progress: 0, status: hasActive ? 'queued' : 'active' }] }))
        toast(`${d.name} adicionado aos downloads`, { description: hasActive ? 'Na fila' : 'Baixando agora' })
      },
      pauseAll: () => set((s) => ({ downloads: s.downloads.map((d) => (d.status === 'active' ? { ...d, status: 'paused' } : d)) })),
      resumeAll: () => set((s) => ({ downloads: s.downloads.map((d) => (d.status === 'paused' ? { ...d, status: 'active' } : d)) })),
      togglePause: (id) =>
        set((s) => ({
          downloads: s.downloads.map((d) => (d.id !== id ? d : d.status === 'active' ? { ...d, status: 'paused' } : d.status === 'paused' ? { ...d, status: 'active' } : d)),
        })),
      cancel: (id) => {
        const d = get().downloads.find((x) => x.id === id)
        set((s) => ({ downloads: s.downloads.filter((x) => x.id !== id) }))
        if (d) toast(`${d.name} cancelado`)
      },
      retry: (id) => set((s) => ({ downloads: s.downloads.map((d) => (d.id === id ? { ...d, status: 'active', progress: 0, detail: 'Tentando de novo' } : d)) })),
      clearHistory: () => set((s) => ({ downloads: s.downloads.filter((d) => d.status !== 'done' && d.status !== 'error') })),
      setBandwidth: (b) => set({ bandwidth: b }),

      notify: (n) => set((s) => ({ notifications: [{ ...n, id: uid(), at: Date.now(), read: false }, ...s.notifications].slice(0, 30) })),
      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),

      startLaunch: (instanceId) => {
        const s = get()
        if (s.launch.state === 'preparing' || s.launch.state === 'running') return
        set({ launch: { state: 'preparing', instanceId, progress: 0, startedAt: null }, logs: [] })
      },
      stopLaunch: () => {
        const s = get()
        const inst = s.instances.find((i) => i.id === s.launch.instanceId)
        set({ launch: { state: 'idle', instanceId: null, progress: 0, startedAt: null } })
        if (inst && s.launch.state === 'running') toast(`${inst.name} encerrado`)
      },
      simulateCrash: () => {
        const s = get()
        if (s.launch.state !== 'running') return
        set({
          launch: { ...s.launch, state: 'crashed' },
          logs: [
            ...s.logs,
            { t: now(), level: 'ERROR', msg: 'java.lang.NoSuchMethodError: flywheel.api.Material.get()' },
            { t: now(), level: 'ERROR', msg: '  at com.simibubi.create.content.kinetics…' },
            { t: now(), level: 'INFO', msg: 'Processo encerrado com código 1' },
          ],
        })
        toast.error('O jogo fechou inesperadamente', { description: 'Veja a causa provável no console.' })
        get().notify({ title: 'O jogo fechou (código 1)', body: "Causa provável: 'flywheel' desatualizado.", tone: 'danger', href: '/console' })
      },

      tick: () => {
        const s = get()
        const speedCap = Number(s.bandwidth) || 0
        const step = speedCap ? Math.min(2.2, speedCap / 4) : 2.2
        let downloads = s.downloads
        const finished: Download[] = []
        if (downloads.some((d) => d.status === 'active')) {
          downloads = downloads.map((d) => {
            if (d.status !== 'active') return d
            const progress = Math.min(100, d.progress + step + Math.random() * 1.5)
            if (progress >= 100) {
              const done = { ...d, progress: 100, status: 'done' as const, finishedAt: Date.now() }
              finished.push(done)
              return done
            }
            return { ...d, progress }
          })
          if (!downloads.some((d) => d.status === 'active')) {
            const next = downloads.findIndex((d) => d.status === 'queued')
            if (next >= 0) downloads = downloads.map((d, i) => (i === next ? { ...d, status: 'active' } : d))
          }
        }

        let { launch, logs, instances } = s
        if (launch.state === 'preparing') {
          const progress = Math.min(100, launch.progress + 4 + Math.random() * 4)
          if (progress >= 100) {
            const inst = instances.find((i) => i.id === launch.instanceId)!
            const acc = s.accounts.find((a) => a.id === s.activeAccountId)!
            launch = { state: 'running', instanceId: launch.instanceId, progress: 100, startedAt: Date.now() }
            logs = bootLog(inst, acc.name)
            instances = instances.map((i) => (i.id === inst.id ? { ...i, lastPlayed: 'agora' } : i))
            toast.success(`${inst.name} aberto`, { description: s.settings.afterLaunch === 'minimize' ? 'O launcher vai minimizar.' : undefined })
          } else {
            launch = { ...launch, progress }
          }
        }

        for (const d of finished) {
          if (d.onDone === 'install-instance' && d.payload) {
            const payload = d.payload
            instances = instances.some((i) => i.id === payload.id) ? instances : [...instances, payload]
            toast.success(`${payload.name} instalado`, { description: 'Já está na sua biblioteca.' })
            get().notify({ title: `${payload.name} instalado`, body: `${payload.mods} mods · ${payload.loader} ${payload.mcVersion}`, tone: 'success', href: `/instancia/${payload.id}` })
          } else {
            toast.success(`${d.name} concluído`)
            get().notify({ title: `${d.name} concluído`, body: d.detail, tone: 'success', href: '/downloads' })
          }
        }

        if (downloads !== s.downloads || launch !== s.launch) set({ downloads, launch, logs, instances })
      },

      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      setOnboarded: (v) => set({ onboarded: v }),
    }),
    {
      name: 'oblyvium-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        settings: s.settings,
        activeAccountId: s.activeAccountId,
        skinByAccount: s.skinByAccount,
        skinModel: s.skinModel,
        cape: s.cape,
        selectedId: s.selectedId,
        onboarded: s.onboarded,
      }),
    },
  ),
)

export const useSelectedInstance = () => useLauncher((s) => s.instances.find((i) => i.id === s.selectedId) ?? s.instances[0])
export const useActiveAccount = () => useLauncher((s) => s.accounts.find((a) => a.id === s.activeAccountId) ?? s.accounts[0])
