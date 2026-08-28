import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { quando } from "@/components/Etichette";
import { abbina } from "@/lib/pagamento-banca";
import { contoDaUsare, movimenti, qontoConfigurato } from "@/lib/qonto";
import { leggiRegole } from "@/lib/impostazioni";

export const dynamic = "force-dynamic";

// Il conto visto dall'app: saldo e ultime uscite, con accanto la richiesta
// Deluxy riconosciuta. Questa pagina non muove niente e non cambia niente: è la
// risposta alla domanda «il denaro è uscito davvero?».
export default async function Banca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; periodo?: string }>;
}) {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  const sp = await searchParams;

  if (!(await qontoConfigurato())) {
    return (
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Banca</h1>
            <p className="page-sub">Saldo e movimenti del conto.</p>
          </div>
        </div>
        <div className="scheda">
          <div className="avviso-errore">
            Qonto non è collegato. Le chiavi si incollano in{" "}
            <a href="/impostazioni">Impostazioni → Collegamento alla banca</a> (si generano in Qonto: Integrazioni e
            partnership → Chiave API). In alternativa valgono <code>QONTO_LOGIN</code> e <code>QONTO_SECRET_KEY</code>{" "}
            fra le variabili d&apos;ambiente.
          </div>
        </div>
      </main>
    );
  }

  const regole = await leggiRegole();
  const conto = await contoDaUsare();
  if (!conto.ok) {
    return (
      <main className="main">
        <div className="page-head">
          <h1 className="page-title">Banca</h1>
        </div>
        <div className="scheda">
          <div className="avviso-errore">{conto.errore}</div>
        </div>
      </main>
    );
  }

  // Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): un parametro solo.
  // Il periodo si applica alla DATA CONTABILE del movimento (`settled_at`):
  // è la data con cui la banca lo registra, quella che qui si legge in tabella.
  // Senza scorciatoia si tengono gli ultimi 30 giorni, com'era prima.
  const PERIODI = ["mese", "scorso", "trimestre", "anno"] as const;
  const periodo = PERIODI.includes(sp.periodo as (typeof PERIODI)[number]) ? sp.periodo! : "";
  const oggi = new Date();
  const inizioMese = (n: number) => new Date(oggi.getFullYear(), oggi.getMonth() - n, 1);
  const dal =
    periodo === "mese" ? inizioMese(0)
    : periodo === "scorso" ? inizioMese(1)
    : periodo === "trimestre" ? inizioMese(2) // ultimi 3 mesi incluso il corrente
    : periodo === "anno" ? new Date(oggi.getFullYear(), 0, 1)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const al = periodo === "scorso" ? inizioMese(0) : undefined;
  const ETICHETTA_PERIODO: Record<string, string> = {
    mese: "del mese in corso",
    scorso: "del mese scorso",
    trimestre: "degli ultimi 3 mesi",
    anno: "dell'anno in corso",
  };
  const etichettaUscite = ETICHETTA_PERIODO[periodo] ?? "degli ultimi 30 giorni";

  const uscite = await movimenti({ contoId: conto.dati.id, dal, al, soloUscite: true });
  const richieste = await prisma.richiesta.findMany({
    // La finestra delle richieste deve coprire il periodo mostrato: con «anno»
    // i 120 giorni di prima lascerebbero i movimenti vecchi senza abbinamento.
    where: { creataIl: { gte: new Date(Math.min(dal.getTime(), Date.now() - 120 * 24 * 60 * 60 * 1000)) } },
    select: { id: true, riferimento: true, stato: true, importoCent: true },
  });
  const righe = uscite.ok ? abbina(uscite.dati, richieste) : [];
  // La ricerca (Libro v1.9 §8-bis): beneficiario, causale o riferimento della
  // richiesta abbinata. In memoria: le righe arrivano già tutte dalla banca.
  const cerca = (sp.q ?? "").trim().toLowerCase();
  const visibili = cerca
    ? righe.filter((r) =>
        `${r.descrizione ?? ""} ${r.causale ?? ""} ${r.richiesta?.riferimento ?? ""}`.toLowerCase().includes(cerca)
      )
    : righe;
  const nonRiconosciute = visibili.filter((r) => !r.richiesta).length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Banca</h1>
          <p className="page-sub">
            {conto.dati.name ?? "Conto"} · {conto.dati.iban ? formattaIban(conto.dati.iban) : "—"}
          </p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Saldo</div>
        <div className="griglia-campi">
          <div className="campo">
            <dt>Disponibile</dt>
            <dd className="importo">
              {typeof conto.dati.authorized_balance_cents === "number"
                ? euro(conto.dati.authorized_balance_cents)
                : "—"}
            </dd>
          </div>
          <div className="campo">
            <dt>Saldo contabile</dt>
            <dd className="importo">
              {typeof conto.dati.balance_cents === "number" ? euro(conto.dati.balance_cents) : "—"}
            </dd>
          </div>
          <div className="campo">
            <dt>Pagamento dalla banca</dt>
            <dd>{regole.qontoEsecuzioneAttiva ? "acceso" : "spento (esce solo il file SEPA)"}</dd>
          </div>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Vai a pagare</div>
        {regole.urlPortaleBanca || regole.urlCaricamentoSepa ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {regole.urlCaricamentoSepa && (
              <a className="btn" href={regole.urlCaricamentoSepa} target="_blank" rel="noopener noreferrer">
                Carica il file SEPA ↗
              </a>
            )}
            {regole.urlPortaleBanca && (
              <a className="btn btn-secondario" href={regole.urlPortaleBanca} target="_blank" rel="noopener noreferrer">
                Apri il portale della banca ↗
              </a>
            )}
          </div>
        ) : (
          <p className="firma-nota">
            Nessun link impostato. Compilali in <a href="/impostazioni">Impostazioni</a>: da lì diventano i bottoni per
            arrivare con un clic alla pagina della banca dove si completa il pagamento.
          </p>
        )}
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Uscite {etichettaUscite}</div>
        {/* Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): link GET fuori
            dal form — il submit del form non porta `periodo` e le azzera. */}
        <div className="filtri riga-chips-scorri" style={{ marginBottom: 10 }}>
          {([
            { v: "mese", l: "Mese in corso" },
            { v: "scorso", l: "Mese scorso" },
            { v: "trimestre", l: "Trimestre" },
            { v: "anno", l: "Anno" },
          ] as const).map((p) => (
            <a
              key={p.v}
              href={`/banca?periodo=${p.v}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
              className={`chip-link${periodo === p.v ? " attiva" : ""}`}
            >
              {p.l}
            </a>
          ))}
          {periodo && (
            <a href={`/banca${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`} className="chip-link azzera">
              Ultimi 30 giorni
            </a>
          )}
        </div>
        <form className="filtri" method="get" style={{ marginBottom: 10 }}>
          {/* La ricerca (Libro v1.9 §8-bis): beneficiario, causale o TRX-…. */}
          <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Cerca per beneficiario, causale o riferimento…" />
          <button className="btn" type="submit">Cerca</button>
        </form>
        {!uscite.ok ? (
          <div className="avviso-errore">{uscite.errore}</div>
        ) : (
          <p className="firma-nota">
            {visibili.length}
            {cerca ? ` su ${righe.length}` : ""} uscite · {nonRiconosciute} senza una richiesta Deluxy riconosciuta. Il riconoscimento cerca il
            riferimento (TRX-…) nella causale del movimento: non si indovina per importo, perché due bonifici uguali
            nello stesso giorno sono normali e sbagliare vorrebbe dire dare per pagata una richiesta che non lo è.
          </p>
        )}
      </div>

      {uscite.ok && visibili.length > 0 && (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Beneficiario</th>
                <th>Causale</th>
                <th>Richiesta</th>
                <th className="num">Importo</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => (
                <tr key={r.movimentoId}>
                  <td className="cella-muta">{r.data ? quando(new Date(r.data)) : "—"}</td>
                  <td>{r.descrizione || "—"}</td>
                  <td className="cella-muta">{r.causale || "—"}</td>
                  <td>
                    {r.richiesta ? (
                      <a href={`/richieste/${r.richiesta.id}`} className="cella-nome">
                        {r.richiesta.riferimento}
                      </a>
                    ) : (
                      <span className="cella-muta">non riconosciuta</span>
                    )}
                  </td>
                  <td className="cella-num importo">{euro(r.importoCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
