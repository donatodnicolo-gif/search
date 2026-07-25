import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore, mappaColori, coloreBrand } from "@/lib/brand";
import { decodificaChiave, whereOrdiniCliente } from "@/lib/clienti";
import { statiOrdinati } from "@/lib/stati";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";

export const dynamic = "force-dynamic";

export default async function SchedaCliente({ params }: { params: Promise<{ chiave: string }> }) {
  const { chiave: codice } = await params;
  const chiave = decodificaChiave(codice);
  const where = whereOrdiniCliente(chiave);

  const [ordini, somma, brand, stati] = await Promise.all([
    prisma.ordine.findMany({
      where,
      include: { stato: true, etichette: true },
      orderBy: { data: "desc" },
      take: 300,
    }),
    prisma.ordine.aggregate({ where, _sum: { totale: true }, _count: { _all: true } }),
    brandConColore(),
    statiOrdinati(),
  ]);

  if (ordini.length === 0) notFound();

  const colori = mappaColori(brand);
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));
  const primo = ordini[ordini.length - 1];
  const ultimo = ordini[0];
  const speso = somma._sum.totale ?? 0;
  const quanti = somma._count._all;

  // I dati anagrafici più completi fra tutti i suoi ordini
  const nome = ordini.find((o) => o.clienteNome)?.clienteNome ?? ultimo.spedizioneNome ?? chiave;
  const email = ordini.find((o) => o.clienteEmail)?.clienteEmail ?? null;
  const telefono = ordini.find((o) => o.clienteTelefono)?.clienteTelefono ?? null;
  const indirizzo = ordini.find((o) => o.indirizzo);
  const brandUsati = [...new Set(ordini.map((o) => o.brand))];

  return (
    <main className="main">
      <Link href="/clienti" className="ritorno">← Tutti i clienti</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">{nome}</h1>
          <p className="page-sub">
            {quanti === 1 ? "1 ordine" : `${quanti.toLocaleString("it-IT")} ordini`} · {euro(speso)} totali
          </p>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{quanti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ordini</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(speso)}</div>
          <div className="kpi-etichetta">Speso in totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(quanti ? speso / quanti : 0)}</div>
          <div className="kpi-etichetta">Ordine medio</div>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Anagrafica</div>
        <dl className="griglia-campi">
          <div className="campo"><dt>Email</dt><dd>{email ?? "—"}</dd></div>
          <div className="campo"><dt>Telefono</dt><dd>{telefono ?? "—"}</dd></div>
          <div className="campo"><dt>Primo ordine</dt><dd>{dataBreve(primo.data)}</dd></div>
          <div className="campo"><dt>Ultimo ordine</dt><dd>{dataBreve(ultimo.data)}</dd></div>
          <div className="campo campo-largo"><dt>Ultimo indirizzo</dt><dd>
            {indirizzo
              ? [indirizzo.spedizioneNome, indirizzo.indirizzo, [indirizzo.cap, indirizzo.citta, indirizzo.provincia].filter(Boolean).join(" "), indirizzo.paese]
                  .filter(Boolean)
                  .join(" · ")
              : "—"}
          </dd></div>
          <div className="campo campo-largo"><dt>Brand</dt><dd>
            <span className="etichette">
              {brandUsati.map((b) => (
                <span key={b} className="tag" style={{ color: coloreBrand(colori, b) }}>
                  <span className="dot" /><span className="tag-label">{b}</span>
                </span>
              ))}
            </span>
          </dd></div>
        </dl>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">
          I suoi ordini{quanti > ordini.length ? ` (ultimi ${ordini.length} di ${quanti})` : ""}
        </div>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th><th>Data</th><th className="num">Totale</th><th>Pagamento</th><th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => (
                <tr key={o.id} className="riga-brand" style={{ ["--brand" as string]: coloreBrand(colori, o.brand) }}>
                  <td>
                    <Link href={`/ordini/${o.id}`} className="cella-nome">{o.numero}</Link>
                    <div className="cella-sub cella-brand"><span className="brand-dot" />{o.brand}</div>
                  </td>
                  <td className="cella-muta">{dataBreve(o.data)}</td>
                  <td className="cella-num">{euro(o.totale, o.valuta)}</td>
                  <td><span className="badge neutro">{o.categoriaPagamento}</span></td>
                  <td>
                    <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
