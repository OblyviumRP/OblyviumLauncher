import { useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { DialogContent } from '@/components/ui/dialog'
import { t } from '@/i18n'
import { useLauncher } from '@/store/launcher'

function size(chars: number) {
  return chars >= 1024 ? `${Math.round(chars / 1024)} KB` : `${chars} B`
}

export function CrashReportDialog() {
  const crash = useLauncher((s) => s.crash)
  const close = useLauncher((s) => s.closeCrash)
  const send = useLauncher((s) => s.sendCrash)
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    setSending(true)
    const ok = await send(description.trim())
    setSending(false)
    if (ok) setDescription('')
  }

  return (
    <DialogPrimitive.Root open={crash != null} onOpenChange={(open) => !open && !sending && close()}>
      {crash && (
        <DialogContent
          className="max-w-xl"
          title={t('O jogo fechou com erro')}
          description={t('Quer enviar um relatório para a staff? Nada sai do seu computador sem você clicar em Enviar.')}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>{t('O que você estava fazendo quando fechou?')}</span>
            <textarea
              value={description}
              maxLength={2000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Ex.: entrei no servidor e abri o inventário')}
              className="resize-none rounded-sm border border-input bg-input-fill px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-2 focus-visible:border-ring"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t('O que vai junto:')}</span>
            <ul className="flex flex-col gap-1 text-xs">
              {crash.files.map((f) => (
                <li key={f.name}>
                  <details>
                    <summary className="cursor-pointer font-mono">
                      {f.name} <span className="text-muted-2">({size(f.content.length)})</span>
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded border border-border-2 bg-sidebar p-2 font-mono text-[11px] leading-snug">{f.content}</pre>
                  </details>
                </li>
              ))}
              <li>
                {t('Sistema: {os} · Java {java} · RAM {max} MB de {total} MB', {
                  os: crash.system.os,
                  java: crash.system.java,
                  max: crash.system.maxRamMb,
                  total: crash.system.totalRamMb,
                })}
              </li>
              <li>
                {t('Placa de vídeo: {gpus}', {
                  gpus: crash.system.gpus.length ? crash.system.gpus.map((g) => `${g.name} (driver ${g.driver || '?'})`).join(', ') : t('não identificada'),
                })}
              </li>
              <li>{t('Modpack {pack}, {n} mods, código de saída {code}, versão do launcher e seu nick', { pack: crash.serverId, n: crash.system.mods.length, code: crash.code })}</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={sending} onClick={close}>
              {t('Não enviar')}
            </Button>
            <Button onClick={submit} disabled={sending} autoFocus>
              {sending ? t('Enviando…') : t('Enviar')}
            </Button>
          </div>
        </DialogContent>
      )}
    </DialogPrimitive.Root>
  )
}
