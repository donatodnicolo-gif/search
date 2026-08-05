import { prisma } from "@/lib/db";
import { formattaData, formattaEuro } from "@/lib/dominio";

// I gruppi non coprono sempre lo stesso periodo della campagna, e la
// differenza si legge come un buco nei numeri.
//
// Il caso che l'ha fatta nascere (04/08/2026, «[Deluxy] Roma (Fiori) -
// italian»): la campagna dichiarava **7 conversioni** e il gruppo ne mostrava
// **2**. Non era un errore di calcolo — la serie della campagna comincia il
// 27/06, quella dei gruppi il **21/07**: sugli stessi «ultimi 30 giorni» il
// confronto era fra 29 giorni di campagna e 15 di gruppo. Lo stesso vale per
// la spesa: 281 € contro 153 €.
//
// Il numero del gruppo non è sbagliato: è di un periodo più corto. Ma senza
// dirlo si conclude che il gruppo non converte, che è la conclusione opposta.
export async function CoperturaGruppi({
  campagnaId,
  giorni,
}: {
  campagnaId: string;
  giorni: number;
}) {
  const da = new Date();
  da.setHours(0, 0, 0, 0);
  da.setDate(da.getDate() - giorni);

  const [campagna, gruppi] = await Promise.all([
    prisma.metricaCampagna.aggregate({
      where: { campagnaId, data: { gte: da } },
      _sum: { spesa: true, conversioni: true },
      _min: { data: true },
    }),
    prisma.metricaGruppo.aggregate({
      where: { gruppo: { campagnaId }, data: { gte: da } },
      _sum: { spesa: true, conversioni: true },
      _min: { data: true },
    }),
  ]);

  const spesaCamp = campagna._sum.spesa ?? 0;
  const spesaGr = gruppi._sum.spesa ?? 0;
  const convCamp = campagna._sum.conversioni ?? 0;
  const convGr = gruppi._sum.conversioni ?? 0;
  const primoCamp = campagna._min.data;
  const primoGr = gruppi._min.data;

  // Senza dati di gruppo lo dice già la tabella; e sotto il 10% di scarto non
  // vale la pena di allarmare: gli arrotondamenti di Google fanno il resto.
  if (spesaGr === 0 || spesaCamp === 0) return null;
  const copertura = spesaGr / spesaCamp;
  if (copertura > 0.9) return null;

  const partonoDiverso =
    primoCamp && primoGr && primoGr.getTime() - primoCamp.getTime() > 86400_000;

  return (
    <div className="nota-info" style={{ marginTop: 12 }}>
      <span className="nota-icona">◈</span>
      <span>
        <b>I gruppi qui sotto coprono meno periodo della campagna</b>, quindi i loro numeri sono
        più bassi e non è un calo: sommati fanno {formattaEuro(spesaGr)} contro i{" "}
        {formattaEuro(spesaCamp)} della campagna ({Math.round(copertura * 100)}%)
        {convCamp > 0 && (
          <>
            , e {convGr.toFixed(0)} conversioni contro {convCamp.toFixed(0)}
          </>
        )}
        .
        {partonoDiverso && primoCamp && primoGr && (
          <>
            {" "}Nel periodo scelto la campagna ha dati dal <b>{formattaData(primoCamp)}</b>, i
            gruppi solo dal <b>{formattaData(primoGr)}</b>: il giro{" "}
            <code>AZIONE = &quot;gruppi&quot;</code> è partito dopo, e lo storico di prima non
            esiste a livello di gruppo.
          </>
        )}
        {!partonoDiverso && (
          <>
            {" "}Succede quando qualche giornata di gruppo non è stata consegnata: guarda{" "}
            <a href="/ricezione">Dati in arrivo</a>.
          </>
        )}
      </span>
    </div>
  );
}
