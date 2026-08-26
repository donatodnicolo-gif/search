import { prisma } from "@/lib/db";
import { frequenzeMeta, type FrequenzaMeta } from "@/lib/meta";
import { formattaEuro, formattaNumero, roas } from "@/lib/dominio";

// Come sta andando, per finestre: 7 giorni · mese corrente · 30 giorni ·
// trimestre · anno, tutte insieme in tabella.
//
// ⚠️ Tutte insieme, non una alla volta: la domanda è «va meglio o peggio di
// prima», e con le tab bisognava cliccarne cinque tenendo i numeri a mente.
// L'andamento giorno per giorno lo racconta il grafico che sta già sulla
// pagina: qui servono i totali, confrontabili.
//
// ⚠️ Non tocca il periodo condiviso dell'app: sono finestre fisse, e il
// periodo scelto in cima governa il resto della pagina.
const FINESTRE: { chiave: string; nome: string; giorni: number | "mese" | "anno" }[] = [
  { chiave: "7g", nome: "7 giorni", giorni: 7 },
  { chiave: "mese", nome: "Mese corrente", giorni: "mese" },
  { chiave: "30g", nome: "30 giorni", giorni: 30 },
  { chiave: "trimestre", nome: "Trimestre", giorni: 90 },
  { chiave: "anno", nome: "Anno", giorni: "anno" },
];

function estremi(chiave: string): { da: Date; a: Date } {
  const f = FINESTRE.find((x) => x.chiave === chiave) ?? FINESTRE[2];
  const a = new Date();
  a.setHours(23, 59, 59, 999);
  const da = new Date();
  if (f.giorni === "mese") {
    da.setDate(1);
  } else if (f.giorni === "anno") {
    da.setMonth(0, 1);
  } else {
    da.setDate(da.getDate() - (f.giorni - 1));
  }
  da.setHours(0, 0, 0, 0);
  return { da, a };
}

export async function PerformancePeriodi({
  campagnaId,
  gruppoId,
  metaIdEsterno,
}: {
  // Uno dei due: la campagna intera o un singolo gruppo di annunci. Le
  // metriche stanno in due tabelle diverse ma rispondono alla stessa
  // domanda, e la tabella che ne esce è la stessa.
  campagnaId?: string;
  gruppoId?: string;
  // Per le campagne META: l'id di piattaforma. Accende la colonna FREQUENZA,
  // chiesta viva a Meta per ogni finestra — è un numero di periodo (gente
  // unica) e dalle righe giornaliere non si può ricavare.
  metaIdEsterno?: string | null;
}) {
  const inizioAnno = estremi("anno").da;
  const fine = estremi("7g").a;

  // ⚠️ Una lettura sola per tutte e cinque le finestre: si prende il periodo
  // più lungo e le altre si ritagliano in memoria. Cinque query sullo stesso
  // Postgres condiviso per cinque somme è il modo di far aspettare una
  // pagina per niente.
  const tutte = gruppoId
    ? await prisma.metricaGruppo.findMany({
        where: { gruppoId, data: { gte: inizioAnno, lte: fine } },
        orderBy: { data: "asc" },
        select: { data: true, spesa: true, ricavi: true, click: true, conversioni: true },
      })
    : await prisma.metricaCampagna.findMany({
        where: { campagnaId, data: { gte: inizioAnno, lte: fine } },
        orderBy: { data: "asc" },
        select: { data: true, spesa: true, ricavi: true, click: true, conversioni: true },
      });

  if (tutte.length === 0) return null;

  const frequenze: Map<string, FrequenzaMeta> = metaIdEsterno
    ? await frequenzeMeta(
        metaIdEsterno,
        FINESTRE.map((f) => ({ chiave: f.chiave, ...estremi(f.chiave) }))
      )
    : new Map();
  const conFrequenza = frequenze.size > 0;

  const confronto = FINESTRE.map((f) => {
    const e = estremi(f.chiave);
    const righe = tutte.filter((m) => m.data >= e.da && m.data <= e.a);
    const sp = righe.reduce((s, m) => s + (m.spesa ?? 0), 0);
    const ri = righe.reduce((s, m) => s + (m.ricavi ?? 0), 0);
    return {
      chiave: f.chiave,
      nome: f.nome,
      giorni: righe.length,
      spesa: sp,
      ricavi: ri,
      conversioni: righe.reduce((s, m) => s + (m.conversioni ?? 0), 0),
      click: righe.reduce((s, m) => s + (m.click ?? 0), 0),
      resa: roas(ri, sp),
      // ⚠️ La media al giorno è l'unica colonna confrontabile fra finestre di
      // lunghezza diversa: 223 € in 7 giorni e 900 € in 30 non si leggono uno
      // accanto all'altro, la media sì.
      spesaGiorno: righe.length > 0 ? sp / righe.length : null,
    };
  });

  return (
    <section className="scheda" id="andamento">
      <div className="scheda-titolo">Come sta andando</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Le finestre a confronto, tutte insieme. La colonna <b>al giorno</b> è quella da leggere per
        capire se sta andando meglio o peggio: la spesa totale di sette giorni e quella di un anno
        non si confrontano fra loro.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Finestra</th>
              <th className="num">Spesa</th>
              <th className="num" title="Spesa ÷ giorni con dati: l'unico modo di confrontare finestre di lunghezza diversa">
                Al giorno
              </th>
              <th className="num">Ricavi</th>
              <th className="num">Conv.</th>
              <th className="num">Click</th>
              <th className="num">ROAS</th>
              {conFrequenza && (
                <th
                  className="num"
                  title="Impressioni ÷ persone raggiunte nel periodo, letta da Meta: sopra 3 nel lusso i creativi si consumano, sopra 10 il pubblico è esaurito e ogni euro in più peggiora la fatigue"
                >
                  Frequenza
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {confronto.map((c) => (
              <tr key={c.chiave}>
                <td>
                  <b>{c.nome}</b>
                  <div className="cella-sub">
                    {c.giorni === 0 ? "nessun dato" : `${c.giorni} giorn${c.giorni === 1 ? "o" : "i"} con dati`}
                  </div>
                </td>
                <td className="num">{c.spesa > 0 ? formattaEuro(c.spesa) : "—"}</td>
                <td className="num">{c.spesaGiorno != null ? formattaEuro(c.spesaGiorno) : "—"}</td>
                <td className="num">{c.ricavi > 0 ? formattaEuro(c.ricavi) : "—"}</td>
                <td className="num">{c.conversioni > 0 ? formattaNumero(c.conversioni) : "—"}</td>
                <td className="num cella-muta">{c.click > 0 ? formattaNumero(c.click) : "—"}</td>
                <td
                  className="num"
                  style={{ fontWeight: 600, color: c.resa == null ? undefined : c.resa >= 3 ? "var(--green)" : c.resa < 1 ? "var(--red)" : undefined }}
                >
                  {c.resa != null ? `${c.resa.toFixed(1).replace(".", ",")}×` : "—"}
                </td>
                {conFrequenza && (() => {
                  const fq = frequenze.get(c.chiave);
                  return (
                    <td
                      className="num"
                      style={{
                        fontWeight: 600,
                        color: fq == null ? undefined : fq.frequenza >= 10 ? "var(--red)" : fq.frequenza >= 3 ? "var(--orange)" : undefined,
                      }}
                      title={fq ? `${formattaNumero(fq.copertura)} persone raggiunte` : "Meta non ha risposto per questa finestra"}
                    >
                      {fq ? `${fq.frequenza.toFixed(1).replace(".", ",")}×` : "—"}
                    </td>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
