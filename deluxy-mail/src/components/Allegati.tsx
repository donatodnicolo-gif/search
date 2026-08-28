'use client'

/**
 * Apre un allegato che si sta ancora SCRIVENDO (non è mai partito).
 *
 * ⚠️ È un oggetto `File` del browser: non c'è niente da chiedere al server, si
 * fabbrica un indirizzo temporaneo dal file in memoria e lo si apre in una
 * scheda nuova. Il browser decide da sé — un PDF lo mostra, un'immagine la
 * apre, il resto lo scarica.
 * ⚠️ L'indirizzo temporaneo si REVOCA dopo un minuto: se lo si revocasse
 * subito, la scheda appena aperta non farebbe in tempo a leggerlo; se non lo
 * si revocasse mai, il file resterebbe in memoria finché non chiudi tutto.
 */
function apri(f: File) {
  const url = URL.createObjectURL(f)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Selezione degli allegati: aggiungi file, li apri, li togli. */
export function Allegati({
  files,
  onChange,
  /** Id del campo file: serve alla graffetta nella barra dell'editor, che è
   *  una <label> legata a questo input (nessun ref, apre il selettore da sé). */
  idInput,
}: {
  files: File[]
  onChange: (files: File[]) => void
  idInput?: string
}) {
  const totaleMB = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)

  return (
    <div className="allegati">
      <label className="btn secondary small" style={{ cursor: 'pointer' }}>
        📎 Aggiungi allegato
        <input
          type="file"
          multiple
          hidden
          id={idInput}
          onChange={(e) => {
            const nuovi = Array.from(e.target.files ?? [])
            if (nuovi.length) onChange([...files, ...nuovi])
            e.target.value = '' // così puoi riaggiungere lo stesso file
          }}
        />
      </label>

      {files.length > 0 && (
        <div className="allegati-lista">
          {files.map((f, i) => (
            <span key={i} className="allegato-chip">
              {/* ⚠️ Il NOME apre il file: prima si potevano solo aggiungere e
                  togliere, e per controllare di allegare la fattura giusta
                  bisognava mandarla e riaprirla dall'inviata. */}
              <button
                type="button"
                className="allegato-apri"
                title="Apri per controllare"
                onClick={() => apri(f)}
              >
                {f.name}
              </button>
              <span className="muted">({(f.size / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                className="allegato-x"
                title="Togli"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>
            Totale {totaleMB.toFixed(1)} MB {totaleMB > 20 && '· troppo pesante (max 20 MB)'}
          </span>
        </div>
      )}
    </div>
  )
}
