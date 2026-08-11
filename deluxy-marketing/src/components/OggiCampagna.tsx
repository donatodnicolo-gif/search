import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";

// "Quanto stiamo spendendo oggi". Con un'avvertenza che vale sempre: i dati di
// oggi sono PARZIALI. Lo script manda i giorni conclusi, e le conversioni
// Google le consolida nei giorni dopo — leggere il ROAS di oggi come se fosse
// definitivo è il modo più veloce per prendere una decisione sbagliata.
//
// ⚠️ **Senza i dati di oggi questo riquadro NON esiste.** Prima diceva soltanto
// che oggi non era arrivato, sopra un paragrafo che spiega che comunque i
// numeri di oggi non si usano per decidere; poi ha provato a rendersi utile
// mostrando l'ultima giornata piena, la media dei 7 giorni e il budget — ma
// sono gli **stessi numeri** dei KPI in cima alla scheda. Tre riquadri sotto
// altri sette che dicevano la stessa cosa. Quello che valeva la pena tenere
// (qual è l'ultimo giorno pieno, quanto budget ha usato, e quando gira lo
// script) è salito **nei KPI**, dove si guarda per primo.
export async function OggiCampagna({
  campagnaId,
  brand,
  budgetGiornaliero,
}: {
  campagnaId: string;
  brand: string;
  budgetGiornaliero: number | null;
}) {
  const oggi = new Date();
  oggi.setUTCHours(0, 0, 0, 0);
  const ieri = new Date(oggi.getTime() - 86_400_000);
  const da7 = new Date(oggi.getTime() - 7 * 86_400_000);

  const riga = await prisma.metricaCampagna.findFirst({ where: { campagnaId, data: oggi } });
  const spesaOggi = riga?.spesa ?? null;
  if (spesaOggi == null) return null;

  const [rigaIeri, settimana, totaleOggiBrand, ultimaScritta] = await Promise.all([
    prisma.metricaCampagna.findFirst({ where: { campagnaId, data: ieri } }),
    prisma.metricaCampagna.aggregate({
      where: { campagnaId, data: { gte: da7, lt: oggi } },
      _sum: { spesa: true },
      _count: { _all: true },
    }),
    prisma.metricaCampagna.aggregate({
      where: { data: oggi, campagna: { brand } },
      _sum: { spesa: true, ricavi: true },
      _count: { _all: true },
    }),
    prisma.metricaCampagna.findFirst({
      where: { data: oggi },
      orderBy: { creataIl: "desc" },
      select: { creataIl: true },
    }),
  ]);

  const mediaGiorno = settimana._count._all > 0 ? (settimana._sum.spesa ?? 0) / settimana._count._all : null;
  const quotaBrand =
    (totaleOggiBrand._sum.spesa ?? 0) > 0 ? spesaOggi / (totaleOggiBrand._sum.spesa ?? 1) : null;

  // Confronto onesto: oggi è in corso, quindi si dice quanto manca al budget e
  // come sta andando rispetto alla media, senza proclamare tendenze.
  const restaBudget = budgetGiornaliero != null ? budgetGiornaliero - spesaOggi : null;

  // ⚠️ Il PASSO va confrontato con la parte di giornata già passata, non con
  // l'intera media: a mezzogiorno una campagna perfettamente in linea ha
  // speso metà della sua media, e dire «-50%» sarebbe un falso allarme
  // quotidiano. Si rapporta la spesa di oggi alla quota di media che
  // corrisponde all'ora in cui i dati sono stati letti.
  const letturaOre = ultimaScritta?.creataIl ?? new Date();
  const oreTrascorse = letturaOre.getHours() + letturaOre.getMinutes() / 60;
  const quotaGiornata = Math.min(1, Math.max(0.05, oreTrascorse / 24));
  const passo =
    mediaGiorno != null && mediaGiorno > 0 ? spesaOggi / (mediaGiorno * quotaGiornata) : null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">Quanto stiamo spendendo oggi</div>

      <div className="kpi-riga" style={{ marginBottom: 0 }}>
        {/* ⚠️ Il budget NON si ripete qui: sta nei KPI in cima, dove si
            guarda per primo. Quello che serve oggi è quanto ne resta e a che
            passo si sta andando — cioè numeri che domani non esisteranno
            più. */}
        <div className="kpi">
          <div className="kpi-valore">{formattaEuro(spesaOggi)}</div>
          <div className="kpi-etichetta">
            Spesa di oggi, parziale
            {budgetGiornaliero != null && budgetGiornaliero > 0 && (
              <> · {Math.round((spesaOggi / budgetGiornaliero) * 100)}% del budget</>
            )}
            {restaBudget != null && (
              restaBudget >= 0
                ? <>, ne restano {formattaEuro(restaBudget)}</>
                : <>, <b style={{ color: "var(--orange)" }}>superato di {formattaEuro(-restaBudget)}</b></>
            )}
            {ultimaScritta
              ? ` · ricevuta alle ${ultimaScritta.creataIl.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </div>
        </div>
        {/* Il PASSO: oggi contro la media dei sette giorni prima, allo stesso
            punto della giornata. È la domanda vera di questo riquadro —
            «sto correndo più del solito?» — e prima bisognava calcolarla a
            mente confrontando due tessere. */}
        <div className="kpi">
          <div
            className="kpi-valore"
            style={{ color: passo == null ? undefined : passo >= 1.3 ? "var(--orange)" : passo <= 0.6 ? "var(--ardesia)" : undefined }}
          >
            {passo != null ? `${passo >= 1 ? "+" : ""}${Math.round((passo - 1) * 100)}%` : "—"}
          </div>
          <div className="kpi-etichetta">
            Passo rispetto ai 7 giorni prima
            {mediaGiorno != null && (
              <> — {formattaEuro(mediaGiorno)}/g di media, ieri {rigaIeri?.spesa != null ? formattaEuro(rigaIeri.spesa) : "—"}</>
            )}
            {" · "}rapportato alle prime {Math.round(oreTrascorse)} ore, non alla giornata intera
          </div>
        </div>
        {/* Quello che è già tornato indietro oggi: parziale come la spesa,
            ma se è zero a metà giornata su una campagna che di solito vende,
            è la prima cosa da vedere. */}
        <div className="kpi">
          <div className="kpi-valore" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span>{(riga?.conversioni ?? 0) > 0 ? formattaNumero(riga!.conversioni) : "0"}</span>
            {(riga?.ricavi ?? 0) > 0 && (
              <span style={{ fontSize: "0.62em", fontWeight: 600, color: "var(--green)" }}>
                {formattaEuro(riga!.ricavi)}
              </span>
            )}
          </div>
          <div className="kpi-etichetta">
            Conversioni di oggi · incasso
            {(riga?.ricavi ?? 0) > 0 && spesaOggi > 0 && (
              <> · resa {((riga!.ricavi ?? 0) / spesaOggi).toFixed(1)}×</>
            )}
            {(riga?.conversioni ?? 0) === 0 && <> — Google le consolida nelle ore dopo</>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{formattaNumero(riga?.click ?? 0)}</div>
          <div className="kpi-etichetta">
            Click di oggi
            {(riga?.click ?? 0) > 0 && spesaOggi > 0 && (
              <> · {formattaEuro(spesaOggi / (riga!.click ?? 1))} di CPC</>
            )}
            {(riga?.impression ?? 0) > 0 && (riga?.click ?? 0) > 0 && (
              <> · CTR {(((riga!.click ?? 0) / (riga!.impression ?? 1)) * 100).toFixed(1)}%</>
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{formattaEuro(totaleOggiBrand._sum.spesa)}</div>
          <div className="kpi-etichetta">
            Tutto il brand oggi ({formattaNumero(totaleOggiBrand._count._all)} campagne)
            {quotaBrand != null ? ` · questa è il ${Math.round(quotaBrand * 100)}%` : ""}
          </div>
        </div>
      </div>

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        I numeri di oggi sono <b>parziali per costruzione</b>: la spesa arriva quando lo script
        gira, e le conversioni Google le consolida nelle ore e nei giorni dopo. Per decidere si
        guardano 7 e 30 giorni; oggi serve solo ad accorgersi in tempo di un&apos;anomalia.
      </p>
    </section>
  );
}
