import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataBreve } from "@/lib/ordini";
import { negoziPronti } from "@/lib/incassa";
import { ModuloIncasso } from "@/components/ModuloIncasso";
import { RigaLinkIncasso } from "@/components/RigaLinkIncasso";
import { creaLink, aggiornaStatoLink, annullaLink, rileggiPermessi } from "./actions";

export const dynamic = "force-dynamic";

// FATTI PAGARE — un link per qualcosa che non è ancora un ordine: «100 rose».
//
// Shopify prepara una **bozza d'ordine** e ne esce un link; quando il cliente
// paga, la bozza **diventa un ordine vero** e la sync lo porta nel registro. È il
// motivo per cui non si crea un ordine subito: un ordine non pagato comparirebbe
// in bacheca, in consegna e al Customer Service anche se il cliente non paga mai.

const STATI: Record<string, { nome: string; colore: string }> = {
  aperto: { nome: "In attesa", colore: "var(--orange)" },
  pagato: { nome: "Pagato", colore: "var(--green)" },
  annullato: { nome: "Annullato", colore: "var(--text-tertiary)" },
};

export default async function Incassa() {
  const [negozi, link] = await Promise.all([
    negoziPronti(),
    prisma.linkIncasso.findMany({ orderBy: { creatoIl: "desc" }, take: 100 }),
  ]);

  const pronti = negozi.filter((n) => n.pronto === true);
  const nonPronti = negozi.filter((n) => n.pronto === false);
  const sconosciuti = negozi.filter((n) => n.pronto === null);
  const inAttesa = link.filter((l) => l.stato === "aperto");

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Fatti pagare</h1>
          <p className="page-sub">
            Un link di pagamento per qualcosa che <strong>non è ancora un ordine</strong> — «100 rose», un supplemento,
            un lavoro concordato al telefono. Quando il cliente paga, diventa un ordine e lo trovi nel registro.
          </p>
        </div>
      </div>

      {/* Quali negozi possono già farlo. Se manca il permesso si dice cosa fare,
          invece di lasciare che il bottone fallisca con un ACCESS_DENIED. */}
      {nonPronti.length > 0 && (
        <div className="avviso-nuovi" style={{ borderLeftColor: "var(--orange)" }}>
          <span className="cresce">
            <strong>
              {nonPronti.length === negozi.length
                ? "Nessun negozio può ancora creare link."
                : `${nonPronti.map((n) => n.brand).join(", ")}: permesso mancante.`}
            </strong>{" "}
            Serve il permesso <code className="inline">write_draft_orders</code> sull&apos;app Shopify di quel negozio
            (oggi il token ha <code className="inline">read_orders</code> e <code className="inline">write_orders</code>,
            che bastano a leggere e aggiornare gli ordini ma non a preparare una bozza). Si aggiunge una volta sola nella
            Dev Dashboard del negozio; il token si rifà da sé al primo uso, senza reincollare niente qui.
            {pronti.length > 0 && ` Intanto ${pronti.map((n) => n.brand).join(", ")} funziona già.`}
          </span>
          {/* Il token che abbiamo in mano dura ~24 ore e i permessi li ha
              dentro: appena il permesso è stato aggiunto in Shopify va fatto
              scadere, altrimenti il cambiamento si vedrebbe domani e sembrerebbe
              non aver funzionato. */}
          <form action={rileggiPermessi}>
            <button className="btn small" type="submit" title="Fa scadere il token: al primo uso l'app se ne conia uno nuovo coi permessi aggiornati">
              Ho aggiunto il permesso — rileggi
            </button>
          </form>
        </div>
      )}
      {sconosciuti.length > 0 && (
        <p className="testo-guida">
          Non sono riuscito a chiedere i permessi di {sconosciuti.map((n) => n.brand).join(", ")}: controlla il
          collegamento in <Link href="/impostazioni" className="ritorno">Impostazioni</Link>.
        </p>
      )}

      <ModuloIncasso negozi={negozi.map((n) => ({ nome: n.brand, pronto: n.pronto }))} crea={creaLink} />

      <div className="scheda">
        <div className="scheda-titolo">
          Link creati
          {inAttesa.length > 0 && (
            <span className="testo-guida" style={{ fontWeight: 400 }}>
              {" "}
              · {inAttesa.length} in attesa per {euro(inAttesa.reduce((s, l) => s + l.totale, 0))}
            </span>
          )}
        </div>

        <div className="tabella-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Bozza</th>
                <th>Cosa</th>
                <th>Cliente</th>
                <th className="num">Importo</th>
                <th>Stato</th>
                <th>Creato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {link.map((l) => {
                const st = STATI[l.stato] ?? STATI.aperto;
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="cella-nome">{l.nome}</span>
                      <div className="cella-sub">{l.brand}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.descrizione}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {l.clienteNome ?? l.clienteEmail ?? l.clienteTelefono ?? "—"}
                    </td>
                    <td className="cella-num">{euro(l.totale, l.valuta)}</td>
                    <td>
                      <span className="pill-stato" style={{ color: st.colore }}>
                        <span className="dot" style={{ background: st.colore }} />
                        {st.nome}
                      </span>
                      {l.ordineNumero && <div className="cella-muta">ordine {l.ordineNumero}</div>}
                    </td>
                    <td className="cella-muta">{dataBreve(l.creatoIl)}</td>
                    <td>
                      <RigaLinkIncasso
                        linkId={l.id}
                        pagato={l.stato !== "aperto"}
                        aggiorna={aggiornaStatoLink}
                        annulla={annullaLink}
                      />
                    </td>
                  </tr>
                );
              })}
              {link.length === 0 && (
                <tr>
                  <td colSpan={7} className="cella-muta">
                    Nessun link creato finora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="testo-guida" style={{ marginTop: 10 }}>
          Lo <strong>stato non si aggiorna da solo</strong>: «Mostra il link» lo richiede a Shopify e nello stesso giro
          scopre se nel frattempo è stato pagato. Il link contiene un segreto e per questo non è salvato qui: si chiede
          quando serve. <strong>L&apos;app non manda niente al cliente</strong> — lo copi e lo mandi tu.
        </p>
      </div>
    </main>
  );
}
