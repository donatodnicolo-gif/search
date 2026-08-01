import type { Metadata } from 'next'
import { sitoDaCodice } from '@/lib/widget-siti'

export const dynamic = 'force-dynamic'

// LA CHAT COME PAGINA A SÉ: deluxy-messaging.vercel.app/chat/<codice>
//
// È la stessa chat del widget, ma senza un sito attorno: si manda per link.
// Serve dove un widget non può stare — la bio di Instagram, la firma delle
// mail, un QR sul biglietto che va col mazzo, un messaggio WhatsApp con
// «scrivici qui» — e arriva nella stessa Inbox, nella colonna del marchio
// giusto, perché sotto è sempre `/widget?sito=<slug>`.
//
// ⚠️ È PUBBLICA: nessun login. Per questo il pezzo di URL è un codice casuale e
// non lo slug del sito — con `/chat/cake` bastava provare `/chat/deluxy` per
// aprire conversazioni a nome di un altro marchio. Va anche esclusa dal
// middleware (vedi `src/middleware.ts`), che altrimenti manda al login chi
// arriva da fuori: cioè tutti.

type Props = { params: Promise<{ codice: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codice } = await params
  const sito = await sitoDaCodice(codice)
  const nome = sito?.titolo || sito?.nome || 'Deluxy'
  return {
    title: `${nome} — chat`,
    description: 'Scrivici: rispondiamo dal servizio clienti.',
    // Un link mandato in giro non deve finire nei risultati di ricerca: è per
    // chi lo riceve, non per il mondo.
    robots: { index: false, follow: false },
  }
}

export default async function PaginaChatPubblica({ params }: Props) {
  const { codice } = await params
  const sito = await sitoDaCodice(codice)

  if (!sito) {
    return (
      <main className="chat-piena chat-piena-vuota">
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Questa chat non esiste più</h1>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Il link potrebbe essere stato disattivato. Scrivici a{' '}
            <a href="mailto:cs@deluxy.it">cs@deluxy.it</a> e ti rispondiamo lo stesso.
          </p>
        </div>
      </main>
    )
  }

  // Gli stessi parametri che `widget.js` passa all'iframe sui siti: da qui in
  // giù è esattamente il widget, senza un pezzo di codice in più da tenere
  // allineato. `pagina=link` dice all'Inbox da dove arriva la conversazione.
  const parametri = new URLSearchParams({ sito: sito.slug, tema: sito.tema, pagina: 'link' })
  if (sito.accento) parametri.set('accento', sito.accento)
  // ⚠️ Il dominio serve ai LINK RAPIDI: sono relativi («/collections/oggi») e
  // qui non c'è un sito attorno a cui appoggiarli. Senza, «Torte per oggi»
  // avrebbe portato su deluxy-messaging.vercel.app/collections/oggi — cioè a
  // una pagina che non esiste, dal link che mandiamo ai clienti.
  if (sito.dominio) parametri.set('dominio', sito.dominio)

  return (
    <main className="chat-piena">
      <div className="chat-piena-cornice">
        <iframe
          src={`/widget?${parametri.toString()}`}
          title={`Chat con ${sito.nome}`}
          allow="clipboard-write"
        />
      </div>
      <p className="chat-piena-firma">{sito.nome}</p>
    </main>
  )
}
