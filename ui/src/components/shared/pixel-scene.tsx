import { memo, useMemo } from 'react'
import type { SceneKey } from '@/data/types'
import { cn } from '@/lib/utils'

// Cenário noturno em pixel art gerado por código: substitui capturas que não temos.
// Cada instância tem uma paleta; a forma vem de uma semente fixa, então é sempre igual.

type Palette = { sky: [string, string, string]; star: string; moon: string; far: string; mid: string; near: string; ground: string; top: string; glow: string; castle?: boolean }

export const scenes: Record<SceneKey, Palette> = {
  arcane: { sky: ['#0b0716', '#140c26', '#1f1238'], star: '#c4b5fd', moon: '#ede9fe', far: '#2a1a4a', mid: '#1b1032', near: '#120a22', ground: '#0a0612', top: '#5b3a8f', glow: '#a78bfa', castle: true },
  ember: { sky: ['#120806', '#241009', '#3a170b'], star: '#fcd34d', moon: '#fde68a', far: '#4a1d0c', mid: '#2e1208', near: '#1c0b05', ground: '#0f0603', top: '#b45309', glow: '#f59e0b' },
  tide: { sky: ['#050b14', '#0a1626', '#0f2238'], star: '#bae6fd', moon: '#e0f2fe', far: '#12304d', mid: '#0c2238', near: '#081726', ground: '#050d17', top: '#0e7490', glow: '#38bdf8' },
  grove: { sky: ['#050d0a', '#0a1a12', '#10281b'], star: '#bbf7d0', moon: '#ecfccb', far: '#163a24', mid: '#0f2a1a', near: '#0a1d12', ground: '#06120b', top: '#3f8f3a', glow: '#86efac' },
  dusk: { sky: ['#12060f', '#22091d', '#360d2b'], star: '#fbcfe8', moon: '#fce7f3', far: '#4a1238', mid: '#2e0b24', near: '#1d0717', ground: '#11040d', top: '#9d174d', glow: '#f472b6' },
  frost: { sky: ['#070a12', '#0e1424', '#151f36'], star: '#e0e7ff', moon: '#f8fafc', far: '#2b3a5c', mid: '#1c2742', near: '#121a2e', ground: '#0b1120', top: '#94a3b8', glow: '#c7d2fe' },
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function ridge(cols: number, base: number, amp: number, rough: number, r: () => number) {
  const out: number[] = []
  let h = base
  for (let x = 0; x < cols; x++) {
    h += (r() - 0.5) * rough
    h = Math.max(base - amp, Math.min(base + amp, h))
    out.push(Math.round(h))
  }
  return out
}

const seedOf = (k: string) => [...k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)

export const PixelScene = memo(function PixelScene({
  scene,
  cols = 96,
  rows = 54,
  className,
  stars = true,
  twinkle = false,
}: {
  scene: SceneKey
  cols?: number
  rows?: number
  className?: string
  stars?: boolean
  twinkle?: boolean
}) {
  const p = scenes[scene]
  const data = useMemo(() => {
    const r = rng(seedOf(scene) + cols)
    const u = rows / 54
    const far = ridge(cols, rows * 0.55, 7 * u, 3, r)
    const mid = ridge(cols, rows * 0.68, 5 * u, 2.4, r)
    const near = ridge(cols, rows * 0.8, 3 * u, 1.6, r)
    const starList = Array.from({ length: Math.round(cols * 0.35) }, () => ({ x: Math.floor(r() * cols), y: Math.floor(r() * rows * 0.45), big: r() > 0.85, d: r() * 3 }))
    const moon = { x: Math.floor(cols * (0.78 + r() * 0.1)), y: Math.floor(rows * 0.26), rad: Math.max(2, Math.round(3.5 * u)) }
    return { far, mid, near, starList, moon }
  }, [scene, cols, rows])

  const castleX = Math.floor(cols * 0.3)
  const castleBase = data.mid[castleX]
  const castle = p.castle
    ? [
        { x: castleX - 6, w: 12, h: 9 },
        { x: castleX - 8, w: 3, h: 14 },
        { x: castleX + 5, w: 3, h: 14 },
        { x: castleX - 1, w: 3, h: 19 },
      ]
    : []

  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" className={cn('block size-full', className)} aria-hidden>
      <rect width={cols} height={rows} fill={p.sky[0]} />
      <rect y={rows * 0.3} width={cols} height={rows * 0.7} fill={p.sky[1]} />
      <rect y={rows * 0.48} width={cols} height={rows * 0.52} fill={p.sky[2]} />
      {stars &&
        data.starList.map((s, i) => (
          <rect
            key={i}
            x={s.x}
            y={s.y}
            width={s.big ? 1 : 0.6}
            height={s.big ? 1 : 0.6}
            fill={p.star}
            opacity={s.big ? 0.9 : 0.55}
            style={twinkle ? { animation: `twinkle ${2.5 + s.d}s ease-in-out ${s.d}s infinite` } : undefined}
          />
        ))}
      <g fill={p.moon}>
        {Array.from({ length: data.moon.rad * 2 }, (_, i) => {
          const dy = i - data.moon.rad + 0.5
          const half = Math.round(Math.sqrt(data.moon.rad ** 2 - dy ** 2))
          return <rect key={i} x={data.moon.x - half} y={data.moon.y - data.moon.rad + i} width={half * 2} height={1.02} />
        })}
      </g>
      <rect x={data.moon.x - 1} y={data.moon.y - 1} width={1} height={1} fill={p.sky[2]} opacity={0.3} />
      <rect x={data.moon.x + 1} y={data.moon.y + 1} width={1} height={1} fill={p.sky[2]} opacity={0.2} />
      {data.far.map((h, x) => (
        <rect key={`f${x}`} x={x} y={h} width={1.02} height={rows - h} fill={p.far} />
      ))}
      {castle.map((c, i) => (
        <rect key={`c${i}`} x={c.x} y={castleBase - c.h} width={c.w} height={c.h + 2} fill={p.mid} />
      ))}
      {p.castle && <rect x={castleX} y={castleBase - 15} width={1} height={1.4} fill={p.glow} />}
      {p.castle && <rect x={castleX - 3} y={castleBase - 6} width={1} height={1.2} fill={p.glow} opacity={0.8} />}
      {data.mid.map((h, x) => (
        <rect key={`m${x}`} x={x} y={h} width={1.02} height={rows - h} fill={p.mid} />
      ))}
      {data.near.map((h, x) => (
        <g key={`n${x}`}>
          <rect x={x} y={h} width={1.02} height={rows - h} fill={p.ground} />
          <rect x={x} y={h} width={1.02} height={1} fill={p.top} opacity={0.75} />
        </g>
      ))}
    </svg>
  )
})

export function InstanceIcon({ scene, name, className }: { scene: SceneKey; name: string; className?: string }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-md', className)}>
      <PixelScene scene={scene} cols={24} rows={24} stars={false} className="absolute inset-0" />
      <span className="relative font-minecraft text-[10px] text-white [text-shadow:1px_1px_0_rgb(0_0_0/0.8)]">{name.charAt(0)}</span>
    </span>
  )
}
