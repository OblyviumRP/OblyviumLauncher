import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { DialogContent } from '@/components/ui/dialog'
import { useLauncher } from '@/store/launcher'

/** Confirmação global: o store pede (ex.: baixar Java) e espera a resposta. */
export function AskDialog() {
  const ask = useLauncher((s) => s.ask)
  const close = useLauncher((s) => s.closeAsk)
  return (
    <DialogPrimitive.Root open={ask != null} onOpenChange={(open) => !open && close(false)}>
      {ask && (
        <DialogContent title={ask.title} description={ask.body}>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              {ask.cancel ?? 'Cancelar'}
            </Button>
            <Button variant={ask.tone === 'danger' ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
              {ask.confirm}
            </Button>
          </div>
        </DialogContent>
      )}
    </DialogPrimitive.Root>
  )
}
