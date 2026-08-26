// AUTO-QUALIFICA delle richieste web (richiesta utente, 25/08/2026): la
// trattativa nasce DA SOLA quando la richiesta arriva — associata al contatto
// se chi scrive è già in rubrica (match per email o telefono), altrimenti
// creando negozio e contatto dai dati ricevuti.
//
// Usata dalle DUE porte d'ingresso web: la Edge `mail` (import della casella
// commerciale) e la Edge `lead` (form del sito / AI Mail / automazioni). Le
// richieste inserite A MANO dall'app restano manuali: lì c'è già una persona
// che sta guardando.
//
// ⚠️ Best-effort per contratto: la richiesta è GIÀ salvata in `leads` quando
// si arriva qui — se l'auto-qualifica fallisce il lead resta «nuovo» e lo
// qualifica una persona, come prima. Un errore qui non deve perdere niente.
//
// ⚠️ L'estrazione di persona/email/telefono duplica IN PICCOLO la logica di
// `lib/lead-parse.ts` (che è codice dell'app, non importabile da Deno senza
// portarsi dietro l'alias @/): stesso formato — le etichette `Name:`/`Email:`/
// `Phone:` delle notifiche del modulo Shopify — più il fallback sui pattern
// generici. Se il formato cambia, vanno aggiornati tutti e due.

// Il client service-role di chi ci chiama (supabase-js): tipato lasco per non
// re-importare la libreria da un modulo condiviso.
// deno-lint-ignore no-explicit-any
type Admin = any;

import { assicuraNegozioNelRegistro, type EsitoRegistro } from './registro.ts';

const GIORNI_FOLLOWUP_LEAD = 3; // stessa cadenza web di lib/cadenze.ts

export type EsitoAutoQualifica =
  | { esito: 'agganciato'; dealId: string; placeId: string; registro?: EsitoRegistro }
  | { esito: 'creato'; dealId: string; placeId: string; registro?: EsitoRegistro }
  /** Chi ha scritto è già CLIENTE: niente trattativa, è una richiesta da prezzare. */
  | { esito: 'richiesta_cliente'; richiestaId: string; placeId: string; cliente: string; registro?: EsitoRegistro }
  | { esito: 'saltato'; motivo: string };

/**
 * La richiesta di un cliente che c'è già: nasce in `richieste_cliente`, non in
 * `deals`. Nessun importo — il prezzo si fa dopo, ed è proprio il lavoro che
 * quella schermata esiste per raccogliere: si prezza e si finalizza col
 * documento di FINANCE.
 *
 * Senza padrone (`owner: null`): la vede tutta la squadra e se la prende chi
 * può, come le trattative nate da sole.
 */
async function richiestaDiUnCliente(
  admin: Admin,
  lead: { id: string; nome: string; contatto: string | null; messaggio: string | null; mail_ref?: string | null },
  posto: { id: string; nome: string },
  chi: { persona: string; email: string | null; telefono: string | null },
): Promise<EsitoAutoQualifica> {
  const descrizione = (lead.messaggio ?? '').trim().slice(0, 500) || `Richiesta di ${chi.persona}`;
  const { data: richiesta, error } = await admin
    .from('richieste_cliente')
    .insert({
      owner: null,
      place_id: posto.id,
      // ⚠️ Il nome del NEGOZIO, non della persona: è quello che andrà a FINANCE
      // per intestare il documento, e il documento si intesta all'azienda.
      cliente: posto.nome,
      descrizione,
      canale: 'mail',
      origine: 'scout-mail',
      // Idempotenza: la stessa richiesta web non deve entrare due volte se il
      // cron rilegge la mail o se qualcuno rilancia l'import.
      riferimento_esterno: lead.id,
      mail_ref: lead.mail_ref ?? null,
      nota: chi.email || chi.telefono ? `Ha scritto ${chi.persona} (${chi.email ?? chi.telefono})` : null,
    })
    .select('id')
    .single();
  if (error || !richiesta) return { esito: 'saltato', motivo: error?.message ?? 'richiesta non creata' };
  await admin
    .from('leads')
    .update({
      stato: 'qualificato',
      place_id: posto.id,
      richiesta_cliente_id: (richiesta as { id: string }).id,
      lavorato_il: new Date().toISOString(),
    })
    .eq('id', lead.id);
  // Anche un cliente dev'essere nel registro Anagrafiche: che lo sia già è
  // probabile, non certo — e «probabile» non è una verifica.
  const registro = await assicuraNegozioNelRegistro(admin, posto.id, [
    { nome: chi.persona, email: chi.email, telefono: chi.telefono, ruolo: null },
  ]);
  return {
    esito: 'richiesta_cliente',
    richiestaId: (richiesta as { id: string }).id,
    placeId: posto.id,
    cliente: posto.nome,
    registro,
  };
}

/** Estrae persona/email/telefono dal testo della richiesta. */
function estrai(nome: string, contatto: string | null, messaggio: string | null) {
  const testo = messaggio ?? '';
  const etichetta = (label: string) => {
    const m = testo.match(new RegExp(`${label}:\\s*([^\\n\\r—·]+)`, 'i'));
    return m?.[1]?.trim() || null;
  };
  const persona = etichetta('Name') || null;
  const email =
    (contatto && contatto.includes('@') ? contatto : null) ||
    etichetta('Email') ||
    testo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ||
    null;
  const telefono =
    etichetta('Phone') ||
    (contatto && !contatto.includes('@') ? contatto : null) ||
    testo.match(/\+?\d[\d\s\-.]{7,}\d/)?.[0] ||
    null;
  return { persona: persona ?? nome, email: email?.toLowerCase() ?? null, telefono: telefono?.trim() ?? null };
}

/** Solo le cifre, per confrontare telefoni scritti in modi diversi; si
 *  paragonano le ULTIME 9 (il numero italiano senza prefisso). */
function cifre(t: string | null | undefined): string {
  return String(t ?? '').replace(/\D/g, '').slice(-9);
}

export async function autoQualificaLead(
  admin: Admin,
  lead: { id: string; nome: string; contatto: string | null; messaggio: string | null },
): Promise<EsitoAutoQualifica> {
  try {
    const { persona, email, telefono } = estrai(lead.nome, lead.contatto, lead.messaggio);

    // 1) È già in rubrica? Match per email (esatto, case-insensitive) o per
    //    telefono (ultime 9 cifre). La rubrica è piccola: si confronta qui,
    //    dove si può normalizzare, invece di inventare un LIKE che non regge
    //    gli spazi. Gli archiviati non contano: sono usciti di scena.
    let placeId: string | null = null;
    if (email || telefono) {
      const { data: contatti } = await admin
        .from('contacts')
        .select('place_id, email, telefono, archiviato')
        .or([email ? `email.ilike.${email}` : null, telefono ? 'telefono.not.is.null' : null].filter(Boolean).join(','));
      const telLead = cifre(telefono);
      const match = (contatti ?? []).find(
        (c: any) =>
          !c.archiviato &&
          c.place_id &&
          ((email && String(c.email ?? '').toLowerCase() === email) ||
            (telLead.length >= 8 && cifre(c.telefono) === telLead)),
      );
      placeId = match?.place_id ?? null;
    }

    // 1-bis) ⭐ LA REGOLA DEL BINARIO (26/08/2026 sera, decisione dell'utente).
    //    Se chi scrive è di un negozio che è GIÀ CLIENTE, questa non è una
    //    trattativa: è una richiesta saltuaria da prezzare e finalizzare. Farne
    //    una trattativa riempiva la pipeline di evasioni e faceva valere due
    //    volte la stessa vendita (una volta come pipeline, una come incasso).
    //    Va in «Richieste Clienti», che è il canale dei ricorrenti.
    //
    //    ⚠️ «Cliente» sono due cose, e valgono entrambe: lo stato di Scout
    //    (`stato = 'cliente'`) e quello del registro Anagrafiche
    //    (`anagrafiche_stato = 'attivo'`), che è la fonte di verità del rapporto
    //    e può saperlo prima di noi.
    if (placeId) {
      const { data: posto } = await admin
        .from('places')
        .select('id, nome, stato, anagrafiche_stato')
        .eq('id', placeId)
        .maybeSingle();
      if (posto && (posto.stato === 'cliente' || posto.anagrafiche_stato === 'attivo')) {
        return await richiestaDiUnCliente(admin, lead, posto, { persona, email, telefono });
      }
    }

    // 2) Nessun match: si crea il negozio dai dati ricevuti. Senza indirizzo
    //    non c'è niente da geocodificare: entra a 0,0 (meglio un lead senza
    //    posizione che un lead perso — stessa scelta di «Prendi in carico»).
    //    Il contatto in rubrica fa due cose: rende il negozio un LEAD per
    //    lib/livelli.ts, e fa agganciare qui le prossime richieste della
    //    stessa persona invece di creare un doppione.
    let creato = false;
    if (!placeId) {
      const { data: place, error: ePlace } = await admin
        .from('places')
        .insert({ nome: persona || lead.nome, lat: 0, lng: 0 })
        .select('id')
        .single();
      if (ePlace || !place) return { esito: 'saltato', motivo: ePlace?.message ?? 'negozio non creato' };
      placeId = (place as any).id as string;
      creato = true;
      if (email || telefono) {
        await admin
          .from('contacts')
          .insert({
            place_id: placeId,
            nome: persona || lead.nome,
            ruolo: null,
            email,
            telefono,
            is_decisore: false,
            hubspot_contact_id: null,
          })
          .then(() => {}, () => {});
      }
    }

    // 3) La trattativa: stessi campi della qualifica manuale (qualificaLead in
    //    lib/db.ts) — canale web, follow-up a 3 giorni, oggetto = la richiesta.
    //    Owner null = non attribuita: compare a tutti in Home finché qualcuno
    //    non se la prende.
    const scadenza = new Date(Date.now() + GIORNI_FOLLOWUP_LEAD * 86_400_000).toISOString().slice(0, 10);
    const recapito = email ?? telefono;
    const { data: deal, error: eDeal } = await admin
      .from('deals')
      .insert({
        place_id: placeId,
        linea: null,
        fase: 'appointmentscheduled',
        valore_atteso: null,
        scadenza,
        next_action: recapito ? `Ricontattare ${persona || lead.nome} (${recapito})` : `Ricontattare ${persona || lead.nome}`,
        oggetto: lead.messaggio?.slice(0, 120) || `Lead web: ${persona || lead.nome}`,
        canale: 'web',
        owner: null,
        hubspot_deal_id: null,
      })
      .select('id')
      .single();
    if (eDeal || !deal) return { esito: 'saltato', motivo: eDeal?.message ?? 'trattativa non creata' };

    // 4) Il lead ricorda cosa ha generato — e non è più «nuovo».
    await admin
      .from('leads')
      .update({
        stato: 'qualificato',
        deal_id: (deal as any).id,
        place_id: placeId,
        lavorato_il: new Date().toISOString(),
      })
      .eq('id', lead.id);

    // 5) E IL NEGOZIO ENTRA NEL REGISTRO ANAGRAFICHE, se non c'è già — col
    //    referente che ci ha scritto. Una richiesta qualificata è un'azienda
    //    con cui stiamo trattando: fino a ieri restava solo dentro Scout, e il
    //    registro delle anagrafiche B2B non ne sapeva niente. Stessa regola
    //    della qualifica a mano (`assicuraNegozioNelRegistro`, lib/db.ts).
    //
    //    Best-effort e per ultimo: la trattativa è già salvata, e un registro
    //    irraggiungibile non deve farla perdere. L'esito però torna a chi ha
    //    chiamato — che lo scrive nella sua risposta — invece di sparire.
    const registro = await assicuraNegozioNelRegistro(admin, placeId!, [
      { nome: persona || lead.nome, email, telefono, ruolo: null },
    ]);

    return { esito: creato ? 'creato' : 'agganciato', dealId: (deal as any).id as string, placeId: placeId!, registro };
  } catch (e) {
    return { esito: 'saltato', motivo: String((e as any)?.message ?? e) };
  }
}
