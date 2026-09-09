// **La bozza che si salva da sola mentre compili un prodotto nuovo.**
//
// Richiesta dell'utente (09/09/2026): «metti salvataggio automatico del
// prodotto in fase di creazione e indica che è una bozza». Prima, chiudere la
// pagina a metà voleva dire ricominciare: nome, descrizione, sezioni scritte a
// mano, tutto perso.
//
// ⚠️⚠️ **Crea prodotti veri.** Non è una copia in un angolo: nasce una scheda
// in fase «concept», che si vede nell'elenco come tutte le altre. Da qui
// discendono tre cautele:
//   1. **non nasce finché il nome non c'è** (almeno tre lettere): aprire il
//      modulo e cambiare idea non deve lasciare schede vuote in giro;
//   2. **non tocca mai un prodotto già pubblicato**: se la scheda ha uno
//      `shopifyId` o non è più in «concept», la richiesta viene ignorata —
//      un salvataggio automatico non deve poter riscrivere un prodotto vivo;
//   3. **scrive solo i campi del testo**: niente prezzi, niente varianti,
//      niente pubblicazioni. Quelli passano dal salvataggio vero, dove ci sono
//      i controlli sugli SKU e sui negozi.
//
// Alla fine il modulo manda l'id della bozza insieme al resto, e il
// salvataggio la **completa** invece di creare un secondo prodotto.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Sette cifre casuali: lo stesso schema del modulo. Il vero SKU si decide al salvataggio. */
const codiceProvvisorio = () => String(Math.floor(1_000_000 + Math.random() * 9_000_000));

// Come le altre rotte del modulo, sta dietro il middleware col cookie di
// sessione: chi non è autenticato non ci arriva.
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as {
    id?: string;
    nome?: string;
    categoria?: string;
    descrizione?: string;
    plusProdotto?: string;
    brief?: string;
    sezioniScheda?: Record<string, Record<string, string>>;
  } | null;
  if (!corpo) return NextResponse.json({ ok: false, errore: "Richiesta illeggibile." }, { status: 400 });

  const nome = (corpo.nome ?? "").trim().slice(0, 300);
  if (nome.length < 3) return NextResponse.json({ ok: false, errore: "Ancora senza nome: non salvo niente." });

  const dati = {
    nome,
    categoria: (corpo.categoria ?? "").trim() || "DA_CLASSIFICARE",
    descrizione: (corpo.descrizione ?? "").trim().slice(0, 4000) || null,
    plusProdotto: (corpo.plusProdotto ?? "").trim().slice(0, 140) || null,
    brief: (corpo.brief ?? "").trim().slice(0, 4000) || null,
    sezioniScheda: corpo.sezioniScheda && typeof corpo.sezioniScheda === "object" ? corpo.sezioniScheda : undefined,
  };

  if (corpo.id) {
    // ⚠️ Il controllo è la ragione per cui questa rotta si può usare: senza,
    // un id qualsiasi mandato da fuori riscriverebbe il testo di un prodotto
    // in vendita.
    const gia = await prisma.prodotto.findUnique({
      where: { id: corpo.id },
      select: { id: true, fase: true, shopifyId: true },
    });
    if (!gia) return NextResponse.json({ ok: false, errore: "Quella bozza non c'è più." }, { status: 404 });
    if (gia.fase !== "concept" || gia.shopifyId) {
      return NextResponse.json({ ok: false, errore: "Non è più una bozza: non la tocco." }, { status: 409 });
    }
    await prisma.prodotto.update({ where: { id: gia.id }, data: dati });
    return NextResponse.json({ ok: true, id: gia.id, creata: false });
  }

  // Il codice si ripete finché non ne trova uno libero: sette cifre casuali
  // collidono di rado, ma «di rado» su 5.000 prodotti succede.
  let codice = codiceProvvisorio();
  for (let i = 0; i < 20; i++) {
    if (!(await prisma.prodotto.findUnique({ where: { codice }, select: { id: true } }))) break;
    codice = codiceProvvisorio();
  }
  const nato = await prisma.prodotto.create({
    data: { ...dati, codice, fase: "concept", tipologiaVendita: null },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: nato.id, creata: true });
}
