// Implementação simulada do Backend: roda no navegador (npm run ui:dev) sem Electron.
// Os dados ficam só em memória e servem para desenvolver e revisar a interface.
import {
  UserError,
  type AccountInfo,
  type Backend,
  type GameSettings,
  type LaunchHandlers,
  type LauncherSettings,
  type LibrarySkin,
  type PackMod,
  type ProfileInfo,
  type ProfileSettings,
  type ServerInfo,
  type SkinProfile,
} from './types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const uid = () => Math.random().toString(16).slice(2, 10)

const servers: ServerInfo[] = [
  {
    id: 'oblyvium-rp',
    name: 'Oblyvium RP',
    description: 'Servidor de roleplay medieval com magia, guildas e economia própria.',
    mcVersion: '1.20.1',
    version: '3.4.0',
    loader: 'Forge',
    icon: null,
    background: null,
    address: 'jogar.oblyvium.com.br',
    main: true,
    scene: 'arcane',
    packModCount: 6,
    group: 'OpenGL',
  },
  {
    id: 'oblyvium-rp-vulkan',
    name: 'Oblyvium RP (Vulkan)',
    description: 'O mesmo servidor com o renderizador Vulkan, para placas de vídeo mais novas.',
    mcVersion: '1.20.1',
    version: '3.4.0',
    loader: 'Forge',
    icon: null,
    background: null,
    address: 'jogar.oblyvium.com.br',
    main: false,
    scene: 'tide',
    packModCount: 7,
    group: 'Vulkan',
  },
  {
    id: 'oblyvium-eventos',
    name: 'Eventos',
    description: 'Mapas de evento e minigames da staff.',
    mcVersion: '1.21.1',
    version: '1.2.0',
    loader: 'Fabric',
    icon: null,
    background: null,
    address: 'eventos.oblyvium.com.br',
    main: false,
    scene: 'ember',
    packModCount: 2,
    group: 'OpenGL',
  },
]

const profiles: Record<string, ProfileInfo[]> = {
  'oblyvium-rp': [
    { id: 'padrao', name: 'Padrão', icon: 'espada', created: null, isDefault: true },
    { id: 'a1b2c3d4', name: 'Shaders', icon: 'coroa', created: '2026-09-02T12:00:00Z', isDefault: false },
  ],
  'oblyvium-eventos': [{ id: 'padrao', name: 'Padrão', icon: 'espada', created: null, isDefault: true }],
  'oblyvium-rp-vulkan': [{ id: 'padrao', name: 'Padrão', icon: 'espada', created: null, isDefault: true }],
}
const selectedProfile: Record<string, string> = { 'oblyvium-rp': 'padrao', 'oblyvium-eventos': 'padrao', 'oblyvium-rp-vulkan': 'padrao' }
let selectedServer = 'oblyvium-rp'

let accounts: AccountInfo[] = []
let selectedAccount: string | null = null

const settings: LauncherSettings = {
  discordPresence: true,
  allowPrerelease: false,
  autoConnect: true,
  launcherOnPlay: 'tray',
  dataDirectory: '~/.oblyviumlauncher',
}
const game: GameSettings = { maxRamGB: 6, ramMinGB: 3, ramMaxGB: 12, ramRecommendedGB: 6, systemRamGB: 16, width: 1280, height: 720, fullscreen: false }
const profileSettings: Record<string, ProfileSettings> = {}
function ps(key: string): ProfileSettings {
  profileSettings[key] ??= { javaPath: null, javaSupported: '>=17.x' }
  return profileSettings[key]
}
let lang: string | null = null
try {
  lang = localStorage.getItem('oblyvium-lang')
} catch {
  // Sem localStorage: segue o idioma do navegador.
}

const packMods: Record<string, PackMod[]> = {}
function pack(key: string): PackMod[] {
  packMods[key] ??= [
    { id: 'jei', path: ['jei'], name: 'Just Enough Items', version: '15.2.0', required: true, enabled: true, available: true, children: [] },
    { id: 'jm', path: ['jm'], name: 'JourneyMap', version: '5.9.8', required: false, enabled: true, available: true, children: [] },
    {
      id: 'emotes',
      path: ['emotes'],
      name: 'Emotecraft',
      version: '2.2.7',
      required: false,
      enabled: false,
      available: true,
      children: [{ id: 'emotes-extra', path: ['emotes', 'emotes-extra'], name: 'Pacote de emotes extra', version: '1.0', required: false, enabled: true, available: true, children: [] }],
    },
  ]
  return packMods[key]
}

let skin: SkinProfile = { skin: null, capes: [{ id: 'c1', alias: 'Migrator', url: '', active: false }] }
const library: LibrarySkin[] = []

let running: { stop: () => void } | null = null
let maximized = false
const maximizedListeners: ((maximized: boolean) => void)[] = []

function key(serverId: string, profileId: string) {
  return profileId === 'padrao' ? serverId : `${serverId}@${profileId}`
}

export function createMockBackend(): Backend {
  return {
    kind: 'mock',
    appVersion: '3.0.0',
    isDev: true,

    async boot() {
      await wait(400)
      return { ok: true, firstLaunch: accounts.length === 0 }
    },
    async refreshDistribution() {
      await wait(300)
    },

    servers: () => servers,
    selectedServerId: () => selectedServer,
    selectServer(id) {
      selectedServer = id
    },
    profiles: (serverId) => profiles[serverId] ?? [],
    selectedProfileId: (serverId) => selectedProfile[serverId] ?? 'padrao',
    selectProfile(serverId, profileId) {
      if (running) throw new UserError('Jogo aberto', 'Troque de perfil depois de fechar o jogo.')
      selectedProfile[serverId] = profileId
    },
    updateProfile(serverId, profileId, o) {
      const p = profiles[serverId].find((x) => x.id === profileId)
      if (p) Object.assign(p, o)
    },
    async removeProfile(serverId, profileId) {
      profiles[serverId] = profiles[serverId].filter((p) => p.id !== profileId)
      if (selectedProfile[serverId] === profileId) selectedProfile[serverId] = 'padrao'
    },
    profileIcons: () =>
      ['espada', 'escudo', 'machado', 'arco', 'picareta', 'livro', 'pocao', 'coroa'].map((name) => ({
        name,
        label: name,
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="7"/></svg>`,
      })),
    validateProfileName: (name) => (name.trim().length >= 1 && name.trim().length <= 32 ? null : 'Use de 1 a 32 caracteres.'),

    accounts: () => accounts,
    selectedAccountId: () => selectedAccount,
    selectAccount(id) {
      selectedAccount = id
    },
    validateSelectedAccount: async () => true,
    async loginMicrosoft() {
      await wait(900)
      const a: AccountInfo = { id: uid(), name: 'Aventureira', kind: 'microsoft' }
      accounts = [...accounts, a]
      selectedAccount = a.id
      return a
    },
    async loginOffline(name) {
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) throw new UserError('Nome inválido', 'Use de 3 a 16 letras, números ou _.')
      const a: AccountInfo = { id: uid(), name, kind: 'offline' }
      accounts = [...accounts, a]
      selectedAccount = a.id
      return a
    },
    async logout(id) {
      accounts = accounts.filter((a) => a.id !== id)
      if (selectedAccount === id) selectedAccount = accounts[0]?.id ?? null
      return true
    },

    async launch(h: LaunchHandlers) {
      if (running) return false
      if (selectedAccount == null) throw new UserError('Não foi possível abrir o jogo', 'Entre em uma conta antes de jogar.')
      let stopped = false
      running = { stop: () => (stopped = true) }
      h.onStatus('Verificando arquivos…')
      for (let p = 0; p <= 100; p += 10) {
        await wait(120)
        h.onProgress({ phase: p < 50 ? 'verify' : 'download', percent: p })
      }
      h.onStatus('Abrindo o jogo…')
      const lines = ['[main/INFO]: Loading Minecraft 1.20.1 with Forge 47.3.0', '[main/WARN]: Mod emotecraft recomenda playeranimator', '[Render thread/INFO]: Setting user: Aventureira', '[Render thread/INFO]: Sound engine started']
      for (const line of lines) {
        await wait(150)
        h.onLog({ stream: 'stdout', line })
      }
      h.onStarted()
      void (async () => {
        while (!stopped) {
          await wait(1500)
          if (!stopped) h.onLog({ stream: 'stdout', line: `[Server thread/INFO]: Autosave ${new Date().toLocaleTimeString('pt-BR')}` })
        }
        running = null
        h.onExit({ code: 0, started: true, crashReport: null })
      })()
      return true
    },
    stop() {
      running?.stop()
    },
    async verifyFiles(h) {
      h.onStatus('Verificando arquivos…')
      for (let p = 0; p <= 100; p += 20) {
        await wait(150)
        h.onProgress({ phase: 'verify', percent: p })
      }
      return true
    },

    packMods: (serverId, profileId) => pack(key(serverId, profileId)),
    setPackModEnabled(serverId, profileId, path, enabled) {
      let list = pack(key(serverId, profileId))
      for (let i = 0; i < path.length; i++) {
        const m = list.find((x) => x.id === path[i])
        if (!m) return
        if (i === path.length - 1) m.enabled = enabled
        list = m.children
      }
    },
    screenshots: async () => [],
    latestLog: async () => '[12:00:00] [main/INFO]: Nenhum log real no modo de desenvolvimento.',
    openGameFolder() {},

    launcherSettings: () => ({ ...settings }),
    setLauncherSetting(k, v) {
      settings[k] = v
    },
    profileSettings: (serverId, profileId) => ({ ...ps(key(serverId, profileId)) }),
    gameSettings: () => ({ ...game }),
    setGameSetting(k, v) {
      Object.assign(game, { [k]: v })
    },
    language: () => lang,
    setLanguage(l) {
      lang = l
      try {
        localStorage.setItem('oblyvium-lang', l)
      } catch {
        // Ignora: o idioma vale só nesta sessão.
      }
    },
    setProfileSetting(serverId, profileId, _k, v) {
      ps(key(serverId, profileId)).javaPath = v
    },
    detectJava: async () => '/usr/lib/jvm/temurin-17/bin/java',
    chooseJava: async () => null,
    openDataFolder() {},

    serverStatus: async (id) => (id.startsWith('oblyvium-rp') ? { online: 87, max: 200, pingMs: 24 } : null),
    news: async () => [
      { title: 'Temporada 4: As Ruínas de Vel’Thar', link: 'https://oblyvium.com.br', date: '2026-10-20T18:00:00Z', author: 'Staff', summary: 'Nova região, três masmorras e o retorno das guildas mercantes.' },
      { title: 'Manutenção programada', link: null, date: '2026-10-15T12:00:00Z', author: 'Staff', summary: 'O servidor fica fora do ar das 3h às 5h para atualização do mapa.' },
    ],

    async skinProfile() {
      await wait(200)
      const acc = accounts.find((a) => a.id === selectedAccount)
      if (acc?.kind !== 'microsoft') throw new UserError('Skins indisponíveis', 'Skins só podem ser trocadas em contas Microsoft.')
      return skin
    },
    async uploadSkin(_dataUrl, variant) {
      await wait(500)
      skin = { ...skin, skin: { url: '', variant } }
      return skin
    },
    async resetSkin() {
      skin = { ...skin, skin: null }
      return skin
    },
    async setCape(capeId) {
      skin = { ...skin, capes: skin.capes.map((c) => ({ ...c, active: c.id === capeId })) }
      return skin
    },
    skinLibrary: async () => [...library],
    addSkinFromFile: async () => null,
    addSkinFromCurrent: async () => null,
    async renameLibrarySkin(id, name) {
      const s = library.find((x) => x.id === id)
      if (s) s.name = name
    },
    async removeLibrarySkin(id) {
      const i = library.findIndex((x) => x.id === id)
      if (i >= 0) library.splice(i, 1)
    },
    async applyLibrarySkin(_id, variant) {
      skin = { ...skin, skin: { url: '', variant } }
      return skin
    },

    pollFeed: async () => [],
    markFeedSeen() {},
    onUpdate() {},
    checkForUpdate() {},
    installUpdate() {},
    changelog: async () => null,
    openExternal(url) {
      window.open(url, '_blank', 'noopener')
    },
    toggleMaximize() {
      maximized = !maximized
      maximizedListeners.forEach((cb) => cb(maximized))
    },
    onWindowMaximized(cb) {
      maximizedListeners.push(cb)
    },
    showFile() {},
    windowMinimize() {},
    windowClose() {},
  }
}
