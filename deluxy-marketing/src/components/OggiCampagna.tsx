import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";

// "Quanto stiamo spendendo oggi". Con un'avvertenza che vale sempre: i dati di
// oggi sono PARZIALI. Lo script manda la giornata la sera, e le conversioni
// Google le consolida nei giorni dopo — leggere il ROAS di oggi come se fosse
// definitivo è il modo più veloce per prendere una decisione sbagliata.
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

  const [riga, rigaIeri, settimana, totaleOggiBrand, ultimaScritta] = await Promise.all([
    prisma.metricaCampagna.findFirst({ where: { campagnaId, data: oggi } }),
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

  const spesaOggi = riga?.spesa ?? null;
  const mediaGiorno = settimana._count._all > 0 ? (settimana._sum.spesa ?? 0) / settimana._count._all : null;
  const quotaBrand =
    spesaOggi != null && (totaleOggiBrand._sum.spesa ?? 0) > 0
      ? spesaOggi / (totaleOggiBrand._sum.spesa ?? 1)
      : null;

  // Confronto onesto: oggi è in corso, quindi si dice quanto manca al budget e
  // come sta andando rispetto alla media, senza proclamare tendenze.
  const restaBudget = budgetGiornaliero != null && spesaOggi != null ? budgetGiornaliero - spesaOggi : null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">Quanto stiamo spendendo oggi</div>

      {spesaOggi == null ? (
        <div className="vuoto-mini">
          Per oggi non è ancora arrivato niente. Lo script manda la giornata la sera (fascia
          23:00-24:00): fino ad allora l&apos;ultimo giorno pieno è ieri
          {rigaIeri?.spesa != null ? `, ${formattaEuro(rigaIeri.spesa)}` : ""}.
        </div>
      ) : (
        <div className="kpi-riga" style={{ marginBottom: 0 }}>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesaOggi)}</div>
            <div className="kpi-etichetta">
              Spesa di oggi, parziale
              {ultimaScritta ? ` · ricevuta alle ${ultimaScritta.creataIl.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{rigaIeri?.spesa != null ? formattaEuro(rigaIeri.spesa) : "—"}</div>
            <div className="kpi-etichetta">Ieri, giornata piena</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{mediaGiorno != null ? formattaEuro(mediaGiorno) : "—"}</div>
            <div className="kpi-etichetta">Media dei 7 giorni prima</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {budgetGiornaliero != null ? formattaEuro(budgetGiornaliero) : "—"}
            </div>
            <div className="kpi-etichetta">
              Budget al giorno
              {restaBudget != null
                ? restaBudget >= 0
                  ? ` · ne restano ${formattaEuro(restaBudget)}`
                  : ` · già superato di ${formattaEuro(-restaBudget)}`
                : ""}
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
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        I numeri di oggi sono <b>parziali per costruzione</b>: la spesa arriva quando lo script
        gira, e le conversioni Google le consolida nelle ore e nei giorni dopo. Per decidere si
        guardano 7 e 30 giorni; oggi serve solo ad accorgersi in tempo di un&apos;anomalia.
      </p>
    </section>
  );
}
