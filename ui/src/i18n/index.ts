import { categories } from './categories'
import { en } from './en'
import { es } from './es'

// O texto em português é a própria chave: t('Jogar') devolve 'Play' em inglês.
// Assim o código continua legível e uma tradução faltando cai no português.
// `npm run i18n:check` lista as chaves sem tradução.

export type Lang = 'pt-BR' | 'en' | 'es'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
]

const dictionaries: Record<Lang, Record<string, string> | null> = { 'pt-BR': null, en, es }

let current: Lang = 'pt-BR'

export function detectLanguage(): Lang {
  const nav = (navigator.language || 'pt-BR').toLowerCase()
  if (nav.startsWith('pt')) return 'pt-BR'
  if (nav.startsWith('es')) return 'es'
  return 'en'
}

export function isLang(value: unknown): value is Lang {
  return value === 'pt-BR' || value === 'en' || value === 'es'
}

export function setLanguage(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
}

export function getLanguage(): Lang {
  return current
}

/** Locale para datas e números. */
export function locale() {
  return current === 'pt-BR' ? 'pt-BR' : current === 'es' ? 'es' : 'en-US'
}

/** Traduz um texto em português. `{nome}` é trocado pelo valor em vars. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[current]
  let out = dict?.[text] ?? text
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** Escolhe entre singular e plural pelo número. */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>) {
  return t(n === 1 ? one : many, { n: n.toLocaleString(locale()), ...vars })
}

/** Nome de uma categoria do Modrinth no idioma atual. */
export function categoryLabel(slug: string) {
  const known = categories[slug]
  if (known) return known[current]
  return slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
