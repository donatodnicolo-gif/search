import { headers } from 'next/headers'
import Link from 'next/link'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { AspettoWidget } from '@/components/AspettoWidget'

export const dynamic = 'force-dynamic'

// L'aspetto della chat sui siti: tema, colore, posizione, e il codice pronto.
//
// Il widget non gira qui dentro ma sui siti degli altri — i nostri e quelli dei
// partner — dove il CSS è di qualcun altro. I temi servono a farlo sembrare
// parte di quel sito senza toccarne il codice.

export default async function PaginaAspettoWidget() {
  const intestazioni = await headers()
  const host = intestazioni.get('host') ?? 'deluxy-messaging.vercel.app'
  const protocollo = host.startsWith('localhost') ? 'http' : 'https'
  const config = await leggiImpostazioni(['widgetTitolo'])

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Aspetto del widget</h1>
          <p className="page-sub">
            La chat sui siti si adatta a chi la ospita: sei temi, il colore del sito e la
            posizione. Il testo del saluto e il titolo restano in{' '}
            <Link href="/impostazioni">Impostazioni</Link>.
          </p>
        </div>
      </div>

      <AspettoWidget
        origine={`${protocollo}://${host}`}
        titolo={config.widgetTitolo || 'Deluxy'}
      />
    </main>
  )
}
