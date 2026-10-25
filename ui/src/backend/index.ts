import type { Backend } from './types'

export * from './types'

// Dentro do Electron (nodeIntegration) a página tem window.require; no navegador usa a simulação.
let current: Backend | null = null

export async function initBackend(): Promise<Backend> {
  if (current) return current
  const w = window as unknown as { require?: unknown }
  if (typeof w.require === 'function') {
    current = (await import('./electron')).createElectronBackend()
  } else {
    current = (await import('./mock')).createMockBackend()
  }
  return current
}

export function backend(): Backend {
  if (!current) throw new Error('Backend ainda não iniciado')
  return current
}
