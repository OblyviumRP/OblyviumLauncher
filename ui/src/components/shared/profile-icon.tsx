import { useMemo } from 'react'
import { backend } from '@/backend'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

let cache: Map<string, { label: string; svg: string }> | null = null
export function profileIcons() {
  if (cache == null) cache = new Map(backend().profileIcons().map((i) => [i.name, { label: i.label, svg: i.svg }]))
  return cache
}

/** Ícone de linha do perfil (o SVG vem de app/assets/js/profileicons.js, gerado localmente). */
export function ProfileIcon({ name, className }: { name: string; className?: string }) {
  const svg = useMemo(() => profileIcons().get(name)?.svg ?? profileIcons().values().next().value?.svg ?? '', [name])
  return <span aria-hidden className={cn('inline-grid size-4 shrink-0 place-items-center [&_svg]:size-full', className)} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Nome do perfil para mostrar: o padrão ("Padrão") é traduzido; os criados pelo jogador, não. */
export function profileLabel(p: { name: string; isDefault: boolean }) {
  return p.isDefault ? t(p.name) : p.name
}
