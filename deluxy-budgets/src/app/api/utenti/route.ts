import { NextResponse } from "next/server";
import { aggiornaUtente, creaUtente, ultimoAdmin } from "@/lib/utenti";

// Gestione degli utenti. Le richieste passano dal middleware, che per il ruolo
// «lettura» rifiuta tutto ciò che non è una lettura: qui non serve ricontrollare
// il permesso, serve invece impedire di **chiudersi fuori**.

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  try {
    const u = await creaUtente({
      email: String(b?.email ?? ""),
      nome: String(b?.nome ?? ""),
      password: String(b?.password ?? ""),
      ruolo: String(b?.ruolo ?? "lettura"),
    });
    return NextResponse.json({ ok: true, id: u.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  // L'ultimo amministratore attivo non si spegne e non si degrada: un'app in cui
  // nessuno può più entrare non è più sicura, è solo rotta.
  const degrada = (b?.ruolo && b.ruolo !== "admin") || b?.attivo === false;
  if (degrada && (await ultimoAdmin(id))) {
    return NextResponse.json(
      { error: "È l'ultimo amministratore attivo: prima nominane un altro, altrimenti nessuno può più modificare niente." },
      { status: 409 }
    );
  }

  try {
    await aggiornaUtente(id, {
      nome: typeof b?.nome === "string" ? b.nome : undefined,
      ruolo: typeof b?.ruolo === "string" ? b.ruolo : undefined,
      attivo: typeof b?.attivo === "boolean" ? b.attivo : undefined,
      password: typeof b?.password === "string" && b.password ? b.password : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
