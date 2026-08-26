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

const GIORNI_FOLLOWUP_LEAD = 3; // stessa cadenza web di lib/cadenze.ts

export type EsitoAutoQualifica =
  | { esito: 'agganciato'; dealId: string; placeId: string }
  | { esito: 'creato'; dealId: string; placeId: string }
  | { esito: 'saltato'; motivo: string };

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

    return { esito: creato ? 'creato' : 'agganciato', dealId: (deal as any).id as string, placeId: placeId! };
  } catch (e) {
    return { esito: 'saltato', motivo: String((e as any)?.message ?? e) };
  }
}
