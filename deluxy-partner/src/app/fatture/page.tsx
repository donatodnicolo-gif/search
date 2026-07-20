import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, MESI, ivato } from "@/lib/calc";
import { segnaFatturaPagata, deleteFattura } from "@/lib/actions";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

export default async function FatturePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string; stato?: string; tipologia?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const mese = sp.mese ? parseInt(sp.mese) : undefined;

  const tipologie = await prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" } });
  let fatture = await prisma.fatturaServizio.findMany({
    where: {
      anno,
      ...(mese ? { mese } : {}),
      ...(sp.stato === "aperte" ? { pagata: false } : {}),
      ...(sp.stato === "pagate" ? { pagata: true } : {}),
      ...(sp.tipologia ? { tipologiaId: sp.tipologia } : {}),
    },
    include: { partner: true, tipologia: true },
    orderBy: [{ mese: "desc" }, { partner: { nome: "asc" } }],
  });

  type F = (typeof fatture)[number];
  const campi: Record<string, (f: F) => string | number | Date | null> = {
    partner: (f) => f.partner.nome,
    mese: (f) => f.mese,
    tipologia: (f) => f.tipologia.nome,
    numero: (f) => f.numero,
    scadenza: (f) => f.scadenza,
    imponibile: (f) => f.imponibile,
    ivato: (f) => ivato(f),
    stato: (f) => (f.pagata ? 1 : 0),
  };
  if (sp.sort && campi[sp.sort]) fatture = ordina(fatture, campi[sp.sort], sp.dir);

  const totale = fatture.reduce((a, f) => a + f.imponibile, 0);
  const totaleIvato = fatture.reduce((a, f) => a + ivato(f), 0);
  const aperto = fatture.filter((f) => !f.pagata).reduce((a, f) => a + ivato(f), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Servizi a fatturazione</h1>
          <p className="page-caption">
            Fatture emesse ai partner per i servizi Deluxy (consegne, eventi, magazzino…).
          </p>
        </div>
        <div className="page-actions">
          <Link href="/fatture/nuova" className="btn primary">+ Nuova fattura</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Fatturato periodo (netto IVA)</div>
          <div className="kpi-value">{euro(totale)}</div>
          <div className="kpi-sub">{fatture.length} fatture · {euro(totaleIvato)} IVA inclusa</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da incassare</div>
          <div className={`kpi-value ${aperto > 0 ? "neg" : ""}`}>{euro(aperto)}</div>
          <div className="kpi-sub">{fatture.filter((f) => !f.pagata).length} fatture aperte</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="mese" defaultValue={sp.mese ?? ""}>
            <option value="">Tutto l&apos;anno</option>
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutte</option>
            <option value="aperte">Da incassare</option>
            <option value="pagate">Saldate</option>
          </select>
          <select name="tipologia" defaultValue={sp.tipologia ?? ""}>
            <option value="">Tutte le tipologie</option>
            {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <input type="hidden" name="anno" value={anno} />
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {fatture.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna fattura</div>
            <div className="empty-text">Nessuna fattura trovata per i filtri selezionati.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={sp} path="/fatture" />
                  <ThSort label="Mese" campo="mese" sp={sp} path="/fatture" />
                  <ThSort label="Tipologia" campo="tipologia" sp={sp} path="/fatture" />
                  <ThSort label="N° fattura" campo="numero" sp={sp} path="/fatture" />
                  <ThSort label="Scadenza" campo="scadenza" sp={sp} path="/fatture" />
                  <ThSort label="Imponibile" campo="imponibile" sp={sp} path="/fatture" num />
                  <ThSort label="IVA incl." campo="ivato" sp={sp} path="/fatture" num />
                  <ThSort label="Stato" campo="stato" sp={sp} path="/fatture" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fatture.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                    <td>{nomeMese(f.mese)}</td>
                    <td>{f.tipologia.nome}</td>
                    <td>
                      <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }} title="Apri il record della fattura">
                        {f.numero ?? "s.n."}
                      </Link>
                    </td>
                    <td>{dataIt(f.scadenza)}</td>
                    <td className="num">{euro(f.imponibile)}</td>
                    <td className="num">{euro(ivato(f))}</td>
                    <td>
                      {f.pagata ? (
                        <span className="badge green"><span className="dot" />Saldata {dataIt(f.dataPagamento)}</span>
                      ) : f.scadenza && f.scadenza < new Date() ? (
                        <span className="badge red"><span className="dot" />Scaduta</span>
                      ) : (
                        <span className="badge orange"><span className="dot" />Da incassare</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!f.pagata ? (
                        <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                          <button className="btn small secondary" type="submit">Segna saldata</button>
                        </form>
                      ) : (
                        <form action={segnaFatturaPagata.bind(null, f.id, false, undefined)} style={{ display: "inline" }}>
                          <button className="btn small secondary" type="submit">Riapri</button>
                        </form>
                      )}{" "}
                      <form action={deleteFattura.bind(null, f.id)} style={{ display: "inline" }}>
                        <button className="btn small danger" type="submit">Elimina</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
