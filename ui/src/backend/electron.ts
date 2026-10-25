/* eslint-disable @typescript-eslint/no-explicit-any */
// Ponte com o launcher real: roda no BrowserWindow do Electron com nodeIntegration,
// e chama os módulos de app/assets/js por require. Nada aqui toca no DOM legado.
import {
  UserError,
  type AccountInfo,
  type Article,
  type Backend,
  type BootResult,
  type ChangelogRelease,
  type ContentFile,
  type ContentType,
  type FeedItem,
  type GameSettings,
  type LaunchHandlers,
  type LauncherSettings,
  type LibrarySkin,
  type PackMod,
  type ProfileInfo,
  type ProfileSettings,
  type ProjectDetails,
  type SceneKey,
  type SearchHit,
  type ServerInfo,
  type SkinProfile,
  type UpdateEvent,
} from './types'
import { t } from '@/i18n'

const w = window as any
const nodeRequire: (id: string) => any = w.require
const path = nodeRequire('path')
const os = nodeRequire('os')
const { pathToFileURL } = nodeRequire('url')
const { ipcRenderer, shell } = nodeRequire('electron')
const { fileURLToPath } = nodeRequire('url')
// A página fica em <app>/ui/dist/index.html; os módulos do launcher são resolvidos a partir de <app>.
const appRoot: string = path.resolve(path.dirname(fileURLToPath(window.location.href)), '..', '..')
const req: (id: string) => any = nodeRequire('module').createRequire(path.join(appRoot, 'index.js'))
const fs = req('fs-extra')
const remote = req('@electron/remote')
const mod = (name: string) => req(path.join(appRoot, 'app', 'assets', 'js', name))

const ConfigManager = mod('configmanager')
const AuthManager = mod('authmanager')
const AuthManagerOffline = req(path.join(appRoot, 'app', 'assets', 'extension', 'offline', 'authmanagerOffline'))
const { DistroAPI } = mod('distromanager')
const ProfileManager = mod('profilemanager')
const ProfileIcons = mod('profileicons')
const ContentManager = mod('contentmanager')
const Modrinth = mod('modrinth')
const RichText = mod('richtext')
const Notifications = mod('notifications')
const Changelog = mod('changelog')
const isDev: boolean = mod('isdev')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, WINDOW_OPCODE } = mod('ipcconstants')
const DistroSync = mod('core/distrosync')
const LaunchService = mod('core/launchservice')
const News = mod('core/news')
const Skins = mod('core/skins')
const GameSettingsCore = mod('core/gamesettings')
const { getServerStatus } = req('helios-core/mojang')
const { validateSelectedJvm, ensureJavaDirIsRoot, javaExecFromRoot, discoverBestJvmInstallation } = req('helios-core/java')

let distro: any = null

const SCENES: SceneKey[] = ['arcane', 'ember', 'tide', 'grove', 'dusk', 'frost']
function sceneFor(id: string, main: boolean): SceneKey {
  if (main) return 'arcane'
  let h = 7
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SCENES[1 + (h % (SCENES.length - 1))]
}

function stripTags(text: unknown) {
  return String(text ?? '').replace(/<[^>]+>/g, '').trim()
}

function server(id: string) {
  const s = distro?.getServerById(id)
  if (s == null) throw new UserError('Servidor não encontrado', 'Este servidor não está mais na distribuição.')
  return s
}

function mapServer(s: any): ServerInfo {
  const raw = s.rawServer
  const target = Modrinth.getServerTarget(s)
  const loader = target.loader === 'forge' ? 'Forge' : target.loader === 'fabric' ? 'Fabric' : 'Vanilla'
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    description: stripTags(raw.description ?? ''),
    mcVersion: raw.minecraftVersion ?? '',
    version: raw.version ?? '',
    loader,
    icon: typeof raw.icon === 'string' && /^(https?|file):/.test(raw.icon) ? raw.icon : null,
    background: typeof raw.background === 'string' && /^https?:/.test(raw.background) ? raw.background : null,
    address: raw.address ?? null,
    main: Boolean(raw.mainServer),
    scene: sceneFor(raw.id, Boolean(raw.mainServer)),
    packModCount: DistroSync.countPackMods(DistroSync.packModTree(s.modules, {})),
    // Mesmo critério do launcher antigo: o id do servidor diz se ele é Vulkan.
    group: raw.id.toLowerCase().includes('vulkan') ? 'Vulkan' : 'OpenGL',
  }
}

/** Depois de carregar a distribuição: mods opcionais, Java e a configuração global do jogo. */
function sync(d: any) {
  DistroSync.syncDistribution(d)
  GameSettingsCore.apply(d, ConfigManager, ProfileManager)
  ConfigManager.save()
}

/** Status do launcher (textos em português do en_US.toml) no idioma da interface. */
function status(text: string) {
  const java = /^Baixando Java (\d+)$/.exec(text)
  return java ? t('Baixando Java {n}', { n: java[1] }) : t(text)
}

function mapProfile(p: any): ProfileInfo {
  return { id: p.id, name: p.name, icon: p.icon, created: p.created ?? null, isDefault: p.id === ProfileManager.DEFAULT_ID }
}

function mapAccount(a: any): AccountInfo {
  return { id: a.uuid, name: a.displayName ?? a.username, kind: a.type === 'microsoft' ? 'microsoft' : a.type === 'offline' ? 'offline' : 'mojang' }
}

function gameDir(serverId: string, profileId: string) {
  return ProfileManager.getGameDir(serverId, profileId)
}

function configKey(serverId: string, profileId: string) {
  return ProfileManager.configKey(serverId, profileId)
}

// Mesmos textos de [js.mods.error] no en_US.toml, aqui para passarem pelo t().
function modrinthMessage(err: any): string {
  const title = err?.data?.title ?? ''
  switch (err?.code) {
    case 'BLOCKED':
      return err.data?.dependency ? t('Não dá para instalar: ele precisa de {title}, que é proibido pela staff.', { title }) : t('{title} é proibido pela staff.', { title })
    case 'ALREADY_INSTALLED':
      return t('{title} já está instalado neste perfil.', { title })
    case 'NO_COMPATIBLE_VERSION':
      return t('{title} não tem versão para este servidor.', { title })
    case 'HASH_MISMATCH':
      return t('O arquivo baixado veio diferente do esperado e foi descartado. Tente novamente.')
    case 'RATE_LIMITED':
      return t('Muitas buscas seguidas, aguarde alguns segundos.')
    case 'DESTINATION_EXISTS':
      return t('Já existe um arquivo com esse nome na pasta.')
    case 'BAD_FILENAME':
      return t('O arquivo anunciado pela Modrinth tem um nome inválido e foi recusado.')
    case 'UNSUPPORTED_TYPE':
      return t('Esse tipo de conteúdo não é suportado pelo launcher.')
    case 'ENOENT':
    case 'ENOSPC':
      return t('Não foi possível ler a pasta do perfil.')
    default:
      return t('Não foi possível falar com o Modrinth. Verifique a conexão e tente de novo.')
  }
}

// Mensagens do core/skins.js, por código.
const SKIN_MESSAGES: Record<string, string> = {
  TOO_LARGE: 'O arquivo é grande demais para uma skin.',
  NOT_PNG: 'Escolha um arquivo .png.',
  BAD_SIZE: 'A skin precisa ter 64×64 pixels.',
  NETWORK: 'Sem conexão com os servidores do Minecraft.',
  UNAUTHORIZED: 'A sessão expirou. Entre de novo na conta.',
  RATE_LIMITED: 'Muitas trocas seguidas. Tente de novo em alguns minutos.',
  HTTP: 'Os servidores do Minecraft recusaram o pedido.',
  BAD_URL: 'Endereço de textura inválido.',
  NOT_FOUND: 'Skin não encontrada na biblioteca.',
  LIBRARY_FULL: 'A biblioteca aceita até 60 skins.',
}

function asUserError(err: any, title: string): UserError {
  if (err instanceof UserError) return err
  if (err?.title && (err.desc || err.message)) return new UserError(stripTags(err.title), stripTags(err.desc ?? err.message))
  if (err instanceof Skins.SkinError) return new UserError(title, SKIN_MESSAGES[err.code] ?? err.message)
  if (err instanceof Modrinth.ModrinthError || err?.code) return new UserError(title, modrinthMessage(err))
  return new UserError(title, 'Algo deu errado. Veja o console (Ctrl+Shift+I) para detalhes.')
}

function waitDistributionIndex(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: boolean) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    if (typeof w.distributionIndexResult === 'boolean') finish(w.distributionIndexResult)
    ipcRenderer.once('distributionIndexDone', (_e: unknown, res: boolean) => finish(res))
    const t = setInterval(() => {
      if (typeof w.distributionIndexResult === 'boolean') {
        clearInterval(t)
        finish(w.distributionIndexResult)
      }
    }, 100)
  })
}

// Pacotes do servidor e conteúdo instalado: só para não instalar duplicado.
let packProjects: { serverId: string; promise: Promise<Set<string>> } | null = null
function getPackProjects(s: any, strict: boolean): Promise<Set<string>> {
  if (packProjects == null || packProjects.serverId !== s.rawServer.id || strict) {
    const promise = Modrinth.getModpackProjects(s, { download: strict })
    packProjects = { serverId: s.rawServer.id, promise }
    promise.catch(() => {
      if (packProjects?.promise === promise) packProjects = null
    })
  }
  return strict ? packProjects.promise : packProjects.promise.catch(() => new Set<string>())
}

const pendingUpdates = new Map<string, any>()
let installQueue: Promise<unknown> = Promise.resolve()

function selectedTarget() {
  const s = server(ConfigManager.getSelectedServer())
  const p = ProfileManager.getSelected(s.rawServer.id)
  return { s, dir: gameDir(s.rawServer.id, p.id), target: Modrinth.getServerTarget(s), blocklist: Modrinth.getBlocklist(s) }
}

async function bufToDataUrl(buf: Uint8Array) {
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return 'data:image/png;base64,' + btoa(bin)
}

function dataUrlToBuffer(dataUrl: string) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!m) throw new UserError('Skin inválida', 'Escolha um arquivo .png.')
  return nodeRequire('buffer').Buffer.from(m[1], 'base64')
}

async function mcToken(): Promise<string> {
  const acc = ConfigManager.getSelectedAccount()
  if (acc == null || acc.type !== 'microsoft') {
    throw new UserError('Skins indisponíveis', 'Skins só podem ser trocadas em contas Microsoft.')
  }
  const ok = await AuthManager.validateSelected()
  if (!ok) throw new UserError('Sessão expirada', 'Entre de novo na conta Microsoft para trocar a skin.')
  return ConfigManager.getSelectedAccount().accessToken
}

async function libraryEntry(e: any): Promise<LibrarySkin> {
  const { buf } = await Skins.readLibrarySkin(ConfigManager.getDataDirectory(), e.id)
  return { id: e.id, name: e.name, variant: e.variant, dataUrl: await bufToDataUrl(buf) }
}

let feedEtag: string | null = null
let feedCache: any = null
let feedClock: any = null

export function createElectronBackend(): Backend {
  return {
    kind: 'electron',
    appVersion: remote.app.getVersion(),
    isDev,

    async boot(): Promise<BootResult> {
      const ok = await waitDistributionIndex()
      if (!ok) {
        return { ok: false, message: 'Não foi possível carregar a lista de servidores. Verifique a conexão e abra o launcher de novo.' }
      }
      distro = await DistroAPI.getDistribution()
      sync(distro)
      if (ConfigManager.getLauncherMaximized()) ipcRenderer.send(WINDOW_OPCODE.MAXIMIZE)
      if (!isDev) ipcRenderer.send('autoUpdateAction', 'initAutoUpdater', ConfigManager.getAllowPrerelease())
      LaunchService.updateLauncherPresence()
      return { ok: true, firstLaunch: ConfigManager.isFirstLaunch() || Object.keys(ConfigManager.getAuthAccounts()).length === 0 }
    },

    async refreshDistribution() {
      distro = await DistroAPI.refreshDistributionOrFallback()
      sync(distro)
    },

    servers() {
      return (distro?.servers ?? []).filter((s: any) => s.rawServer.id !== 'SELECT').map(mapServer)
    },
    selectedServerId() {
      return ConfigManager.getSelectedServer() ?? null
    },
    selectServer(id) {
      server(id)
      ConfigManager.setSelectedServer(id)
      ConfigManager.save()
      LaunchService.updateLauncherPresence()
    },
    profiles(serverId) {
      return ProfileManager.list(serverId).map(mapProfile)
    },
    selectedProfileId(serverId) {
      return ProfileManager.getSelected(serverId).id
    },
    selectProfile(serverId, profileId) {
      if (LaunchService.isBusy() || LaunchService.isRunning()) throw new UserError('Jogo aberto', 'Troque de perfil depois de fechar o jogo.')
      ProfileManager.select(serverId, profileId)
    },
    updateProfile(serverId, profileId, o) {
      ProfileManager.update(serverId, profileId, o)
    },
    async removeProfile(serverId, profileId) {
      if (LaunchService.isBusy() || LaunchService.isRunning()) throw new UserError('Jogo aberto', 'Feche o jogo antes de excluir um perfil.')
      try {
        await ProfileManager.remove(serverId, profileId)
      } catch (err) {
        throw asUserError(err, 'Não foi possível excluir o perfil')
      }
    },
    profileIcons() {
      return ProfileManager.ICONS.map((name: string) => ({ name, label: ProfileIcons.LABELS?.[name] ?? name, svg: ProfileIcons.svg(name).outerHTML }))
    },
    validateProfileName(name) {
      return ProfileManager.validateName(name) == null ? 'Use de 1 a 32 caracteres.' : null
    },

    accounts() {
      return Object.values(ConfigManager.getAuthAccounts()).map(mapAccount)
    },
    selectedAccountId() {
      return ConfigManager.getSelectedAccount()?.uuid ?? null
    },
    selectAccount(id) {
      ConfigManager.setSelectedAccount(id)
      ConfigManager.save()
    },
    async validateSelectedAccount() {
      if (ConfigManager.getSelectedAccount() == null) return true
      try {
        return await AuthManager.validateSelected()
      } catch {
        return true
      }
    },
    loginMicrosoft() {
      return new Promise<AccountInfo | null>((resolve, reject) => {
        ipcRenderer.once(MSFT_OPCODE.REPLY_LOGIN, async (_e: unknown, ...args: any[]) => {
          if (args[0] === MSFT_REPLY_TYPE.ERROR) {
            if (args[1] === MSFT_ERROR.NOT_FINISHED) resolve(null)
            else reject(new UserError('Login já aberto', 'A janela de login da Microsoft já está aberta.'))
            return
          }
          const query = args[1] ?? {}
          if (query.error) {
            if (query.error === 'access_denied') resolve(null)
            else reject(new UserError('Erro no login da Microsoft', stripTags(query.error_description ?? query.error)))
            return
          }
          try {
            const acc = await AuthManager.addMicrosoftAccount(query.code)
            resolve(mapAccount(acc))
          } catch (err) {
            reject(asUserError(err, 'Não foi possível entrar com a Microsoft'))
          }
        })
        ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, 'ok', 'cancel')
      })
    },
    async loginOffline(name) {
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
        throw new UserError('Nome inválido', 'Use de 3 a 16 letras, números ou _.')
      }
      const acc = await AuthManagerOffline.addOfflineAccount(name)
      ConfigManager.save()
      return mapAccount(acc)
    },
    async logout(id) {
      const acc = ConfigManager.getAuthAccount(id)
      if (acc == null) return true
      if (acc.type === 'microsoft') {
        const isLast = Object.keys(ConfigManager.getAuthAccounts()).length === 1
        const ok = await new Promise<boolean>((resolve, reject) => {
          ipcRenderer.once(MSFT_OPCODE.REPLY_LOGOUT, (_e: unknown, ...args: any[]) => {
            if (args[0] === MSFT_REPLY_TYPE.SUCCESS) resolve(true)
            else if (args[1] === MSFT_ERROR.NOT_FINISHED) resolve(false)
            else reject(new UserError('Logout já aberto', 'A janela de logout da Microsoft já está aberta.'))
          })
          ipcRenderer.send(MSFT_OPCODE.OPEN_LOGOUT, id, isLast)
        })
        if (!ok) return false
        await AuthManager.removeMicrosoftAccount(id)
      } else if (acc.type === 'offline') {
        await AuthManager.removeMicrosoftAccount(id)
      } else {
        await AuthManager.removeMojangAccount(id)
      }
      return true
    },

    async launch(h: LaunchHandlers) {
      try {
        return await LaunchService.launch({
          ...h,
          onStatus: (text: string) => h.onStatus(status(text)),
          onBlocked: (items: any[]) => h.onBlocked(items.map((i) => ({ title: i.title, type: i.type }))),
          onDistro: (d: any) => {
            distro = d
          },
        })
      } catch (err) {
        throw asUserError(err, 'Não foi possível abrir o jogo')
      }
    },
    stop() {
      LaunchService.stop()
    },
    async verifyFiles(h) {
      try {
        return await LaunchService.verifyOnly({ ...h, onStatus: (text: string) => h.onStatus(status(text)), onDistro: (d: any) => (distro = d) })
      } catch (err) {
        throw asUserError(err, 'Não foi possível verificar os arquivos')
      }
    },

    async listContent(serverId, profileId, type) {
      const dir = gameDir(serverId, profileId)
      const s = server(serverId)
      const files = await ContentManager.describe(dir, type)
      let updates = new Map<string, any>()
      const recognised = files.filter((f: any) => f.project != null)
      const target = Modrinth.getServerTarget(s)
      if (recognised.length > 0 && !(type === 'mod' && target.loader == null)) {
        try {
          updates = await Modrinth.checkUpdates(
            recognised.map((f: any) => ({ path: f.path, type })),
            target,
          )
        } catch {
          // Sem Modrinth, a lista aparece sem atualizações.
        }
      }
      return files.map((f: any): ContentFile => {
        const up = updates.get(f.path)
        if (up) pendingUpdates.set(`${dir}|${type}|${f.fileName}`, up)
        return {
          fileName: f.fileName,
          type,
          enabled: f.enabled,
          title: f.project?.title ?? f.fileName.replace(/\.disabled$/, '').replace(/\.(jar|zip)$/, ''),
          projectId: f.project?.id ?? null,
          iconUrl: f.project?.iconUrl ?? null,
          version: f.version?.number ?? null,
          update: up ? { id: up.id, number: up.version_number } : null,
        }
      })
    },
    async setContentEnabled(serverId, profileId, type, fileName, enabled) {
      try {
        await ContentManager.setEnabled(gameDir(serverId, profileId), type, fileName, enabled)
      } catch (err) {
        throw asUserError(err, 'Não foi possível alterar o item')
      }
    },
    async removeContent(serverId, profileId, type, fileName) {
      const dir = gameDir(serverId, profileId)
      try {
        if (type !== 'mod') await ContentManager.setEnabled(dir, type, fileName, false)
        const dest = path.join(ContentManager.folder(dir, type), fileName)
        const res = await ipcRenderer.invoke('TRASH_ITEM', dest)
        if (!res.result) await ContentManager.remove(dir, type, fileName)
      } catch (err) {
        throw asUserError(err, 'Não foi possível remover o item')
      }
    },
    async updateContent(serverId, profileId, type, fileName) {
      const dir = gameDir(serverId, profileId)
      const ver = pendingUpdates.get(`${dir}|${type}|${fileName}`)
      if (ver == null) return
      try {
        await ContentManager.updateFile(dir, type, fileName, ver)
        pendingUpdates.delete(`${dir}|${type}|${fileName}`)
      } catch (err) {
        throw asUserError(err, 'Não foi possível atualizar')
      }
    },
    openContentFolder(serverId, profileId, type) {
      const dir = ContentManager.folder(gameDir(serverId, profileId), type)
      fs.ensureDir(dir).then(() => shell.openPath(dir))
    },
    packMods(serverId, profileId): PackMod[] {
      return DistroSync.getPackMods(server(serverId), configKey(serverId, profileId))
    },
    setPackModEnabled(serverId, profileId, p, enabled) {
      DistroSync.setPackModEnabled(configKey(serverId, profileId), p, enabled)
    },
    async screenshots(serverId, profileId) {
      const dir = path.join(gameDir(serverId, profileId), 'screenshots')
      try {
        const names: string[] = (await fs.readdir(dir)).filter((n: string) => /\.(png|jpe?g)$/i.test(n))
        const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(dir, n))).mtimeMs })))
        return withTime
          .sort((a, b) => b.t - a.t)
          .slice(0, 60)
          .map(({ n }) => ({ name: n, url: pathToFileURL(path.join(dir, n)).href }))
      } catch {
        return []
      }
    },
    async latestLog(serverId, profileId) {
      try {
        const text: string = await fs.readFile(path.join(gameDir(serverId, profileId), 'logs', 'latest.log'), 'utf8')
        const lines = text.split(/\r?\n/)
        return lines.slice(-400).join('\n')
      } catch {
        return null
      }
    },
    openGameFolder(serverId, profileId, sub) {
      const dir = sub ? path.join(gameDir(serverId, profileId), sub) : gameDir(serverId, profileId)
      fs.ensureDir(dir).then(() => shell.openPath(dir))
    },

    async categories(type) {
      try {
        return await Modrinth.getCategories(type)
      } catch {
        return []
      }
    },
    async search(o) {
      const { s, dir, target, blocklist } = selectedTarget()
      try {
        const [pack, installed] = await Promise.all([getPackProjects(s, false), ContentManager.installedProjects(dir).catch(() => new Set())])
        const res = await Modrinth.search(o, target, blocklist, pack)
        return {
          total: res.total,
          pageSize: res.pageSize,
          hits: res.hits.map(
            (h: any): SearchHit => ({
              id: h.project_id,
              slug: h.slug,
              title: h.title,
              author: h.author,
              description: h.description,
              iconUrl: h.icon_url || null,
              downloads: h.downloads,
              follows: h.follows,
              updated: h.date_modified ?? null,
              categories: h.categories ?? [],
              installed: installed.has(h.project_id),
            }),
          ),
        }
      } catch (err) {
        throw asUserError(err, 'Busca indisponível')
      }
    },
    async project(idOrSlug) {
      const { dir, target } = selectedTarget()
      try {
        const p = await Modrinth.getProject(idOrSlug)
        const type: ContentType = p.project_type === 'shader' ? 'shader' : p.project_type === 'resourcepack' ? 'resourcepack' : 'mod'
        const [installed, ver] = await Promise.all([
          ContentManager.installedProjects(dir).catch(() => new Set()),
          Modrinth.getCompatibleVersion(p.id, type, target).catch(() => null),
        ])
        const details: ProjectDetails = {
          id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          bodyHtml: RichText.render(p.body ?? ''),
          iconUrl: p.icon_url || null,
          downloads: p.downloads,
          follows: p.followers,
          updated: p.updated ?? null,
          categories: p.categories ?? [],
          gallery: (p.gallery ?? []).filter((g: any) => /^https:/.test(g.url)).map((g: any) => ({ url: g.url, title: g.title ?? null })),
          license: p.license?.name ?? p.license?.id ?? null,
          sourceUrl: p.source_url ?? null,
          type,
          installed: installed.has(p.id),
          compatibleVersion: ver ? { id: ver.id, number: ver.version_number, date: ver.date_published ?? null } : null,
        }
        return details
      } catch (err) {
        throw asUserError(err, 'Projeto indisponível')
      }
    },
    async install(projectId) {
      const { s, dir, target, blocklist } = selectedTarget()
      const run = installQueue.then(async () => {
        const [pack, installed] = await Promise.all([getPackProjects(s, true), ContentManager.installedProjects(dir)])
        await Modrinth.install(projectId, target, dir, installed, blocklist, pack)
      })
      installQueue = run.catch(() => {})
      try {
        await run
      } catch (err) {
        throw asUserError(err, 'Não foi possível instalar')
      }
    },

    launcherSettings(): LauncherSettings {
      return {
        discordPresence: ConfigManager.getDiscordPresence(),
        allowPrerelease: ConfigManager.getAllowPrerelease(),
        autoConnect: ConfigManager.getAutoConnect(),
        launcherOnPlay: ConfigManager.getLauncherOnPlay(),
        dataDirectory: ConfigManager.getDataDirectory(),
      }
    },
    setLauncherSetting(key, value) {
      if (key === 'discordPresence') {
        ConfigManager.setDiscordPresence(value)
        LaunchService.updateLauncherPresence()
      } else if (key === 'allowPrerelease') {
        ConfigManager.setAllowPrerelease(value)
        if (!isDev) ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', value)
      } else if (key === 'autoConnect') {
        ConfigManager.setAutoConnect(value)
      } else if (key === 'launcherOnPlay') {
        ConfigManager.setLauncherOnPlay(value)
      }
      ConfigManager.save()
    },
    profileSettings(serverId, profileId): ProfileSettings {
      const s = server(serverId)
      const key = configKey(serverId, profileId)
      ConfigManager.ensureJavaConfig(key, s.effectiveJavaOptions, s.rawServer.javaOptions?.ram)
      return { javaPath: ConfigManager.getJavaExecutable(key), javaSupported: s.effectiveJavaOptions?.supported ?? '' }
    },
    setProfileSetting(serverId, profileId, _key, value) {
      ConfigManager.setJavaExecutable(configKey(serverId, profileId), value)
      ConfigManager.save()
    },
    gameSettings(): GameSettings {
      const servers = (distro?.servers ?? []).filter((s: any) => s.rawServer.id !== 'SELECT')
      const b = GameSettingsCore.ramBounds(servers, ConfigManager)
      const current = ConfigManager.getGlobalMaxRAM()
      // Sem valor global ainda: mostra o que o servidor selecionado usa hoje.
      const selected = ConfigManager.getSelectedServer()
      const fallback = selected ? GameSettingsCore.parseRam(ConfigManager.getJavaConfigKeys().includes(selected) ? ConfigManager.getMaxRAM(selected) : null, b.recommended) : b.recommended
      return {
        maxRamGB: Math.min(b.max, Math.max(b.min, current ?? fallback)),
        ramMinGB: b.min,
        ramMaxGB: b.max,
        ramRecommendedGB: b.recommended,
        systemRamGB: b.system,
        width: ConfigManager.getGameWidth(),
        height: ConfigManager.getGameHeight(),
        fullscreen: ConfigManager.getFullscreen(),
      }
    },
    setGameSetting(key, value) {
      if (key === 'maxRamGB') ConfigManager.setGlobalMaxRAM(Number(value))
      else if (key === 'width' && ConfigManager.validateGameWidth(Number(value))) ConfigManager.setGameWidth(Number(value))
      else if (key === 'height' && ConfigManager.validateGameHeight(Number(value))) ConfigManager.setGameHeight(Number(value))
      else if (key === 'fullscreen') ConfigManager.setFullscreen(Boolean(value))
      if (distro) GameSettingsCore.apply(distro, ConfigManager, ProfileManager)
      ConfigManager.save()
    },
    language() {
      return ConfigManager.getLanguage()
    },
    setLanguage(lang) {
      ConfigManager.setLanguage(lang)
      ConfigManager.save()
    },
    async detectJava(serverId, profileId) {
      const s = server(serverId)
      const found = await discoverBestJvmInstallation(ConfigManager.getDataDirectory(), s.effectiveJavaOptions.supported)
      if (found == null) return null
      const exec = javaExecFromRoot(found.path)
      ConfigManager.setJavaExecutable(configKey(serverId, profileId), exec)
      ConfigManager.save()
      return exec
    },
    async chooseJava(serverId, profileId) {
      const s = server(serverId)
      const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
        title: 'Escolha o executável do Java',
        properties: ['openFile'],
        filters: os.platform() === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
      })
      if (res.canceled || res.filePaths.length === 0) return null
      const exe = res.filePaths[0]
      const details = await validateSelectedJvm(ensureJavaDirIsRoot(exe), s.effectiveJavaOptions.supported)
      if (details == null) {
        throw new UserError('Java incompatível', `Este servidor precisa de Java ${s.effectiveJavaOptions.suggestedMajor}.`)
      }
      ConfigManager.setJavaExecutable(configKey(serverId, profileId), exe)
      ConfigManager.save()
      return exe
    },
    openDataFolder() {
      shell.openPath(ConfigManager.getDataDirectory())
    },

    async serverStatus(serverId) {
      const s = distro?.getServerById(serverId)
      if (s == null || !s.hostname) return null
      try {
        const started = performance.now()
        const st = await getServerStatus(47, s.hostname, s.port)
        return { online: st.players.online, max: st.players.max, pingMs: Math.round(performance.now() - started) }
      } catch {
        return null
      }
    },
    async news(): Promise<Article[] | null> {
      return News.fetchNews(distro?.rawDistribution?.rss)
    },

    async skinProfile() {
      try {
        return (await Skins.getProfile(await mcToken())) as SkinProfile
      } catch (err) {
        throw asUserError(err, 'Skins indisponíveis')
      }
    },
    async uploadSkin(dataUrl, variant) {
      try {
        return (await Skins.uploadSkin(await mcToken(), dataUrlToBuffer(dataUrl), variant)) as SkinProfile
      } catch (err) {
        throw asUserError(err, 'Não foi possível aplicar a skin')
      }
    },
    async resetSkin() {
      try {
        return (await Skins.resetSkin(await mcToken())) as SkinProfile
      } catch (err) {
        throw asUserError(err, 'Não foi possível voltar à skin padrão')
      }
    },
    async setCape(capeId) {
      try {
        return (await Skins.setCape(await mcToken(), capeId)) as SkinProfile
      } catch (err) {
        throw asUserError(err, 'Não foi possível trocar a capa')
      }
    },
    async skinLibrary() {
      const list = await Skins.listLibrary(ConfigManager.getDataDirectory())
      const out: LibrarySkin[] = []
      for (const e of list) {
        try {
          out.push(await libraryEntry(e))
        } catch {
          // Arquivo sumiu: some da lista.
        }
      }
      return out
    },
    async addSkinFromFile() {
      const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
        title: 'Escolha uma skin (.png 64×64)',
        properties: ['openFile'],
        filters: [{ name: 'Skin', extensions: ['png'] }],
      })
      if (res.canceled || res.filePaths.length === 0) return null
      try {
        const file = res.filePaths[0]
        const buf = await fs.readFile(file)
        const e = await Skins.addToLibrary(ConfigManager.getDataDirectory(), buf, { name: path.basename(file, '.png'), variant: 'classic' })
        return await libraryEntry(e)
      } catch (err) {
        throw asUserError(err, 'Não foi possível adicionar a skin')
      }
    },
    async addSkinFromCurrent(name) {
      try {
        const p = await Skins.getProfile(await mcToken())
        if (p.skin == null) return null
        const buf = await Skins.downloadTexture(p.skin.url)
        const e = await Skins.addToLibrary(ConfigManager.getDataDirectory(), buf, { name, variant: p.skin.variant })
        return await libraryEntry(e)
      } catch (err) {
        throw asUserError(err, 'Não foi possível salvar a skin')
      }
    },
    async renameLibrarySkin(id, name) {
      await Skins.updateLibraryEntry(ConfigManager.getDataDirectory(), id, { name })
    },
    async removeLibrarySkin(id) {
      await Skins.removeFromLibrary(ConfigManager.getDataDirectory(), id)
    },
    async applyLibrarySkin(id, variant) {
      try {
        const { buf } = await Skins.readLibrarySkin(ConfigManager.getDataDirectory(), id)
        await Skins.updateLibraryEntry(ConfigManager.getDataDirectory(), id, { variant })
        return (await Skins.uploadSkin(await mcToken(), buf, variant)) as SkinProfile
      } catch (err) {
        throw asUserError(err, 'Não foi possível aplicar a skin')
      }
    },

    async pollFeed(): Promise<FeedItem[]> {
      try {
        const res = await Notifications.fetchFeed({ etag: feedEtag })
        if (res.changed) {
          feedCache = res.feed
          feedEtag = res.etag
          ConfigManager.setNotificationsSeen(Notifications.pruneSeen(ConfigManager.getNotificationsSeen(), res.feed))
          ConfigManager.save()
        }
        if (res.clock) feedClock = res.clock
      } catch {
        // Sem feed agora: mostra o que já tinha.
      }
      if (feedCache == null || feedClock == null) return []
      const items = Notifications.pendingItems(feedCache, {
        serverId: ConfigManager.getSelectedServer(),
        seen: new Set(ConfigManager.getNotificationsSeen()),
        feedNowMs: Notifications.feedClock(feedClock),
      })
      return items.map((i: any) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        body: i.body,
        link: i.link,
        highlight: i.highlight,
        image: i.image,
        sticky: i.sticky,
        startsAtMs: i.startsAtMs,
      }))
    },
    markFeedSeen(ids) {
      const seen = new Set<string>(ConfigManager.getNotificationsSeen())
      ids.forEach((id) => seen.add(id))
      ConfigManager.setNotificationsSeen([...seen])
      ConfigManager.save()
    },
    onUpdate(cb: (e: UpdateEvent) => void) {
      ipcRenderer.on('autoUpdateNotification', (_e: unknown, arg: string, info: any) => {
        switch (arg) {
          case 'ready':
            ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
            setInterval(() => ipcRenderer.send('autoUpdateAction', 'checkForUpdate'), 30 * 60 * 1000)
            break
          case 'checking-for-update':
            cb({ kind: 'checking' })
            break
          case 'update-available':
            cb({ kind: 'available', version: info?.version ?? '' })
            break
          case 'download-progress':
            cb({ kind: 'progress', percent: Math.round(info?.percent ?? 0) })
            break
          case 'update-downloaded':
            cb({ kind: 'ready', version: info?.version ?? '' })
            break
          case 'update-not-available':
            cb({ kind: 'none' })
            break
          case 'realerror':
            cb({ kind: 'error', message: 'Não foi possível verificar atualizações.' })
            break
        }
      })
    },
    checkForUpdate() {
      if (isDev) return
      ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
    },
    installUpdate() {
      if (LaunchService.isBusy() || LaunchService.isRunning()) {
        throw new UserError('Jogo aberto', 'Feche o jogo antes de instalar a atualização.')
      }
      ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
    },
    async changelog(): Promise<ChangelogRelease | null> {
      try {
        const log = await Changelog.fetchChangelog()
        const rel = Changelog.findRelease(log, remote.app.getVersion())
        if (rel == null) return null
        return { version: rel.version, title: rel.title, blocks: Changelog.noteBlocks(rel.notes), publishedAt: rel.publishedAt }
      } catch {
        return null
      }
    },
    openExternal(url) {
      try {
        const u = new URL(url)
        if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(u.href)
      } catch {
        // Endereço inválido: ignora.
      }
    },
    toggleMaximize() {
      ipcRenderer.send(WINDOW_OPCODE.TOGGLE_MAXIMIZE)
    },
    onWindowMaximized(cb) {
      cb(remote.getCurrentWindow().isMaximized())
      ipcRenderer.on(WINDOW_OPCODE.MAXIMIZED_CHANGED, (_e: unknown, maximized: boolean) => {
        // Lembra o estado para a próxima vez que o launcher abrir.
        ConfigManager.setLauncherMaximized(maximized)
        ConfigManager.save()
        cb(maximized)
      })
    },
    showFile(file) {
      shell.showItemInFolder(file)
    },
    windowMinimize() {
      remote.getCurrentWindow().minimize()
    },
    windowClose() {
      remote.getCurrentWindow().close()
    },
  }
}
