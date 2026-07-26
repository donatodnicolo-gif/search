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
export default async function Banca() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

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

  const dal = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const uscite = await movimenti({ contoId: conto.dati.id, dal, soloUscite: true });
  const richieste = await prisma.richiesta.findMany({
    where: { creataIl: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) } },
    select: { id: true, riferimento: true, stato: true, importoCent: true },
  });
  const righe = uscite.ok ? abbina(uscite.dati, richieste) : [];
  const nonRiconosciute = righe.filter((r) => !r.richiesta).length;

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
        <div className="scheda-titolo">Uscite degli ultimi 30 giorni</div>
        {!uscite.ok ? (
          <div className="avviso-errore">{uscite.errore}</div>
        ) : (
          <p className="firma-nota">
            {righe.length} uscite · {nonRiconosciute} senza una richiesta Deluxy riconosciuta. Il riconoscimento cerca il
            riferimento (TRX-…) nella causale del movimento: non si indovina per importo, perché due bonifici uguali
            nello stesso giorno sono normali e sbagliare vorrebbe dire dare per pagata una richiesta che non lo è.
          </p>
        )}
      </div>

      {uscite.ok && righe.length > 0 && (
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
              {righe.map((r) => (
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
