import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiGuarda } from "@/lib/chi-guarda";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.autore !== "string" || !body.autore.trim()) {
    return NextResponse.json({ error: "autore mancante" }, { status: 400 });
  }

  // ⚠️⚠️ **L'AUTORE NON LO SCEGLIE CHI MANDA** (buco chiuso il 27/08/2026).
  //
  // Prima `autore` era testo libero preso dal corpo della richiesta e non
  // veniva mai confrontato con la sessione: chiunque avesse un accesso poteva
  // inviare una proposta di budget **firmata col nome di un collega**, su
  // qualunque maison. E siccome nel record non finiva nessuna identità, il
  // filtro «solo le mie proposte» non era neppure implementabile: mancava il
  // dato su cui filtrare.
  //
  // ⭐ Adesso chi manda viene sempre **registrato** (`inviataDa*`, dalla
  // sessione firmata, che non si scrive dal browser). Il campo `autore` resta
  // libero **solo per l'admin**, perché una proposta si può inserire per conto
  // di qualcun altro; per tutti gli altri lo impone il server.
  const chi = await chiGuarda();
  const autore = chi.admin ? String(body.autore).trim() : (chi.nome || String(body.autore).trim());
  // **Una proposta contiene solo i mesi che propone.** Pretendere dodici mesi
  // sembrava un controllo di completezza, e invece obbligava a riempire di zeri
  // i mesi già chiusi: siccome il consolidamento scrive nel budget *quello che
  // la proposta contiene*, quegli zeri cancellavano il budget pubblicato dei
  // mesi passati. Si accettano da 1 a 12 mesi, ognuno valido e senza doppioni.
  //
  // Ogni riga può portare un **canale** (la linea di business): su una proposta
  // di maison si propone linea per linea, così chi consolida non deve scegliere
  // lui su quale voce di budget applicarla. La chiave unica è quindi
  // `mese+canale`, non il solo mese.
  const valori = (Array.isArray(body.valori) ? body.valori : []) as {
    month?: unknown;
    canale?: unknown;
    valore?: unknown;
  }[];
  const viste = new Set<string>();
  for (const v of valori) {
    const m = Number(v?.month);
    const canale = typeof v?.canale === "string" ? v.canale : "";
    const k = `${m}·${canale}`;
    if (!Number.isInteger(m) || m < 1 || m > 12 || viste.has(k)) {
      return NextResponse.json({ error: "mesi non validi o ripetuti" }, { status: 400 });
    }
    viste.add(k);
  }
  if (viste.size === 0) {
    return NextResponse.json({ error: "serve almeno un mese da proporre" }, { status: 400 });
  }
  const ambitoTipo = ["MAISON", "LINEA", "GLOBALE"].includes(body.ambitoTipo)
    ? body.ambitoTipo
    : "GLOBALE";

  const proposta = await prisma.propostaBudget.create({
    data: {
      year: Number(body.year) || new Date().getFullYear(),
      autore, inviataDaUid: chi.uid, inviataDaNome: chi.nome,
      ruolo: typeof body.ruolo === "string" ? body.ruolo : "Responsabile",
      ambitoTipo,
      ambitoSlug: ambitoTipo === "GLOBALE" ? null : (body.ambitoSlug ?? null),
      // Da quale lavoro nascono questi numeri. Non è una nota: decide su quale
      // riga di budget atterrano e quindi che cosa il consolidamento
      // sovrascrive — la propria fonte, mai quella degli altri.
      fonte: ["adv-web", "commerciale"].includes(body.fonte) ? body.fonte : "adv-web",
      note: typeof body.note === "string" ? body.note : null,
      valori: JSON.stringify(
        valori.map((v) => ({
          month: Number(v.month),
          // `canale` c'è solo sulle proposte di maison: sulle altre resta
          // assente, e chi legge distingue le due forme senza un flag in più.
          ...(typeof v.canale === "string" && v.canale ? { canale: v.canale } : {}),
          valore: Number(v.valore) || 0,
        }))
      ),
    },
  });
  return NextResponse.json({ ok: true, id: proposta.id });
}
