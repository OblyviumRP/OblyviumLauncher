// Dados de demonstração para a nova interface. Nada aqui vem do servidor real:
// textos entre colchetes são lacunas a preencher com a distribuição/RSS oficiais.
import type { Account, ContentItem, DiscoverItem, Instance, Skin } from './types'

export const instances: Instance[] = [
  {
    id: 'oblyvium-rp',
    name: 'Oblyvium RP',
    loader: 'Forge',
    loaderVersion: '47.3.0',
    mcVersion: '1.20.1',
    source: 'Servidor',
    kind: 'server',
    description: 'Modpack oficial do servidor. Arquivos verificados e atualizados automaticamente antes de abrir o jogo.',
    mods: 186,
    sizeMb: 4300,
    playtimeH: 312,
    lastPlayed: 'há 2 horas',
    scene: 'arcane',
    pinned: true,
    server: { address: '[IP DO SERVIDOR]', online: 128, max: 500, pingMs: 24 },
    memoryGb: 8,
  },
  {
    id: 'create-eng',
    name: 'Create: Engenharia',
    loader: 'NeoForge',
    loaderVersion: '21.1.77',
    mcVersion: '1.21.1',
    source: 'Modrinth',
    kind: 'modpack',
    description: 'Máquinas, trens e automação com Create e addons.',
    mods: 142,
    sizeMb: 3100,
    playtimeH: 48,
    lastPlayed: 'ontem',
    scene: 'ember',
    pinned: true,
    update: { from: 'v1.8', to: 'v1.9' },
    memoryGb: 6,
  },
  {
    id: 'vanilla',
    name: 'Vanilla 1.21.4',
    loader: 'Vanilla',
    mcVersion: '1.21.4',
    source: 'Local',
    kind: 'vanilla',
    description: 'Instância limpa, sem mods.',
    mods: 0,
    sizeMb: 612,
    playtimeH: 9,
    lastPlayed: 'há 6 dias',
    scene: 'grove',
    pinned: true,
    memoryGb: 4,
  },
  {
    id: 'fo',
    name: 'Fabulously Optimized',
    loader: 'Fabric',
    loaderVersion: '0.16.9',
    mcVersion: '1.21.4',
    source: 'Modrinth',
    kind: 'modpack',
    description: 'Desempenho e gráficos melhores mantendo a experiência vanilla.',
    mods: 64,
    sizeMb: 890,
    playtimeH: 22,
    lastPlayed: 'há 2 semanas',
    scene: 'tide',
    memoryGb: 4,
  },
  {
    id: 'atm10',
    name: 'All the Mods 10',
    loader: 'NeoForge',
    loaderVersion: '21.1.77',
    mcVersion: '1.21.1',
    source: 'CurseForge',
    kind: 'modpack',
    description: 'Kitchen sink com mais de 400 mods.',
    mods: 418,
    sizeMb: 9800,
    playtimeH: 3,
    lastPlayed: 'há 1 mês',
    scene: 'dusk',
    update: { from: 'v2.31', to: 'v2.33' },
    memoryGb: 10,
  },
]

export const accounts: Account[] = [
  { id: 'acc-main', name: '[SEU NICK]', kind: 'microsoft', color: '#6d28d9' },
  { id: 'acc-alt', name: '[NICK SECUNDÁRIO]', kind: 'microsoft', expired: true, color: '#0f766e' },
  { id: 'acc-off', name: 'Jogador_Offline', kind: 'offline', color: '#52525b' },
]

const sk = (id: string, name: string, hair: string, skin: string, shirt: string, pants: string, shoes: string): Skin => ({ id, name, hair, skin, shirt, pants, shoes })

export const savedSkins: Skin[] = [
  sk('s-knight', 'Cavaleiro', '#5b3a1f', '#c99a6b', '#6d28d9', '#1e3a8a', '#3f3f46'),
  sk('s-mage', 'Mago', '#e5e7eb', '#d6a77a', '#4c1d95', '#312e81', '#1f2937'),
  sk('s-smith', 'Ferreiro', '#1f2937', '#a3735a', '#7c2d12', '#44403c', '#292524'),
  sk('s-archer', 'Arqueira', '#b45309', '#e0b48a', '#166534', '#3f6212', '#422006'),
]

// As nove skins padrão do Minecraft: Java Edition (desde 1.19.3).
export const defaultSkins: Skin[] = [
  sk('d-steve', 'Steve', '#3b2a1a', '#c99a6b', '#0e7490', '#1e3a8a', '#3f3f46'),
  sk('d-alex', 'Alex', '#c2410c', '#e8c39e', '#4d7c0f', '#57534e', '#292524'),
  sk('d-ari', 'Ari', '#78350f', '#d6a77a', '#be123c', '#334155', '#1f2937'),
  sk('d-efe', 'Efe', '#111827', '#8d5a3b', '#ca8a04', '#1e40af', '#1f2937'),
  sk('d-kai', 'Kai', '#1c1917', '#c68e64', '#0f766e', '#404040', '#171717'),
  sk('d-makena', 'Makena', '#0c0a09', '#6b4430', '#7e22ce', '#0f172a', '#78350f'),
  sk('d-noor', 'Noor', '#292524', '#b07c58', '#be185d', '#3f3f46', '#1c1917'),
  sk('d-sunny', 'Sunny', '#a16207', '#e8c39e', '#ea580c', '#155e75', '#422006'),
  sk('d-zuri', 'Zuri', '#1c1917', '#7a4b32', '#2563eb', '#4d7c0f', '#292524'),
]

export const contentByType: Record<'mods' | 'resourcepacks' | 'shaders' | 'worlds', ContentItem[]> = {
  mods: [
    { id: 'm1', name: 'Create', author: 'simibubi', version: '6.0.4', next: '6.0.6', source: 'Modrinth', enabled: true, color: '#b45309' },
    { id: 'm2', name: 'Sodium', author: 'jellysquid3', version: '0.6.3', source: 'Modrinth', enabled: true, color: '#0f766e' },
    { id: 'm3', name: 'JEI', author: 'mezz', version: '19.21.0', next: '19.21.2', source: 'CurseForge', enabled: true, color: '#9f1239' },
    { id: 'm4', name: "Create: Steam 'n' Rails", author: 'Layers of Railways', version: '1.6.9', source: 'Modrinth', enabled: true, color: '#78350f' },
    { id: 'm5', name: "Xaero's Minimap", author: 'xaero96', version: '24.6.1', next: '24.7.0', source: 'CurseForge', enabled: false, color: '#1e3a8a' },
    { id: 'm6', name: 'Jade', author: 'Snownee', version: '15.8.2', source: 'Modrinth', enabled: true, color: '#4d7c0f' },
    { id: 'm7', name: 'Simple Voice Chat', author: 'henkelmax', version: '2.5.26', source: 'Modrinth', enabled: true, color: '#6d28d9' },
    { id: 'm8', name: 'meu-mod-local.jar', author: 'Arquivo manual', version: '—', source: 'Manual', enabled: true, color: '#52525b' },
  ],
  resourcepacks: [
    { id: 'r1', name: 'Faithful 32x', author: 'Faithful Team', version: '1.21', source: 'Modrinth', enabled: true, color: '#3f6212' },
    { id: 'r2', name: 'Fresh Animations', author: 'FreshLX', version: '1.9.2', next: '1.9.3', source: 'Modrinth', enabled: true, color: '#a16207' },
    { id: 'r3', name: 'Oblyvium UI', author: 'Oblyvium', version: '2.4.7', source: 'Servidor', enabled: true, color: '#6d28d9' },
  ],
  shaders: [
    { id: 'h1', name: 'Complementary Reimagined', author: 'EminGT', version: 'r5.4', source: 'Modrinth', enabled: true, color: '#0369a1' },
    { id: 'h2', name: 'BSL Shaders', author: 'capttatsu', version: 'v8.4', source: 'CurseForge', enabled: false, color: '#c2410c' },
  ],
  worlds: [
    { id: 'w1', name: 'Fábrica Central', author: 'Sobrevivência · 41 h', version: '1.21.1', source: 'Local', enabled: true, color: '#166534' },
    { id: 'w2', name: 'Teste de trens', author: 'Criativo · 3 h', version: '1.21.1', source: 'Local', enabled: true, color: '#1d4ed8' },
  ],
}

export const discover: DiscoverItem[] = [
  { id: 'd1', name: 'Prominence II', author: 'Elic', description: 'RPG com classes, chefes e masmorras feitas à mão.', loader: 'Fabric', mcVersion: '1.20.1', source: 'CurseForge', downloads: '3,3 mi', updated: 'há 5 dias', categories: ['Aventura', 'Magia'], scene: 'dusk', sizeMb: 1900, mods: 260 },
  { id: 'd2', name: 'Better MC', author: 'Luna Pixel', description: 'Vanilla+ com novos biomas, estruturas, mobs e qualidade de vida.', loader: 'Fabric', mcVersion: '1.20.1', source: 'CurseForge', downloads: '22 mi', updated: 'há 2 semanas', categories: ['Exploração', 'Leve'], scene: 'grove', sizeMb: 1200, mods: 230 },
  { id: 'd3', name: 'Cobblemon Official', author: 'Cobblemon', description: 'Criaturas para capturar, treinar e batalhar.', loader: 'Fabric', mcVersion: '1.21.1', source: 'Modrinth', downloads: '6,1 mi', updated: 'ontem', categories: ['Aventura', 'Multiplayer'], scene: 'tide', sizeMb: 640, mods: 48 },
  { id: 'd4', name: 'Create: Above and Beyond', author: 'simibubi', description: 'Progressão guiada por automação com Create.', loader: 'Forge', mcVersion: '1.18.2', source: 'CurseForge', downloads: '4,0 mi', updated: 'há 1 mês', categories: ['Tecnologia'], scene: 'ember', sizeMb: 900, mods: 180 },
  { id: 'd5', name: 'Simply Optimized', author: 'robotkoer', description: 'Só otimização, nada de conteúdo novo.', loader: 'Fabric', mcVersion: '1.21.4', source: 'Modrinth', downloads: '2,4 mi', updated: 'há 3 dias', categories: ['Otimização', 'Leve'], scene: 'frost', sizeMb: 120, mods: 22 },
  { id: 'd6', name: 'Enigmatica 10', author: 'NillerMedDild', description: 'Kitchen sink com missões e progressão em capítulos.', loader: 'NeoForge', mcVersion: '1.21.1', source: 'CurseForge', downloads: '1,1 mi', updated: 'há 4 dias', categories: ['Tecnologia', 'Magia'], scene: 'arcane', sizeMb: 3400, mods: 320 },
]

export const discoverCategories = ['Aventura', 'Tecnologia', 'Magia', 'Otimização', 'Exploração', 'Leve', 'Multiplayer']

export const javaRuntimes = [
  { version: 'Java 21', path: '~/.oblyvium/runtime/java-21-temurin', use: 'MC 1.20.5+', managed: true },
  { version: 'Java 17', path: '~/.oblyvium/runtime/java-17-temurin', use: 'MC 1.17–1.20.4', managed: true },
  { version: 'Java 8', path: 'C:\\Program Files\\Java\\jre1.8.0_421', use: 'MC até 1.16', managed: false },
]

export const systemMemoryGb = 32
