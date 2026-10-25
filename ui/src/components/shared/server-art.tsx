import { useState } from 'react'
import type { ServerInfo } from '@/backend'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { InstanceIcon, PixelScene } from './pixel-scene'

/** Arte de fundo do servidor: a imagem da distribuição, ou o cenário gerado quando não há. */
export function ServerArt({ server, className, twinkle, cols, rows }: { server: ServerInfo; className?: string; twinkle?: boolean; cols?: number; rows?: number }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (server.background && failed !== server.background) {
    return <img src={server.background} alt="" draggable={false} onError={() => setFailed(server.background)} className={cn('size-full object-cover', className)} />
  }
  return <PixelScene scene={server.scene} twinkle={twinkle} cols={cols} rows={rows} className={className} />
}

export function hasRealArt(server: ServerInfo) {
  return Boolean(server.background)
}

export function artNotice() {
  return t('Arte gerada, não é uma captura do servidor')
}


export function ServerIcon({ server, className }: { server: ServerInfo; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (server.icon && !failed) {
    return <img src={server.icon} alt="" draggable={false} onError={() => setFailed(true)} className={cn('shrink-0 rounded-md object-cover [image-rendering:pixelated]', className)} />
  }
  return <InstanceIcon scene={server.scene} name={server.name} className={className} />
}
