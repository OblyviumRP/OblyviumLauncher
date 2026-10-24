import type { DiscoverItem } from '@/data/types'
import { useShallow } from 'zustand/react/shallow'
import { useLauncher } from '@/store/launcher'

/** Coloca um modpack na fila; ao terminar ele vira instância da biblioteca. */
export function installModpack(item: DiscoverItem, version?: string) {
  const { enqueue, instances, downloads } = useLauncher.getState()
  const id = `mp-${item.id}`
  if (instances.some((i) => i.id === id) || downloads.some((d) => d.id === id && d.status !== 'done')) return false
  enqueue({
    id,
    name: version ? `${item.name} ${version}` : item.name,
    detail: `Modpack · ${item.mods} mods · ${item.loader} ${item.mcVersion}`,
    sizeMb: item.sizeMb,
    scene: item.scene,
    onDone: 'install-instance',
    payload: {
      id,
      name: item.name,
      loader: item.loader,
      loaderVersion: 'estável',
      mcVersion: item.mcVersion,
      source: item.source,
      kind: 'modpack',
      description: item.description,
      mods: item.mods,
      sizeMb: item.sizeMb * 2.2,
      playtimeH: 0,
      lastPlayed: 'nunca',
      scene: item.scene,
      memoryGb: item.mods > 200 ? 8 : 6,
    },
  })
  return true
}

export function useInstallState(itemId: string) {
  return useLauncher(useShallow((s) => {
    const id = `mp-${itemId}`
    if (s.instances.some((i) => i.id === id)) return { state: 'installed' as const, progress: 100 }
    const d = s.downloads.find((x) => x.id === id && x.status !== 'done')
    if (d) return { state: 'installing' as const, progress: d.progress }
    return { state: 'none' as const, progress: 0 }
  }))
}
