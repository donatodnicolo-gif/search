import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { nomeMese } from "@/lib/calc";
import { trovaFattureFicMancanti } from "@/lib/fic-mancanti";
import { registraFatturaFic, importaFicAdesso } from "@/lib/fic-mancanti-actions";

export const dynamic = "force-dynamic";

// LE FATTURE CHE FIC HA E FINANCE NO (31/08/2026).
//
// Qui arrivano solo quelle che il controllo automatico NON sa registrare da
// solo: manca la scheda abbinata, o quel cliente non ha mai avuto una
// tipologia decisa. La persona sceglie UNA volta — da lì in poi le fatture di
// quel cliente le importa il cron. La competenza è il mese di emissione
// (decisione dell'utente, 30/08) e non si sceglie da qui: si corregge
// eventualmente dopo, dalla fattura.
export default async function DaFicPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; n?: string }>;
}) {
  const sp = await searchParams;
  const [esito, tipologie, partner] = await Promise.all([
    trovaFattureFicMancanti(),
    prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.partner.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Da Fatture in Cloud</h1>
          <p className="page-caption">
            Fatture emesse su FIC e non ancora registrate qui. Le «sicure» (scheda e tipologia già
            viste) le importa da solo il controllo notturno; queste aspettano una scelta — che vale
            anche per le prossime dello stesso cliente. Competenza = mese di emissione.
          </p>
        </div>
        <Link href="/fatture" className="btn btn-secondary">← Fatture</Link>
      </div>

      {sp.esito === "ok" && <div className="avviso-ok">Fattura registrata. Le prossime di questo cliente entrano da sole.</div>}
      {sp.esito === "import" && <div className="avviso-ok">Importate {sp.n ?? 0} fatture sicure.</div>}
      {sp.esito === "gia" && <div className="avviso-errore">Quel numero era già registrato: niente doppioni.</div>}
      {sp.esito === "incompleta" && <div className="avviso-errore">Servono scheda e tipologia.</div>}
      {sp.esito === "errore" && <div className="avviso-errore">L&apos;import non è riuscito: riprova.</div>}

      {!esito.ok ? (
        <div className="avviso-errore">{esito.errore}</div>
      ) : esito.mancanti.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          Tutto registrato: FIC e Finance dicono le stesse fatture ({esito.controllate} controllate
          negli ultimi 90 giorni).
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
            <div className="page-caption">
              {esito.mancanti.length} da sistemare · {euro(esito.mancanti.reduce((s, m) => s + m.imponibile, 0))} netti
            </div>
            {esito.mancanti.some((m) => m.partnerId && m.tipologiaId) && (
              <form action={importaFicAdesso}>
                <button className="btn" type="submit">
                  Importa le {esito.mancanti.filter((m) => m.partnerId && m.tipologiaId).length} sicure adesso
                </button>
              </form>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Emessa</th>
                  <th>N.</th>
                  <th>Cliente su FIC</th>
                  <th className="num">Netto</th>
                  <th>Competenza</th>
                  <th>Scheda</th>
                  <th>Tipologia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {esito.mancanti.map((m) => (
                  <tr key={m.ficId}>
                    <td>{dataIt(new Date(m.data))}</td>
                    <td>{m.numero}</td>
                    <td title={m.descrizione ?? undefined}>{m.cliente}</td>
                    <td className="num">{euro(m.imponibile)}{m.aliquotaIva === 0 ? <span style={{ color: "var(--text-tertiary)" }}> · esente</span> : null}</td>
                    <td>{nomeMese(m.mese)} {m.anno}</td>
                    {/* Un form per riga: la scelta di questa fattura non deve
                        dipendere da quella sopra. */}
                    <td colSpan={3}>
                      <form action={registraFatturaFic} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="numero" value={m.numero} />
                        <input type="hidden" name="anno" value={m.anno} />
                        <input type="hidden" name="mese" value={m.mese} />
                        <input type="hidden" name="imponibile" value={m.imponibile} />
                        <input type="hidden" name="aliquotaIva" value={m.aliquotaIva} />
                        <input type="hidden" name="data" value={m.data} />
                        <input type="hidden" name="descrizione" value={m.descrizione ?? ""} />
                        <select name="partnerId" defaultValue={m.partnerId ?? ""} required style={{ maxWidth: 220 }}>
                          <option value="" disabled>
                            {m.partnerNome ? m.partnerNome : "Scheda…"}
                          </option>
                          {partner.map((p) => (
                            <option key={p.id} value={p.id}>{p.nome}</option>
                          ))}
                        </select>
                        <select name="tipologiaId" defaultValue={m.tipologiaId ?? ""} required>
                          <option value="" disabled>Tipologia…</option>
                          {tipologie.map((t) => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                        </select>
                        <button className="btn btn-secondary" type="submit">Registra</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-caption" style={{ marginTop: 10 }}>
            Se la scheda non esiste ancora, si crea prima da <Link href="/partner" style={{ textDecoration: "underline" }}>Partner</Link>{" "}
            (o arriva dal registro Anagrafiche col giro notturno) e poi si torna qui.
          </p>
        </>
      )}
    </div>
  );
}
