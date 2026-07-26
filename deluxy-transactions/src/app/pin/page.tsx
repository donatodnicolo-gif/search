import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { eIlPagatore, emailPagatore } from "@/lib/sblocco";
import { quando } from "@/components/Etichette";
import { ModuloPin } from "@/components/ModuloPin";

export const dynamic = "force-dynamic";

export default async function Pin() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

  const o = await prisma.operatore.findUnique({ where: { id: operatore.id } });
  const pagatore = await eIlPagatore(operatore.email);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">PIN di pagamento</h1>
          <p className="page-sub">Il terzo fattore: senza, dall&apos;app non esce denaro.</p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">{o?.pinHash ? "Cambia il PIN" : "Imposta il PIN"}</div>
        {o?.pinAggiornatoIl && <p className="firma-nota">Ultimo aggiornamento: {quando(o.pinAggiornatoIl)}.</p>}
        <ModuloPin richiedeCodice={operatore.totpAttivo} giaImpostato={Boolean(o?.pinHash)} />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">A cosa serve</div>
        <ul className="elenco-secco">
          <li>
            <span className="pallino" />
            Il denaro esce solo da questa app, e solo da una distinta <strong>sbloccata</strong>.
          </li>
          <li>
            <span className="pallino" />
            Sbloccare vuol dire: chiedere un codice, riceverlo per email su{" "}
            <strong>{await emailPagatore()}</strong>, digitarlo insieme al PIN.
          </li>
          <li>
            <span className="pallino" />
            {pagatore
              ? "Oggi il pagatore sei tu: il PIN che imposti qui è quello che sblocca i pagamenti."
              : "Oggi il pagatore non sei tu: il PIN ti serve solo se un domani lo diventi."}
          </li>
          <li>
            <span className="pallino" />
            Il codice arriva con importo e beneficiari scritti dentro: se ne ricevi uno che non hai chiesto, qualcuno è
            entrato con le tue credenziali.
          </li>
        </ul>
      </div>
    </main>
  );
}
