import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Cabeça do jogador (minotar, a mesma fonte do launcher antigo). Sem rede, mostra a inicial.
 * A imagem fica num quadrado de tamanho fixo: assim não estica quando o menu lateral
 * muda de largura.
 */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span aria-hidden className={cn('relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-sm bg-primary-soft', className)}>
      {failed || !name ? (
        <span className="font-minecraft text-[10px] text-primary-fg">{name.charAt(0).toUpperCase() || '?'}</span>
      ) : (
        <img
          src={`https://minotar.net/helm/${encodeURIComponent(name)}/64.png`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-contain [image-rendering:pixelated]"
        />
      )}
    </span>
  )
}
