import { creaAzioneDaOpportunita } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { STATI_AZIONE_APERTI } from "@/lib/dominio";
import { giudicabilita } from "@/lib/guardrail";
import { gruppiConNumeri } from "@/lib/gruppi";
import { opportunitaCampagna } from "@/lib/opportunita";

const COLORE_PRIORITA: Record<string, string> = {
  alta: "var(--red)",
  media: "var(--orange)",
  bassa: "var(--text-tertiary)",
};

// La tasklist della scheda campagna: cosa conviene fare adesso, con accanto il
// numero che l'ha fatta nascere e un bottone che la trasforma in azione vera.
// Le voci già diventate azioni non si ripropongono: si vedono nell'elenco delle
// azioni aperte qui sotto.
export async function ProssimeAzioni({ campagnaId }: { campagnaId: string }) {
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: {
      // I 90 giorni più recenti, poi rimessi in ordine di tempo
      metriche: { orderBy: { data: "desc" }, take: 90 },
      modifiche: { orderBy: { eseguitaIl: "desc" }, take: 1 },
      alert: { where: { stato: "aperto" }, orderBy: { creatoIl: "desc" }, take: 10 },
      azioni: { where: { stato: { in: STATI_AZIONE_APERTI } }, orderBy: { creataIl: "desc" } },
    },
  });
  if (!campagna) return null;

  const [gruppi, keyword] = await Promise.all([
    gruppiConNumeri({ campagnaId }),
    prisma.copyAnnuncio.findMany({
      where: { tipo: "keyword", campagna: campagna.nome },
      select: { testo: true, spesa: true, incasso: true },
    }),
  ]);

  const giud = giudicabilita(campagna.modifiche[0]?.eseguitaIl ?? null);
  const voci = opportunitaCampagna({
    campagna: {
      id: campagna.id,
      nome: campagna.nome,
      brand: campagna.brand,
      stato: campagna.stato,
      classe: campagna.classe,
      budgetGiornaliero: campagna.budgetGiornaliero,
      strategiaOfferta: campagna.strategiaOfferta,
      tipoConversione: campagna.tipoConversione,
    },
    metriche: [...campagna.metriche].reverse(),
    gruppi,
    keyword,
    alert: campagna.alert.map((a) => ({ tipo: a.tipo, livello: a.livello, messaggio: a.messaggio })),
    inBlackoutFino: giud.fino,
    azioniAperte: campagna.azioni.map((a) => a.titolo),
  });

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Prossime azioni ({voci.filter((v) => !v.soloNota).length})
        {campagna.azioni.length > 0 ? ` · ${campagna.azioni.length} già in lista` : ""}
      </div>

      {voci.length === 0 && campagna.azioni.length === 0 && (
        <div className="vuoto-mini">
          Niente da proporre: nessun alert aperto, spesa e resa dentro le soglie del brand, dati
          aggiornati. Se ti aspettavi qualcosa, controlla che i dati stiano arrivando in{" "}
          <a href="/ricezione">Dati in arrivo</a>.
        </div>
      )}

      {voci.length > 0 && (
        <ul className="storia" style={{ marginBottom: campagna.azioni.length ? 16 : 0 }}>
          {voci.map((v) => (
            <li key={v.chiave} style={{ alignItems: "flex-start" }}>
              <span className="storia-data" style={{ color: COLORE_PRIORITA[v.priorita], fontWeight: 700, flex: "0 0 64px" }}>
                {v.priorita}
              </span>
              <span className="storia-testo" style={{ whiteSpace: "normal" }}>
                <b>{v.titolo}</b>
                <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 2 }}>{v.perche}</div>
                {v.dove && (
                  <div style={{ marginTop: 4 }}>
                    <a href={v.dove} style={{ fontSize: 13 }}>Vai dove si fa →</a>
                  </div>
                )}
              </span>
              <span className="storia-autore" style={{ flex: "0 0 auto" }}>
                {v.soloNota ? (
                  <span className="cella-sub">nota</span>
                ) : (
                  <form action={creaAzioneDaOpportunita}>
                    <input type="hidden" name="campagnaId" value={campagnaId} />
                    <input type="hidden" name="titolo" value={v.titolo} />
                    <input type="hidden" name="perche" value={v.perche} />
                    <input type="hidden" name="priorita" value={v.priorita} />
                    <input type="hidden" name="chiave" value={v.chiave} />
                    <button className="btn small" type="submit">Crea azione</button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {campagna.azioni.length > 0 && (
        <>
          <div className="cella-sub" style={{ marginBottom: 6 }}>GIÀ IN LISTA</div>
          <ul className="storia">
            {campagna.azioni.map((a) => (
              <li key={a.id}>
                <span className="storia-data" style={{ color: COLORE_PRIORITA[a.priorita], fontWeight: 700, flex: "0 0 64px" }}>
                  {a.priorita}
                </span>
                <span className="storia-testo">
                  <a href={`/azioni/${a.id}`}>{a.titolo}</a>
                </span>
                <span className="storia-autore">{a.stato}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        Ogni voce nasce da un numero di questa campagna, non da un&apos;impressione. Creare
        l&apos;azione non cambia niente su Google: le modifiche passano sempre dalla coda
        approvata a mano.
      </p>
    </section>
  );
}
