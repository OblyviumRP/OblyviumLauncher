import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initBackend } from './backend'
import { detectLanguage, isLang, setLanguage } from './i18n'
import { useLang } from './i18n/store'
import './index.css'

function Root() {
  const lang = useLang((s) => s.lang)
  return <App key={lang} />
}

initBackend().then((b) => {
  const saved = b.language()
  setLanguage(isLang(saved) ? saved : detectLanguage())
  useLang.setState({ lang: isLang(saved) ? saved : detectLanguage() })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
