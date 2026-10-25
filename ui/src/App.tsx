import { Loader2, TriangleAlert } from 'lucide-react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell, Providers } from '@/components/layout/app-shell'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { PixelScene } from '@/components/shared/pixel-scene'
import { Button } from '@/components/ui/button'
import { ConsolePage } from '@/pages/console'
import { DownloadsPage } from '@/pages/downloads'
import { HomePage } from '@/pages/home'
import { OnboardingPage } from '@/pages/onboarding'
import { ProfilePage } from '@/pages/profile'
import { SettingsPage } from '@/pages/settings'
import { SkinsPage } from '@/pages/skins'
import { t } from '@/i18n'
import { useLauncher } from '@/store/launcher'

function Splash({ error }: { error?: string }) {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden p-4">
      <div className="absolute inset-0 -z-10 opacity-50">
        <PixelScene scene="arcane" twinkle />
      </div>
      <div className="absolute inset-0 -z-10 bg-overlay" aria-hidden />
      <div role="status" className="flex max-w-sm flex-col items-center gap-4 text-center">
        <OblyviumMark className="size-14 text-primary-light" />
        <span className="font-minecraft text-sm tracking-wide">OBLYVIUM</span>
        {error ? (
          <>
            <p className="flex items-start gap-2 text-sm text-danger-fg">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t(error)}
            </p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t('Tentar de novo')}
            </Button>
          </>
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t('Carregando servidores…')}
          </span>
        )}
      </div>
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const boot = useLauncher((s) => s.boot)
  const hasAccount = useLauncher((s) => s.accounts.length > 0)
  if (boot.phase === 'booting') return <Splash />
  if (boot.phase === 'error') return <Splash error={boot.message} />
  return hasAccount ? <>{children}</> : <Navigate to="/boas-vindas" replace />
}

function BootOnly({ children }: { children: React.ReactNode }) {
  const boot = useLauncher((s) => s.boot)
  if (boot.phase === 'booting') return <Splash />
  if (boot.phase === 'error') return <Splash error={boot.message} />
  return <>{children}</>
}

// HashRouter: funciona com file:// dentro do Electron.
export default function App() {
  return (
    <HashRouter>
      <Providers>
        <Routes>
          <Route
            path="/boas-vindas"
            element={
              <BootOnly>
                <OnboardingPage />
              </BootOnly>
            }
          />
          <Route
            element={
              <Gate>
                <AppShell />
              </Gate>
            }
          >
            <Route index element={<HomePage />} />

            <Route path="perfil" element={<ProfilePage />} />
            <Route path="skins" element={<SkinsPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="console" element={<ConsolePage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Providers>
    </HashRouter>
  )
}
