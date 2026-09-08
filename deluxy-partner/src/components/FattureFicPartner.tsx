import { prisma } from "@/lib/db";
import { ficStato } from "@/lib/fic";
import { fattureFicDelPartner } from "@/lib/fic-partner";
import { euro, dataIt } from "@/lib/format";
import { ANNO_CORRENTE } from "@/lib/queries";
import { registraFicComeServizio } from "@/lib/actions";
import { eFatturaCommissioni } from "@/lib/fic-mancanti";

// Mostra sulla scheda partner le fatture emesse su Fatture in Cloud intestate a
// questo partner. L'aggancio usa i nomi cliente FIC che sono stati riconciliati
// a questo partner (RiconciliazioneAnagrafica) più il nome del partner stesso.
// Da qui si può "Registra come servizio" per portarle nei conteggi del partner.

export async function FattureFicPartner({ partnerId, partnerNome }: { partnerId: string; partnerNome: string }) {
  const stato = await ficStato().catch(() => ({ collegato: false }));
  if (!stato.collegato) return null;

  const tipologie = await prisma.tipologiaServizio.findMany({
    orderBy: { ordine: "asc" },
    select: { id: true, nome: true },
  });
  const tipDefault = tipologie.find((t) => /altro/i.test(t.nome))?.id ?? tipologie[0]?.id ?? "";
  // La compensazione del partner: cambia cosa vuol dire «da incassare» su una
  // fattura di commissioni (vedi sotto).
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { compensazione: true },
  });
  // stessa logica di aggancio usata per collegare la fattura commissioni a un
  // mese: due filtri diversi darebbero due elenchi diversi per la stessa domanda
  const matchNome = await fattureFicDelPartner(partnerId, partnerNome, ANNO_CORRENTE);
  if (matchNome.length === 0) return null;
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
                // ⭐ SI RICONOSCE DA SOLA (08/09/2026, regola dell'utente:
                // «riconosci automaticamente, alcune sono fee commissioni ed è
                // specificato»). L'oggetto del documento lo dice —
                // «Commissioni Deluxy Agosto 2026» — e lo stesso giudizio che
                // usa l'import notturno lo usa anche questa tendina: due
                // criteri diversi per la stessa domanda darebbero due risposte.
                const commissioni = eFatturaCommissioni(f.oggetto, f.numero, new Set());
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 500 }}>
                      <a href={`https://secure.fattureincloud.it/invoices/view/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>{f.numero}</a>
                    </td>
                    <td>{dataIt(f.data)}</td>
                    <td className="num">{euro(f.totale)} <span className="muted">({euro(f.imponibile)} netto)</span></td>
                    <td>
                      {/* ⭐ COMMISSIONI + PARTNER IN COMPENSAZIONE = SEMPRE
                          SALDATA (08/09/2026, regola dell'utente). La fattura
                          delle commissioni a un partner in compensazione non si
                          incassa in banca: la commissione è già tolta dal
                          dovuto sulle vendite, cioè è già stata pagata nel
                          momento in cui è nata. Mostrarla «da incassare»
                          faceva sollecitare soldi che nessuno deve versare.
                          ⚠️ Su Fatture in Cloud il documento resta aperto: qui
                          si dice come stanno i conti, non si tocca FIC — e la
                          pillola lo dichiara, invece di far credere che di là
                          risulti incassata. */}
                      {commissioni && partner?.compensazione ? (
                        <span className="badge green" title="La commissione è già tolta dal dovuto sulle vendite del mese: non si incassa in banca. ⚠️ Su Fatture in Cloud il documento risulta ancora aperto.">
                          <span className="dot" />Saldata per compensazione
                        </span>
                      ) : f.pagata ? (
                        <span className="badge green"><span className="dot" />Saldata</span>
                      ) : (
                        <span className="badge orange"><span className="dot" />Da incassare{f.scadenza ? ` · scad. ${dataIt(f.scadenza)}` : ""}</span>
                      )}
                    </td>
                    <td>
                      <form action={registraFicComeServizio.bind(null, partnerId)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="numero" value={f.numero} />
                        <input type="hidden" name="imponibile" value={f.imponibile} />
                        <input type="hidden" name="aliquotaIva" value={aliquota} />
                        <input type="hidden" name="anno" value={f.data ? parseInt(f.data.slice(0, 4)) : ANNO_CORRENTE} />
                        <input type="hidden" name="mese" value={f.data ? parseInt(f.data.slice(5, 7)) : 1} />
                        {/* L OGGETTO vero del documento, non «FIC 624/2026»: e quello che
                            fa scattare le regole sulla tipologia (una «Fee
                            affiliazione» finisce sotto Affiliazioni) e quello
                            che si legge poi sulla riga. */}
                        <input type="hidden" name="descrizione" value={f.oggetto ?? `FIC ${f.numero}`} />
                        <select name="tipologiaId" defaultValue={commissioni ? "__fee__" : tipDefault} style={{ fontSize: 12, padding: "4px 6px" }}>
                          {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                          {/* Le commissioni sulle vendite vendor NON sono un servizio
                              venduto: sono già calcolate sulla vendita e già tolte dal
                              dovuto. Scegliendo questa voce la fattura viene agganciata
                              al mese come «fattura commissioni», senza doppio conteggio. */}
                          <option value="__fee__">Fee vendor (fattura commissioni)</option>
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
          <br />
          Se invece è la fattura delle <strong>commissioni</strong> sulle vendite come vendor, scegli
          <strong> «Fee vendor»</strong>: viene agganciata al mese come fattura commissioni e <strong>non</strong> si
          somma al fatturato — la fee è già calcolata sulla vendita e già tolta dal dovuto al partner.
        </p>
      </div>
    </>
  );
}
