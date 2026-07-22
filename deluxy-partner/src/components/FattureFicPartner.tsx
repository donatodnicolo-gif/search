import { prisma } from "@/lib/db";
import { ficStato, ficFattureCached, type FicFattura } from "@/lib/fic";
import { euro, dataIt } from "@/lib/format";
import { ANNO_CORRENTE } from "@/lib/queries";
import { registraFicComeServizio } from "@/lib/actions";

// Mostra sulla scheda partner le fatture emesse su Fatture in Cloud intestate a
// questo partner. L'aggancio usa i nomi cliente FIC che sono stati riconciliati
// a questo partner (RiconciliazioneAnagrafica) più il nome del partner stesso.
// Da qui si può "Registra come servizio" per portarle nei conteggi del partner.

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function FattureFicPartner({ partnerId, partnerNome }: { partnerId: string; partnerNome: string }) {
  const stato = await ficStato().catch(() => ({ collegato: false }));
  if (!stato.collegato) return null;

  const [ric, tipologie] = await Promise.all([
    prisma.riconciliazioneAnagrafica.findMany({ where: { partnerId, stato: "confermata" }, select: { ficNome: true } }),
    prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" }, select: { id: true, nome: true } }),
  ]);
  const tipDefault = tipologie.find((t) => /altro/i.test(t.nome))?.id ?? tipologie[0]?.id ?? "";
  const nomi = [partnerNome, ...ric.map((r) => r.ficNome)].map(norm).filter(Boolean);
  if (nomi.length === 0) return null;

  let fatture: FicFattura[] = [];
  try {
    fatture = await ficFattureCached({ anno: ANNO_CORRENTE });
  } catch {
    return null;
  }
  const matchNome = fatture.filter((f) => {
    const c = norm(f.cliente);
    return c && nomi.some((n) => c === n || c.includes(n) || n.includes(c));
  });
  // escludi le fatture già registrate come "Servizio a fatturazione" (per numero)
  const registrate = await prisma.fatturaServizio.findMany({
    where: { partnerId, numero: { not: null } },
    select: { numero: true },
  });
  const numeriReg = new Set(registrate.map((r) => r.numero));
  const mie = matchNome.filter((f) => !numeriReg.has(f.numero));
  if (mie.length === 0) return null;

  const tot = mie.reduce((a, f) => a + f.totale, 0);

  return (
    <>
      <h2 className="section-title">Fatture su Fatture in Cloud ({ANNO_CORRENTE})</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                <th>N°</th><th>Data</th><th className="num">Totale</th><th>Stato</th><th>Registra nei conteggi</th>
              </tr>
            </thead>
            <tbody>
              {mie.map((f) => {
                const aliquota = f.imponibile > 0 ? Math.round((f.iva / f.imponibile) * 100) : 22;
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 500 }}>
                      <a href={`https://secure.fattureincloud.it/invoices/view/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>{f.numero}</a>
                    </td>
                    <td>{dataIt(f.data)}</td>
                    <td className="num">{euro(f.totale)} <span className="muted">({euro(f.imponibile)} netto)</span></td>
                    <td>
                      {f.pagata
                        ? <span className="badge green"><span className="dot" />Saldata</span>
                        : <span className="badge orange"><span className="dot" />Da incassare{f.scadenza ? ` · scad. ${dataIt(f.scadenza)}` : ""}</span>}
                    </td>
                    <td>
                      <form action={registraFicComeServizio.bind(null, partnerId)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="numero" value={f.numero} />
                        <input type="hidden" name="imponibile" value={f.imponibile} />
                        <input type="hidden" name="aliquotaIva" value={aliquota} />
                        <input type="hidden" name="anno" value={f.data ? parseInt(f.data.slice(0, 4)) : ANNO_CORRENTE} />
                        <input type="hidden" name="mese" value={f.data ? parseInt(f.data.slice(5, 7)) : 1} />
                        <input type="hidden" name="descrizione" value={`FIC ${f.numero}`} />
                        <select name="tipologiaId" defaultValue={tipDefault} style={{ fontSize: 12, padding: "4px 6px" }}>
                          {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                        <button className="btn small primary" type="submit" title="Crea un «Servizio a fatturazione» da questa fattura FIC">Registra</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg)" }}>
                <td colSpan={2} className="muted">Totale {mie.length} fatture non ancora nei conteggi</td>
                <td className="num" style={{ fontWeight: 600 }}>{euro(tot)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Sono fatture su Fatture in Cloud non ancora nei conteggi del partner. Scegli una tipologia e premi
          <strong> Registra</strong> per portarne una tra i «Servizi a fatturazione» (entra nel fatturato/dovuto).
        </p>
      </div>
    </>
  );
}
