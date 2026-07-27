'use client'

import type { AzioneDescritta } from '@/lib/appDeluxy'

/**
 * Richiamare le APP DELUXY **da una mail aperta**.
 *
 * ⚠️ Il meccanismo esisteva già, ma solo in posta in arrivo: si trascinava la
 * riga sulle carte a destra, o si premeva «→ App». Aperta la mail — cioè
 * esattamente quando hai letto cosa chiede e sai a quale app mandarla — non
 * c'era nulla: bisognava tornare indietro e ritrovare la riga. Qui le azioni
 * sono elencate per esteso, perché in una pagina di dettaglio lo spazio c'è e
 * scegliere l'app giusta è meglio che indovinarla.
 *
 * Non fa niente da sé: apre lo STESSO dialogo di sempre (`aimail:app`), dove
 * l'AI prepara i dati e la persona conferma. Un'app non collegata resta visibile
 * ma spenta, con scritto perché — nasconderla farebbe pensare che non esista.
 */
export function AppSuMessaggio({ messaggioId, azioni }: { messaggioId: string; azioni: AzioneDescritta[] }) {
  const apri = (azioneId?: string) =>
    window.dispatchEvent(new CustomEvent('aimail:app', { detail: { messaggioId, azioneId } }))

  const collegate = azioni.filter((a) => a.configurata)

  return (
    <div className="card">
      <div
        className="mail-subject"
        style={{ fontSize: 18, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
      >
        <span>Manda a un’app Deluxy</span>
        {collegate.length > 0 && (
          <button
            type="button"
            className="btn secondary small"
            title="Lascia decidere alle regole APP DELUXY quale funzione chiamare"
            onClick={() => apri()}
          >
            Automatico
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        L’AI legge questa mail, prepara i dati e te li mostra: <strong>confermi tu</strong>. Con
        «Automatico» decidono le regole; altrimenti scegli la funzione.
      </p>

      {collegate.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Nessuna app collegata. Le chiavi si mettono in Impostazioni → App Deluxy.
        </div>
      ) : (
        <div className="riga-azioni" style={{ gap: '8px 10px' }}>
          {azioni.map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn secondary small"
              disabled={!a.configurata}
              title={
                a.configurata
                  ? `${a.app} — ${a.descrizione}`
                  : `${a.app}: chiave non ancora inserita (Impostazioni → App Deluxy)`
              }
              onClick={() => apri(a.id)}
            >
              <span className={`badge ${a.colore}`} style={{ marginRight: 6 }}>
                <span className="dot" />
                {a.app}
              </span>
              {a.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
