import { alternative } from '@/lib/condizioni'

/**
 * Mostra il valore di una condizione: se ha più alternative (separate da
 * virgola) le rende come «uno tra X o Y», altrimenti il singolo valore.
 */
export function ValoreCondizione({ valore }: { valore: string }) {
  const alt = alternative(valore)
  if (alt.length <= 1) return <code>{valore}</code>
  return (
    <>
      uno tra{' '}
      {alt.map((a, i) => (
        <span key={i}>
          <code>{a}</code>
          {i < alt.length - 1 ? ' o ' : ''}
        </span>
      ))}
    </>
  )
}
