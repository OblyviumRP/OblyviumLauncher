// Contrato entre a interface e o launcher. A implementação Electron chama os
// módulos de app/assets/js; a simulada (mock.ts) serve para desenvolver no navegador.

export type SceneKey = 'arcane' | 'ember' | 'tide' | 'grove' | 'dusk' | 'frost'

export type ServerInfo = {
  id: string
  name: string
  description: string
  mcVersion: string
  version: string
  loader: string
  icon: string | null
  background: string | null
  address: string | null
  main: boolean
  scene: SceneKey
  packModCount: number
}

export type ProfileInfo = { id: string; name: string; icon: string; created: string | null; isDefault: boolean }

export type AccountInfo = { id: string; name: string; kind: 'microsoft' | 'offline' | 'mojang' }

export type ContentType = 'mod' | 'resourcepack' | 'shader'

export type ContentFile = {
  fileName: string
  type: ContentType
  enabled: boolean
  title: string
  projectId: string | null
  iconUrl: string | null
  version: string | null
  update: { id: string; number: string } | null
}

export type PackMod = {
  id: string
  path: string[]
  name: string
  version: string
  required: boolean
  enabled: boolean
  available: boolean
  children: PackMod[]
}

export type ProfileSettings = {
  maxRamGB: number
  ramMinGB: number
  ramMaxGB: number
  ramRecommendedGB: number
  systemRamGB: number
  javaPath: string | null
  javaSupported: string
  width: number
  height: number
  fullscreen: boolean
}

export type LauncherSettings = {
  discordPresence: boolean
  allowPrerelease: boolean
  autoConnect: boolean
  hideLauncherWhilePlaying: boolean
  dataDirectory: string
}

export type Article = { title: string; link: string | null; date: string | null; author: string; summary: string }

export type SearchHit = {
  id: string
  slug: string
  title: string
  author: string
  description: string
  iconUrl: string | null
  downloads: number
  follows: number
  updated: string | null
  categories: string[]
  installed: boolean
}

export type ProjectDetails = {
  id: string
  slug: string
  title: string
  description: string
  bodyHtml: string
  iconUrl: string | null
  downloads: number
  follows: number
  updated: string | null
  categories: string[]
  gallery: { url: string; title: string | null }[]
  license: string | null
  sourceUrl: string | null
  type: ContentType
  installed: boolean
  compatibleVersion: { id: string; number: string; date: string | null } | null
}

export type LogLine = { t: string; level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'; msg: string }

export type LaunchProgress = { phase: 'verify' | 'download' | 'java'; percent: number }

export type LaunchHandlers = {
  onStatus: (text: string) => void
  onProgress: (p: LaunchProgress) => void
  onBlocked: (items: { title: string; type: ContentType }[]) => void
  onLog: (line: { stream: 'stdout' | 'stderr'; line: string }) => void
  onStarted: () => void
  onExit: (r: { code: number | null; started: boolean; crashReport: string | null }) => void
  askDownloadJava: (o: { major: number }) => Promise<boolean>
}

export type SkinProfile = {
  skin: { url: string; variant: 'classic' | 'slim' } | null
  capes: { id: string; alias: string; url: string; active: boolean }[]
}

export type LibrarySkin = { id: string; name: string; variant: 'classic' | 'slim'; dataUrl: string }

export type FeedItem = {
  id: string
  type: string
  title: string
  body: string
  link: { url: string; label: string } | null
  highlight: boolean
  image: string | null
  sticky: boolean
  startsAtMs: number
}

export type UpdateEvent =
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'none' }
  | { kind: 'error'; message: string }

export type ChangelogRelease = { version: string; title: string; blocks: ({ type: 'p'; text: string } | { type: 'ul'; items: string[] })[]; publishedAt: string }

export class UserError extends Error {
  title: string
  constructor(title: string, message: string) {
    super(message)
    this.title = title
  }
}

export type BootResult =
  | { ok: true; firstLaunch: boolean }
  | { ok: false; message: string }

export interface Backend {
  kind: 'electron' | 'mock'
  appVersion: string
  isDev: boolean

  boot(): Promise<BootResult>
  refreshDistribution(): Promise<void>

  // Servidores e perfis
  servers(): ServerInfo[]
  selectedServerId(): string | null
  selectServer(id: string): void
  profiles(serverId: string): ProfileInfo[]
  selectedProfileId(serverId: string): string
  selectProfile(serverId: string, profileId: string): void
  createProfile(serverId: string, o: { name: string; icon: string; copyFrom: string | null }): Promise<ProfileInfo>
  duplicateProfile(serverId: string, profileId: string): Promise<ProfileInfo>
  updateProfile(serverId: string, profileId: string, o: { name?: string; icon?: string }): void
  removeProfile(serverId: string, profileId: string): Promise<void>
  profileIcons(): { name: string; label: string; svg: string }[]
  validateProfileName(name: string): string | null

  // Contas
  accounts(): AccountInfo[]
  selectedAccountId(): string | null
  selectAccount(id: string): void
  validateSelectedAccount(): Promise<boolean>
  loginMicrosoft(): Promise<AccountInfo | null>
  loginOffline(name: string): Promise<AccountInfo>
  logout(id: string): Promise<boolean>

  // Jogo
  launch(h: LaunchHandlers): Promise<boolean>
  stop(): void
  verifyFiles(h: Pick<LaunchHandlers, 'onStatus' | 'onProgress'>): Promise<boolean>

  // Conteúdo do perfil
  listContent(serverId: string, profileId: string, type: ContentType): Promise<ContentFile[]>
  setContentEnabled(serverId: string, profileId: string, type: ContentType, fileName: string, enabled: boolean): Promise<void>
  removeContent(serverId: string, profileId: string, type: ContentType, fileName: string): Promise<void>
  updateContent(serverId: string, profileId: string, type: ContentType, fileName: string, versionId: string): Promise<void>
  openContentFolder(serverId: string, profileId: string, type: ContentType): void
  packMods(serverId: string, profileId: string): PackMod[]
  setPackModEnabled(serverId: string, profileId: string, path: string[], enabled: boolean): void
  screenshots(serverId: string, profileId: string): Promise<{ name: string; url: string }[]>
  latestLog(serverId: string, profileId: string): Promise<string | null>
  openGameFolder(serverId: string, profileId: string, sub?: string): void

  // Modrinth
  categories(type: ContentType): Promise<string[]>
  search(o: { query: string; type: ContentType; categories: string[]; sort: string; offset: number }): Promise<{ hits: SearchHit[]; total: number; pageSize: number }>
  project(idOrSlug: string): Promise<ProjectDetails>
  install(projectId: string): Promise<void>

  // Configurações
  launcherSettings(): LauncherSettings
  setLauncherSetting<K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]): void
  profileSettings(serverId: string, profileId: string): ProfileSettings
  setProfileSetting(serverId: string, profileId: string, key: 'maxRamGB' | 'width' | 'height' | 'fullscreen' | 'javaPath', value: number | boolean | string | null): void
  detectJava(serverId: string, profileId: string): Promise<string | null>
  chooseJava(serverId: string, profileId: string): Promise<string | null>
  openDataFolder(): void

  // Extras da tela inicial
  serverStatus(serverId: string): Promise<{ online: number; max: number } | null>
  news(): Promise<Article[] | null>

  // Skins
  skinProfile(): Promise<SkinProfile>
  uploadSkin(dataUrl: string, variant: 'classic' | 'slim'): Promise<SkinProfile>
  resetSkin(): Promise<SkinProfile>
  setCape(capeId: string | null): Promise<SkinProfile>
  skinLibrary(): Promise<LibrarySkin[]>
  addSkinFromFile(): Promise<LibrarySkin | null>
  addSkinFromCurrent(name: string): Promise<LibrarySkin | null>
  renameLibrarySkin(id: string, name: string): Promise<void>
  removeLibrarySkin(id: string): Promise<void>
  applyLibrarySkin(id: string, variant: 'classic' | 'slim'): Promise<SkinProfile>

  // Notificações, atualizações e janela
  pollFeed(): Promise<FeedItem[]>
  markFeedSeen(ids: string[]): void
  onUpdate(cb: (e: UpdateEvent) => void): void
  checkForUpdate(): void
  installUpdate(): void
  changelog(): Promise<ChangelogRelease | null>
  openExternal(url: string): void
  showFile(path: string): void
  windowMinimize(): void
  windowClose(): void
}
