import { cookies } from "next/headers";
import { Chiavi, type ChiaveUI } from "@/components/Chiavi";
import { Vuoto } from "@/components/Vuoto";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/ruoli";
import { SISTEMI } from "@/lib/sistemi";

// Le chiavi con cui le altre app entrano in questo registro. Prima si creavano
// solo da riga di comando (`npm run chiave`): qui le fa un admin dal browser.

export const dynamic = "force-dynamic";

export default async function PaginaChiavi() {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  // Senza segreto di sessione (sviluppo locale) la app è aperta in vista admin.
  const admin = sessione ? isAdmin(sessione.ruolo) : !process.env.TASKS_SESSION_SECRET;

  if (!admin) {
    return (
      <main className="wrap">
        <h1 className="page-title">Chiavi</h1>
        <Vuoto icona="chiave" titolo="Riservato agli amministratori">
          Le chiavi delle app le gestisce un amministratore: se te ne serve una, chiedi a chi
          amministra il Deluxy Hub.
        </Vuoto>
      </main>
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
  } catch (e) {
    console.error("[tasks] elenco chiavi non caricabile:", e);
    erroreDb = "Il registro delle chiavi non risponde.";
  }

  // Nomi già noti come provenienza delle task: comodi da suggerire, ma il nome
  // è libero (un'app nuova può presentarsi con quello che vuole).
  const suggeriti = Object.keys(SISTEMI).sort();

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Chiavi delle app</h1>
        <p className="page-sub">
          Una chiave apre questo registro a un'altra app Deluxy: con quella l'app manda qui le sue
          cose da fare e rilegge le proprie. Si vede una volta sola, appena creata.
        </p>
      </div>

      {erroreDb ? (
        <Vuoto tono="errore" titolo={erroreDb}>
          Senza database non si possono creare né revocare chiavi. Riprova ricaricando la pagina;
          se continua, segnalalo a chi amministra le app Deluxy.
        </Vuoto>
      ) : (
        <Chiavi chiavi={chiavi} suggeriti={suggeriti} />
      )}
    </main>
  );
}
