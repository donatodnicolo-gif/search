import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { leggiRegole } from "@/lib/impostazioni";
import { quando } from "@/components/Etichette";
import { ModuloDistinta } from "@/components/ModuloDistinta";
import { VoceCliccabile } from "@/components/VoceCliccabile";

// Distinte SEPA: si selezionano le richieste approvate e si genera il file da
// caricare in banca. L'app non parla con nessuna banca — vedi src/lib/sepa.ts.

export const dynamic = "force-dynamic";

export default async function Distinte() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

  const [pronte, lotti, regole] = await Promise.all([
    prisma.richiesta.findMany({ where: { stato: "approvata", lottoId: null }, orderBy: { decisaIl: "asc" } }),
    prisma.lotto.findMany({
      orderBy: { creatoIl: "desc" },
      take: 30,
      include: { richieste: { select: { importoCent: true } } },
    }),
    leggiRegole(),
  ]);

  const totale = pronte.reduce((s, r) => s + r.importoCent, 0);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Distinte</h1>
          <p className="page-sub">
            {pronte.length} richieste approvate, {euro(totale)} da mettere in distinta
          </p>
        </div>
      </div>

      {!regole.ordinanteIban && (
        <div className="avviso-attenzione">
          Prima di generare una distinta serve l&apos;IBAN aziendale ordinante in <a href="/impostazioni">Impostazioni</a>.
        </div>
      )}

      {pronte.length === 0 ? (
        <div className="vuoto">Nessuna richiesta approvata in attesa di distinta.</div>
      ) : (
        <ModuloDistinta
          richieste={pronte.map((r) => ({
            id: r.id,
            riferimento: r.riferimento,
            beneficiario: r.beneficiario,
            iban: formattaIban(r.iban),
            importo: euro(r.importoCent),
            importoCent: r.importoCent,
            causale: r.causale,
          }))}
          disabilitato={operatore.ruolo === "osservatore" || !regole.ordinanteIban}
        />
      )}

      <div className="scheda" style={{ marginTop: 24 }}>
        <div className="scheda-titolo">Distinte create</div>
        {lotti.length === 0 ? (
          <p className="testo-guida">Ancora nessuna distinta.</p>
        ) : (
          <ul className="storia">
            {lotti.map((l) => (
              // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
              // voce porta alla distinta, non solo il riferimento in blu.
              <VoceCliccabile key={l.id} href={`/distinte/${l.id}`}>
                <span className="storia-data">{quando(l.creatoIl)}</span>
                <span>
                  <a href={`/distinte/${l.id}`} className="cella-nome">
                    {l.riferimento}
                  </a>{" "}
                  — {l.richieste.length} pagamenti,{" "}
                  <span className="importo">{euro(l.richieste.reduce((s, r) => s + r.importoCent, 0))}</span> · {l.stato}
                </span>
                <span className="storia-autore">{l.creatoDa}</span>
              </VoceCliccabile>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
