import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  COLORE_STATO_VALET,
  ETICHETTE_STATO_VALET,
  STATI_VALET,
  isStatoValet,
  nomeCompleto,
} from "@/lib/valet";

export const dynamic = "force-dynamic";

// Elenco dei valet: la rubrica delle persone che fanno le consegne, accanto a
// quella dei referenti delle aziende. Ricerca su nome, recapiti e province.
export default async function Valet({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stato?: string; archiviati?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const stato = sp.stato && isStatoValet(sp.stato) ? sp.stato : null;
  const archiviati = sp.archiviati === "1";

  const righe = await prisma.valet.findMany({
    where: {
      attivo: !archiviati,
      ...(stato ? { stato } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { cognome: { contains: q, mode: "insensitive" } },
              { telefono: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { citta: { contains: q, mode: "insensitive" } },
              { provinceServite: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ cognome: "asc" }, { nome: "asc" }],
  });

  const perStato = await prisma.valet.groupBy({
    by: ["stato"],
    where: { attivo: true },
    _count: { _all: true },
  });
  const conta = new Map(perStato.map((s) => [s.stato, s._count._all]));
  const archiviate = await prisma.valet.count({ where: { attivo: false } });

  return (
    <div className="layout">
      <Sidebar valetAttivo />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Valet</h1>
            <p className="page-sub">
              Le persone che fanno le consegne: anagrafica e recapiti. Paghe, province assegnate e
              stipendi restano nella piattaforma consegne
            </p>
          </div>
          <a className="btn" href="/valet/nuovo">＋ Nuovo valet</a>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nome, telefono, email, provincia…" defaultValue={q} />
          <select name="stato" defaultValue={stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_VALET.map((s) => (
              <option key={s} value={s}>
                {ETICHETTE_STATO_VALET[s]} ({conta.get(s) ?? 0})
              </option>
            ))}
          </select>
          {archiviati && <input type="hidden" name="archiviati" value="1" />}
          <button className="btn btn-secondario" type="submit">Filtra</button>
          <a className="btn btn-secondario" href={archiviati ? "/valet" : "/valet?archiviati=1"}>
            {archiviati ? "← In servizio" : `Archiviati (${archiviate})`}
          </a>
        </form>

        {righe.length === 0 ? (
          <div className="vuoto">
            {q || stato ? "Nessun valet con questi filtri." : "Nessun valet ancora inserito."}
          </div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Valet</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Città</th>
                  <th>Province servite</th>
                  <th>Mezzo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <a href={`/valet/${v.id}`}>
                        <div className="cella-nome">{nomeCompleto(v)}</div>
                        {v.pIva && <div className="cella-sub">P. IVA {v.pIva}</div>}
                      </a>
                    </td>
                    <td className="cella-muta">
                      {v.telefono ? (
                        <a href={`tel:${v.telefono.replace(/[^\d+]/g, "")}`} title="Chiama">{v.telefono}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cella-muta">{v.email ?? "—"}</td>
                    <td className="cella-muta">{[v.citta, v.provincia].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="cella-muta">{v.provinceServite ?? "—"}</td>
                    <td className="cella-muta">{v.mezzo ?? "—"}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          color: isStatoValet(v.stato) ? COLORE_STATO_VALET[v.stato] : "var(--text-secondary)",
                        }}
                      >
                        <span className="dot" />
                        <span className="stato-label">
                          {isStatoValet(v.stato) ? ETICHETTE_STATO_VALET[v.stato] : v.stato}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
