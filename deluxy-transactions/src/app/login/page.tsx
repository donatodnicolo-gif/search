import { redirect } from "next/navigation";
import { ModuloAccesso } from "@/components/ModuloAccesso";
import { MINUTI_INATTIVITA, esistonoOperatori, operatoreCorrente, uscitoPerInattivita } from "@/lib/sessione";

export const dynamic = "force-dynamic";

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  if (await operatoreCorrente()) redirect("/");
  const { da } = await searchParams;
  const conOperatori = await esistonoOperatori();
  const perInattivita = await uscitoPerInattivita();

  return (
    <div className="accesso">
      <div className="accesso-scheda">
        <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}>
          D
        </div>
        <h1>Deluxy Transactions</h1>
        <p>Autorizzazione dei pagamenti</p>
        {perInattivita && (
          <div className="avviso-attenzione" style={{ textAlign: "left" }}>
            Sei uscito da solo: la sessione si chiude dopo {MINUTI_INATTIVITA} minuti senza attività. Rientra e riprendi
            da dove eri.
          </div>
        )}
        {conOperatori ? (
          <>
            <ModuloAccesso da={da ?? ""} />
            <p className="firma-nota" style={{ textAlign: "left" }}>
              Per sicurezza la sessione si chiude da sola dopo {MINUTI_INATTIVITA} minuti di inattività, e comunque a
              fine giornata.
            </p>
          </>
        ) : (
          <div className="testo-guida" style={{ textAlign: "left" }}>
            Nessun operatore configurato. Dalla cartella dell&apos;app:
            <code className="chiave-mostrata">npm run operatore</code>
            crea il primo amministratore e stampa il segreto per l&apos;app di autenticazione.
          </div>
        )}
      </div>
    </div>
  );
}
