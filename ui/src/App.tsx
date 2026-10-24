import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell, Providers } from '@/components/layout/app-shell'
import { ConsolePage } from '@/pages/console'
import { DiscoverPage } from '@/pages/discover'
import { DownloadsPage } from '@/pages/downloads'
import { HomePage } from '@/pages/home'
import { InstancePage } from '@/pages/instance'
import { LibraryPage } from '@/pages/library'
import { ModpackPage } from '@/pages/modpack'
import { OnboardingPage } from '@/pages/onboarding'
import { SettingsPage } from '@/pages/settings'
import { SkinsPage } from '@/pages/skins'
import { useLauncher } from '@/store/launcher'

function FirstRunGate({ children }: { children: React.ReactNode }) {
  const onboarded = useLauncher((s) => s.onboarded)
  return onboarded ? <>{children}</> : <Navigate to="/boas-vindas" replace />
}

// HashRouter: funciona com file:// dentro do Electron.
export default function App() {
  return (
    <HashRouter>
      <Providers>
        <Routes>
          <Route path="/boas-vindas" element={<OnboardingPage />} />
          <Route
            element={
              <FirstRunGate>
                <AppShell />
              </FirstRunGate>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="biblioteca" element={<LibraryPage />} />
            <Route path="instancia/:id" element={<InstancePage />} />
            <Route path="descobrir" element={<DiscoverPage />} />
            <Route path="descobrir/:id" element={<ModpackPage />} />
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
