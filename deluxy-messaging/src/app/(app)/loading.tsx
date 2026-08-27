/*
 * Loading di rotta del segmento (app). Ogni pagina qui dentro è
 * `force-dynamic`: senza questo confine di Suspense, il passaggio da una pagina
 * all'altra restava sullo schermo vecchio finché il server non rispondeva
 * (Libro UX §6: il Loading è obbligatorio su ogni rotta dati; 2–10 s = testo
 * sobrio o skeleton). Renderizza dentro <main class="main"> del layout.
 */
export default function CaricamentoRotta() {
  const barra = (larghezza: string): React.CSSProperties => ({
    height: 14,
    width: larghezza,
    borderRadius: 'var(--radius-s)',
    background: 'var(--fill)',
  })

  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div>
          <div style={{ ...barra('220px'), height: 28, marginBottom: 10 }} />
          <div style={barra('320px')} />
        </div>
      </div>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-l)',
          boxShadow: 'var(--shadow-card)',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={barra('100%')} />
        <div style={barra('92%')} />
        <div style={barra('96%')} />
        <div style={barra('70%')} />
      </div>
      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>Caricamento…</p>
    </div>
  )
}
