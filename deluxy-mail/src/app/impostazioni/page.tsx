import { db } from '@/lib/db'
import { salvaImpostazioni } from '@/lib/actions'
import { leggiImpostazioni, CHIAVI } from '@/lib/impostazioni'
import { FormAccount } from '@/components/FormAccount'
import { EliminaAccount } from '@/components/EliminaAccount'
import { ScaricaStorico } from '@/components/ScaricaStorico'
import { NotifichePush } from '@/components/NotifichePush'
import { salvaFirmaDati } from '@/lib/actions'
import { leggiFirmaDati } from '@/lib/firma'
import { dataLunga } from '@/lib/format'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Lingue offerte come caselle: i nomi coincidono con quelli che l'AI usa per
// rilevare la lingua (in italiano), così il confronto funziona.
const LINGUE = ['italiano', 'inglese', 'francese', 'spagnolo', 'tedesco', 'portoghese', 'olandese']

export default async function Impostazioni() {
  const u = await richiediUtente()
  const lingueLette = u.lingueLette.split(',').map((l) => l.trim().toLowerCase())
  const [account, impostazioni] = await Promise.all([
    db.account.findMany({
      where: { utenteId: u.id },
      orderBy: { creatoIl: 'asc' },
      include: { _count: { select: { messaggi: true } } },
    }),
    leggiImpostazioni(),
  ])
  const isAdmin = u.ruolo === 'admin'

  // Dati della firma per il form dedicato: se l'email è ancora vuota (primo
  // accesso / creazione account), si precompila con quella dell'utente.
  const firmaDati = leggiFirmaDati(u.firmaDati)
  if (!firmaDati.email) firmaDati.email = u.email
  if (!firmaDati.nome) firmaDati.nome = u.nome

  const aiPronta = Boolean(process.env.OPENAI_API_KEY)
  const modello = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-caption">Caselle collegate e contesto che l’AI usa per rispondere.</p>
        </div>
      </div>

      <h2 className="section-title">Caselle collegate</h2>
      <div className="card tight">
        {account.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✉</div>
            <div className="empty-title">Nessuna casella</div>
            <p className="empty-text">Collega la prima casella con il modulo qui sotto.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Casella</th>
                  <th>Server IMAP</th>
                  <th>Ultima lettura</th>
                  <th>Stato</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {account.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.nome}</strong>
                      <div className="muted">{a.email}</div>
                    </td>
                    <td className="muted">
                      {a.imapHost}:{a.imapPort} · {a.cartella}
                    </td>
                    <td className="muted">
                      {a.ultimoSync ? dataLunga(a.ultimoSync) : 'mai'}
                    </td>
                    <td>
                      {a.ultimoErrore ? (
                        <span className="badge red" title={a.ultimoErrore}>
                          <span className="dot" />
                          errore
                        </span>
                      ) : (
                        <span className="badge green">
                          <span className="dot" />
                          ok
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <EliminaAccount id={a.id} email={a.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {account.length > 0 && (
        <>
          <h2 className="section-title">Scaricare la posta vecchia</h2>
          <div className="card">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Al primo collegamento AI Mail prende solo la posta recente, per non tirare giù
              anni di archivio senza che tu l’abbia chiesto. Il resto della casella è ancora
              sul server: da qui lo recuperi un blocco alla volta.
            </p>
            {account.map((a) => (
              <div key={a.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  {a.nome} · <span className="muted">{a._count.messaggi} messaggi scaricati</span>
                </div>
                <ScaricaStorico
                  accountId={a.id}
                  storicoFinito={a.storicoFinito}
                  messaggiInArchivio={a._count.messaggi}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Collega una casella</h2>
      <div className="card">
        <FormAccount />
      </div>

      <h2 className="section-title">Intelligenza artificiale</h2>
      <div className="card">
        <div className="mail-tags" style={{ marginBottom: 16 }}>
          {aiPronta ? (
            <span className="badge green">
              <span className="dot" />
              Chiave OpenAI configurata · modello {modello}
            </span>
          ) : (
            <span className="badge orange">
              <span className="dot" />
              OPENAI_API_KEY mancante: l’analisi automatica è spenta
            </span>
          )}
        </div>

        <form action={salvaImpostazioni}>
          <div className="form-grid">
            <div className="full">
              <label className="field-label">
                Contesto aziendale {isAdmin ? '(condiviso con tutti)' : '(solo un admin lo modifica)'}
              </label>
              <textarea
                name="contestoAzienda"
                rows={4}
                disabled={!isAdmin}
                defaultValue={impostazioni[CHIAVI.contestoAzienda] ?? ''}
                placeholder="Deluxy consegna fiori e composizioni a Milano. Lavoriamo con fiorai e pasticcerie partner. Le consegne si prenotano entro le 18 del giorno prima."
              />
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                L’AI legge questo testo prima di ogni risposta. È lo stesso per tutta l’azienda.
              </div>
            </div>
            <div className="full">
              <label className="field-label">Controlla la posta ogni</label>
              <select
                name="sincronizzaOgniSec"
                defaultValue={String(u.sincronizzaOgniSec ?? 300)}
                style={{ width: 'auto', minWidth: 160 }}
              >
                <option value="30">30 secondi</option>
                <option value="60">1 minuto</option>
                <option value="120">2 minuti</option>
                <option value="300">5 minuti</option>
                <option value="600">10 minuti</option>
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Vale mentre l’app è aperta (la spunta “Automatico” nella barra a sinistra). Ad
                app chiusa la posta si riallinea quando la riapri.
              </div>
            </div>

            <div className="full">
              <label className="checkbox-row">
                <input type="checkbox" name="scaricaStoricoAuto" defaultChecked={u.scaricaStoricoAuto} />
                Scarica tutta la posta di sempre (in background)
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
                Con l’app aperta, scarico a poco a poco anche la posta più vecchia fino a
                completare la casella, senza bloccare l’uso dell’app. Una volta scaricata tutta,
                si ferma da solo. Utile la prima volta o dopo aver collegato una casella con molto
                archivio.
              </div>
            </div>

            <div className="full">
              <label className="checkbox-row">
                <input type="checkbox" name="traduzioneAuto" defaultChecked={u.traduzioneAuto} />
                Traduzione automatica
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
                Le mail in lingua straniera vengono tradotte in italiano quando le apri (con
                l’originale a un clic). E quando rispondi scrivi in italiano: all’invio traduco
                io nella lingua della mail.
              </div>
            </div>
            <div className="full">
              <label className="field-label">Lingue che leggo (non tradurre)</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                {LINGUE.map((lingua) => (
                  <label key={lingua} className="checkbox-row" style={{ padding: 0 }}>
                    <input
                      type="checkbox"
                      name="lingueLette"
                      value={lingua}
                      defaultChecked={lingueLette.includes(lingua)}
                    />
                    {lingua.charAt(0).toUpperCase() + lingua.slice(1)}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Le mail nelle lingue spuntate non vengono tradotte. Se non spunti niente, resta
                l’italiano.
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Salva
            </button>
          </div>
        </form>
      </div>

      <h2 className="section-title">La tua firma</h2>
      <div className="card">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Compila i tuoi dati: la firma Deluxy (con logo) si genera da sola e finisce in fondo alle
          mail che scrivi. La puoi cambiare quando vuoi.
        </p>
        <form action={salvaFirmaDati}>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome e cognome</label>
              <input type="text" name="nome" defaultValue={firmaDati.nome} placeholder="Eleonora Mannini" />
            </div>
            <div>
              <label className="field-label">Ruolo</label>
              <input type="text" name="ruolo" defaultValue={firmaDati.ruolo} placeholder="Chief Commercial Officer" />
            </div>
            <div>
              <label className="field-label">Reparto / azienda</label>
              <input type="text" name="reparto" defaultValue={firmaDati.reparto} placeholder="Deluxy White Gloves" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input type="text" name="email" defaultValue={firmaDati.email} placeholder="nome@deluxy.it" />
            </div>
            <div>
              <label className="field-label">Telefono</label>
              <input type="text" name="telefono" defaultValue={firmaDati.telefono} placeholder="+39 339 1068285" />
            </div>
            <div>
              <label className="field-label">Sito</label>
              <input type="text" name="sito" defaultValue={firmaDati.sito} placeholder="www.deluxy.it" />
            </div>
          </div>
          <div className="form-footer" style={{ marginTop: 14 }}>
            <button className="btn primary" type="submit">
              Salva firma
            </button>
          </div>
        </form>
      </div>

      <h2 className="section-title">Notifiche sul telefono</h2>
      <div className="card">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Ricevi una notifica quando arriva posta nuova, anche con l’app chiusa. Si attiva per
          questo dispositivo (attivala su ogni telefono/PC che vuoi). Su iPhone: aggiungi prima
          l’app alla schermata Home. Le notifiche arrivano quando il controllo automatico della
          posta gira: più è frequente il cron, più sono tempestive.
        </p>
        <NotifichePush />
      </div>
    </>
  )
}
