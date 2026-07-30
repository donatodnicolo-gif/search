import { db } from '@/lib/db'
import { pagineCollegate, type PaginaCollegata } from '@/lib/pagine-meta'
import { DiagnosiWhatsApp } from '@/components/DiagnosiWhatsApp'
import { RinnovaTokenMeta } from '@/components/RinnovaTokenMeta'
import { salvaPaginaAction, eliminaPaginaAction } from './actions'

export const dynamic = 'force-dynamic'

// Le Pagine Facebook e gli account Instagram collegati, uno per marchio.
//
// Prima la configurazione era singola (un Page Access Token e un token
// Instagram nelle Impostazioni): con due marchi si rispondeva a tutti
// dall'account impostato, cioè per metà dei clienti dal marchio sbagliato.

const NOME_CANALE: Record<string, string> = {
  messenger: 'Facebook (Messenger)',
  instagram: 'Instagram',
}

function Scheda({
  p,
  negozi,
}: {
  p: PaginaCollegata
  negozi: { id: string; nome: string }[]
}) {
  return (
    <div className="card" style={{ marginBottom: 14, opacity: p.attivo ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{p.nome}</h2>
        <span className={`badge canale-${p.canale}`}>{NOME_CANALE[p.canale] ?? p.canale}</span>
        {p.brand ? <span className="badge">{p.brand}</span> : null}
        {!p.attivo ? <span className="badge rosso">sospeso</span> : null}
        {!p.tokenProprio ? (
          <span className="cella-sub">token generale (Impostazioni) — da riempire</span>
        ) : null}
      </div>

      <form action={salvaPaginaAction} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="canale" value={p.canale} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Nome (come lo chiami tu)</span>
            <input name="nome" defaultValue={p.nome} />
          </label>
          <label className="campo">
            <span>{p.canale === 'instagram' ? 'Nome utente (@…)' : 'Nome della pagina'}</span>
            <input name="riferimento" defaultValue={p.riferimento} />
          </label>
          <label className="campo">
            <span>{p.canale === 'instagram' ? 'ID account Instagram' : 'ID della pagina'}</span>
            <input name="idPagina" defaultValue={p.idPagina} inputMode="numeric" />
          </label>
          <label className="campo">
            <span>Marchio</span>
            <select name="negozioId" defaultValue={p.negozioId ?? ''}>
              <option value="">Nessuno</option>
              {negozi.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            {/* ⚠️ Due token diversi, due strade diverse: quello che comincia per
                «IGAA» viene dall'Instagram API con login di Instagram e parla
                solo con graph.instagram.com; quello per «EAA» è il Page Access
                Token di Facebook. L'app sceglie l'indirizzo giusto dal prefisso,
                ma chi incolla deve sapere cosa sta incollando. */}
            <span>
              Token di questo account
              {p.canale === 'instagram'
                ? ' — «IGAA…» dall’Instagram API con login di Instagram, «EAA…» dalla Pagina Facebook'
                : ''}
            </span>
            <input
              name="token"
              type="password"
              autoComplete="off"
              placeholder={
                p.tokenProprio ? 'salvato — incolla per sostituire' : 'vuoto = token generale'
              }
            />
          </label>
        </div>
        <button className="bottone">Salva</button>
      </form>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {/* Sospendi/riattiva riusa la stessa action cambiando solo `attivo`. */}
        <form action={salvaPaginaAction}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="canale" value={p.canale} />
          <input type="hidden" name="idPagina" value={p.idPagina} />
          <input type="hidden" name="nome" value={p.nome} />
          <input type="hidden" name="riferimento" value={p.riferimento} />
          <input type="hidden" name="negozioId" value={p.negozioId ?? ''} />
          <input type="hidden" name="attivo" value={p.attivo ? '0' : '1'} />
          <button className="bottone secondario mini">{p.attivo ? 'Sospendi' : 'Riattiva'}</button>
        </form>
        <form action={eliminaPaginaAction}>
          <input type="hidden" name="id" value={p.id} />
          <button className="bottone secondario mini" style={{ color: 'var(--red)' }}>
            Elimina
          </button>
        </form>
      </div>
    </div>
  )
}

function ModuloNuovo({
  canale,
  negozi,
}: {
  canale: 'messenger' | 'instagram'
  negozi: { id: string; nome: string }[]
}) {
  const ig = canale === 'instagram'
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>
        Aggiungi {ig ? 'un account Instagram' : 'una Pagina Facebook'}
      </h2>
      <form action={salvaPaginaAction}>
        <input type="hidden" name="canale" value={canale} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Nome</span>
            <input name="nome" placeholder="Deluxy Flowers" />
          </label>
          <label className="campo">
            <span>{ig ? 'Nome utente (@…)' : 'Nome della pagina'}</span>
            <input name="riferimento" placeholder={ig ? '@deluxyflowers' : 'Deluxy Flowers'} />
          </label>
          <label className="campo">
            <span>{ig ? 'ID account Instagram' : 'ID della pagina'}</span>
            <input
              name="idPagina"
              inputMode="numeric"
              placeholder={ig ? 'Meta → Instagram → account' : 'Pagina → Informazioni → ID'}
            />
          </label>
          <label className="campo">
            <span>Marchio</span>
            <select name="negozioId" defaultValue="">
              <option value="">Nessuno</option>
              {negozi.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            <span>Token di questo account</span>
            <input
              name="token"
              type="password"
              autoComplete="off"
              placeholder={ig ? "Token IGAA… oppure Page Access Token" : "Page Access Token di QUESTA pagina"}
            />
          </label>
        </div>
        <button className="bottone">Aggiungi</button>
      </form>
    </div>
  )
}

export default async function PaginaAccountMeta() {
  const [pagine, negozi, visti] = await Promise.all([
    pagineCollegate(),
    db.negozioShopify.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    // Gli account da cui sono ARRIVATI messaggi: l'id vero, scritto da Meta.
    // Serve a non doverlo cercare a mano nel Business Manager — basta mandare
    // un messaggio di prova alla pagina e l'id compare qui, giusto per
    // costruzione. Cercarlo a mano è il passaggio dove si sbaglia.
    db.conversazione.groupBy({
      by: ['canale', 'numeroId'],
      where: { canale: { in: ['messenger', 'instagram'] }, NOT: { numeroId: '' } },
      _count: { _all: true },
    }),
  ])

  const messenger = pagine.filter((p) => p.canale === 'messenger')
  const instagram = pagine.filter((p) => p.canale === 'instagram')
  const giaCollegati = new Set(pagine.map((p) => `${p.canale}:${p.idPagina}`))
  const daCollegare = visti.filter((v) => !giaCollegati.has(`${v.canale}:${v.numeroId}`))

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Facebook e Instagram</h1>
          <p className="page-sub">
            Una pagina e un profilo per marchio. Il messaggio che arriva su un account resta su
            quello: in Inbox si vede a chi ha scritto il cliente, e la risposta esce dallo stesso
            account — non da un altro marchio del gruppo.
          </p>
        </div>
      </div>

      {pagine.length === 0 ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Nessun account collegato</h2>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Finché non ne colleghi almeno uno si usa il token generale delle Impostazioni, che va
            bene con <strong>un solo</strong> account. Con più pagine serve il token di ciascuna:
            quello di un&apos;altra pagina non fa partire il messaggio dalla pagina giusta.
          </p>
        </div>
      ) : null}

      {/* Gli id che Meta ci ha già mandato: si collegano con un clic, senza
          andarli a cercare nel Business Manager. */}
      {daCollegare.length ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>
            Account che ci hanno scritto, ma non ancora collegati
          </h2>
          <p className="descrizione">
            Questi id li ha scritti Meta stessa consegnando i messaggi, quindi sono giusti per
            costruzione. Manda un messaggio di prova alla pagina o al profilo, ricarica, e prendilo
            da qui invece di cercarlo a mano: è il passaggio dove si sbaglia.
          </p>
          {daCollegare.map((v) => (
            <form
              action={salvaPaginaAction}
              key={`${v.canale}:${v.numeroId}`}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}
            >
              <input type="hidden" name="canale" value={v.canale} />
              <input type="hidden" name="idPagina" value={v.numeroId} />
              <div>
                <span className={`badge canale-${v.canale}`}>
                  {NOME_CANALE[v.canale] ?? v.canale}
                </span>{' '}
                <code>{v.numeroId}</code>{' '}
                <span className="cella-sub">
                  {v._count._all} conversazion{v._count._all === 1 ? 'e' : 'i'}
                </span>
              </div>
              <label className="campo" style={{ margin: 0 }}>
                <span>Nome</span>
                <input name="nome" placeholder="Deluxy Flowers" />
              </label>
              <label className="campo" style={{ margin: 0 }}>
                <span>Marchio</span>
                <select name="negozioId" defaultValue="">
                  <option value="">Nessuno</option>
                  {negozi.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button className="bottone secondario mini">Collega</button>
            </form>
          ))}
          <p className="cella-sub" style={{ marginBottom: 0 }}>
            Il token si aggiunge dopo, nella scheda dell&apos;account: senza, i messaggi si leggono
            ma non si risponde.
          </p>
        </div>
      ) : null}

      {messenger.map((p) => (
        <Scheda key={p.id} p={p} negozi={negozi} />
      ))}
      <ModuloNuovo canale="messenger" negozi={negozi} />

      {instagram.map((p) => (
        <Scheda key={p.id} p={p} negozi={negozi} />
      ))}
      <ModuloNuovo canale="instagram" negozi={negozi} />

      {/* La diagnosi è la stessa di Numeri WhatsApp — controlla già gli oggetti
          `instagram` e `page` — ma stava solo là dentro: chi collega Instagram
          non passa da quella pagina e restava senza risposta alla domanda
          «perché il mio DM non è arrivato?». */}
      {/* ⚠️ La scadenza dei token Instagram: 60 giorni, e non si rinnova da sé.
          Al sessantesimo giorno i direct smettono di arrivare e non lo dice
          nessuno — sembra un guasto ed è il calendario. */}
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Scadenza dei token</h2>
        <p className="descrizione">
          Il token dell&apos;<strong>Instagram API con login di Instagram</strong> dura{' '}
          <strong>60 giorni</strong> e non si rinnova da solo: al sessantesimo giorno i direct
          smettono di arrivare senza che niente lo segnali. Ogni notte l&apos;app lo rinnova in
          anticipo (dal quindicesimo giorno prima della scadenza), perché Meta lascia rinnovarlo
          solo mentre è ancora valido.
        </p>
        <p className="descrizione">
          La strada migliore però è un&apos;altra: un token generato da un{' '}
          <strong>utente di sistema</strong> in Meta Business Suite <strong>non scade</strong>. Se
          usi quello, qui sotto leggerai «non rinnovato» con l&apos;errore di Meta — ed è la
          risposta giusta, non un guasto: quel token non ha bisogno di rinnovi.
        </p>
        {instagram.some((p) => p.tokenScadeIl || p.tokenEsito) ? (
          <ul className="elenco-esiti">
            {instagram
              .filter((p) => p.tokenScadeIl || p.tokenEsito)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.riferimento || p.nome}</strong> —{' '}
                  {p.tokenScadeIl
                    ? `scade il ${new Date(p.tokenScadeIl).toLocaleDateString('it-IT')}`
                    : 'scadenza non nota'}
                  {p.tokenEsito ? ` · ${p.tokenEsito}` : ''}
                </li>
              ))}
          </ul>
        ) : null}
        <RinnovaTokenMeta />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Non arrivano i messaggi?</h2>
        <p className="descrizione">
          Il controllo interroga Meta con i token salvati qui e dice a che punto si ferma. La
          domanda che conta è l&apos;<strong>iscrizione al webhook</strong>: Instagram e Messenger
          si iscrivono <strong>a parte</strong> rispetto a WhatsApp, e finché il campo{' '}
          <code>messages</code> del prodotto Instagram non è spuntato, Meta non ci manda niente —
          il messaggio resta nella posta di Instagram e qui non arriva.
        </p>
        <DiagnosiWhatsApp />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Dove si trovano questi dati</h2>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          L&apos;<strong>ID della pagina</strong> sta in Facebook → Pagina → Informazioni;
          l&apos;<strong>ID dell&apos;account Instagram</strong> in Meta Business Suite →
          Impostazioni → account Instagram. Il <strong>token</strong> si genera nell&apos;app Meta →
          Messenger → Impostazioni → Token di accesso, scegliendo quella pagina: ne esce uno per
          pagina, ed è quello che va incollato qui. Instagram passa dalla pagina Facebook a cui il
          profilo professionale è collegato. Il webhook è unico per tutti i canali — quello già
          impostato per WhatsApp vale anche qui, purché nell&apos;app Meta siano spuntati i campi{' '}
          <code>messages</code> dei prodotti Messenger e Instagram.
        </p>
      </div>
    </main>
  )
}
