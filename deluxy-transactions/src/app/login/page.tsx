import { redirect } from "next/navigation";
import { ModuloAccesso } from "@/components/ModuloAccesso";
import { esistonoOperatori, operatoreCorrente } from "@/lib/sessione";

export const dynamic = "force-dynamic";

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  if (await operatoreCorrente()) redirect("/");
  const { da } = await searchParams;
  const conOperatori = await esistonoOperatori();

  return (
    <div className="accesso">
      <div className="accesso-scheda">
        <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}>
          D
        </div>
        <h1>Deluxy Transactions</h1>
        <p>Autorizzazione dei pagamenti</p>
        {conOperatori ? (
          <ModuloAccesso da={da ?? ""} />
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
