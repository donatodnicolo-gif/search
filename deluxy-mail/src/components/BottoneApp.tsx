'use client'

/**
 * "→ App" sulla singola mail: la via senza trascinamento (è l'unica su
 * mobile, dove il pannello a destra non c'è). Apre il dialogo APP DELUXY:
 * decidono le regole, o si sceglie l'app a mano.
 */
export function BottoneApp({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="azione-riga"
      title="Manda questa mail a un’app Deluxy (l’AI prepara i dati, tu confermi)"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('aimail:app', { detail: { messaggioId: id } }))
      }}
    >
      → App
    </button>
  )
}
