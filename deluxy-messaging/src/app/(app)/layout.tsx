import Link from 'next/link'
import { redirect } from 'next/navigation'
import { utenteCorrente } from '@/lib/sessione'
import { esci } from '../login/actions'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utente = await utenteCorrente()
  if (!utente) redirect('/login')

  return (
    <>
      <header className="barra">
        <div className="logo">
          Deluxy <span className="oro">Messaggi</span>
        </div>
        <nav>
          <Link href="/">Inbox</Link>
          <Link href="/impostazioni">Impostazioni</Link>
        </nav>
        <div className="spazio" />
        <span className="utente">{utente.nome}</span>
        <form action={esci}>
          <button className="bottone secondario" style={{ padding: '5px 14px', fontSize: 13 }}>
            Esci
          </button>
        </form>
      </header>
      <main className="contenuto">{children}</main>
    </>
  )
}
