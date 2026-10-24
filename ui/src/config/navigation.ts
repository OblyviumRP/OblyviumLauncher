import { Compass, Download, House, LayoutGrid, Settings, Shirt, SquareTerminal, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; match?: string[] }

// Fonte única da navegação: sidebar e títulos derivam daqui.
export const mainNav: NavItem[] = [
  { to: '/', label: 'Início', icon: House },
  { to: '/biblioteca', label: 'Biblioteca', icon: LayoutGrid, match: ['/instancia'] },
  { to: '/descobrir', label: 'Descobrir', icon: Compass },
  { to: '/skins', label: 'Skins', icon: Shirt },
  { to: '/downloads', label: 'Downloads', icon: Download },
]

export const footerNav: NavItem[] = [
  { to: '/console', label: 'Console', icon: SquareTerminal },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function isActive(item: NavItem, pathname: string) {
  if (item.to === '/') return pathname === '/'
  return pathname.startsWith(item.to) || (item.match ?? []).some((m) => pathname.startsWith(m))
}
