/**
 * Cosa si vede MENTRE una schermata arriva.
 *
 * ⚠️ Serve perché tutte le pagine di quest'app sono `force-dynamic`: ognuna
 * interroga il database (e a volte l'AI o il server IMAP) a ogni apertura. Senza
 * questo file, premendo una voce del menu non succedeva **niente** — si restava
 * sulla pagina di prima, immobile, per tutto il viaggio fino al database. È la
 * ricetta del doppio clic e del «si è piantata».
 *
 * ⚠️ Sta alla RADICE apposta: copre tutte le rotte in un colpo. Una schermata
 * che vuole un'attesa più parlante può metterne uno suo nella sua cartella.
 */
export default function Caricamento() {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="empty">
        <div className="empty-icon" aria-hidden>
          ⟳
        </div>
        <div className="empty-title">Un attimo…</div>
        <p className="empty-text">Sto leggendo i dati.</p>
      </div>
    </div>
  )
}
