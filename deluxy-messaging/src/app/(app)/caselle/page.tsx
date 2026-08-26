import { db } from '@/lib/db'
import { IMAP_DEFAULT, SMTP_DEFAULT } from '@/lib/email'
import { ProvaCasella } from '@/components/ProvaCasella'
import { RismistaMail } from '@/components/RismistaMail'
import { eliminaCasellaAction, salvaCasellaAction, salvaMittentiIgnoratiAction } from './actions'
import { elencoMittentiIgnorati } from '@/lib/mittenti-ignorati'

export const dynamic = 'force-dynamic'

export default async function PaginaCaselle() {
  const [caselle, negozi, mittentiIgnorati] = await Promise.all([
    db.casellaEmail.findMany({ orderBy: [{ predefinita: 'desc' }, { indirizzo: 'asc' }] }),
    db.negozioShopify.findMany({
      where: { attivo: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    elencoMittentiIgnorati(),
  ])

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Caselle di posta</h1>
          <p className="page-sub">
            Le caselle email collegate: le mail arrivano in inbox come gli altri canali e la
            risposta parte dalla casella che ha ricevuto. Parametri register.it:{' '}
            <code>{IMAP_DEFAULT}</code> porta 993 e <code>{SMTP_DEFAULT}</code> porta 465, utente =
            indirizzo completo.
          </p>
        </div>
      </div>

      <div className="griglia-impostazioni">
        {caselle.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{c.nome || c.indirizzo}</h2>
              {c.tipo === 'chiamate' ? <span className="badge">chiamate</span> : null}
              {c.predefinita ? <span className="badge verde">predefinita</span> : null}
              <span className={`badge${c.attiva ? ' verde' : ''}`}>
                {c.attiva ? 'attiva' : 'sospesa'}
              </span>
              <span className={`badge${c.password ? ' verde' : ' rosso'}`}>
                {c.password ? 'password ok' : 'password mancante'}
              </span>
            </div>

            <form action={salvaCasellaAction}>
              <input type="hidden" name="id" value={c.id} />
              <label className="campo">
                <span>Etichetta</span>
                <input name="nome" defaultValue={c.nome} placeholder="Servizio clienti" />
              </label>
              <label className="campo">
                <span>Indirizzo (è anche l&apos;utente)</span>
                <input name="indirizzo" type="email" defaultValue={c.indirizzo} required />
              </label>
              <label className="campo">
                <span>Nome mittente</span>
                <input name="nomeMittente" defaultValue={c.nomeMittente} />
              </label>
              <label className="campo">
                <span>Password della casella</span>
                <input
                  name="password"
                  type="password"
                  placeholder={c.password ? 'salvata — incolla per sostituire' : ''}
                  autoComplete="new-password"
                />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="campo" style={{ flex: 2 }}>
                  <span>Server IMAP</span>
                  <input name="imapHost" defaultValue={c.imapHost} />
                </label>
                <label className="campo" style={{ flex: 1 }}>
                  <span>Porta</span>
                  <input name="imapPort" type="number" defaultValue={c.imapPort} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="campo" style={{ flex: 2 }}>
                  <span>Server SMTP</span>
                  <input name="smtpHost" defaultValue={c.smtpHost} />
                </label>
                <label className="campo" style={{ flex: 1 }}>
                  <span>Porta</span>
                  <input name="smtpPort" type="number" defaultValue={c.smtpPort} />
                </label>
              </div>
              {/* La FIRMA di questa casella. Le tre voci sono diverse: firmare
                  una mail della pasticceria «Servizio Clienti Deluxy, consegna
                  in guanti bianchi» è dire al cliente una cosa che per quel
                  brand non esiste. */}
              <label className="campo">
                <span>Firma delle mail di questa casella</span>
                <textarea
                  name="firma"
                  defaultValue={c.firma}
                  rows={4}
                  maxLength={600}
                  placeholder={'Servizio Clienti Deluxy\nWhatsApp +39 …\ndeluxy.it'}
                />
              </label>
              {/* Il marchio della casella: una mail non porta con sé «il nostro
                  numero» come WhatsApp, quindi senza questo l'inbox non sa a
                  chi ha scritto il cliente e la mette senza marchio. */}
              <label className="campo">
                <span>Marchio</span>
                <select name="negozioId" defaultValue={c.negozioId ?? ''}>
                  <option value="">Nessuno (serve tutti i marchi)</option>
                  {negozi.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </select>
              </label>
              {/* ⚠️⚠️ A COSA SERVE questa casella. La differenza non si vede
                  dall'indirizzo: le notifiche del centralino
                  (chiamate@deluxy.it) sono mail come le altre, e senza questo
                  campo finirebbero in inbox — una conversazione per ogni
                  squillo, con un corpo che nessuno legge e per mittente il
                  centralino invece del cliente. */}
              <label className="campo">
                <span>A cosa serve</span>
                <select name="tipo" defaultValue={c.tipo}>
                  <option value="posta">Posta: le mail entrano in inbox</option>
                  <option value="chiamate">
                    Chiamate: notifiche del centralino, vanno in Chiamate
                  </option>
                </select>
              </label>
              <label
                style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}
              >
                <input type="checkbox" name="predefinita" value="1" defaultChecked={c.predefinita} />
                Casella predefinita (per le mail nuove)
              </label>
              <button className="btn">Salva</button>
            </form>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ProvaCasella id={c.id} />
              <form action={eliminaCasellaAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-secondario small" style={{ color: 'var(--red)' }}>
                  Elimina
                </button>
              </form>
            </div>
          </div>
        ))}

        <div className="card" style={{ borderStyle: 'dashed' }}>
          <h2 style={{ marginTop: 0 }}>Aggiungi una casella</h2>
          <form action={salvaCasellaAction}>
            <label className="campo">
              <span>Etichetta</span>
              <input name="nome" placeholder="Servizio clienti" />
            </label>
            <label className="campo">
              <span>Indirizzo</span>
              <input name="indirizzo" type="email" placeholder="cs@deluxy.it" required />
            </label>
            <label className="campo">
              <span>Nome mittente</span>
              <input name="nomeMittente" placeholder="Deluxy" />
            </label>
            <label className="campo">
              <span>Password della casella</span>
              <input name="password" type="password" autoComplete="new-password" />
            </label>
            <label className="campo">
              <span>A cosa serve</span>
              <select name="tipo" defaultValue="posta">
                <option value="posta">Posta: le mail entrano in inbox</option>
                <option value="chiamate">
                  Chiamate: notifiche del centralino, vanno in Chiamate
                </option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="campo" style={{ flex: 2 }}>
                <span>Server IMAP</span>
                <input name="imapHost" defaultValue={IMAP_DEFAULT} />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Porta</span>
                <input name="imapPort" type="number" defaultValue={993} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="campo" style={{ flex: 2 }}>
                <span>Server SMTP</span>
                <input name="smtpHost" defaultValue={SMTP_DEFAULT} />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Porta</span>
                <input name="smtpPort" type="number" defaultValue={465} />
              </label>
            </div>
            <label className="campo">
              <span>Firma delle mail di questa casella</span>
              <textarea
                name="firma"
                rows={4}
                maxLength={600}
                placeholder={'Servizio Clienti Deluxy\nWhatsApp +39 …\ndeluxy.it'}
              />
            </label>
            <label className="campo">
              <span>Marchio</span>
              <select name="negozioId" defaultValue="">
                <option value="">Nessuno (serve tutti i marchi)</option>
                {negozi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}
            >
              <input type="checkbox" name="predefinita" value="1" />
              Casella predefinita
            </label>
            <button className="btn">Aggiungi casella</button>
          </form>
        </div>
      </div>

      {/* ⚠️ Non è un antispam. Misurato il 30/07/2026: nella colonna Deluxy 85
          conversazioni e 107 non letti, quasi tutte newsletter e piattaforme —
          il lavoro vero stava in mezzo. Qui si ignorano i mittenti che UNA
          PERSONA mette in elenco: un filtro che decide da sé, il giorno che
          sbaglia, fa sparire la mail di un cliente e nessuno se ne accorge. */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Mittenti da ignorare</h2>
        <p className="descrizione">
          Le mail di questi mittenti finiscono <strong>direttamente nel cestino</strong>: non
          compaiono né in arrivo né in archivio, e non contano fra i non letti. Non si indovina
          niente — valgono solo i mittenti scritti qui.
        </p>
        {/* ⚠️⚠️ LA CONSEGUENZA VA DETTA DOVE SI SCRIVE LA REGOLA, non solo dove
            si preme «spam». Prima le mail ignorate restavano in archivio per
            sempre; dal 25/08/2026 vanno nel cestino, che si svuota dopo 30
            giorni. Una regola larga («tiktok», «@gmail.com») adesso può far
            perdere davvero la mail di un cliente — chi la scrive deve saperlo
            mentre la scrive. */}
        <p className="descrizione" style={{ color: 'var(--red)' }}>
          ⚠️ Il cestino si svuota dopo <strong>30 giorni</strong>: passati quelli, quelle mail si
          perdono davvero. Per questo una riga larga come <code>@gmail.com</code> o{' '}
          <code>info</code> va pensata due volte: farebbe sparire anche i clienti che scrivono da
          lì.
        </p>
        <form action={salvaMittentiIgnoratiAction}>
          <label className="campo">
            <span>Uno per riga</span>
            <textarea
              name="mittentiIgnorati"
              defaultValue={mittentiIgnorati}
              rows={8}
              spellCheck={false}
              placeholder={
                'info@tiktok.com\n@shopify.com\nnewsletter\n# le righe con il cancelletto sono commenti'
              }
            />
          </label>
          <p className="cella-sub">
            Tre forme, dalla più precisa alla più larga: <code>info@tiktok.com</code> per un
            indirizzo, <code>@tiktok.com</code> per tutto il dominio, <code>tiktok</code> per un
            pezzo dell&apos;indirizzo — utile per chi cambia casella a ogni invio, ma da usare con
            prudenza: una parola troppo comune farebbe sparire mezza inbox.
          </p>
          <button className="btn">Salva l&apos;elenco</button>
        </form>
        <RismistaMail />
      </div>
    </main>
  )
}
