// Edge Function `notifica-ordine` (Deno): annuncia a tutta la squadra un ORDINE
// NUOVO — e, dal 03/09/2026, anche un ordine ANNULLATO.
//
// Richiesta dell'utente (28/08/2026): «quando viene creato un ordine poi manda
// una mail a tutti gli account dell'app come quella degli ordini shopify
// quindi [ORDINE SCOUT] ecc»; e (03/09/2026) «invia mail anche per gli ordini
// annullati come lo fai per gli ordini creati — in questo caso specifica
// nell'oggetto che l'ordine è annullato».
//
//   { ordine_id }                        → [ORDINE SCOUT] …
//   { ordine_id, tipo: 'annullato' }     → [ORDINE SCOUT · ANNULLATO] …
//
// ⭐ **L'OGGETTO PORTA IL RIFERIMENTO** (`[ORDINE SCOUT] SCOUT007 · Cliente ·
// € 1.200`): è il numero che va scritto come DDT sulla consegna, e chi legge
// la mail dal telefono deve poterlo copiare senza aprirla. Sull'annullamento
// l'etichetta sta PRIMA di tutto, dove il telefono non taglia.
//
// ⚠️ **SICUREZZA.** Chiama solo un utente Scout loggato (JWT verificato), e i
// destinatari NON arrivano dal chiamante: si leggono dai profili qui dentro.
// Se li scegliesse il client, questa funzione sarebbe un modo per spedire mail
// a chiunque con le caselle di Deluxy.
//
// ⚠️ **NON RILANCIA.** Ogni annuncio ha la sua data (`annunciato_il` per il
// nuovo, `annullamento_annunciato_il` per l'annullamento, migr. 0113): se c'è
// già, risponde `{ sent: false, reason: 'gia_annunciato' }`. Una casella che
// riceve due volte lo stesso ordine smette di fidarsi della terza.
//
// ⚠️ **L'ANNULLAMENTO SI ANNUNCIA SOLO SE L'ORDINE ERA STATO ANNUNCIATO.** Un
// ordine annullato da bozza non l'ha mai visto nessuno (l'annuncio parte alla
// chiusura della pratica): risponde `mai_annunciato` e non manda niente.
//
// ⚠️ Se lo SMTP non è configurato la funzione è INERTE (`smtp_non_configurato`)
// e non è un errore: l'ordine è già salvato, la mail è un di più.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { credenzialiPerUtente, decifra, inviaMail, type Credenziali } from '../_shared/smtp.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/**
 * ⭐ LA CASELLA DELL'AZIENDA (28/08/2026, decisione dell'utente: «si manda
 * pure da commerciale@deluxy.it»).
 *
 * L'annuncio di un ordine non è una mail personale: è la voce dell'azienda, e
 * deve partire dallo stesso indirizzo qualunque commerciale abbia chiuso. Il
 * mittente si legge da `impostazioni.mail.casella_annunci` (migr. 0097) e si
 * risolve nelle credenziali già salvate — cifrate — in `smtp_account`.
 *
 * ⚠️ Le password non arrivano da qui né da un secret nuovo: si decifrano dalla
 * riga che esiste già, con `SMTP_ENC_KEY`. Una copia in più delle credenziali
 * è una copia in più da revocare il giorno che cambiano.
 *
 * ⚠️ Ripiego sulla casella di chi segue l'ordine: se un domani quella
 * dell'azienda non fosse configurata, meglio una mail che parte da un collega
 * che nessuna mail.
 */
async function credenzialiAnnunci(admin: any, ownerId: string | null): Promise<Credenziali | null> {
  const { data: imp } = await admin
    .from('impostazioni')
    .select('valore')
    .eq('chiave', 'mail.casella_annunci')
    .maybeSingle();
  const casella = String(imp?.valore ?? '').trim();
  if (casella) {
    const { data } = await admin.from('smtp_account').select('*').eq('utente', casella).maybeSingle();
    if (data?.host && data?.utente && data?.password_cifrata) {
      const nome = String(data.mittente ?? '').trim();
      return {
        host: data.host,
        port: Number(data.porta ?? 465),
        user: data.utente,
        pass: await decifra(data.password_cifrata),
        // Il nome visibile dice CHE COS'È: chi riceve deve capire dall'elenco
        // che è un ordine dell'app, non un messaggio di una persona.
        from: `"${(nome && !nome.includes('@') ? nome : 'Deluxy Scout').replace(/"/g, '')}" <${data.utente}>`,
      };
    }
  }
  return await credenzialiPerUtente(admin, ownerId);
}

const euro = (v: unknown) =>
  v == null || v === '' ? null : `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const { ordine_id, tipo } = await req.json();
    if (!ordine_id) return json({ error: 'ordine_id mancante' }, 400);

    // ⭐ **DUE ANNUNCI, UNA FUNZIONE** (03/09/2026, richiesta dell'utente:
    // «invia mail anche per gli ordini annullati come lo fai per gli ordini
    // creati — in questo caso specifica nell'oggetto che l'ordine è
    // annullato»). Mittente, destinatari e antidoppione sono gli stessi:
    // tenerli in due funzioni vorrebbe dire due liste di destinatari da
    // aggiornare, e una che un giorno resta indietro.
    const annullato = tipo === 'annullato';

    const { data: o } = await admin.from('ordini').select('*').eq('id', ordine_id).single();
    if (!o) return json({ error: 'Ordine non trovato' }, 404);

    if (annullato) {
      // ⚠️ Si annuncia solo ciò che È annullato: la mail dice un fatto, e se
      // l'ordine nel frattempo è tornato in gioco quel fatto non è più vero.
      if (o.stato !== 'annullato') return json({ sent: false, reason: 'non_annullato' });
      // ⚠️ E solo se la squadra sapeva che l'ordine esisteva. Un ordine
      // annullato da BOZZA non è mai stato annunciato (l'annuncio parte alla
      // chiusura della pratica): dire «annullato SCOUT senza riferimento» a
      // gente che non ne ha mai sentito parlare è rumore, non informazione.
      if (!o.annunciato_il) return json({ sent: false, reason: 'mai_annunciato' });
      if (o.annullamento_annunciato_il) return json({ sent: false, reason: 'gia_annunciato' });
    } else if (o.annunciato_il) {
      return json({ sent: false, reason: 'gia_annunciato' });
    }

    // ⚠️ La prenotazione PRIMA dell'invio: due chiamate in parallelo (doppio
    // clic, due schede aperte) devono trovarne una sola libera. La `is null`
    // nella update è la condizione di corsa — chi arriva secondo aggiorna zero
    // righe e si ferma, invece di mandare la seconda copia.
    const colonna = annullato ? 'annullamento_annunciato_il' : 'annunciato_il';
    const { data: preso } = await admin
      .from('ordini')
      .update({ [colonna]: new Date().toISOString() })
      .eq('id', ordine_id)
      .is(colonna, null)
      .select('id');
    if (!preso?.length) return json({ sent: false, reason: 'gia_annunciato' });

    const libera = () => admin.from('ordini').update({ [colonna]: null }).eq('id', ordine_id);

    const { data: profili } = await admin.from('profiles').select('id, email, nome');
    const destinatari = (profili ?? []).map((p: any) => p.email).filter((e: string) => !!e && e.includes('@'));
    if (!destinatari.length) {
      await libera();
      return json({ sent: false, reason: 'nessun_destinatario' });
    }

    // Mittente: la casella dell'azienda (commerciale@deluxy.it), non quella
    // personale — vedi `credenzialiAnnunci`.
    const cred = await credenzialiAnnunci(admin, o.owner ?? null);
    if (!cred) {
      // ⚠️ Si RILASCIA la prenotazione: senza, l'ordine resterebbe segnato
      // «annunciato» pur non avendo mandato niente, e configurare lo SMTP dopo
      // non lo recupererebbe più.
      await libera();
      return json({ sent: false, reason: 'smtp_non_configurato' });
    }

    const chiSegue = (profili ?? []).find((p: any) => p.id === o.owner);
    const nomeChiSegue = chiSegue?.nome || chiSegue?.email?.split('@')[0] || null;

    const rif = o.riferimento ?? '(senza riferimento)';
    const valore = euro(o.valore);
    // ⚠️ L'ANNULLAMENTO SI VEDE DALL'ELENCO, senza aprire: l'etichetta sta in
    // testa all'oggetto, dove il telefono taglia per ultimo. Un «annullato»
    // messo in fondo, dopo cliente e importo, non lo legge nessuno.
    const oggetto = annullato
      ? `[ORDINE SCOUT · ANNULLATO] ${rif} · ${o.cliente}${valore ? ` · ${valore}` : ''}`
      : `[ORDINE SCOUT] ${rif} · ${o.cliente}${valore ? ` · ${valore}` : ''}`;

    const documento = o.fattura_numero || o.proforma_numero || null;
    const righe = annullato
      ? [
          `Ordine ANNULLATO su Deluxy Scout.`,
          ``,
          `• Riferimento: ${rif}`,
          `• Cliente: ${o.cliente}`,
          o.descrizione ? `• Cosa: ${o.descrizione}` : null,
          valore ? `• Valore che non entra: ${valore}` : null,
          nomeChiSegue ? `• Seguito da: ${nomeChiSegue}` : null,
          ``,
          // ⚠️ Le due code che l'annullamento NON chiude da solo: si dicono
          // qui, che è il momento in cui qualcuno può ancora fermarle.
          `Se era già stata aperta una consegna con ${rif} nel campo DDT, va annullata sulla piattaforma:`,
          `l'annullamento dell'ordine non la tocca.`,
          documento
            ? `E ${documento} resta su FINANCE: una pro-forma si lascia scadere, una fattura si storna con una nota di credito.`
            : null,
          ``,
          `Aprilo qui: https://deluxy-scout.vercel.app/ordini`,
        ]
      : [
          `Nuovo ordine su Deluxy Scout.`,
          ``,
          `• Riferimento: ${rif}`,
          `• Cliente: ${o.cliente}`,
          o.descrizione ? `• Cosa: ${o.descrizione}` : null,
          o.linea ? `• Linea: ${o.linea}` : null,
          valore ? `• Valore (IVA esclusa): ${valore}` : `• Valore: non ancora indicato`,
          o.canale ? `• Canale: ${o.canale}` : null,
          nomeChiSegue ? `• Seguito da: ${nomeChiSegue}` : null,
          ``,
          // ⚠️ L'istruzione operativa sta NELLA MAIL: è il momento in cui serve, e
          // chi apre la consegna non ha sotto mano né questo documento né me.
          `Se serve una consegna, apri il servizio sulla piattaforma e scrivi ${rif} nel campo DDT:`,
          `così la consegna resta legata a questo ordine.`,
          ``,
          `Aprilo qui: https://deluxy-scout.vercel.app/ordini`,
        ];
    const corpo = righe.filter((r) => r !== null).join('\n');

    // Un invio per destinatario: `inviaMail` prende un indirizzo solo, e così
    // l'esito si sa per ciascuno invece di perdersi in un tutto-o-niente.
    const esiti: { to: string; ok: boolean; errore?: string }[] = [];
    for (const to of destinatari) {
      const e = await inviaMail(cred, { to, subject: oggetto, content: corpo });
      esiti.push({ to, ok: e.ok, ...(e.ok ? {} : { errore: e.errore }) });
    }
    const riusciti = esiti.filter((e) => e.ok).length;
    if (!riusciti) {
      await libera();
      return json({ sent: false, esiti }, 502);
    }
    return json({ sent: true, tipo: annullato ? 'annullato' : 'nuovo', riferimento: rif, destinatari: riusciti, esiti });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
