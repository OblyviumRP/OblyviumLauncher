import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { AskDialog } from '@/components/shared/ask-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useLauncher } from '@/store/launcher'
import { Sidebar } from './sidebar'
import { TitleBar } from './title-bar'

export function Providers({ children }: { children: React.ReactNode }) {
  const start = useLauncher((s) => s.start)
  useEffect(() => {
    void start()
  }, [start])
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

export function AppShell() {
  const location = useLocation()
  // Uma chave por seção para não animar a troca de abas internas.
  const key = location.pathname.split('/').slice(0, 3).join('/')
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
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
