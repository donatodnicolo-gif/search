import { datiDashboard } from '@/lib/dashboard'
import { Dashboard } from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

// La schermata iniziale del Customer Service: chi aspetta una risposta, cosa va
// consegnato, cosa è rimasto aperto. Gli ordini in bacheca hanno la loro pagina,
// `/ordini` — che è anche l'indirizzo registrato su Shopify.
export default async function PaginaIniziale() {
  const dati = await datiDashboard()

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Oggi</h1>
          <p className="page-sub">
            Chi sta aspettando una risposta, cosa va consegnato e cosa è rimasto aperto — su tutti i
            marchi, in ordine di urgenza. I numeri portano dove si lavora.
          </p>
        </div>
      </div>

      <Dashboard dati={dati} />
    </main>
  )
}
