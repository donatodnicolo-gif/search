import { Sidebar } from "@/components/Sidebar";
import { DecidiRiconciliazione } from "@/components/DecidiRiconciliazione";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// RICONCILIAZIONI — i disaccordi fra il registro e una fonte esterna, campo per
// campo, da decidere a mano.
//
// Nascono dall'import del tracker Excel (`npm run import:excel -- --solo-nuovi`).
// Quando il file dice una cosa e il registro un'altra, lo script non sceglie:
// registra il disaccordo e lo lascia qui. Il motivo è che nessuna regola
// automatica può sapere se «Corso Matteotti 1» contro «Via Albricci 9» sia un
// trasloco, un secondo punto vendita o un errore di battitura — lo sa solo chi
// ci è stato.
//
// ⚠️ Da non confondere con **Riconciliazione** (singolare), che è un'altra cosa:
// lì si assegnano i REFERENTI finiti sotto un'anagrafica «DA CLASSIFICARE».
// Qui si decide fra due valori dello stesso campo di un'anagrafica già a posto.
//
// Le differenze di solo formato non arrivano fin qui: lo script le riconosce e
// le scarta (nel confronto di luglio 2026, 26 su 30 erano il registro che
// scrive «MI» contro il file che scrive «MILANO»). Una coda piena di falsi
// allarmi è una coda che nessuno guarda più.

const ETICHETTA_CAMPO: Record<string, string> = {
  indirizzo: "Indirizzo",
  provincia: "Provincia",
  account: "Account",
  citta: "Città",
  regione: "Regione",
};

export default async function Riconciliazioni({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  const { stato: filtro } = await searchParams;
  const mostraDecise = filtro === "decise";

  const righe = await prisma.riconciliazione.findMany({
    where: mostraDecise ? { stato: { not: "aperta" } } : { stato: "aperta" },
    include: { partner: { select: { id: true, nome: true, citta: true, categoria: true } } },
    orderBy: [{ creatoIl: "desc" }],
    take: 200,
  });
  const aperte = await prisma.riconciliazione.count({ where: { stato: "aperta" } });
  const decise = await prisma.riconciliazione.count({ where: { stato: { not: "aperta" } } });

  return (
    <div className="layout">
      <Sidebar />
      <main className="contenuto">
        <header className="testata">
          <h1>Riconciliazioni</h1>
          <p className="sottotitolo">
            Dove il tracker Excel e il registro dicono cose diverse sullo stesso campo. Nessuno dei due
            vince da solo: decidi tu, una riga per volta. Le differenze di sola forma (provincia in sigla,
            città in coda all’indirizzo) non compaiono qui.
          </p>
        </header>

        <nav className="tab">
          <a className={`tab-voce${!mostraDecise ? " attiva" : ""}`} href="/riconciliazioni">
            Da decidere{aperte > 0 ? ` (${aperte})` : ""}
          </a>
          <a className={`tab-voce${mostraDecise ? " attiva" : ""}`} href="/riconciliazioni?stato=decise">
            Già decise{decise > 0 ? ` (${decise})` : ""}
          </a>
        </nav>

        {righe.length === 0 ? (
          <p className="vuoto">
            {mostraDecise
              ? "Nessuna decisione presa finora."
              : "Nessun disaccordo aperto: registro e tracker dicono la stessa cosa (o le differenze rimaste sono di sola forma)."}
          </p>
        ) : (
          <ul className="elenco-riconc">
            {righe.map((r) => (
              <li key={r.id} className="riconc">
                <div className="riconc-testa">
                  <a className="riconc-nome" href={`/partner/${r.partner.id}`}>
                    {r.partner.nome}
                  </a>
                  <span className="riconc-meta">
                    {[r.partner.citta, r.partner.categoria].filter(Boolean).join(" · ")}
                  </span>
                  <span className="riconc-campo">{ETICHETTA_CAMPO[r.campo] ?? r.campo}</span>
                </div>

                {/* I due valori affiancati, per esteso: la decisione si prende
                    leggendoli, non ricordandoseli. */}
                <div className="riconc-valori">
                  <div className="riconc-val">
                    <span className="riconc-et">Nel registro</span>
                    <span className="riconc-testo">{r.valoreAttuale || <em>vuoto</em>}</span>
                  </div>
                  <div className="riconc-val">
                    <span className="riconc-et">Nel tracker ({r.fonte})</span>
                    <span className="riconc-testo">{r.valoreProposto || <em>vuoto</em>}</span>
                  </div>
                </div>

                <DecidiRiconciliazione
                  id={r.id}
                  stato={r.stato}
                  decisoIl={r.decisoIl ? r.decisoIl.toLocaleDateString("it-IT") : null}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
