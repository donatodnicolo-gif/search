'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { leggiScriptPronti } from '@/lib/actions'
import { componiScript, type ScriptPronto } from '@/lib/scriptTesto'

/**
 * «Testi pronti»: i copioni aziendali di Deluxy Scripts dentro la schermata di
 * scrittura. Si sceglie un testo e finisce in oggetto e messaggio, già composto
 * con la firma e i recapiti della posta.
 *
 * ⚠️ I buchi rimasti si compilano QUI, a mano, in campi visibili — non si
 * indovinano. Una data messa a caso da un programma è un invito sbagliato che
 * parte al cliente: `{{DATA}}` resta scritto così finché non lo riempi tu, e si
 * vede benissimo prima di premere invio.
 *
 * Se il collegamento a Scripts non c'è, il riquadro non compare: si scrive a
 * mano come sempre.
 */
export function TestiPronti({
  destinatario,
  onScegli,
}: {
  destinatario: string
  /** Riceve oggetto e testo composti: chi scrive decide dove metterli. */
  onScegli: (scelta: { oggetto: string; testo: string }) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [attivo, setAttivo] = useState(false)
  const [script, setScript] = useState<ScriptPronto[]>([])
  const [scelto, setScelto] = useState<ScriptPronto | null>(null)
  const [valori, setValori] = useState<Record<string, string>>({})
  const [cerca, setCerca] = useState('')
  const [inCorso, start] = useTransition()

  // Per quale destinatario abbiamo già chiesto i testi.
  // ⚠️⚠️ Prima il freno era `script.length > 0`, e frenava SOLO se l'elenco
  // tornava pieno: con Scripts non collegato (o senza testi accesi) la lista
  // resta vuota, e siccome `destinatario` è il campo «A» in digitazione,
  // partiva **una chiamata all'app Scripts per ogni tasto battuto** — con il
  // riquadro che sfarfallava fra «Carico…» e «Nessun testo pronto».
  const chiestoPer = useRef<string | null>(null)

  // I testi si chiedono solo quando si apre il riquadro: aprire la schermata di
  // scrittura non deve costare una chiamata a un'altra app.
  useEffect(() => {
    if (!aperto) return
    if (chiestoPer.current === destinatario) return
    chiestoPer.current = destinatario
    start(async () => {
      const r = await leggiScriptPronti(destinatario)
      setAttivo(r.attivo)
      setScript(r.script)
      if (r.nomeProposto) {
        // Proposta, non imposizione: finisce in un campo che si può correggere.
        setValori((v) => ({ NOME: r.nomeProposto, NOME_CLIENTE: r.nomeProposto, ...v }))
      }
    })
  }, [aperto, destinatario])

  if (!aperto) {
    return (
      <div className="full">
        <button type="button" className="azione-riga" onClick={() => setAperto(true)}>
          ✎ Usa un testo pronto
        </button>
      </div>
    )
  }

  const filtrati = cerca.trim()
    ? script.filter((s) =>
        `${s.nome} ${s.descrizione} ${s.categoria}`.toLowerCase().includes(cerca.trim().toLowerCase())
      )
    : script

  const inserisci = (s: ScriptPronto) => {
    onScegli({
      oggetto: componiScript(s.oggetto, valori),
      testo: componiScript(s.testo, valori),
    })
    setAperto(false)
    setScelto(null)
  }

  return (
    <div className="full">
      <div className="card tight" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Testi pronti</strong>
          <button type="button" className="azione-riga" onClick={() => setAperto(false)}>
            Chiudi
          </button>
        </div>

        {inCorso && script.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Chiedo i testi a Scripts…</div>
        )}

        {!inCorso && !attivo && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            I testi pronti non sono collegati. Un amministratore può collegarli in Impostazioni →
            App Deluxy, sezione «Testi pronti».
          </div>
        )}

        {!inCorso && attivo && script.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Nessun testo è ancora acceso per AI Mail. Si abilitano dall’app Scripts, testo per testo.
          </div>
        )}

        {script.length > 0 && !scelto && (
          <>
            <input
              type="text"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca fra i testi…"
              style={{ marginBottom: 10 }}
            />
            <div className="mail-list">
              {filtrati.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  className="col-task"
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setScelto(s)}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="col-task-titolo">{s.nome}</div>
                    <div className="col-task-meta">
                      {s.categoria && <span className="badge neutral">{s.categoria}</span>}
                      {s.canale && <span className="muted">{s.canale}</span>}
                      {s.daCompilare.length > 0 && (
                        <span className="muted">
                          {s.daCompilare.length} da compilare
                        </span>
                      )}
                    </div>
                    {s.descrizione && (
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                        {s.descrizione}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {filtrati.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 2px' }}>
                  Nessun testo corrisponde a «{cerca}».
                </div>
              )}
            </div>
          </>
        )}

        {scelto && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 13.5 }}>{scelto.nome}</strong>
              <button type="button" className="azione-riga" onClick={() => setScelto(null)}>
                ← Altri testi
              </button>
            </div>

            {scelto.daCompilare.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Questi dati il testo non li sa: quello che lasci vuoto resta scritto{' '}
                  <code>{'{{COSÌ}}'}</code> nel messaggio, così lo vedi prima di mandarlo.
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {scelto.daCompilare.map((v) => (
                    <div key={v}>
                      <label className="field-label" style={{ fontSize: 12 }}>
                        {v.replace(/_/g, ' ').toLowerCase()}
                      </label>
                      <input
                        type="text"
                        value={valori[v] ?? ''}
                        onChange={(e) => setValori((x) => ({ ...x, [v]: e.target.value }))}
                        placeholder={`{{${v}}}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                background: 'var(--fill)',
                borderRadius: 10,
                padding: 12,
                maxHeight: 260,
                overflowY: 'auto',
                marginBottom: 12,
              }}
            >
              {componiScript(scelto.testo, valori) || '(testo vuoto)'}
            </div>

            <button type="button" className="btn primary small" onClick={() => inserisci(scelto)}>
              Metti nel messaggio
            </button>
          </>
        )}
      </div>
    </div>
  )
}
