export type Loader = 'Vanilla' | 'Fabric' | 'Quilt' | 'Forge' | 'NeoForge'
export type Source = 'Servidor' | 'Modrinth' | 'CurseForge' | 'Local'

export type SceneKey = 'arcane' | 'ember' | 'tide' | 'grove' | 'dusk' | 'frost'

export type Instance = {
  id: string
  name: string
  loader: Loader
  loaderVersion?: string
  mcVersion: string
  source: Source
  kind: 'server' | 'modpack' | 'vanilla'
  description: string
  mods: number
  sizeMb: number
  playtimeH: number
  lastPlayed: string
  scene: SceneKey
  pinned?: boolean
  update?: { from: string; to: string }
  server?: { address: string; online: number; max: number; pingMs: number }
  memoryGb: number
}

export type ContentItem = {
  id: string
  name: string
  author: string
  version: string
  next?: string
  source: Source | 'Manual'
  enabled: boolean
  side?: string
  color: string
}

export type Account = { id: string; name: string; kind: 'microsoft' | 'offline'; expired?: boolean; color: string }

export type Skin = {
  id: string
  name: string
  hair: string
  skin: string
  shirt: string
  pants: string
  shoes: string
}

export type DownloadStatus = 'active' | 'paused' | 'queued' | 'done' | 'error'

export type Download = {
  id: string
  name: string
  detail: string
  sizeMb: number
  progress: number
  status: DownloadStatus
  scene: SceneKey
  finishedAt?: number
  onDone?: 'install-instance' | 'none'
  payload?: Instance
}

export type Notification = {
  id: string
  title: string
  body: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
  at: number
  read: boolean
  href?: string
}

export type DiscoverItem = {
  id: string
  name: string
  author: string
  description: string
  loader: Loader
  mcVersion: string
  source: 'Modrinth' | 'CurseForge'
  downloads: string
  updated: string
  categories: string[]
  scene: SceneKey
  sizeMb: number
  mods: number
}
