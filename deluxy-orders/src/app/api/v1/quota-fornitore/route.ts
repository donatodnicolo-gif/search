import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { QUOTA_FORNITORE_DEFAULT, arrotondaA5, quotaFornitorePer, valutaQuota } from "@/lib/controllo";
import { provinciaHaPartner } from "@/lib/piattaforma";

// GET /api/v1/quota-fornitore — quanto ci aspettiamo di pagare al fornitore.
//
// ⚠️⚠️ QUESTA È L'UNICA VERITÀ SULLA QUOTA, e sta qui perché qui si controllano
// i pagamenti ai fornitori: la percentuale si cambia in Impostazioni di Orders
// (`controllo.quotaFornitore`) e da quel momento vale per tutti. Le altre app
// devono CHIEDERLA, non ricopiarsela: una seconda copia scritta nel codice di
// un'altra app resterebbe al vecchio valore il giorno che questo cambia, e le
// due schermate direbbero due numeri diversi senza che nessuno se ne accorga.
//
// La usa Deluxy Customer Service, che sulla scheda di un ordine mostra
// «al fornitore ≈ X €» prima di scrivergli.
//
// Parametro facoltativo `totale`: se c'è, la risposta porta anche l'importo
// atteso per quell'ordine — il conto lo fa chi possiede la regola, così non si
// sparpagliano moltiplicazioni per le app.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  // Dal 24/08/2026 la quota può variare PER PROVINCIA (e categoria): la
  // cascata è (provincia, categoria) → (provincia) → default, e la risposta
  // dice da dove viene il numero. Senza parametri: il default, come sempre.
  const provincia = req.nextUrl.searchParams.get("provincia");
  const categoria = req.nextUrl.searchParams.get("categoria");
  // ⭐ 06/09/2026 (regola utente): la REGOLA DEL TERRITORIO per i prodotti non unici —
  // 40 % di sconto dove non abbiamo partner, 20 % a Milano e 30 % altrove dove ce
  // l'abbiamo, prezzo arrotondato a 5 o a 0. «Con partner» lo dice chi chiama
  // (`conPartner=1|0`: la piattaforma lo sa) oppure lo si chiede alla piattaforma;
  // se non si sa, si resta sul default, senza fingere.
  const grezzoConPartner = req.nextUrl.searchParams.get("conPartner");
  let conPartner: boolean | null = grezzoConPartner === null ? null : ["1", "true", "si", "sì"].includes(grezzoConPartner.toLowerCase()) ? true : ["0", "false", "no"].includes(grezzoConPartner.toLowerCase()) ? false : null;
  let fonteConPartner: "chiamante" | "piattaforma" | "sconosciuta" = conPartner === null ? "sconosciuta" : "chiamante";
  if (conPartner === null && provincia) {
    const dallaPiattaforma = await provinciaHaPartner(provincia);
    if (dallaPiattaforma !== null) { conPartner = dallaPiattaforma; fonteConPartner = "piattaforma"; }
  }
  const { quota, sconto, regola, motivo } = await quotaFornitorePer(provincia, categoria, conPartner);
  const grezzoPubblico = req.nextUrl.searchParams.get("prezzoPubblico");
  const prezzoPubblico = grezzoPubblico === null ? null : Number(grezzoPubblico);
  const pubblicoValido = prezzoPubblico !== null && Number.isFinite(prezzoPubblico) && prezzoPubblico > 0;
  const grezzo = req.nextUrl.searchParams.get("totale");
  const totale = grezzo === null ? null : Number(grezzo);

  // ⚠️ Un `totale` illeggibile non diventa zero: senza numero non si risponde
  // con un importo. Un «al fornitore ≈ 0,00 €» sarebbe una risposta sbagliata
  // con l'aria di una giusta.
  const valido = totale !== null && Number.isFinite(totale) && totale > 0;

  return NextResponse.json({
    quota,
    predefinita: QUOTA_FORNITORE_DEFAULT,
    chiave: "controllo.quotaFornitore",
    dove: "Deluxy Orders → Impostazioni",
    // Che cosa vuol dire: pagare SOTTO la quota è bene (margine alto), sopra è
    // male. Scritto qui perché chi mostra il numero lo dica giusto.
    // Da dove viene il numero: «default» oppure una regola per provincia
    // (tabella QuotaRegola). Vale per i fornitori in chat: gli smistati dalla
    // piattaforma hanno lo sconto cristallizzato sulla vendita là.
    regola,
    // Lo sconto sul prezzo pubblico (= 100 − quota) e come si è deciso.
    sconto,
    conPartner,
    fonteConPartner,
    motivo,
    ambito: "prodotti non unici: per gli unici vale il listino del proprietario",
    arrotondamento: "il prezzo al fornitore si arrotonda a 5 o a 0, al più vicino",
    nota:
      regola === "default"
        ? "Quota indicativa di default: nessuna regola per questa provincia."
        : regola === "territorio"
          ? "Regola del territorio (06/09/2026): 40% senza partner; con partner 20% a Milano, 30% altrove."
          : "Quota decisa per questa provincia (tabella QuotaRegola di Orders).",
    ...(valido ? { totale, atteso: valutaQuota(totale, 0, quota).atteso } : {}),
    // ⭐ Il PREZZO da dare al fornitore/partner per quel prodotto, già arrotondato.
    ...(pubblicoValido ? { prezzoPubblico, prezzoFornitore: arrotondaA5(prezzoPubblico * (quota / 100)) } : {}),
  });
}
