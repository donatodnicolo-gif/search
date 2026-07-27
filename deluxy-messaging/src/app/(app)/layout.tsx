import { redirect } from 'next/navigation'
import { utenteCorrente } from '@/lib/sessione'
import { Sidebar } from '@/components/Sidebar'
import { ToggleSidebar, VeloMenu } from '@/components/ToggleSidebar'
import { esci } from '../login/actions'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utente = await utenteCorrente()
  if (!utente) redirect('/login')

  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ToggleSidebar />
          <div className="logo">
            Deluxy <span className="oro">Customer Service</span>
          </div>
        </div>
        <div className="topbar-azioni">
          <span className="utente">{utente.nome}</span>
          <form action={esci}>
            <button className="btn btn-secondario small">Esci</button>
          </form>
        </div>
      </header>
      {/* Il menu sta a sinistra: la barra in alto tiene solo marchio e utente.
          Su mobile diventa un pannello a scomparsa, col velo che lo chiude. */}
      <div className="layout">
        <VeloMenu />
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </>
  )
}
