import { useCallback, useEffect, useRef, useState } from 'react'

/** Carrega dados assíncronos e descarta respostas antigas quando as dependências mudam. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true })
  const seq = useRef(0)
  const run = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => id === seq.current && setState({ data, error: null, loading: false }),
      (error) => id === seq.current && setState({ data: null, error, loading: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    run()
  }, [run])
  return { ...state, reload: run }
}
