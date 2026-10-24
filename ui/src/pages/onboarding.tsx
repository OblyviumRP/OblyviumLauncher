import { Check, Compass, FolderInput, Gamepad2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { PixelScene } from '@/components/shared/pixel-scene'
import { Button } from '@/components/ui/button'
import { systemMemoryGb } from '@/data/mock'
import { cn } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

const steps = ['Conta', 'Ajustes', 'Começar']

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <rect x="2" y="2" width="9.5" height="9.5" fill="#f25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7fba00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00a4ef" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#ffb900" />
    </svg>
  )
}

export function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [signing, setSigning] = useState(false)
  const setOnboarded = useLauncher((s) => s.setOnboarded)
  const memory = useLauncher((s) => s.settings.memoryGb)
  const navigate = useNavigate()

  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const signIn = () => {
    setSigning(true)
    setTimeout(() => {
      setSigning(false)
      go(1)
    }, 900)
  }
  const finish = (to: string) => {
    setOnboarded(true)
    navigate(to)
  }

  return (
    <div className="relative grid h-full place-items-center overflow-hidden p-4">
      <div className="absolute inset-0 -z-10 opacity-60">
        <PixelScene scene="arcane" twinkle />
      </div>
      <div className="absolute inset-0 -z-10 bg-overlay" aria-hidden />

      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        aria-label="Primeiro acesso"
        className="flex w-full max-w-md flex-col gap-6 overflow-hidden rounded-lg border border-border-2 bg-card p-7 shadow-dialog"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.span initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
            <OblyviumMark className="size-14 text-primary-light" />
          </motion.span>
          <span className="font-minecraft text-sm tracking-wide">OBLYVIUM</span>
        </div>

        <ol aria-label="Etapas" className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => (
            <li key={s} className={cn('flex flex-col gap-1.5 text-xs', i === step ? 'text-foreground' : 'text-muted-foreground')} aria-current={i === step ? 'step' : undefined}>
              <span className="h-1 overflow-hidden rounded-full bg-accent">
                <motion.span className="block h-full bg-primary" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
              </span>
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            {step === 0 && (
              <>
                <h1 className="text-lg font-semibold">Entre na sua conta</h1>
                <p className="text-sm text-muted-foreground">Use a conta Microsoft que tem o Minecraft: Java Edition. A senha é digitada na página da Microsoft, nunca aqui.</p>
                <Button size="xl" onClick={signIn} disabled={signing}>
                  <MicrosoftLogo /> {signing ? 'Abrindo a Microsoft…' : 'Entrar com Microsoft'}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => go(1)}>
                  Jogar offline
                </Button>
              </>
            )}
            {step === 1 && (
              <>
                <h1 className="text-lg font-semibold">Ajustamos para o seu PC</h1>
                <dl className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm">
                  {[
                    ['Memória do sistema', `${systemMemoryGb} GB`],
                    ['Memória para o jogo', `${memory} GB`],
                    ['Java', 'baixado automaticamente'],
                    ['Pasta', '%APPDATA%\\.OblyviumLauncher'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="flex items-center gap-1.5 font-mono text-xs"><Check className="size-3 text-success-fg" />{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">Dá para mudar tudo depois em Configurações.</p>
                <div className="flex gap-2">
                  <Button size="lg" variant="secondary" onClick={() => go(0)}>Voltar</Button>
                  <Button size="lg" className="flex-1" onClick={() => go(2)}>Continuar</Button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="text-lg font-semibold">Por onde começar?</h1>
                {[
                  { to: '/', icon: <Gamepad2 />, title: 'Jogar no Oblyvium RP', sub: 'Servidor oficial', primary: true },
                  { to: '/descobrir', icon: <Compass />, title: 'Explorar modpacks', sub: 'Modrinth e CurseForge' },
                  { to: '/biblioteca', icon: <FolderInput />, title: 'Importar instâncias', sub: 'Prism, MultiMC ou CurseForge' },
                ].map((o, i) => (
                  <motion.div key={o.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}>
                    <Link
                      to={o.to}
                      onClick={() => finish(o.to)}
                      className={cn(
                        'flex items-center gap-3 rounded-md border p-3 transition-colors',
                        o.primary ? 'border-primary bg-primary-soft hover:bg-primary-line/30' : 'border-border bg-surface-2 hover:bg-accent',
                      )}
                    >
                      <span className="grid size-9 place-items-center rounded-md bg-card text-primary-light [&_svg]:size-4">{o.icon}</span>
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{o.title}</span>
                        <span className="text-xs text-muted-foreground">{o.sub}</span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.section>
      <span className="absolute bottom-3 text-2xs text-muted-foreground">Arte gerada, não é uma captura do servidor</span>
    </div>
  )
}
