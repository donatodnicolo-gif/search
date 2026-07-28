import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { doppioniEvidenti } from "@/lib/riconciliazione";

export const dynamic = "force-dynamic";

// L'elenco dei doppioni evidenti del catalogo: schede diverse con lo stesso
// nome ridotto all'osso.
//
// Non pretende di trovarli tutti — i titoli arrivati dal venduto sono scritti a
// mano su tre negozi — e infatti la pagina lo dice invece di far credere che
// quello che manca non esista. Da qui si sceglie quale scheda tenere; l'unione
// vera si conferma sulla sua pagina.
export default async function DoppioniPage() {
  const gruppi = await doppioniEvidenti(150);
  const uniti = await prisma.prodotto.count({ where: { unitoAId: { not: null } } });
  const schede = gruppi.reduce((s, g) => s + g.prodotti.length, 0);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Schede da riconciliare</h1>
            <p className="page-sub">
              Schede diverse con lo <strong>stesso nome</strong>: probabilmente sono lo stesso prodotto arrivato
              dal venduto di negozi diversi. Finché restano separate, le classifiche dividono il loro venduto.
              Scegli quale tenere e unisci le altre dalla sua pagina.
            </p>
          </div>
          <Link className="btn btn-secondario" href="/prodotti">
            Torna ai prodotti
          </Link>
        </div>

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {gruppi.length} {gruppi.length === 1 ? "gruppo" : "gruppi"} · {schede} schede coinvolte
          {uniti > 0 ? ` · ${uniti} già unite ad altre` : ""}. Questa lista trova solo i nomi
          <strong> identici</strong>: i doppioni scritti in modo diverso si cercano dalla scheda del prodotto.
        </p>

        {gruppi.length === 0 ? (
          <div className="vuoto">Nessuna scheda con lo stesso nome di un&apos;altra.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Schede</th>
                  <th className="num">Quante</th>
                </tr>
              </thead>
              <tbody>
                {gruppi.map((g) => (
                  <tr key={g.chiave}>
                    <td className="cella-nome">{g.prodotti[0].nome}</td>
                    <td>
                      {g.prodotti.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " · "}
                          <Link href={`/prodotti/${p.id}/riconcilia`}>
                            {p.codice}
                            {p.vendorShopify ? ` (${p.vendorShopify})` : ""}
                            {p.prezzoVendita > 0 ? ` ${euro(p.prezzoVendita)}` : ""}
                          </Link>
                        </span>
                      ))}
                    </td>
                    <td className="num">{g.prodotti.length}</td>
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
