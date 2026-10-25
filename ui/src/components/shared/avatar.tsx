import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Cabeça do jogador (minotar, a mesma fonte do launcher antigo). Sem rede, mostra a inicial. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !name) {
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-sm bg-primary-soft font-minecraft text-[10px] text-primary-fg', className)}>
        {name.charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    <img
      src={`https://minotar.net/helm/${encodeURIComponent(name)}/64.png`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-sm [image-rendering:pixelated]', className)}
    />
  )
}
