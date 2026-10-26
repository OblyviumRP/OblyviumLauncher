import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import castelo from '@/assets/scene/inicio-castelo.webp'
import ceu from '@/assets/scene/inicio-ceu.webp'
import estrelas from '@/assets/scene/inicio-estrelas.webp'
import lua from '@/assets/scene/inicio-lua.webp'
import montanhasFundo from '@/assets/scene/inicio-montanhas-fundo.webp'
import montanhasPerto from '@/assets/scene/inicio-montanhas-perto.webp'
import nevoa from '@/assets/scene/inicio-nevoa.webp'
import primeiroPlano from '@/assets/scene/inicio-primeiro-plano.webp'

// As camadas do hero do site (oblyvium.com.br), com a mesma profundidade, escala e opacidade.
// depth 0 é o primeiro plano (anda mais), perto de 1 é o céu (quase parado).
const layers = [
  { src: ceu, depth: 0.9 },
  { src: estrelas, depth: 0.85, className: 'opacity-60' },
  { src: lua, depth: 0.8, img: 'scale-[0.7] origin-[74%_33%]' },
  { src: montanhasFundo, depth: 0.65 },
  { src: montanhasPerto, depth: 0.45 },
  { src: castelo, depth: 0.3, zoom: 1.04, img: 'scale-[0.6] origin-[73%_95%]' },
  // Névoa parada: a deriva contínua do site pediria um "Pausar animações" (WCAG 2.2.2).
  { src: nevoa, depth: 0.15, className: 'opacity-25', img: '-left-[8%] w-[116%]' },
  { src: primeiroPlano, depth: 0 },
]

/** Cenário do reino em camadas. A tela não rola, então o parallax segue o ponteiro. */
export function RealmScene({ className }: { className?: string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Alvo do ponteiro e posição atual, de -1 a 1. A posição persegue o alvo a cada quadro;
    // uma transition do CSS recomeçaria a curva a cada movimento e daria solavanco.
    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let frame = 0
    const step = () => {
      cur.x += (target.x - cur.x) * 0.1
      cur.y += (target.y - cur.y) * 0.1
      const done = Math.abs(target.x - cur.x) < 0.001 && Math.abs(target.y - cur.y) < 0.001
      if (done) Object.assign(cur, target)
      refs.current.forEach((el, i) => {
        if (!el) return
        const { depth, zoom = 1 } = layers[i]
        el.style.transform = `translate3d(${(cur.x * (1 - depth) * -20).toFixed(2)}px, ${(cur.y * (1 - depth) * -10).toFixed(2)}px, 0) scale(${zoom})`
      })
      frame = done ? 0 : requestAnimationFrame(step)
    }
    const aim = (x: number, y: number) => {
      target.x = x
      target.y = y
      if (!frame) frame = requestAnimationFrame(step)
    }
    const move = (e: PointerEvent) => aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1)
    const center = () => aim(0, 0)
    addEventListener('pointermove', move)
    document.documentElement.addEventListener('pointerleave', center)
    return () => {
      removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', center)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div aria-hidden className={cn('overflow-hidden', className)}>
      {layers.map((l, i) => (
        <div key={l.src} ref={(el) => void (refs.current[i] = el)} className={cn('fj-parallax', l.className)} style={{ transform: `scale(${l.zoom ?? 1})` }}>
          <img src={l.src} alt="" draggable={false} className={cn('absolute inset-0 h-full w-full object-cover object-[72%_40%]', l.img)} />
        </div>
      ))}
    </div>
  )
}
