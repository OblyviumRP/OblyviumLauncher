import { ArrowLeft, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { backend } from '@/backend'
import { OblyviumMark } from '@/components/shared/oblyvium-mark'
import { PixelScene } from '@/components/shared/pixel-scene'
import { ServerIcon } from '@/components/shared/server-art'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLauncher } from '@/store/launcher'

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
  const [params] = useSearchParams()
  const adding = params.get('adicionar') === '1'
  const hasAccount = useLauncher((s) => s.accounts.length > 0)
  const servers = useLauncher((s) => s.servers)
  const serverId = useLauncher((s) => s.serverId)
  const selectServer = useLauncher((s) => s.selectServer)
  const refreshAccounts = useLauncher((s) => s.refreshAccounts)
  const showError = useLauncher((s) => s.showError)
  const navigate = useNavigate()

  const [step, setStep] = useState<'conta' | 'offline' | 'servidor'>('conta')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const nameOk = /^[a-zA-Z0-9_]{3,16}$/.test(name)

  const done = (accName: string) => {
    refreshAccounts()
    toast.success(`Bem-vindo, ${accName}`)
    if (adding || servers.length <= 1) navigate('/', { replace: true })
    else setStep('servidor')
  }

  const microsoft = async () => {
    setBusy(true)
    try {
      const acc = await backend().loginMicrosoft()
      if (acc) done(acc.name)
    } catch (err) {
      showError(err, 'Não foi possível entrar com a Microsoft')
    } finally {
      setBusy(false)
    }
  }

  const offline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameOk) return
    setBusy(true)
    try {
      const acc = await backend().loginOffline(name)
      done(acc.name)
    } catch (err) {
      showError(err, 'Não foi possível criar a conta')
    } finally {
      setBusy(false)
    }
  }

  const steps = adding ? ['Conta'] : ['Conta', 'Servidor']
  const index = step === 'servidor' ? 1 : 0

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
        aria-label={adding ? 'Adicionar conta' : 'Primeiro acesso'}
        className="flex w-full max-w-md flex-col gap-6 overflow-hidden rounded-lg border border-border-2 bg-card p-7 shadow-dialog"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.span initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
            <OblyviumMark className="size-14 text-primary-light" />
          </motion.span>
          <span className="font-minecraft text-sm tracking-wide">OBLYVIUM</span>
        </div>

        {steps.length > 1 && (
          <ol aria-label="Etapas" className="grid grid-cols-2 gap-2">
            {steps.map((s, i) => (
              <li key={s} className={cn('flex flex-col gap-1.5 text-xs', i === index ? 'text-foreground' : 'text-muted-foreground')} aria-current={i === index ? 'step' : undefined}>
                <span className="h-1 overflow-hidden rounded-full bg-accent">
                  <motion.span className="block h-full bg-primary" initial={false} animate={{ width: i <= index ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
                </span>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            {step === 'conta' && (
              <>
                <h1 className="text-lg font-semibold">{adding ? 'Adicionar conta' : 'Entre na sua conta'}</h1>
                <p className="text-sm text-muted-foreground">Use a conta Microsoft que tem o Minecraft: Java Edition. A senha é digitada na janela da Microsoft, nunca aqui.</p>
                <Button size="xl" onClick={microsoft} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <MicrosoftLogo />} {busy ? 'Aguardando a Microsoft…' : 'Entrar com Microsoft'}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setStep('offline')} disabled={busy}>
                  Jogar offline
                </Button>
                {adding && hasAccount && (
                  <Button variant="ghost" onClick={() => navigate(-1)}>
                    Cancelar
                  </Button>
                )}
              </>
            )}
            {step === 'offline' && (
              <form onSubmit={offline} className="flex flex-col gap-3">
                <h1 className="text-lg font-semibold">Conta offline</h1>
                <p className="text-sm text-muted-foreground">Sem login da Microsoft. Funciona só em servidores que aceitam contas offline, e não dá para trocar a skin.</p>
                <label className="flex flex-col gap-1.5 text-sm">
                  Nome no jogo
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={16} placeholder="Steve" aria-invalid={name !== '' && !nameOk} />
                  <span className={cn('text-xs', name !== '' && !nameOk ? 'text-danger-fg' : 'text-muted-foreground')}>De 3 a 16 letras, números ou _.</span>
                </label>
                <div className="flex gap-2">
                  <Button type="button" size="lg" variant="secondary" onClick={() => setStep('conta')}>
                    <ArrowLeft /> Voltar
                  </Button>
                  <Button type="submit" size="lg" className="flex-1" disabled={!nameOk || busy}>
                    {busy && <Loader2 className="animate-spin" />} Entrar
                  </Button>
                </div>
              </form>
            )}
            {step === 'servidor' && (
              <>
                <h1 className="text-lg font-semibold">Onde você quer jogar?</h1>
                <p className="text-sm text-muted-foreground">Dá para trocar a qualquer momento em Servidores.</p>
                <div role="radiogroup" aria-label="Servidor" className="flex flex-col gap-2">
                  {servers.map((sv) => (
                    <button
                      key={sv.id}
                      type="button"
                      role="radio"
                      aria-checked={sv.id === serverId}
                      onClick={() => selectServer(sv.id)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors',
                        sv.id === serverId ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2 hover:bg-accent',
                      )}
                    >
                      <ServerIcon server={sv} className="size-9" />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold">{sv.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {sv.main ? 'Servidor principal · ' : ''}Minecraft {sv.mcVersion}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <Button size="lg" onClick={() => navigate('/', { replace: true })}>
                  Começar
                </Button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.section>
      <span className="absolute bottom-3 text-2xs text-muted-foreground">Arte gerada, não é uma captura do servidor</span>
    </div>
  )
}
