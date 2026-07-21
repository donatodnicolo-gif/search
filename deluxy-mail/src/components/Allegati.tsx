'use client'

/** Selezione degli allegati: aggiungi file, li vedi elencati, li togli. */
export function Allegati({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
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
              {f.name} <span className="muted">({(f.size / 1024).toFixed(0)} KB)</span>
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
