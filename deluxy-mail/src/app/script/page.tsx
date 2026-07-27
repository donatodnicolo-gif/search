import Link from 'next/link'
import { richiediUtente } from '@/lib/sessione'
import { elencoScriptPronti, scriptProntiAttivi } from '@/lib/scriptPronti'
import { NuovaRispostaRapida } from '@/components/NuovaRispostaRapida'

export const dynamic = 'force-dynamic'

/**
 * RISPOSTE RAPIDE: i testi pronti visti da AI Mail — quelli accesi per la posta —
 * e il modulo per scriverne di nuovi.
 *
 * ⚠️ Qui non vive nessun testo. Stanno tutti nell'app **Scripts**, che è il loro
 * unico padrone: questa pagina li legge da lì e ne crea di nuovi lì. Tenerne una
 * copia in AI Mail vorrebbe dire ritrovarsi due versioni della stessa formula
 * aziendale che divergono — ed è esattamente ciò che Scripts esiste per evitare.
 *
 * Il senso della sezione è invece pratico: chi risponde alle mail tutto il
 * giorno riconosce le formule buone MENTRE scrive. Se per salvarne una deve
 * cambiare app, non lo farà mai.
 */
export default async function RisposteRapide() {
  await richiediUtente()
  const [attivo, script] = await Promise.all([scriptProntiAttivi(), elencoScriptPronti()])

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="page-title">Risposte rapide</h1>
          <p className="page-caption">
            I testi pronti accesi per la posta: si scelgono mentre scrivi una mail («Usa un testo
            pronto») e arrivano già composti con la firma e i recapiti giusti. Scrivendone uno qui,
            va a vivere nell’app <strong>Scripts</strong> insieme a tutti i testi dell’azienda — non
            se ne tiene una copia qui, così non possono divergere.
          </p>
        </div>
        {attivo && (
          <div className="page-actions">
            <NuovaRispostaRapida />
          </div>
        )}
      </div>

      {!attivo && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✎</div>
            <div className="empty-title">Testi pronti non collegati</div>
            <p className="empty-text">
              Serve la chiave dell’app Scripts. La mette un amministratore in{' '}
              <Link href="/impostazioni-app" style={{ textDecoration: 'underline' }}>
                Impostazioni → App Deluxy
              </Link>
              , sezione «Testi pronti». Per <strong>scrivere</strong> da qui dev’essere una chiave
              di scrittura.
            </p>
          </div>
        </div>
      )}

      {attivo && script.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✎</div>
            <div className="empty-title">Nessuna risposta rapida</div>
            <p className="empty-text">
              Non c’è ancora nessun testo acceso per AI Mail. Scrivine uno col tasto qui sopra:
              comparirà subito anche mentre scrivi una mail.
            </p>
          </div>
        </div>
      )}

      {script.length > 0 && (
        <div className="card tight">
          <div className="mail-list">
            {script.map((s) => (
              <div key={s.slug} className="col-task">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="col-task-titolo" style={{ fontWeight: 600 }}>
                    {s.nome}
                  </div>
                  <div className="col-task-meta">
                    {s.categoria && <span className="badge neutral">{s.categoria}</span>}
                    {s.canale && s.canale !== 'email' && <span className="muted">{s.canale}</span>}
                    {s.daCompilare.length > 0 && (
                      <span className="muted">
                        da compilare: {s.daCompilare.join(', ')}
                      </span>
                    )}
                  </div>
                  {s.descrizione && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                      {s.descrizione}
                    </div>
                  )}
                  {s.oggetto && (
                    <div style={{ fontSize: 12.5, marginTop: 6 }}>
                      <span className="muted">Oggetto: </span>
                      {s.oggetto}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      background: 'var(--fill)',
                      borderRadius: 10,
                      padding: 10,
                      marginTop: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}
                  >
                    {s.testo}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attivo && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Per modificare o togliere un testo si va nell’app Scripts: lì si cambia una volta sola e
          cambia per tutte le app che lo usano.
        </p>
      )}
    </>
  )
}
