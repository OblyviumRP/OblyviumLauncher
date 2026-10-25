import { create } from 'zustand'
import { backend } from '@/backend'
import { getLanguage, setLanguage, type Lang } from './index'

// Trocar de idioma remonta a interface (a chave do App muda), então todo t() é refeito.
export const useLang = create<{ lang: Lang; change: (lang: Lang) => void }>((set) => ({
  lang: getLanguage(),
  change: (lang) => {
    setLanguage(lang)
    backend().setLanguage(lang)
    set({ lang })
  },
}))
