import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { locale, t } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCount(n: number) {
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000)
  if (m < 1) return t('agora')
  if (m < 60) return t('há {n} min', { n: m })
  const h = Math.round(m / 60)
  return h < 24 ? t('há {n} h', { n: h }) : t('há {n} d', { n: Math.round(h / 24) })
}
