// Edge Function `richiesta-evasione` (Deno): manda alle CONSEGNE le
// informazioni per inserire il servizio di un ordine Scout già chiuso.
//
// Richiesta dell'utente (28/08/2026): «metti richiesta evasione di un ordine
// dopo la chiusura che manda all'app delivery le informazioni per
// l'inserimento».
//
// ⭐ **PERCHÉ UNA MAIL E NON UNA CHIAMATA ALLA PIATTAFORMA.** La rotta per
// creare la consegna esiste (`POST /app/consegne`, con chiave di scrittura),
// ma oggi la chiave salvata in Scout non è una chiave della piattaforma —
// nella cassaforte c'è l'IBAN dell'azienda — e soprattutto la consegna
// pretende dati che l'ordine non contiene: la data del servizio, l'indirizzo
// del destinatario, quale servizio del catalogo. Si chiedono a chi fa la
// richiesta e si consegnano a chi inserisce. Il giorno che la chiave c'è,
// questa stessa funzione può chiamare la rotta: i campi raccolti qui sono
// esattamente quelli che il DTO pretende.
//
// ⚠️ **SOLO DOPO LA CHIUSURA.** Prima l'ordine è una bozza e non ha nemmeno il
// numero da scrivere nel DDT: una richiesta senza numero costringerebbe chi
// inserisce a indovinare a quale ordine appartiene.
//
// ⚠️ **SICUREZZA.** Chiama solo un utente Scout loggato; il destinatario NON
// arriva dal client ma dalle impostazioni, altrimenti questa funzione sarebbe
// un modo per spedire mail a chiunque con le caselle di Deluxy.
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

async function impostazione(admin: any, chiave: string): Promise<string> {
  const { data } = await admin.from('impostazioni').select('valore').eq('chiave', chiave).maybeSingle();
  return String(data?.valore ?? '').trim();
}

/** La casella dell'azienda, come per gli annunci: è la voce di Deluxy, non di una persona. */
async function credenzialiAzienda(admin: any, ownerId: string | null): Promise<Credenziali | null> {
  const casella = await impostazione(admin, 'mail.casella_annunci');
  if (casella) {
    const { data } = await admin.from('smtp_account').select('*').eq('utente', casella).maybeSingle();
    if (data?.host && data?.utente && data?.password_cifrata) {
      const nome = String(data.mittente ?? '').trim();
      return {
        host: data.host,
        port: Number(data.porta ?? 465),
        user: data.utente,
        pass: await decifra(data.password_cifrata),
        from: `"${(nome && !nome.includes('@') ? nome : 'Deluxy Scout').replace(/"/g, '')}" <${data.utente}>`,
      };
    }
  }
  return await credenzialiPerUtente(admin, ownerId);
}

const testo = (v: unknown) => String(v ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const b = await req.json().catch(() => ({}));
    const ordineId = testo(b?.ordine_id);
    if (!ordineId) return json({ error: 'ordine_id mancante' }, 400);

    const { data: o } = await admin.from('ordini').select('*').eq('id', ordineId).single();
    if (!o) return json({ error: 'Ordine non trovato' }, 404);
    if (!o.chiuso_il) {
      return json({ error: "L'ordine non è ancora chiuso: l'evasione si chiede dopo la chiusura." }, 400);
    }
    if (!o.riferimento) {
      return json({ error: "L'ordine non ha un numero: senza, chi inserisce non sa a cosa legare la consegna." }, 400);
    }

    // ⚠️ I tre campi senza i quali una consegna non si inserisce: quando, a chi,
    // dove. Se mancano è meglio fermarsi qui che mandare una richiesta che
    // costringe chi la riceve a rincorrere chi l'ha scritta.
    const quando = testo(b?.data_servizio);
    const destinatario = testo(b?.destinatario);
    const indirizzo = testo(b?.indirizzo);
    const mancano = [
      !quando ? 'la data del servizio' : null,
      !destinatario ? 'il destinatario' : null,
      !indirizzo ? "l'indirizzo di consegna" : null,
    ].filter(Boolean);
    if (mancano.length) {
      return json({ error: `Manca ${mancano.join(', ')}: senza, la consegna non si può inserire.` }, 400);
    }

    const dati = {
      data_servizio: quando,
      ora_da: testo(b?.ora_da) || null,
      ora_a: testo(b?.ora_a) || null,
      destinatario,
      indirizzo,
      citofono: testo(b?.citofono) || null,
      telefono: testo(b?.telefono) || null,
      ritiro: testo(b?.ritiro) || null,
      cosa: testo(b?.cosa) || o.descrizione || null,
      note: testo(b?.note) || null,
    };

    const cred = await credenzialiAzienda(admin, o.owner ?? null);
    if (!cred) return json({ sent: false, reason: 'smtp_non_configurato' }, 502);

    // ⚠️ Il destinatario viene dalle IMPOSTAZIONI. Se nessuno l'ha ancora
    // messo, la richiesta va a tutta la squadra e la mail lo DICE in cima:
    // meglio che arrivi alla persona sbagliata sapendolo, che non arrivare.
    const casellaConsegne = await impostazione(admin, 'mail.casella_consegne');
    let destinatari: string[];
    let ripiego = false;
    if (casellaConsegne) {
      destinatari = [casellaConsegne];
    } else {
      const { data: profili } = await admin.from('profiles').select('email');
      destinatari = (profili ?? []).map((p: any) => p.email).filter((e: string) => !!e && e.includes('@'));
      ripiego = true;
      if (!destinatari.length) return json({ sent: false, reason: 'nessun_destinatario' }, 502);
    }

    const rif = o.riferimento;
    const oggetto = `[EVASIONE ${rif}] ${o.cliente} · ${quando}`;
    const fascia = dati.ora_da || dati.ora_a ? `${dati.ora_da ?? '—'} → ${dati.ora_a ?? '—'}` : 'non indicata';

    const corpo = [
      ripiego
        ? '⚠️ Nessun indirizzo delle consegne impostato: questa richiesta è arrivata a tutta la squadra.\n   Si imposta in Scout, impostazione «mail.casella_consegne».\n'
        : null,
      `Richiesta di evasione per l'ordine ${rif}.`,
      ``,
      `DA SCRIVERE NEL CAMPO DDT DELLA CONSEGNA: ${rif}`,
      ``,
      `— L'ordine —`,
      `• Cliente: ${o.cliente}`,
      dati.cosa ? `• Cosa: ${dati.cosa}` : null,
      o.linea ? `• Linea: ${o.linea}` : null,
      ``,
      `— Il servizio da inserire —`,
      `• Data: ${quando}`,
      `• Fascia oraria: ${fascia}`,
      dati.ritiro ? `• Ritiro presso: ${dati.ritiro}` : '• Ritiro: non indicato',
      `• Destinatario: ${destinatario}`,
      `• Indirizzo: ${indirizzo}`,
      dati.citofono ? `• Citofono: ${dati.citofono}` : null,
      dati.telefono ? `• Telefono: ${dati.telefono}` : null,
      dati.note ? `• Note: ${dati.note}` : null,
      ``,
      // ⚠️ Si dice anche quello che NON c'è: chi inserisce deve sapere che il
      // tipo di servizio del catalogo lo sceglie lui, invece di cercarlo qui.
      'Il tipo di servizio del catalogo e il partner li sceglie chi inserisce: da Scout non arrivano.',
      ``,
      "L'ordine: https://deluxy-scout.vercel.app/ordini",
    ]
      .filter((r) => r !== null)
      .join('\n');

    const esiti: { to: string; ok: boolean; errore?: string }[] = [];
    for (const to of destinatari) {
      const e = await inviaMail(cred, { to, subject: oggetto, content: corpo });
      esiti.push({ to, ok: e.ok, ...(e.ok ? {} : { errore: e.errore }) });
    }
    if (!esiti.some((e) => e.ok)) return json({ sent: false, esiti }, 502);

    // Si segna DOPO l'invio: una richiesta segnata come mandata e mai partita
    // è peggio di una mandata due volte.
    await admin
      .from('ordini')
      .update({ evasione_richiesta_il: new Date().toISOString(), evasione_dati: dati })
      .eq('id', ordineId);

    return json({ sent: true, a: destinatari, ripiego });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
