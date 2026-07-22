import { prisma } from "@/lib/db";
import { ficStato, ficFattureCached, type FicFattura } from "@/lib/fic";
import { euro, dataIt } from "@/lib/format";
import { ANNO_CORRENTE } from "@/lib/queries";

// Mostra sulla scheda partner le fatture emesse su Fatture in Cloud intestate a
// questo partner. L'aggancio usa i nomi cliente FIC che sono stati riconciliati
// a questo partner (RiconciliazioneAnagrafica) più il nome del partner stesso.
// Sola lettura: la fonte di verità delle fatture resta FIC.

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function FattureFicPartner({ partnerId, partnerNome }: { partnerId: string; partnerNome: string }) {
  const stato = await ficStato().catch(() => ({ collegato: false }));
  if (!stato.collegato) return null;

  const ric = await prisma.riconciliazioneAnagrafica.findMany({
    where: { partnerId, stato: "confermata" },
    select: { ficNome: true },
  });
  const nomi = [partnerNome, ...ric.map((r) => r.ficNome)].map(norm).filter(Boolean);
  if (nomi.length === 0) return null;

  let fatture: FicFattura[] = [];
  try {
    fatture = await ficFattureCached({ anno: ANNO_CORRENTE });
  } catch {
    return null;
  }
  const mie = fatture.filter((f) => {
    const c = norm(f.cliente);
    return c && nomi.some((n) => c === n || c.includes(n) || n.includes(c));
  });
  if (mie.length === 0) return null;

  const tot = mie.reduce((a, f) => a + f.totale, 0);
  const daIncassare = mie.filter((f) => !f.pagata).reduce((a, f) => a + f.totale, 0);

  return (
    <>
      <h2 className="section-title">Fatture su Fatture in Cloud ({ANNO_CORRENTE})</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                <th>N°</th><th>Data</th><th className="num">Totale</th><th>Stato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {mie.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>{f.numero}</td>
                  <td>{dataIt(f.data)}</td>
                  <td className="num">{euro(f.totale)}</td>
                  <td>
                    {f.pagata
                      ? <span className="badge green"><span className="dot" />Saldata</span>
                      : <span className="badge orange"><span className="dot" />Da incassare{f.scadenza ? ` · scad. ${dataIt(f.scadenza)}` : ""}</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <a href={`https://secure.fattureincloud.it/invoices/view/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontSize: 12.5 }}>
                      Apri su FIC
                    </a>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg)" }}>
                <td colSpan={2} className="muted">Totale {mie.length} fatture</td>
                <td className="num" style={{ fontWeight: 600 }}>{euro(tot)}</td>
                <td colSpan={2} className="muted">{daIncassare > 0.005 ? `di cui ${euro(daIncassare)} da incassare` : "tutte saldate"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Fonte: Fatture in Cloud (agganciate per nome cliente). Non sono conteggiate nei totali &laquo;Rolling&raquo;
          qui sopra, che riguardano i servizi/vendite gestiti nell&apos;app.
        </p>
      </div>
    </>
  );
}
