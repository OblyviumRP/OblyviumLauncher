import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import type { Skin } from '@/data/types'
import { cn } from '@/lib/utils'

// Personagem em blocos com CSS 3D. Arrastar gira; parado, balança de leve.

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `rgb(${c((n >> 16) & 255)} ${c((n >> 8) & 255)} ${c(n & 255)})`
}

function Cuboid({ w, h, d, x, y, color, top, style }: { w: number; h: number; d: number; x: number; y: number; color: string; top?: string; style?: CSSProperties }) {
  const face = 'absolute left-0 top-0 [backface-visibility:hidden]'
  return (
    <div className="absolute [transform-style:preserve-3d]" style={{ width: w, height: h, left: x, top: y, ...style }}>
      <div className={face} style={{ width: w, height: h, background: color, transform: `translateZ(${d / 2}px)` }} />
      <div className={face} style={{ width: w, height: h, background: shade(color, 0.7), transform: `rotateY(180deg) translateZ(${d / 2}px)` }} />
      <div className={face} style={{ width: d, height: h, background: shade(color, 0.8), transform: `translateX(${(w - d) / 2}px) rotateY(90deg) translateZ(${w / 2}px)` }} />
      <div className={face} style={{ width: d, height: h, background: shade(color, 0.8), transform: `translateX(${(w - d) / 2}px) rotateY(-90deg) translateZ(${w / 2}px)` }} />
      <div className={face} style={{ width: w, height: d, background: top ?? shade(color, 1.1), transform: `translateY(${(h - d) / 2}px) rotateX(90deg) translateZ(${h / 2}px)` }} />
      <div className={face} style={{ width: w, height: d, background: shade(color, 0.6), transform: `translateY(${(h - d) / 2}px) rotateX(-90deg) translateZ(${h / 2}px)` }} />
    </div>
  )
}

export function SkinFigure({ skin, slim, cape, scale = 1, interactive = false, className }: { skin: Skin; slim?: boolean; cape?: boolean; scale?: number; interactive?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const rotY = useMotionValue(-24)
  const dragging = useRef(false)
  const transform = useTransform(rotY, (v) => `rotateX(-8deg) rotateY(${v}deg)`)

  useEffect(() => {
    if (!interactive || reduce) return
    const ctrl = animate(rotY, [-24, 24, -24], { duration: 8, repeat: Infinity, ease: 'easeInOut' })
    return () => ctrl.stop()
  }, [interactive, reduce, rotY])

  const u = 8 * scale
  const arm = (slim ? 3 : 4) * u
  const W = 16 * u
  const head = 8 * u
  const body = 8 * u
  const legW = 4 * u
  const torsoH = 12 * u

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return
    dragging.current = true
    rotY.stop()
    const startX = e.clientX
    const start = rotY.get()
    const move = (ev: PointerEvent) => rotY.set(start + (ev.clientX - startX) * 0.8)
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const cx = (W - body) / 2
  return (
    <div
      className={cn('grid place-items-center [perspective:900px]', interactive && 'cursor-grab touch-none active:cursor-grabbing', className)}
      onPointerDown={onPointerDown}
    >
      <motion.div className="relative [transform-style:preserve-3d]" style={{ width: W, height: head + torsoH * 2, transform }}>
        <Cuboid w={head} h={head} d={head} x={(W - head) / 2} y={0} color={skin.skin} top={skin.hair} />
        <div className="absolute [transform-style:preserve-3d]" style={{ left: (W - head) / 2, top: 0, width: head, height: head * 0.3, background: skin.hair, transform: `translateZ(${head / 2 + 0.5}px)` }} />
        <div className="absolute flex justify-center [transform-style:preserve-3d]" style={{ left: (W - head) / 2, top: head * 0.5, width: head, gap: head * 0.25, transform: `translateZ(${head / 2 + 0.6}px)` }}>
          <span style={{ width: u, height: u, background: '#fff' }} />
          <span style={{ width: u, height: u, background: '#fff' }} />
        </div>
        <Cuboid w={body} h={torsoH} d={4 * u} x={cx} y={head} color={skin.shirt} />
        <Cuboid w={arm} h={torsoH} d={4 * u} x={cx - arm} y={head} color={skin.shirt} />
        <Cuboid w={arm} h={torsoH} d={4 * u} x={cx + body} y={head} color={skin.shirt} />
        <div className="absolute [transform-style:preserve-3d]" style={{ left: cx - arm, top: head + torsoH * 0.55, width: arm, height: torsoH * 0.45, background: skin.skin, transform: `translateZ(${2 * u + 0.5}px)` }} />
        <div className="absolute [transform-style:preserve-3d]" style={{ left: cx + body, top: head + torsoH * 0.55, width: arm, height: torsoH * 0.45, background: skin.skin, transform: `translateZ(${2 * u + 0.5}px)` }} />
        <Cuboid w={legW} h={torsoH} d={4 * u} x={cx} y={head + torsoH} color={skin.pants} />
        <Cuboid w={legW} h={torsoH} d={4 * u} x={cx + legW} y={head + torsoH} color={skin.pants} />
        <div className="absolute" style={{ left: cx, top: head + torsoH * 2 - 2 * u, width: body, height: 2 * u, background: skin.shoes, transform: `translateZ(${2 * u + 0.5}px)` }} />
        {cape && (
          <div
            className="absolute border-2 border-primary-light"
            style={{ left: cx - u, top: head, width: body + 2 * u, height: torsoH * 1.4, background: '#4c1d95', transform: `translateZ(${-2 * u - 2}px) rotateX(6deg)`, transformOrigin: 'top' }}
          />
        )}
      </motion.div>
    </div>
  )
}
