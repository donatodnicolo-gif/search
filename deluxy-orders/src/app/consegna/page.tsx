import { prisma } from "@/lib/db";
import { tokenNegozio } from "@/lib/shopify";
import { cercaDocumento, FASCE_DUE_ORE, FASCE_UN_ORA, type DocumentoConsegna } from "@/lib/consegna";
import { impostaConsegnaShopify } from "@/app/actions";

export const dynamic = "force-dynamic";

// Imposta data e fascia di consegna su una bozza (o su un ordine già creato).
// Il sito le scrive da solo quando l'ordine passa dal carrello; una bozza fatta
// a mano in admin no, perché Shopify non ha un campo per gli attributi. Da qui
// si scrivono con lo stesso nome e formato del sito, così a valle nessuno deve
// sapere da dove è nato l'ordine.

function etichettaFascia(f: string): string {
  const [a, b] = f.split("-");
  return `${a}:00 – ${b}:00`;
}

export default async function Consegna({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const negozi = await prisma.negozioShopify.findMany({
    where: { attivo: true },
    orderBy: { brand: "asc" },
  });

  const negozioId = sp.negozio && negozi.some((n) => n.id === sp.negozio) ? sp.negozio : negozi[0]?.id ?? "";
  const numero = (sp.numero ?? "").trim();

  // Ricerca solo se c'è un numero: la pagina si apre vuota, senza chiamate.
  let doc: DocumentoConsegna | null = null;
  let erroreRicerca: string | null = null;
  if (negozioId && numero) {
    const neg = negozi.find((n) => n.id === negozioId)!;
    try {
      const token = await tokenNegozio(neg);
      doc = await cercaDocumento(neg.dominio, token, numero);
      if (!doc) erroreRicerca = `Nessuna bozza né ordine con numero ${numero} su ${neg.brand}.`;
    } catch (e) {
      erroreRicerca = (e as Error).message;
    }
  }

  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Consegna su bozze e ordini</h1>
          <p className="page-sub">
            Data e fascia oraria per gli ordini che non passano dal carrello del sito.
          </p>
        </div>
      </div>

      {sp.esito && (
        <div className="scheda" style={{ borderColor: "var(--green)" }}>
          <strong>Salvato su Shopify.</strong> {sp.esito}
        </div>
      )}
      {sp.errore && (
        <div className="scheda" style={{ borderColor: "var(--red)" }}>
          <strong>Non salvato.</strong> {sp.errore}
        </div>
      )}

      {negozi.length === 0 ? (
        <div className="scheda">
          <p className="testo-guida">
            Nessun negozio Shopify attivo: aggiungine uno in Impostazioni per poter scrivere sulle bozze.
          </p>
        </div>
      ) : (
        <div className="scheda">
          <div className="scheda-titolo">Cerca la bozza o l&apos;ordine</div>
          {/* GET: il numero cercato resta nell'indirizzo, così la ricerca è
              ripetibile e condivisibile con un collega. */}
          <form method="get" className="modulo">
            <div className="campo-modulo">
              <label>Negozio</label>
              <select name="negozio" defaultValue={negozioId}>
                {negozi.map((n) => (
                  <option key={n.id} value={n.id}>{n.brand}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Numero bozza o ordine</label>
              <input name="numero" defaultValue={numero} placeholder="D5510 oppure 12646" required />
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit">Cerca</button>
            </div>
          </form>
          <p className="testo-guida" style={{ marginTop: 8 }}>
            Il numero è quello che vedi in Shopify, con o senza cancelletto. Le bozze iniziano per D.
          </p>
        </div>
      )}

      {erroreRicerca && (
        <div className="scheda">
          <p className="testo-guida">{erroreRicerca}</p>
        </div>
      )}

      {doc && (
        <div className="scheda">
          <div className="scheda-titolo">
            {doc.tipo === "bozza" ? "Bozza" : "Ordine"} {doc.numero}
            {doc.cliente ? ` · ${doc.cliente}` : ""}
          </div>

          <div className="tabella-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr><th>Consegna ora impostata</th><th>Fascia</th><th>Stato</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cella-nome">{doc.dataConsegna ?? "non indicata"}</td>
                  <td className={doc.fascia ? "cella-nome" : "cella-muta"}>
                    {doc.fascia ? etichettaFascia(doc.fascia) : "non indicata"}
                  </td>
                  <td className="cella-muta">{doc.stato ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {doc.avviso && <p className="testo-guida" style={{ marginBottom: 12 }}>⚠ {doc.avviso}</p>}

          <form action={impostaConsegnaShopify} className="modulo">
            <input type="hidden" name="negozioId" value={negozioId} />
            <input type="hidden" name="numero" value={doc.numero} />
            <div className="campo-modulo">
              <label>Data di consegna</label>
              <input type="date" name="data" defaultValue={doc.dataConsegna ?? oggi} min="2020-01-01" />
            </div>
            <div className="campo-modulo">
              <label>Fascia oraria</label>
              <select name="fascia" defaultValue={doc.fascia ?? ""}>
                <option value="">— nessuna —</option>
                <optgroup label="Due ore (consegna in giornata)">
                  {FASCE_DUE_ORE.map((f) => (
                    <option key={f} value={f}>{etichettaFascia(f)}</option>
                  ))}
                </optgroup>
                <optgroup label="Un&apos;ora (dai giorni successivi)">
                  {FASCE_UN_ORA.map((f) => (
                    <option key={f} value={f}>{etichettaFascia(f)}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="azioni-modulo largo">
              <button className="btn" type="submit">Salva su Shopify</button>
            </div>
          </form>

          <p className="testo-guida" style={{ marginTop: 8 }}>
            Si scrivono gli attributi <code>Data_Consegna</code> e <code>Fascia_Oraria_Consegna</code>, gli
            stessi che usa il sito. Su una bozza passano all&apos;ordine quando la completi. Lasciando un
            campo vuoto il dato viene rimosso: meglio nessuna consegna che una sbagliata.
          </p>
        </div>
      )}
    </main>
  );
}
