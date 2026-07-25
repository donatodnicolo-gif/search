import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { nomeApp } from "@/lib/classificazione";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";

export const dynamic = "force-dynamic";

const PER_COLONNA = 40;

export default async function Bacheca({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const brand = sp.brand?.trim() || undefined;
  const filtroBrand = brand ? { brand } : {};

  const [stati, negozi] = await Promise.all([
    statiOrdinati(),
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
  ]);
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));

  // Una colonna per stato + una per gli ordini senza stato.
  const colonne = await Promise.all(
    stati.map(async (s) => {
      const [conta, ordini] = await Promise.all([
        prisma.ordine.count({ where: { statoId: s.id, ...filtroBrand } }),
        prisma.ordine.findMany({
          where: { statoId: s.id, ...filtroBrand },
          orderBy: { data: "desc" },
          take: PER_COLONNA,
          select: { id: true, numero: true, brand: true, totale: true, valuta: true, clienteNome: true, spedizioneNome: true, citta: true, statoId: true, assegnatoApp: true },
        }),
      ]);
      return { stato: s, conta, ordini };
    }),
  );

  const contaSenza = await prisma.ordine.count({ where: { statoId: null, ...filtroBrand } });
  const senzaStato =
    contaSenza > 0
      ? await prisma.ordine.findMany({
          where: { statoId: null, ...filtroBrand },
          orderBy: { data: "desc" },
          take: PER_COLONNA,
          select: { id: true, numero: true, brand: true, totale: true, valuta: true, clienteNome: true, spedizioneNome: true, citta: true, statoId: true, assegnatoApp: true },
        })
      : [];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Bacheca</h1>
          <p className="page-sub">Gli ordini per stato della pipeline. Sposta un ordine cambiandone lo stato.</p>
        </div>
        <form method="get">
          <select name="brand" defaultValue={brand ?? ""} style={{ font: "inherit", padding: "8px 12px", borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent" }}>
            <option value="">Tutti i brand</option>
            {negozi.map((n) => <option key={n.id} value={n.brand}>{n.brand}</option>)}
          </select>
          <button className="btn btn-secondario small" type="submit" style={{ marginLeft: 8 }}>Filtra</button>
        </form>
      </div>

      <div className="bacheca">
        {[...colonne, ...(contaSenza > 0 ? [{ stato: null, conta: contaSenza, ordini: senzaStato }] : [])].map((col, i) => {
          const s = col.stato;
          return (
            <div className="colonna" key={s?.id ?? `senza-${i}`}>
              <div className="colonna-testa">
                <span className="colonna-dot" style={{ background: s?.colore ?? "var(--text-tertiary)" }} />
                <span className="colonna-nome">{s?.nome ?? "Senza stato"}</span>
                <span className="colonna-conta">{col.conta}</span>
              </div>
              {col.ordini.length === 0 ? (
                <div className="colonna-vuota">Nessun ordine</div>
              ) : (
                col.ordini.map((o) => (
                  <div className="card-ordine" key={o.id}>
                    <div className="card-testa">
                      <Link href={`/ordini/${o.id}`} className="card-numero">{o.numero}</Link>
                      <span className="card-totale">{euro(o.totale, o.valuta)}</span>
                    </div>
                    <div className="card-cliente">{o.clienteNome ?? o.spedizioneNome ?? o.brand}{o.citta ? ` · ${o.citta}` : ""}</div>
                    <div className="card-meta">
                      <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                      {o.assegnatoApp && <span className="badge neutro">{nomeApp(o.assegnatoApp)}</span>}
                    </div>
                  </div>
                ))
              )}
              {col.conta > col.ordini.length && (
                <div className="colonna-vuota">+{col.conta - col.ordini.length} altri…</div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
