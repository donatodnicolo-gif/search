import { redirect } from 'next/navigation'
import { utenteCorrente } from '@/lib/sessione'
import { Sidebar } from '@/components/Sidebar'
import { ToggleSidebar, VeloMenu } from '@/components/ToggleSidebar'
import { AiutoLaterale } from '@/components/AiutoLaterale'
import { Novita } from '@/components/Novita'
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
        {/* ⚠️ Il ruolo serve al menu per non mostrare a un operatore le due voci
            che non può usare (Turni, Operatori): una voce che risponde «serve un
            amministratore» sembra un guasto dell'app, non una regola. */}
        <Sidebar amministratore={utente.ruolo === 'admin'} utente={utente.nome} />
        <main className="main">{children}</main>
      </div>
      {/* ⚠️ Fuori dal <div class="layout">: la linguetta è fissa sul bordo
          della finestra, e dentro un contenitore che scorre seguirebbe la
          pagina invece di restare dov'è. */}
      <AiutoLaterale />
      {/* ⚠️⚠️ Gli avvisi stanno QUI, nel layout di tutte le pagine dietro al
          login, e non nella schermata dei riassunti: chi lavora sta dentro una
          conversazione o dentro un ordine, e avvisare solo chi è già sulla
          pagina dei riassunti vuol dire non avvisare nessuno.
          ⚠️ Fuori dal <div class="layout"> come la linguetta dell'aiuto: sono
          fissi al bordo della finestra, e dentro un contenitore che scorre
          seguirebbero la pagina invece di restare dove sono. */}
      <Novita />
    </>
  )
}
