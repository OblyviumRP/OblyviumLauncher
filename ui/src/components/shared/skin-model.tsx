import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// Personagem 3D em CSS montado a partir da textura real da skin (64×64 ou 64×32).
// Cada face é um recorte da imagem com background-position; nada de canvas ou WebGL.

type Box = { u: number; v: number; w: number; h: number; d: number }

function useTextureHeight(src: string | null) {
  const [h, setH] = useState(64)
  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => setH(img.naturalHeight === 32 ? 32 : 64)
    img.src = src
  }, [src])
  return h
}

function Face({ src, tex, x, y, w, h, s, style, flip }: { src: string; tex: [number, number]; x: number; y: number; w: number; h: number; s: number; style: CSSProperties; flip?: boolean }) {
  return (
    <div
      className="absolute left-0 top-0 [backface-visibility:hidden] [image-rendering:pixelated]"
      style={{
        width: w * s,
        height: h * s,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${tex[0] * s}px ${tex[1] * s}px`,
        backgroundPosition: `${-x * s}px ${-y * s}px`,
        ...style,
        transform: `${style.transform ?? ''}${flip ? ' scaleX(-1)' : ''}`,
      }}
    />
  )
}

/** Um bloco texturizado. (u, v) é o canto do mapa UV do Minecraft para esse bloco. */
function Part({ src, tex, box, s, x, y, z = 0, inflate = 0, mirror }: { src: string; tex: [number, number]; box: Box; s: number; x: number; y: number; z?: number; inflate?: number; mirror?: boolean }) {
  const { u, v, w, h, d } = box
  const W = w * s + inflate * 2
  const H = h * s + inflate * 2
  const D = d * s + inflate * 2
  const k = W / (w * s)
  const face = (fx: number, fy: number, fw: number, fh: number, transform: string, flip?: boolean) => (
    <Face src={src} tex={tex} x={fx} y={fy} w={fw} h={fh} s={s * k} style={{ transform }} flip={flip} />
  )
  // Com espelho (membros esquerdos de skins 64×32) as faces laterais trocam de lado.
  const right = mirror ? [u + d + w, v + d] : [u, v + d]
  const left = mirror ? [u, v + d] : [u + d + w, v + d]
  return (
    <div className="absolute [transform-style:preserve-3d]" style={{ width: W, height: H, left: x - inflate, top: y - inflate, transform: `translateZ(${z}px)` }}>
      {face(u + d, v + d, w, h, `translateZ(${D / 2}px)`, mirror)}
      {face(u + 2 * d + w, v + d, w, h, `rotateY(180deg) translateZ(${D / 2}px)`, mirror)}
      {face(left[0], left[1], d, h, `translateX(${(W - D) / 2}px) rotateY(90deg) translateZ(${W / 2}px)`, mirror)}
      {face(right[0], right[1], d, h, `translateX(${(W - D) / 2}px) rotateY(-90deg) translateZ(${W / 2}px)`, mirror)}
      {face(u + d, v, w, d, `translateY(${(H - D) / 2}px) rotateX(90deg) translateZ(${H / 2}px)`, mirror)}
      {face(u + d + w, v, w, d, `translateY(${(H - D) / 2}px) rotateX(-90deg) translateZ(${H / 2}px)`, mirror)}
    </div>
  )
}

export function SkinModel({ src, slim, capeSrc, scale = 1, interactive = false, className }: { src: string; slim?: boolean; capeSrc?: string | null; scale?: number; interactive?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const rotY = useMotionValue(-24)
  const transform = useTransform(rotY, (v) => `rotateX(-8deg) rotateY(${v}deg)`)
  const texH = useTextureHeight(src)
  const legacy = texH === 32
  const tex: [number, number] = [64, texH]

  useEffect(() => {
    if (!interactive || reduce) return
    const ctrl = animate(rotY, [-24, 24, -24], { duration: 8, repeat: Infinity, ease: 'easeInOut' })
    return () => ctrl.stop()
  }, [interactive, reduce, rotY])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return
    rotY.stop()
    const startX = e.clientX
    const start = rotY.get()
    const move = (ev: PointerEvent) => rotY.set(start + (ev.clientX - startX) * 0.8)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const s = 8 * scale // pixels de tela por pixel da textura
  const a = slim ? 3 : 4
  const W = 16 * s
  const bx = (W - 8 * s) / 2
  const parts = (
    <>
      <Part src={src} tex={tex} s={s} box={{ u: 0, v: 0, w: 8, h: 8, d: 8 }} x={bx} y={0} />
      <Part src={src} tex={tex} s={s} box={{ u: 32, v: 0, w: 8, h: 8, d: 8 }} x={bx} y={0} inflate={0.5 * s} />
      <Part src={src} tex={tex} s={s} box={{ u: 16, v: 16, w: 8, h: 12, d: 4 }} x={bx} y={8 * s} />
      <Part src={src} tex={tex} s={s} box={{ u: 40, v: 16, w: a, h: 12, d: 4 }} x={bx - a * s} y={8 * s} />
      <Part src={src} tex={tex} s={s} box={legacy ? { u: 40, v: 16, w: a, h: 12, d: 4 } : { u: 32, v: 48, w: a, h: 12, d: 4 }} x={bx + 8 * s} y={8 * s} mirror={legacy} />
      <Part src={src} tex={tex} s={s} box={{ u: 0, v: 16, w: 4, h: 12, d: 4 }} x={bx} y={20 * s} />
      <Part src={src} tex={tex} s={s} box={legacy ? { u: 0, v: 16, w: 4, h: 12, d: 4 } : { u: 16, v: 48, w: 4, h: 12, d: 4 }} x={bx + 4 * s} y={20 * s} mirror={legacy} />
      {!legacy && (
        <>
          <Part src={src} tex={tex} s={s} box={{ u: 16, v: 32, w: 8, h: 12, d: 4 }} x={bx} y={8 * s} inflate={0.25 * s} />
          <Part src={src} tex={tex} s={s} box={{ u: 40, v: 32, w: a, h: 12, d: 4 }} x={bx - a * s} y={8 * s} inflate={0.25 * s} />
          <Part src={src} tex={tex} s={s} box={{ u: 48, v: 48, w: a, h: 12, d: 4 }} x={bx + 8 * s} y={8 * s} inflate={0.25 * s} />
          <Part src={src} tex={tex} s={s} box={{ u: 0, v: 32, w: 4, h: 12, d: 4 }} x={bx} y={20 * s} inflate={0.25 * s} />
          <Part src={src} tex={tex} s={s} box={{ u: 0, v: 48, w: 4, h: 12, d: 4 }} x={bx + 4 * s} y={20 * s} inflate={0.25 * s} />
        </>
      )}
      {capeSrc && (
        <div className="absolute [transform-style:preserve-3d]" style={{ left: bx - s, top: 8 * s, width: 10 * s, height: 16 * s, transform: `translateZ(${-2 * s - 1}px) rotateX(8deg) rotateY(180deg)`, transformOrigin: 'top' }}>
          <Part src={capeSrc} tex={[64, 32]} s={s} box={{ u: 0, v: 0, w: 10, h: 16, d: 1 }} x={0} y={0} />
        </div>
      )}
    </>
  )

  return (
    <div className={cn('grid place-items-center [perspective:900px]', interactive && 'cursor-grab touch-none active:cursor-grabbing', className)} onPointerDown={onPointerDown}>
      <motion.div className="relative [transform-style:preserve-3d]" style={{ width: W, height: 32 * s, transform }}>
        {parts}
      </motion.div>
    </div>
  )
}
