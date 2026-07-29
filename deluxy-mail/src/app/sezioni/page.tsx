import Link from 'next/link'
import { db } from '@/lib/db'
import { creaSezione } from '@/lib/actions'
import { EliminaSezione } from '@/components/EliminaSezione'
import { RiassuntoSezione, type RiassuntoSalvato } from '@/components/RiassuntoSezione'
import { AzioneSezione, type AzioneSalvata } from '@/components/AzioneSezione'
import { descriviAzioni } from '@/lib/appDeluxy'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // il riassunto AI di una sezione gira qui

const COLORI = ['blue', 'green', 'orange', 'red', 'purple', 'gold'] as const

type SezioneConDati = {
  id: string
  nome: string
  descrizione: string
  colore: string
  genitoreId: string | null
  _count: { messaggi: number }
}

export default async function Sezioni() {
  const u = await richiediUtente()

  let sezioni: SezioneConDati[] = []
  let riassunti: {
    sezioneId: string
    taglio: string
    giorni: number
    testo: string
    punti: string
    messaggiVisti: number
    threadVisti: number
    generatoIl: Date
  }[] = []
  try {
    sezioni = await db.sezione.findMany({
      where: { utenteId: u.id },
      orderBy: { ordine: 'asc' },
      select: {
        id: true, nome: true, descrizione: true, colore: true, genitoreId: true,
        _count: { select: { messaggi: true } },
      },
    })
    riassunti = await db.riassuntoSezione.findMany({
      where: { utenteId: u.id },
      orderBy: { generatoIl: 'desc' },
    })
  } catch {
    // Tabelle non ancora migrate: la pagina si apre lo stesso.
    sezioni = await db.sezione.findMany({
      where: { utenteId: u.id },
      orderBy: { ordine: 'asc' },
      select: {
        id: true, nome: true, descrizione: true, colore: true, genitoreId: true,
        _count: { select: { messaggi: true } },
      },
    })
  }

  // Le azioni APP DELUXY disponibili e quella agganciata a ogni sezione.
  // Lettura A PARTE e difensiva: prima della migrazione le tre colonne non
  // esistono, e la pagina delle sezioni deve aprirsi lo stesso.
  const azioniApp = descriviAzioni(await leggiChiaviApp())
  const azionePerSezione = new Map<string, AzioneSalvata>()
  try {
    const righe = await db.sezione.findMany({
      where: { utenteId: u.id },
      select: { id: true, azioneId: true, azioneModo: true, azioneIstruzioni: true },
    })
    for (const r of righe)
      azionePerSezione.set(r.id, {
        azioneId: r.azioneId,
        modo: r.azioneModo,
        istruzioni: r.azioneIstruzioni,
      })
  } catch {
    /* colonne non ancora migrate: si mostra il modulo vuoto */
  }
  const azioneDi = (id: string): AzioneSalvata =>
    azionePerSezione.get(id) ?? { azioneId: null, modo: 'chiedi', istruzioni: '' }

  // L'ultimo riassunto per sezione (qualunque taglio: il più recente vince).
  const ultimoRiassunto = new Map<string, RiassuntoSalvato>()
  for (const r of riassunti) {
    if (ultimoRiassunto.has(r.sezioneId)) continue
    ultimoRiassunto.set(r.sezioneId, {
      taglio: r.taglio,
      giorni: r.giorni,
      testo: r.testo,
      punti: r.punti.split('\n').filter(Boolean),
      messaggiVisti: r.messaggiVisti,
      threadVisti: r.threadVisti,
      generatoIl: r.generatoIl,
    })
  }

  const principali = sezioni.filter((s) => !s.genitoreId)
  const figlieDi = (id: string) => sezioni.filter((s) => s.genitoreId === id)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sezioni</h1>
          <p className="page-caption">
            Le colonne in cui l’AI allinea la posta. Conta la descrizione, non il nome: è
            quella che il modello legge per decidere. Ogni sezione può avere sottosezioni —
            e può <strong>chiamare un’app Deluxy</strong> quando ci sposti una mail a mano
            (chiedendo conferma o da sola).
          </p>
        </div>
      </div>

      {principali.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◫</div>
            <div className="empty-title">Nessuna sezione</div>
            <p className="empty-text">
              Crea le tue: Ordini, Fornitori, Amministrazione, Clienti… L’AI ci smisterà la
              posta da sola.
            </p>
          </div>
        </div>
      ) : (
        principali.map((s) => {
          const figlie = figlieDi(s.id)
          const totale = s._count.messaggi + figlie.reduce((n, f) => n + f._count.messaggi, 0)
          return (
            <div key={s.id} className="card sez-card">
              <div className="sez-testa">
                <div style={{ minWidth: 0 }}>
                  <Link href={`/?sezione=${s.id}`} className={`badge ${s.colore}`}>
                    <span className="dot" />
                    {s.nome}
                  </Link>
                  <div className="sez-descrizione">{s.descrizione}</div>
                </div>
                <div className="sez-testa-lato">
                  <span className="badge neutral">
                    {totale} {totale === 1 ? 'messaggio' : 'messaggi'}
                    {figlie.length > 0 ? ' in tutto' : ''}
                  </span>
                  <EliminaSezione id={s.id} nome={s.nome} />
                </div>
              </div>

              <RiassuntoSezione sezioneId={s.id} iniziale={ultimoRiassunto.get(s.id) ?? null} />
              <AzioneSezione sezioneId={s.id} azioni={azioniApp} iniziale={azioneDi(s.id)} />

              {figlie.length > 0 && (
                <div className="sez-figlie">
                  {figlie.map((f) => (
                    <div key={f.id} className="sez-figlia">
                      <div className="sez-testa">
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/?sezione=${f.id}`} className={`badge ${f.colore}`}>
                            <span className="dot" />
                            {f.nome}
                          </Link>
                          <div className="sez-descrizione">{f.descrizione}</div>
                        </div>
                        <div className="sez-testa-lato">
                          <span className="badge neutral">{f._count.messaggi}</span>
                          <EliminaSezione id={f.id} nome={f.nome} />
                        </div>
                      </div>
                      <RiassuntoSezione sezioneId={f.id} iniziale={ultimoRiassunto.get(f.id) ?? null} />
                      <AzioneSezione sezioneId={f.id} azioni={azioniApp} iniziale={azioneDi(f.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      <h2 className="section-title">Nuova sezione</h2>
      <div className="card">
        <form action={creaSezione}>
          <div className="form-grid">
            <div>
              <label className="field-label">
                Nome <span className="req">*</span>
              </label>
              <input type="text" name="nome" required placeholder="Ordini" />
            </div>
            <div>
              <label className="field-label">Dentro a…</label>
              <select name="genitoreId" defaultValue="">
                <option value="">— nessuna: è una sezione principale —</option>
                {principali.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Scegliendo una sezione, questa diventa una sua sottosezione (e ne prende il colore).
              </div>
            </div>
            <div>
              <label className="field-label">Colore</label>
              <select name="colore" defaultValue="blue">
                {COLORI.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="full">
              <label className="field-label">
                Cosa ci va <span className="req">*</span>
              </label>
              <textarea
                name="descrizione"
                rows={2}
                required
                placeholder="Mail di clienti che ordinano fiori o composizioni, conferme d’ordine, modifiche e disdette."
              />
            </div>
            <div>
              <label className="field-label">Quando ci metti una mail a mano</label>
              <select name="azioneId" defaultValue="">
                <option value="">— non chiamare nessuna app —</option>
                {azioniApp.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.configurata}>
                    {a.app} — {a.nome}
                    {a.configurata ? '' : ' (da collegare)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Come</label>
              <select name="azioneModo" defaultValue="chiedi">
                <option value="chiedi">Chiedimi conferma</option>
                <option value="automatico">Fallo da solo</option>
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Vale solo per lo spostamento fatto da te: l’AI e le regole non chiamano
                nessuna app.
              </div>
            </div>
            <div className="full">
              <label className="field-label">Istruzioni per l’AI (facoltative)</label>
              <textarea
                name="azioneIstruzioni"
                rows={2}
                placeholder="Es. il nome dell’azienda è quello in firma, non quello nel corpo del testo."
              />
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Crea sezione
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
