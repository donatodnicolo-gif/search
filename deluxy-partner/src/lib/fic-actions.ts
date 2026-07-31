"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { riepilogoPartner } from "./queries";
import { nomeMese } from "./calc";
import {
  ficStato,
  ficClientiFatturabili,
  ficEntityUltimaFattura,
  ficCreaFattura,
  ficIdDaNumero,
  ficIntestatarioDaNumero,
  type FicEntity,
} from "./fic";
import { suggerisciClienteFic } from "./fic-cliente";

// Emissione della fattura commissioni in un clic, dall'elenco delle vendite.
//
// Il bottone «Fattura commissioni» prima apriva soltanto la pagina di
// emissione: per una fattura che è sempre la stessa — le commissioni di quel
// partner in quel mese, imponibile già calcolato, metodo di pagamento
// predefinito — erano tre schermate per confermare dati che l'app conosce già.
//
// ⚠️ Con un'eccezione, che è il motivo per cui questa funzione non crea
// *sempre*: la fattura si intesta a un soggetto fiscale, e sbagliarlo è un
// danno che si ripara solo in contabilità. Si emette al volo **solo** se il
// cliente su Fatture in Cloud arriva dalla riconciliazione confermata a mano.
// Se il nome è stato solo indovinato per somiglianza, o se non si trova, si
// apre la pagina di emissione col suggerimento già pronto e la scelta resta
// a una persona.
export async function emettiCommissioniRapido(
  partnerId: string,
  anno: number,
  mese: number,
  tornaA: string
) {
  const pagina = `/fic/emetti?partnerId=${partnerId}&anno=${anno}&mese=${mese}`;
  const conEsito = (chiave: string, valore: string) =>
    `${tornaA}${tornaA.includes("?") ? "&" : "?"}${chiave}=${encodeURIComponent(valore)}`;

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) redirect(tornaA);

  const saldo = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  // già emessa: non se ne fa una seconda in silenzio
  if (saldo?.commFattEmessa) {
    redirect(
      conEsito(
        "ficErrore",
        `Per ${partner.nome} le commissioni di ${nomeMese(mese)} risultano già fatturate (${saldo.commFattNumero ?? "senza numero"}).`
      )
    );
  }

  const { mesi } = await riepilogoPartner(partnerId, anno);
  const commissioni = mesi[mese - 1].riepilogo.commissioni;
  if (commissioni <= 0.005) {
    redirect(
      conEsito("ficErrore", `${partner.nome} non ha commissioni da fatturare per ${nomeMese(mese)}.`)
    );
  }

  const stato = await ficStato();
  if (!stato.collegato) {
    redirect(conEsito("ficErrore", "Fatture in Cloud non è collegato: vai in Impostazioni e premi Collega."));
  }

  let clienti: Awaited<ReturnType<typeof ficClientiFatturabili>> = [];
  try {
    clienti = await ficClientiFatturabili();
  } catch (e) {
    redirect(conEsito("ficErrore", `Fatture in Cloud non risponde: ${(e as Error).message}`));
  }

  const scelta = await suggerisciClienteFic(partner, clienti);
  // Si emette al volo solo se il soggetto è un FATTO: riconciliazione
  // confermata a mano, oppure l'intestatario delle fatture commissioni già
  // emesse a questo partner. Se il nome è stato solo indovinato per
  // somiglianza, decide una persona.
  if ((scelta.da !== "riconciliazione" && scelta.da !== "storico") || !scelta.cliente) {
    redirect(pagina);
  }

  let clienteId: number | undefined;
  let entity: FicEntity | undefined;
  if (scelta.cliente.valore.startsWith("id:")) {
    clienteId = parseInt(scelta.cliente.valore.slice(3)) || undefined;
  } else {
    const nome = scelta.cliente.valore.slice(5);
    entity = (await ficEntityUltimaFattura(nome)) ?? { name: nome };
  }

  let numero: string;
  try {
    const res = await ficCreaFattura({
      clienteId,
      entity,
      descrizione: `Commissioni su vendite ${nomeMese(mese)} ${anno}${partner.feePercent != null ? ` (fee ${partner.feePercent}%)` : ""}`,
      imponibile: Math.round(commissioni * 100) / 100,
      visibleSubject: `Commissioni ${nomeMese(mese)} ${anno}`,
    });
    numero = res.numero;
  } catch (e) {
    // l'errore vero di FIC serve a chi guarda: «riprova» non dice niente
    redirect(conEsito("ficErrore", `Fattura non creata: ${(e as Error).message}`));
  }

  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, commFattEmessa: true, commFattNumero: numero },
    update: { commFattEmessa: true, commFattNumero: numero },
  });
  for (const p of ["/", "/vendite", "/saldi", "/scadenzario", `/partner/${partnerId}`]) {
    revalidatePath(p, "layout");
  }
  redirect(conEsito("ficFatta", `${numero} · ${partner.nome} · ${nomeMese(mese)}`));
}

// Collega al mese una fattura commissioni GIÀ emessa su Fatture in Cloud.
//
// Emettere non è l'unico modo in cui una fattura viene al mondo: capita di
// farla a mano su FIC, o di averla emessa prima che l'app tenesse il conto.
// Finché l'unico bottone era «Emetti», quel mese restava «da emettere» per
// sempre — e l'unica via d'uscita era emetterne una seconda, cioè fatturare
// due volte la stessa commissione.
//
// Il numero non si accetta sulla fiducia: si cerca su FIC, e se non esiste
// l'azione si ferma. Meglio un errore adesso che un numero inventato nei conti.
export async function collegaFatturaCommissioni(
  partnerId: string,
  anno: number,
  mese: number,
  tornaA: string,
  fd: FormData
) {
  const conEsito = (chiave: string, valore: string) =>
    `${tornaA}${tornaA.includes("?") ? "&" : "?"}${chiave}=${encodeURIComponent(valore)}`;
  // la tendina manda il numero scelto; il campo libero vale se la tendina è vuota
  const numero =
    String(fd.get("numeroScelto") ?? "").trim() || String(fd.get("numero") ?? "").trim();
  if (!numero) {
    redirect(conEsito("ficErrore", "Scrivi il numero della fattura da collegare (es. 460/2026)."));
  }

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) redirect(tornaA);

  // esiste davvero su Fatture in Cloud?
  const stato = await ficStato();
  let intestata: string | null = null;
  if (stato.collegato) {
    try {
      const id = await ficIdDaNumero(numero, anno);
      if (!id) {
        redirect(
          conEsito(
            "ficErrore",
            `Su Fatture in Cloud non c'è nessuna fattura ${numero} del ${anno}: controlla il numero.`
          )
        );
      }
      intestata = await ficIntestatarioDaNumero(numero, anno);
    } catch (e) {
      // `redirect` lancia: non va scambiato per un errore di rete
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      redirect(conEsito("ficErrore", `Fatture in Cloud non risponde: ${(e as Error).message}`));
    }
  }

  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, commFattEmessa: true, commFattNumero: numero },
    update: { commFattEmessa: true, commFattNumero: numero },
  });
  for (const p of ["/", "/vendite", "/saldi", "/scadenzario", `/partner/${partnerId}`]) {
    revalidatePath(p, "layout");
  }
  redirect(
    conEsito(
      "ficCollegata",
      `${numero}${intestata ? ` · intestata a ${intestata}` : ""} · ${partner.nome} · ${nomeMese(mese)}`
    )
  );
}

// Torna indietro: il mese ridiventa «da emettere». Serve perché collegare è
// un'azione a un clic, e un numero sbagliato dev'essere correggibile senza
// passare dal database.
export async function scollegaFatturaCommissioni(
  partnerId: string,
  anno: number,
  mese: number,
  tornaA: string
) {
  await prisma.saldoMensile.updateMany({
    where: { partnerId, anno, mese },
    data: { commFattEmessa: false, commFattNumero: null },
  });
  for (const p of ["/", "/vendite", "/saldi", "/scadenzario", `/partner/${partnerId}`]) {
    revalidatePath(p, "layout");
  }
  redirect(tornaA);
}
