import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { backend } from '@/backend'
import { AskDialog } from '@/components/shared/ask-dialog'
import { ServerArt } from '@/components/shared/server-art'

import { TooltipProvider } from '@/components/ui/tooltip'
import { useLauncher, useServer } from '@/store/launcher'
import { Sidebar } from './sidebar'
import { TitleBar } from './title-bar'

export function Providers({ children }: { children: React.ReactNode }) {
  const start = useLauncher((s) => s.start)
  useEffect(() => {
    void start()
  }, [start])
  // F11 liga e desliga a tela cheia da janela do launcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return
      e.preventDefault()
      backend().setWindowFullscreen(!useLauncher.getState().windowFullscreen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={150} skipDelayDuration={0}>
        {children}
        <AskDialog />
        <Toaster
          theme="dark"
          position="bottom-right"
          offset={16}
          gap={8}
          toastOptions={{
            classNames: {
              toast: '!bg-popover !border-border-2 !text-foreground !rounded-lg !shadow-popover !font-sans',
              description: '!text-muted-foreground',
              success: '[&_[data-icon]]:!text-success-fg',
              error: '[&_[data-icon]]:!text-danger-fg',
              warning: '[&_[data-icon]]:!text-warning-fg',
              actionButton: '!bg-primary-fill !text-white !rounded-sm',
            },
          }}
        />
      </TooltipProvider>
    </MotionConfig>
  )
}

/** Arte do modpack atrás de toda a janela no Início (menu e barra de título ficam por cima). */
function Backdrop() {
  const server = useServer()
  if (!server) return null
  return (
    <motion.div
      key={server.id}
      aria-hidden
      className="absolute inset-0 -z-10 overflow-hidden"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <ServerArt server={server} twinkle className="absolute inset-0 size-full" />
      {/* Escurece à esquerda (texto) e embaixo (cartões), deixando a arte respirar à direita. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_8%,color-mix(in_srgb,var(--background)_72%,transparent)_42%,transparent_78%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--background)_0%,color-mix(in_srgb,var(--background)_55%,transparent)_30%,transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_70%,transparent),transparent)]" />
    </motion.div>
  )
}

export function AppShell() {
  const location = useLocation()
  // Uma chave por seção para não animar a troca de abas internas.
  const key = location.pathname.split('/').slice(0, 3).join('/')
  const onHome = location.pathname === '/'
  return (
    <div className="relative isolate flex h-full flex-col">
      <AnimatePresence>{onHome && <Backdrop key="backdrop" />}</AnimatePresence>
      <TitleBar />
      {/* O menu flutua: fica afastado das bordas, com cantos e fundo translúcido. */}
      <div className="flex min-h-0 flex-1 gap-1 pb-2 pl-2">
        <Sidebar />
        <main id="conteudo" className="relative min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
