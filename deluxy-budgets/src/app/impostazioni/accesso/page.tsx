import Link from "next/link";
import { statoAccesso } from "@/lib/accesso";
import { AccessoEditor } from "@/components/AccessoEditor";

export const dynamic = "force-dynamic";

export default async function AccessoPage() {
  const stato = await statoAccesso();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Accesso</h1>
          <p className="page-caption">
            Chi entra in quest&apos;app vede budget, premi e stipendi. La password del team è{" "}
            <strong>una sola e condivisa</strong>: il <strong>codice di autenticazione</strong> aggiunge una cosa
            che non si può inoltrare — cambia ogni trenta secondi e sta su un dispositivo.
          </p>
        </div>
      </div>

      <AccessoEditor
        obbligatorio={stato.obbligatorio}
        daConfermare={stato.daConfermare}
        cifraturaOk={stato.cifraturaOk}
      />

      <p className="page-caption" style={{ marginTop: 14 }}>
        <strong>Non ci si può chiudere fuori</strong>, ed è la regola che governa questa pagina. Il codice diventa
        obbligatorio <em>solo</em> dopo che ne hai digitato uno valido: una chiave generata e mai confermata non
        blocca nessuno. E se un domani <code>APP_SECRET</code> cambiasse — cioè il segreto con cui la chiave è
        cifrata — l&apos;app tornerebbe alla sola password invece di rifiutare tutti perché non riesce a leggerla.
      </p>
      <p className="page-caption">
        Funziona con qualsiasi app di autenticazione standard (Google Authenticator, 1Password, Authy): è lo stesso
        meccanismo — e lo stesso codice — di{" "}
        <a href="https://deluxy-transactions.vercel.app" style={{ color: "var(--blue)" }}>Deluxy Transactions</a>,
        così il secondo fattore si fa in un modo solo in tutto l&apos;ecosistema.
      </p>
      <p className="page-caption">
        Le chiavi dei servizi esterni stanno in{" "}
        <Link href="/impostazioni/chiavi" style={{ color: "var(--blue)" }}>Chiavi</Link>.
      </p>
    </>
  );
}
