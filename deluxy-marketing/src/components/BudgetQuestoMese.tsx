import { prisma } from "@/lib/db";
import { mezzanotteRoma, oggiRoma } from "@/lib/fuso";
import { budgetDaBudgets, meseDiSito } from "@/lib/budgets";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

// **La riga che la pagina del budget non aveva: come stiamo andando ADESSO.**
//
// ⚠️ Perché serviva. La pagina metteva insieme tre fonti — le attese per
// canale, il tetto ufficiale di Budgets su dodici mesi, e una tabella
// «calendario» importata a mano dal Monitoraggio che copre solo tre mesi —
// senza dire quale comanda e senza rispondere alla domanda per cui uno apre
// una pagina che si chiama «Budget»: *stiamo dentro?*
//
// Qui la domanda è una sola e la risposta sta in una riga per brand: quanto si
// può spendere questo mese, quanto si è già speso, quanto si è acceso, e cosa
// resta.
//
// ⚠️ TRE NUMERI DIVERSI CHE SEMBRANO LO STESSO. Vanno tenuti distinti o si
// legge il posto sbagliato:
//   · CONSENTITO — il tetto, deciso in Budgets sulle vendite previste;
//   · SPESO — quello che è già uscito dal 1° del mese a oggi, dalle metriche;
//   · ACCESO — la somma dei budget giornalieri delle campagne in asta, che è un
//     TETTO giornaliero e non una spesa: serve a stimare dove si arriva.
const GIORNI = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export async function BudgetQuestoMese({ anno }: { anno: number }) {
  // ⚠️ In ora di Roma, non del server (su Vercel è UTC): vedi `lib/fuso.ts`.
  const adesso = new Date();
  const oggi = oggiRoma();
  const stessoAnno = anno === oggi.anno;
  // Su un anno passato o futuro «questo mese» non vuol dire niente: si guarda
  // gennaio, e lo si dice.
  const mese = stessoAnno ? oggi.mese : 1;
  const inizio = mezzanotteRoma(anno, mese, 1);
  const giorniDelMese = GIORNI(inizio);
  const giorniPassati = stessoAnno ? oggi.giorno : giorniDelMese;

  const [campagne, spese, budgets] = await Promise.all([
    prisma.campagna.findMany({
      where: { stato: { notIn: ["defunta", "conclusa"] } },
      select: { id: true, brand: true, statoPiattaforma: true, budgetGiornaliero: true },
    }),
    prisma.metricaCampagna.groupBy({
      by: ["campagnaId"],
      where: { data: { gte: inizio, lte: adesso } },
      _sum: { spesa: true },
    }),
    budgetDaBudgets(anno),
  ]);

  const brandDi = new Map(campagne.map((c) => [c.id, c.brand]));
  const spesoPerBrand = new Map<string, number>();
  for (const s of spese) {
    const b = brandDi.get(s.campagnaId);
    if (!b) continue;
    spesoPerBrand.set(b, (spesoPerBrand.get(b) ?? 0) + (s._sum.spesa ?? 0));
  }

  const righe = SITI.map((sito) => {
    const accese = campagne.filter((c) => c.brand === sito && c.statoPiattaforma === "ENABLED");
    const conBudget = accese.filter((c) => c.budgetGiornaliero != null);
    const alGiorno = conBudget.reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0);
    const speso = spesoPerBrand.get(sito) ?? 0;
    const mb = meseDiSito(budgets, sito, mese);
    // ⚠️ QUALE DEI DUE NUMERI DI BUDGETS, e perché — letto nel codice di
    // quell'app, non dedotto dal nome (sbaglio già fatto una volta):
    //
    //   · `advConsentito` nasce dal budget vendite **APPROVATO** — quello in
    //     cui le proposte consolidate hanno sostituito l'iniziale, che è la
    //     base con cui Budgets fa il P&L e ripartisce fra le piattaforme.
    //     È questo il tetto che vale.
    //   · `advPubblicato` è il **riferimento del vecchio monitoraggio** («ADV
    //     HP mensile», lo dice il commento sul modello): un numero storico,
    //     non una decisione. Preferirlo perché si chiama «pubblicato» è
    //     esattamente l'errore che ho fatto — il nome suonava come
    //     «approvato» e non lo è.
    const consentito = mb?.advConsentito ?? null;
    const riferimentoVecchio = mb?.advPubblicato ?? null;
    // Dove si arriva a fine mese se si continua così: la spesa vera al giorno
    // finora, moltiplicata per i giorni che restano. ⚠️ NON il budget acceso —
    // quello è un tetto, e quasi nessuna campagna lo tocca.
    const alGiornoVero = giorniPassati > 0 ? speso / giorniPassati : 0;
    const proiezione = speso + alGiornoVero * (giorniDelMese - giorniPassati);
    return {
      sito,
      accese: accese.length,
      senzaBudget: accese.length - conBudget.length,
      alGiorno,
      speso,
      consentito,
      riferimentoVecchio,
      advPercent: mb?.advPercent ?? null,
      proiezione,
      resta: consentito != null ? consentito - speso : null,
    };
  });

  const totali = {
    speso: righe.reduce((s, r) => s + r.speso, 0),
    consentito: righe.every((r) => r.consentito == null)
      ? null
      : righe.reduce((s, r) => s + (r.consentito ?? 0), 0),
    proiezione: righe.reduce((s, r) => s + r.proiezione, 0),
  };

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Come stiamo andando · {MESI_IT[mese - 1]} {anno}
        {stessoAnno && (
          <span className="cella-sub" style={{ fontWeight: 400, marginLeft: 8 }}>
            giorno {giorniPassati} di {giorniDelMese}
          </span>
        )}
      </div>

      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        Tre numeri diversi che è facile confondere. <b>Consentito</b> è il tetto che arriva da{" "}
        <b>Deluxy Budgets</b>, calcolato là sul budget vendite <b>approvato</b> — quello in cui le
        proposte consolidate hanno sostituito l&apos;iniziale, e con cui quell&apos;app fa il P&amp;L.
        <b>Speso</b> è quello che è già uscito dal
        primo del mese a oggi. <b>Acceso</b> è la somma dei budget giornalieri delle campagne in
        asta: è un tetto per giorno, non una spesa — quasi nessuna campagna lo tocca davvero, ed è
        per questo che la proiezione si calcola sulla spesa vera e non su di lui.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Brand</th>
              {/* ⚠️ «Consentito» da CHI: senza il nome della fonte e della
                  formula il numero sembra deciso da questa app, che invece non
                  scrive niente sul budget. */}
              <th className="num">
                <a href="https://deluxy-budgets.vercel.app" target="_blank" rel="noreferrer">
                  Consentito da Budgets ↗
                </a>
              </th>
              <th className="num">Speso finora</th>
              <th className="num">Resta</th>
              <th className="num">A fine mese, di questo passo</th>
              <th className="num">Acceso ora</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const sfora = r.consentito != null && r.proiezione > r.consentito;
              const quota = r.consentito ? r.speso / r.consentito : null;
              return (
                <tr key={r.sito}>
                  <td className="cella-nome">
                    <a href={`/brand/${r.sito}`}>{ETICHETTA_SITO[r.sito] ?? r.sito}</a>
                    <div className="cella-sub">
                      {r.accese} campagne in asta
                      {r.senzaBudget > 0 && (
                        <span style={{ color: "var(--orange)" }}> · {r.senzaBudget} senza budget noto</span>
                      )}
                    </div>
                  </td>
                  <td className="num">
                    {r.consentito != null ? formattaEuro(r.consentito) : "—"}
                    {/* Su quale base nasce, e — se esiste ed è diverso — il
                        vecchio riferimento del monitoraggio: separati, perché
                        la differenza è una domanda da fare a Budgets. */}
                    <div className="cella-sub">
                      dal budget vendite <b>approvato</b>
                      {r.advPercent != null && r.advPercent > 0 && (
                        <> · quota {r.advPercent}% del monte ADV dell&apos;anno</>
                      )}
                      {r.riferimentoVecchio != null &&
                        r.riferimentoVecchio > 0 &&
                        r.consentito != null &&
                        Math.round(r.riferimentoVecchio) !== Math.round(r.consentito) && (
                          <div>
                            il vecchio monitoraggio diceva {formattaEuro(r.riferimentoVecchio)}
                          </div>
                        )}
                    </div>
                  </td>
                  <td className="num">
                    {formattaEuro(r.speso)}
                    {quota != null && (
                      <div className="cella-sub">{Math.round(quota * 100)}% del tetto</div>
                    )}
                  </td>
                  <td
                    className="num"
                    style={{ color: r.resta != null && r.resta < 0 ? "var(--orange)" : undefined }}
                  >
                    {r.resta != null ? formattaEuro(r.resta) : "—"}
                  </td>
                  {/* ⚠️ La proiezione è una divisione, non una previsione: dice
                      dove si arriva se il ritmo resta identico. A inizio mese,
                      con due giorni di dati, vale poco — e allora si dichiara
                      invece di mostrare un numero che sembra sicuro. */}
                  <td
                    className="num"
                    style={{ fontWeight: 600, color: sfora ? "var(--orange)" : undefined }}
                  >
                    {giorniPassati < 3 ? (
                      <span className="cella-sub">troppo presto</span>
                    ) : (
                      <>
                        {formattaEuro(r.proiezione)}
                        {sfora && <div className="cella-sub" style={{ color: "var(--orange)" }}>oltre il tetto</div>}
                      </>
                    )}
                  </td>
                  <td className="num cella-muta">
                    {formattaEuro(r.alGiorno)}
                    <div className="cella-sub">al giorno</div>
                  </td>
                </tr>
              );
            })}
            <tr className="riga-forte">
              <td className="cella-nome">Tutti</td>
              <td className="num">{totali.consentito != null ? formattaEuro(totali.consentito) : "—"}</td>
              <td className="num">{formattaEuro(totali.speso)}</td>
              <td className="num">
                {totali.consentito != null ? formattaEuro(totali.consentito - totali.speso) : "—"}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>
                {giorniPassati < 3 ? "—" : formattaEuro(totali.proiezione)}
              </td>
              <td className="num cella-muta">
                {formattaEuro(righe.reduce((s, r) => s + r.alGiorno, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!budgets.ok && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)", marginTop: 12 }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>Il tetto non si è potuto leggere da Budgets</b>: {budgets.errore} Senza, «resta» e
            «oltre il tetto» non si possono calcolare: la colonna del consentito è vuota di
            proposito, invece di mostrare uno zero che sembrerebbe un budget azzerato.
          </span>
        </div>
      )}
    </section>
  );
}
