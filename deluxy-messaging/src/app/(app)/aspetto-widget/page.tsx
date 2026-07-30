import { headers } from 'next/headers'
import Link from 'next/link'
import { AspettoWidget } from '@/components/AspettoWidget'
import { sitiWidget } from '@/lib/widget-siti'
import { salvaAspettoSito } from './actions'

export const dynamic = 'force-dynamic'

// L'aspetto della chat sui siti, UN SITO PER VOLTA: tema, colore, posizione,
// titolo, saluto e il codice pronto da incollare.
//
// Il widget non gira qui dentro ma sui siti degli altri — i nostri e quelli dei
// partner — dove il CSS è di qualcun altro. I temi servono a farlo sembrare
// parte di quel sito senza toccarne il codice; i testi per sito servono perché
// deluxy.it, l'atelier dei fiori e la pasticceria non parlano allo stesso modo.

export default async function PaginaAspettoWidget({
  searchParams,
}: {
  searchParams: Promise<{ sito?: string; salvato?: string }>
}) {
  const { sito: sitoScelto, salvato } = await searchParams
  const intestazioni = await headers()
  const host = intestazioni.get('host') ?? 'deluxy-messaging.vercel.app'
  const protocollo = host.startsWith('localhost') ? 'http' : 'https'
  const siti = await sitiWidget()

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Widget dei siti</h1>
          <p className="page-sub">
            Scegli il sito e trovi il widget già nella voce di quel brand: tema, colore, scritta del
            bottone, titolo e saluto. Ogni sito ha il suo codice da incollare, e in{' '}
            <Link href="/inbox">Inbox</Link> le chat finiscono nella colonna del marchio giusto.
          </p>
        </div>
      </div>

      {salvato ? <div className="avviso-ok">Widget salvato per questo sito.</div> : null}

      {/* Il sito scelto viaggia nell'URL: così dopo il salvataggio si torna su
          quello che si stava configurando, e non sul primo dell'elenco. */}
      <AspettoWidget
        origine={`${protocollo}://${host}`}
        siti={siti}
        slugIniziale={sitoScelto ?? ''}
        salva={salvaAspettoSito}
      />
    </main>
  )
}
