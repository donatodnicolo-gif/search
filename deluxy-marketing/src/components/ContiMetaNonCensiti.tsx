import { prisma } from "@/lib/db";
import { leggiContiMeta, metaConfigurato } from "@/lib/meta";

// I conti pubblicitari che il token Meta vede e che l'app NON ha censito.
//
// ⚠️ PERCHÉ È UN RIQUADRO E NON UNA NOTA. Un conto non censito non produce un
// errore da nessuna parte: le campagne che ci girano semplicemente non
// esistono per questa app, e la loro spesa non entra nel MER, non esce da
// `/api/v1/spesa` (che le altre app leggono per i budget) e non compare in
// nessun elenco. Il totale sembra completo perché è completo **sui conti che
// conosciamo** — che è la trappola del censimento troncato.
//
// Trovato l'11/09/2026: aprendo Ads Manager il conto proposto per primo era
// `1298043513875111`, che fra i tre censiti non c'è.

// Gli stati dei conti come li numera Meta. Si traducono, perché «2» non dice
// niente a chi legge — e la differenza fra «chiuso» e «sospeso per mancato
// pagamento» cambia cosa si fa.
const STATO_CONTO: Record<number, string> = {
  1: "attivo",
  2: "disabilitato",
  3: "non pagato",
  7: "in revisione",
  9: "in chiusura",
  100: "chiuso",
  101: "qualunque attivo",
  201: "qualunque chiuso",
};

export async function ContiMetaNonCensiti() {
  if (!metaConfigurato()) return null;

  const [lettura, censiti] = await Promise.all([
    leggiContiMeta(),
    prisma.accountAdv.findMany({
      where: { piattaforma: "meta_ads" },
      select: { idEsterno: true, nome: true },
    }),
  ]);

  // ⚠️ Se la lettura non arriva NON si dice «tutto a posto»: si tace su quello
  // che non si sa e si dichiara il perché. Un riquadro che sparisce quando una
  // chiamata fallisce si legge come «nessun conto fuori», che è la risposta
  // che nessuno ha verificato.
  if (lettura.errore) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Conti Meta visti dal token</div>
        <p className="cella-sub" style={{ whiteSpace: "normal", color: "var(--orange)" }}>
          Non riesco a chiedere a Meta quali conti vede il nostro token ({lettura.errore}): quindi
          non posso dire se ci sono conti pubblicitari <b>fuori</b> dall&apos;app, con campagne la
          cui spesa non entra da nessuna parte. Non è un «no»: è un «non lo so».
        </p>
      </section>
    );
  }

  const noti = new Set(censiti.map((c) => c.idEsterno.replace(/^act_/, "")));
  const fuori = lettura.conti.filter((c) => c.id && !noti.has(c.id));

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Conti Meta visti dal token ({lettura.conti.length}) · censiti qui ({censiti.length})
      </div>
      {fuori.length === 0 ? (
        <p className="cella-sub" style={{ whiteSpace: "normal" }}>
          Tutti i conti che il token vede sono censiti nell&apos;app: la spesa Meta che entra nel MER
          e in <code>/api/v1/spesa</code> è quella di tutti i conti raggiungibili, non di una parte.
        </p>
      ) : (
        <>
          <p className="cella-sub" style={{ whiteSpace: "normal", color: "var(--orange)" }}>
            <b>
              {fuori.length === 1
                ? "Un conto pubblicitario è fuori dall'app"
                : `${fuori.length} conti pubblicitari sono fuori dall'app`}
              .
            </b>{" "}
            Il token li vede, ma non sono censiti: le campagne che ci girano non esistono per questa
            app, e la loro spesa <b>non entra</b> nel MER, non esce da <code>/api/v1/spesa</code> —
            che le altre app leggono per i budget — e non compare in nessun elenco. Gli elenchi non
            sembrano vuoti: sono completi sui conti che conosciamo.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Conto</th>
                  <th>id</th>
                  <th>Stato su Meta</th>
                  <th className="num">Valuta</th>
                </tr>
              </thead>
              <tbody>
                {fuori.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.nome}</b>
                    </td>
                    <td className="cella-sub">{c.id}</td>
                    <td className="cella-sub">
                      {c.stato == null ? "—" : (STATO_CONTO[c.stato] ?? `codice ${c.stato}`)}
                    </td>
                    <td className="num cella-sub">{c.valuta ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
            Se uno di questi è un conto di prova, di un&apos;agenzia o dismesso, va bene così: la
            riga resta e dice che è fuori apposta. Se invece ci girano campagne di Deluxy, si
            censisce qui sotto col suo brand — e dal giro dopo la sync ne porta campagne, ad set e
            spesa. ⚠️ L&apos;app non lo aggiunge da sola: quale brand sia un conto è una decisione,
            e indovinarla vorrebbe dire attribuire spesa al marchio sbagliato.
          </p>
        </>
      )}
    </section>
  );
}
