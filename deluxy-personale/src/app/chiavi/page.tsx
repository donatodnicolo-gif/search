import { cookies } from "next/headers";
import { Chiavi, type ChiaveUI } from "@/components/Chiavi";
import { authAttiva, leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/ruoli";

// Le chiavi con cui le altre app leggono l'organico (Hub e Budgets in testa).

export const dynamic = "force-dynamic";

export default async function PaginaChiavi() {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  // Senza segreti (sviluppo locale) la app è aperta in vista admin.
  const admin = sessione ? isAdmin(sessione.ruolo) : !authAttiva();

  if (!admin) {
    return (
      <>
        <h1 className="page-title">Chiavi</h1>
        <div className="card vuoto" style={{ marginTop: 20 }}>
          <div className="vuoto-titolo">Le chiavi le gestisce un amministratore</div>
        </div>
      </>
    );
  }

  let chiavi: ChiaveUI[] = [];
  let erroreDb: string | null = null;
  try {
    const righe = await prisma.apiKey.findMany({ orderBy: [{ attiva: "desc" }, { nome: "asc" }] });
    chiavi = righe.map((c) => ({
      id: c.id,
      nome: c.nome,
      scrittura: c.scrittura,
      attiva: c.attiva,
      creataIl: c.creataIl.toISOString(),
      ultimoUso: c.ultimoUso?.toISOString() ?? null,
    }));
  } catch {
    erroreDb = "Database non raggiungibile: senza database non si possono creare chiavi.";
  }

  const suggeriti = ["deluxy-hub", "deluxy-budgets", "deluxy-tasks", "deluxy-calendario", "deluxy-mail"];

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Chiavi delle app</h1>
          <p className="page-sub">
            Con una chiave un&apos;altra app Deluxy legge l&apos;organico da /api/v1 (persone, team,
            funzioni, organigramma). Gli stipendi escono SOLO se il client li chiede con
            ?compensi=1 — e si vede nei log chi lo fa.
          </p>
        </div>
      </div>
      {erroreDb ? <div className="avviso-errore">{erroreDb}</div> : <Chiavi chiavi={chiavi} suggeriti={suggeriti} />}
    </>
  );
}
