import { prisma } from "@/lib/db";
import { formattaData, formattaEuro, formattaNumero } from "@/lib/dominio";

// "Quanto stiamo spendendo oggi". Con un'avvertenza che vale sempre: i dati di
// oggi sono PARZIALI. Lo script manda i giorni conclusi, e le conversioni
// Google le consolida nei giorni dopo — leggere il ROAS di oggi come se fosse
// definitivo è il modo più veloce per prendere una decisione sbagliata.
//
// ⚠️ **L'orario della corsa non si scrive a mano.** Il blocco diceva «lo script
// manda la giornata la sera, fascia 23:00-24:00»: era vero quando fu scritto,
// ma il 06/08/2026 le corse sono state misurate alle **02:37-02:47**. Chi
// leggeva aspettava dei dati per la sera che non sarebbero arrivati. L'orario
// si legge da `RicezioneDati`, che registra ogni consegna davvero avvenuta:
// così la frase resta vera anche il giorno che qualcuno cambia la
// schedulazione dentro Google Ads, dove l'app non può vedere.
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

  // Quando gira davvero lo script di questo brand: si guardano le ultime
  // consegne registrate, non una fascia scritta nel codice.
  const conti = await prisma.accountAdv.findMany({
    where: { piattaforma: "google_ads", brand },
    select: { idEsterno: true },
  });
  const corse = conti.length
    ? await prisma.ricezioneDati.findMany({
        where: { fonte: "google_ads", account: { in: conti.map((c) => c.idEsterno) }, tipo: "metriche" },
        orderBy: { ricevutoIl: "desc" },
        take: 5,
        select: { ricevutoIl: true },
      })
    : [];
  const ultimaCorsa = corse[0]?.ricevutoIl ?? null;
  const oraDi = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  // «Di solito verso le …»: l'ora della corsa più recente, con le altre a
  // conferma. Se le ultime cinque corse hanno orari sparsi lo si dice, invece
  // di promettere una puntualità che non c'è.
  const oreCorse = corse.map((c) => c.ricevutoIl.getHours());
  const regolare = oreCorse.length >= 2 && Math.max(...oreCorse) - Math.min(...oreCorse) <= 2;

  // ⚠️ L'ultimo giorno CON DATI, non «ieri». Se la corsa gira alle 2 di notte
  // copre fino all'altro ieri, e il riquadro mostrava un trattino proprio nel
  // numero principale: sembrava che la campagna non avesse speso, mentre era
  // solo il calendario a non combaciare con l'orario dello script.
  const ultimoPieno = await prisma.metricaCampagna.findFirst({
    where: { campagnaId, data: { lt: oggi } },
    orderBy: { data: "desc" },
    select: { data: true, spesa: true },
  });

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

      {/* ⚠️ Quando oggi non è arrivato, il blocco diceva soltanto che non era
          arrivato — e sotto spiegava che comunque i numeri di oggi non si usano
          per decidere. Due frasi per non dire niente, in un riquadro intero.
          Adesso mostra IERI, che è l'ultimo giorno vero e completo: la domanda
          «sto spendendo troppo?» ha una risposta anche prima della corsa. */}
      {spesaOggi == null ? (
        <>
          <div className="kpi-riga" style={{ marginBottom: 0 }}>
            <div className="kpi">
              <div className="kpi-valore">
                {ultimoPieno?.spesa != null ? formattaEuro(ultimoPieno.spesa) : "—"}
              </div>
              <div className="kpi-etichetta">
                {ultimoPieno
                  ? `Ultima giornata piena · ${formattaData(ultimoPieno.data)}`
                  : "Nessuna giornata piena in archivio"}
              </div>
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
                {budgetGiornaliero != null && ultimoPieno?.spesa != null && budgetGiornaliero > 0
                  ? ` · quel giorno ne ha usato il ${Math.round((ultimoPieno.spesa / budgetGiornaliero) * 100)}%`
                  : ""}
              </div>
            </div>
          </div>
          <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
            Per <b>oggi</b> non è ancora arrivato niente.{" "}
            {ultimaCorsa ? (
              <>
                L&apos;ultima corsa dello script su questo account è delle{" "}
                <b>{oraDi(ultimaCorsa)}</b>
                {regolare ? " — è l'ora a cui gira di solito" : " (gli orari delle ultime corse sono sparsi)"}
                : la giornata di oggi entra alla corsa successiva, non stasera.
              </>
            ) : (
              <>
                Questo account non ha ancora consegnato niente: finché lo script non gira, di oggi
                non si sa nulla. Guarda <a href="/ricezione">Dati in arrivo</a>.
              </>
            )}
          </p>
        </>
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

      {spesaOggi != null && (
        <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
          I numeri di oggi sono <b>parziali per costruzione</b>: la spesa arriva quando lo script
          gira, e le conversioni Google le consolida nelle ore e nei giorni dopo. Per decidere si
          guardano 7 e 30 giorni; oggi serve solo ad accorgersi in tempo di un&apos;anomalia.
        </p>
      )}
    </section>
  );
}
